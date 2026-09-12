import { useWorld } from "@/features/world";
import {
  CAMERA_LOOK_AT,
  CAMERA_POSITION,
  CONDUCTOR_OFFSET,
  LANE_SPACING,
  TRAIN_Y,
  VOICE_GAIN,
  VOICE_REF_DISTANCE,
  VOICE_RESUME_TIMEOUT_MS,
  VOICE_ROLLOFF,
} from "./constants";

type Point = { x: number; y: number; z: number };
type Pose = { position: Point; forward: Point; up: Point };
type Voice = { panner: PannerNode; dispose(): void };

// Rendering supplies positions; the speech driver owns playback and disposal.
// No world commands are called here. Initial positions cover speech that starts
// before the Canvas has rendered its first frame.
const listenerPose: Pose = {
  position: { x: CAMERA_POSITION[0], y: CAMERA_POSITION[1], z: CAMERA_POSITION[2] },
  forward: {
    x: CAMERA_LOOK_AT[0] - CAMERA_POSITION[0],
    y: CAMERA_LOOK_AT[1] - CAMERA_POSITION[1],
    z: CAMERA_LOOK_AT[2] - CAMERA_POSITION[2],
  },
  up: { x: 0, y: 1, z: 0 },
};
const outputs = new Set<ReturnType<typeof createVoiceAudio>>();

export function updateVoiceListener(position: Point, forward: Point, up: Point): void {
  Object.assign(listenerPose.position, position);
  Object.assign(listenerPose.forward, forward);
  Object.assign(listenerPose.up, up);
  for (const output of outputs) output.updateListener();
}

export function updateVoicePosition(trainId: string, position: Point): void {
  for (const output of outputs) output.updatePosition(trainId, position);
}

// Firefox has no positional AudioParams on AudioListener (positionX, forwardX,
// upX…) — only the older setPosition()/setOrientation() methods — while
// Chrome and Safari have both. Feature-detect per node rather than per
// browser: PannerNode has the params everywhere, the listener does not.
// This runs every frame once the context exists, so a throw here would take
// the whole scene loop down with it.
function setPosition(node: AudioListener | PannerNode, point: Point): void {
  if (node.positionX) {
    node.positionX.value = point.x;
    node.positionY.value = point.y;
    node.positionZ.value = point.z;
  } else {
    node.setPosition(point.x, point.y, point.z);
  }
}

function setOrientation(listener: AudioListener, forward: Point, up: Point): void {
  if (listener.forwardX) {
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  } else {
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

export function createVoiceAudio() {
  let context: AudioContext | null = null;
  const voices = new Map<string, Voice>();
  let disposed = false;

  const updateListener = () => {
    if (!context) return;
    const { position, forward, up } = listenerPose;
    const listener = context.listener;
    setPosition(listener, position);
    const length = Math.hypot(forward.x, forward.y, forward.z) || 1;
    setOrientation(
      listener,
      { x: forward.x / length, y: forward.y / length, z: forward.z / length },
      up,
    );
  };

  // Resume on a gesture too, so a blocked first announcement can be retried
  // with the dev panel. Never replay an old line when the context unlocks.
  const unlock = () => {
    if (disposed) return;
    try {
      // Create the context during the gesture, before an asynchronous timer
      // request returns and user activation expires.
      context ??= new AudioContext();
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch {
      // No audio support: the speech player still supplies timed captions.
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  const output = {
    updateListener,
    updatePosition(trainId: string, position: Point) {
      const voice = voices.get(trainId);
      if (voice) setPosition(voice.panner, position);
    },
    createAudio(url: string, trainId: string) {
      if (disposed) throw new Error("Voice audio is disposed");
      context ??= new AudioContext();
      const ctx = context;
      updateListener();
      voices.get(trainId)?.dispose();
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.src = url;
      const source = ctx.createMediaElementSource(audio);
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = VOICE_REF_DISTANCE;
      panner.rolloffFactor = VOICE_ROLLOFF;
      const lane = useWorld.getState().trains[trainId]?.lane ?? 0;
      setPosition(panner, {
        x: CONDUCTOR_OFFSET[0],
        y: TRAIN_Y + CONDUCTOR_OFFSET[1],
        z: lane * LANE_SPACING + CONDUCTOR_OFFSET[2],
      });
      const gain = ctx.createGain();
      gain.gain.value = VOICE_GAIN;
      source.connect(panner).connect(gain).connect(ctx.destination);
      let stopped = false;
      const voice: Voice = {
        panner,
        dispose() {
          if (stopped) return;
          stopped = true;
          audio.pause();
          source.disconnect();
          panner.disconnect();
          gain.disconnect();
          audio.removeAttribute("src");
          audio.load();
          if (voices.get(trainId) === voice) voices.delete(trainId);
        },
      };
      voices.set(trainId, voice);
      return {
        async play() {
          if (ctx.state !== "running") {
            // resume() can remain pending indefinitely under autoplay policy.
            // Reject promptly so the speech driver can use its text fallback.
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                ctx.resume(),
                new Promise<never>((_resolve, reject) => {
                  timer = setTimeout(
                    () => reject(new Error("Audio is blocked")),
                    VOICE_RESUME_TIMEOUT_MS,
                  );
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          }
          if (stopped || ctx.state !== "running") throw new Error("Audio is unavailable");
          return audio.play();
        },
        pause: () => audio.pause(),
        addEventListener: (type: "ended" | "error", listener: () => void) =>
          audio.addEventListener(type, listener),
        dispose: () => voice.dispose(),
      };
    },
    dispose() {
      disposed = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      for (const voice of voices.values()) voice.dispose();
      outputs.delete(output);
      if (context) void context.close().catch(() => {});
    },
  };
  outputs.add(output);
  return output;
}
