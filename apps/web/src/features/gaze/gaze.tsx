import webgazer from "@webgazer-ts/core";
import { useEffect, useRef, useState } from "react";

interface GazeProps {
  /** How long you have to be turned away before we say so. Default: 2000ms. */
  awayThresholdMs?: number;
  /**
   * Max normalized left/right head turn (nose tip vs. eye-line, as a
   * fraction of interocular width) before we call it "away", AT the
   * reference distance the component calibrates to automatically. Scaled
   * up when you're closer to the camera, down when you're farther away
   * (see the module doc comment on distance scaling below). Default: 0.25.
   */
  yawThreshold?: number;
  /** Same idea, for looking down (e.g. at a keyboard/phone). Default: 0.55 — looser, since resting posture is rarely dead level. */
  pitchThresholdDown?: number;
  /** Same idea, for looking up. Default: 0.25. */
  pitchThresholdUp?: number;
  /**
   * Called on every sample with whether the user is facing the screen right
   * now. This is the raw per-tick observation, not the debounced "looking
   * away" message: smoothing it is the caller's business (see
   * `features/efficiency`, which folds it into an attention average).
   */
  onFacing?: (facing: boolean) => void;
  /**
   * Show live head-pose numbers under the message, and WebGazer's own webcam
   * preview — video, cyan face mesh, feedback box — for tuning the thresholds
   * above. Off by default: during a session the camera view is a distraction,
   * and nothing here needs it on screen. Tracking runs either way.
   */
  debug?: boolean;
}

// MediaPipe FaceMesh landmark indices (468, or 478 with irises). These are
// fixed by the model's topology — not something this app configures — and
// stable across any app built on @tensorflow-models/face-landmarks-detection.
const NOSE_TIP = 1;
const RIGHT_EYE_OUTER = 33; // subject's right eye, outer corner
const RIGHT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 263; // subject's left eye, outer corner
const LEFT_EYE_INNER = 362;
const MIN_EXPECTED_LANDMARKS = 468;

// How many recent samples to average, to smooth out per-frame jitter.
const SMOOTHING_SAMPLES = 3;

// WebGazer's prediction loop runs a face-mesh model on every animation frame.
// That is the one cost in this app that competes with the render loop frame
// for frame, and nothing here needs sixty readings a second: a head turn is a
// slow event, and `awayThresholdMs` is two seconds.
//
// So the tracker sleeps between readings. Each cycle wakes it, waits for one
// fresh reading, takes it, and pauses again — which keeps the tracker awake
// for about as long as a single inference takes on whatever machine this is,
// rather than a fixed guess.
//
// GAZE_SAMPLE_MS is the dial. Every reading costs one dropped frame, so this
// is a straight trade of tracking responsiveness against smoothness, and a
// second is generous for what the reading is for: `awayThresholdMs` is two
// seconds and attention's half-life is a minute. Turning it down makes the
// facing decision quicker and the scene choppier.
//
// The trade exists because this tracker runs its model on the main thread and
// there is no way to ask it not to — see the note in .llm/architecture.md on
// replacing it. Nothing here can make an inference free; it can only make it
// rare.
//
// It has to be one reading per wake rather than a burst of them. A burst is
// cheaper on paper and much worse to look at: it gathers the dropped frames
// into one long hitch instead of spreading them, and a quarter-second freeze
// once a second reads as the whole app stuttering.
//
// Safe because `pause()` and `resume()` only stop and start that loop: the
// camera stream stays open, so there is no permission prompt, no camera light
// blinking, and no reinitialisation between readings.
const GAZE_SAMPLE_MS = 1_000;
/** How often to check whether the tracker has produced a new reading yet. */
const WAKE_POLL_MS = 16;
/** Stop waiting for a fresh reading. Reached when there is no face to find. */
const WAKE_MAX_MS = 250;

// How quickly the "reference distance" (typical interocular width) adapts
// to a real change in seating position, per reading. Readings come at
// GAZE_SAMPLE_MS, so ~0.02 gives a time constant of roughly 10s — slow enough
// that a few seconds turned away, or normal head-turn jitter, barely moves it,
// but a real move to sit closer or farther away is picked up within well under
// a minute.
const DISTANCE_REFERENCE_EMA_ALPHA = 0.02;

// Clamp how far distance-scaling is allowed to stretch/shrink the base
// thresholds, so a corrupted first reading (or someone briefly leaning
// right into the lens) can't make the thresholds absurd.
const MIN_DISTANCE_FACTOR = 0.6;
const MAX_DISTANCE_FACTOR = 1.8;

/**
 * A cheap stand-in for "which frame is this". Landmarks jitter every frame
 * even when you hold still, so a changed nose tip means the tracker has run
 * again — which is how the wake window ends as early as it possibly can.
 */
function positionSignature(positions: number[][] | null): number | null {
  const nose = positions?.[NOSE_TIP];
  if (!nose) return null;
  return coord(nose, 0) * 4096 + coord(nose, 1);
}

interface HeadPose {
  yaw: number;
  pitch: number;
  interocularWidth: number;
}

function coord(point: number[] | undefined, axis: 0 | 1): number {
  return point?.[axis] ?? 0;
}

function distance(a: number[] | undefined, b: number[] | undefined): number {
  const dx = coord(a, 0) - coord(b, 0);
  const dy = coord(a, 1) - coord(b, 1);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Head yaw/pitch estimated from the nose tip's position relative to the eye
 * line, normalized by interocular width (so the raw ratio is roughly scale
 * invariant — it doesn't much matter how big your face appears in frame).
 *
 * This measures rotation, not position — turning your head shifts the nose
 * tip relative to the eye line even though your face's overall position in
 * the frame barely changes, which is what makes it reliable for "did you
 * turn your head" instead of "did you lean over".
 *
 * Interocular-width normalization isn't perfectly distance-invariant,
 * though: real webcams have perspective/parallax, and a face close to the
 * lens shows a bigger yaw/pitch ratio for the *same* physical head turn
 * than the same turn does farther away (the nose sits closer to the camera
 * than the eyes, so its parallax is proportionally larger up close). We
 * also return interocularWidth itself so the caller can correct for that.
 */
function computeHeadPose(positions: number[][]): HeadPose | null {
  if (positions.length < MIN_EXPECTED_LANDMARKS) return null;

  const noseTip = positions[NOSE_TIP];
  const rOuter = positions[RIGHT_EYE_OUTER];
  const rInner = positions[RIGHT_EYE_INNER];
  const lOuter = positions[LEFT_EYE_OUTER];
  const lInner = positions[LEFT_EYE_INNER];
  if (!noseTip || !rOuter || !rInner || !lOuter || !lInner) return null;

  const eyeLineCenterX =
    (coord(rOuter, 0) + coord(rInner, 0) + coord(lOuter, 0) + coord(lInner, 0)) / 4;
  const eyeLineCenterY =
    (coord(rOuter, 1) + coord(rInner, 1) + coord(lOuter, 1) + coord(lInner, 1)) / 4;
  const interocularWidth = distance(rOuter, lOuter);
  if (interocularWidth < 1) return null;

  return {
    yaw: (coord(noseTip, 0) - eyeLineCenterX) / interocularWidth,
    pitch: (coord(noseTip, 1) - eyeLineCenterY) / interocularWidth,
    interocularWidth,
  };
}

interface DebugInfo {
  yaw: number;
  pitch: number;
  interocularWidth: number;
  referenceWidth: number;
  distanceFactor: number;
  effectiveYawThreshold: number;
  effectivePitchThresholdDown: number;
  effectivePitchThresholdUp: number;
  facing: boolean;
  awayForMs: number;
}

export function Gaze({
  awayThresholdMs = 2000,
  yawThreshold = 0.18,
  pitchThresholdDown = 0.48,
  pitchThresholdUp = 0.2,
  onFacing,
  debug = false,
}: GazeProps) {
  const [lookingAway, setLookingAway] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const lastOnScreenAtRef = useRef(Date.now());
  const yawHistoryRef = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);
  const widthHistoryRef = useRef<number[]>([]);
  const referenceWidthRef = useRef<number | null>(null);
  // Held in a ref so a caller passing an inline arrow does not restart
  // WebGazer — and the camera — on every render.
  const onFacingRef = useRef(onFacing);
  onFacingRef.current = onFacing;

  useEffect(() => {
    // Set before begin(): the renderers read these when they are created, so
    // the preview never flashes up on the way to being hidden. The gaze dot
    // stays off in either mode — this component reads head pose from the
    // landmarks and never uses WebGazer's on-screen prediction.
    webgazer
      .showVideoPreview(debug)
      .showFaceOverlay(debug)
      .showFaceFeedbackBox(debug)
      .showPredictionPoints(false);

    webgazer.begin();

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Which reading was last taken, so a wake can end as soon as a new one
    // lands instead of waiting out a fixed guess.
    let lastSignature: number | null = null;

    const stopSampling = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const sample = (positions: number[][] | null) => {
      const pose = positions ? computeHeadPose(positions) : null;

      let facing = false;
      let smoothedYaw = 0;
      let smoothedPitch = 0;
      let smoothedWidth = 0;
      let distanceFactor = 1;
      let effectiveYawThreshold = yawThreshold;
      let effectivePitchThresholdDown = pitchThresholdDown;
      let effectivePitchThresholdUp = pitchThresholdUp;

      if (pose) {
        const yawHistory = yawHistoryRef.current;
        const pitchHistory = pitchHistoryRef.current;
        const widthHistory = widthHistoryRef.current;
        yawHistory.push(pose.yaw);
        pitchHistory.push(pose.pitch);
        widthHistory.push(pose.interocularWidth);
        if (yawHistory.length > SMOOTHING_SAMPLES) yawHistory.shift();
        if (pitchHistory.length > SMOOTHING_SAMPLES) pitchHistory.shift();
        if (widthHistory.length > SMOOTHING_SAMPLES) widthHistory.shift();

        smoothedYaw = yawHistory.reduce((sum, v) => sum + v, 0) / yawHistory.length;
        smoothedPitch = pitchHistory.reduce((sum, v) => sum + v, 0) / pitchHistory.length;
        smoothedWidth = widthHistory.reduce((sum, v) => sum + v, 0) / widthHistory.length;

        // Learn "typical" distance from the camera automatically. Bootstrap
        // on the first reading, then drift slowly toward the current width
        // so a real change in seating position is picked up over time
        // without being thrown off by a brief turn away.
        if (referenceWidthRef.current === null) {
          referenceWidthRef.current = smoothedWidth;
        } else {
          referenceWidthRef.current =
            referenceWidthRef.current * (1 - DISTANCE_REFERENCE_EMA_ALPHA) +
            smoothedWidth * DISTANCE_REFERENCE_EMA_ALPHA;
        }

        const referenceWidth = referenceWidthRef.current;
        distanceFactor =
          referenceWidth > 0
            ? Math.min(
                MAX_DISTANCE_FACTOR,
                Math.max(MIN_DISTANCE_FACTOR, smoothedWidth / referenceWidth),
              )
            : 1;

        effectiveYawThreshold = yawThreshold * distanceFactor;
        effectivePitchThresholdDown = pitchThresholdDown * distanceFactor;
        effectivePitchThresholdUp = pitchThresholdUp * distanceFactor;

        facing =
          Math.abs(smoothedYaw) <= effectiveYawThreshold &&
          Math.abs(smoothedPitch) <= effectivePitchThresholdDown &&
          Math.abs(smoothedPitch) >= effectivePitchThresholdUp;
      } else {
        // No face, or an unreliable reading — reset smoothing so a
        // reappearing face isn't averaged against stale history. Leave the
        // learned reference distance alone; it shouldn't reset just because
        // you looked away briefly.
        yawHistoryRef.current = [];
        pitchHistoryRef.current = [];
        widthHistoryRef.current = [];
      }

      onFacingRef.current?.(facing);

      if (facing) {
        lastOnScreenAtRef.current = Date.now();
      }

      const awayForMs = Date.now() - lastOnScreenAtRef.current;
      setLookingAway(awayForMs >= awayThresholdMs);

      if (debug) {
        setDebugInfo({
          yaw: smoothedYaw,
          pitch: smoothedPitch,
          interocularWidth: smoothedWidth,
          referenceWidth: referenceWidthRef.current ?? 0,
          distanceFactor,
          effectiveYawThreshold,
          effectivePitchThresholdDown,
          effectivePitchThresholdUp,
          facing,
          awayForMs,
        });
      }
    };

    // Wake, wait for one fresh reading, take it, sleep. See GAZE_SAMPLE_MS.
    const runCycle = () => {
      if (disposed || document.hidden) return;
      const wokeAt = Date.now();

      void webgazer
        .resume()
        .then(() => {
          const waitForReading = () => {
            if (disposed || document.hidden) return;

            const positions = webgazer.getTracker()?.getPositions() ?? null;
            const signature = positionSignature(positions);
            const fresh = signature !== null && signature !== lastSignature;
            const waited = Date.now() - wokeAt;

            if (!fresh && waited < WAKE_MAX_MS) {
              timer = setTimeout(waitForReading, WAKE_POLL_MS);
              return;
            }

            lastSignature = signature;
            sample(positions);
            webgazer.pause();
            // A wake that found nothing spent the whole cap looking, so it
            // sleeps a full cycle rather than going straight back round.
            timer = setTimeout(
              runCycle,
              fresh ? Math.max(0, GAZE_SAMPLE_MS - waited) : GAZE_SAMPLE_MS,
            );
          };
          waitForReading();
        })
        .catch(() => {
          // A failed wake is not fatal, and it must not leave the tracker
          // asleep for good: try again on the next cycle.
          if (!disposed) timer = setTimeout(runCycle, GAZE_SAMPLE_MS);
        });
    };

    const startSampling = () => {
      stopSampling();
      runCycle();
    };

    // Background tabs still ran face mesh before this — pause the tracker and
    // the 200ms sample loop while hidden, and treat the learner as away.
    const onVisibility = () => {
      if (document.hidden) {
        stopSampling();
        webgazer.pause();
        onFacingRef.current?.(false);
        setLookingAway(true);
      } else {
        // runCycle wakes the tracker itself.
        startSampling();
      }
    };

    if (document.hidden) {
      webgazer.pause();
      onFacingRef.current?.(false);
      setLookingAway(true);
    } else {
      startSampling();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stopSampling();
      webgazer.end();
    };
  }, [awayThresholdMs, yawThreshold, pitchThresholdDown, pitchThresholdUp, debug]);

  return (
    <div style={{ padding: 16, fontFamily: "monospace" }}>
      <div>{lookingAway ? "Looking away from the screen" : "Looking at the screen"}</div>
      {debug && debugInfo && (
        <pre style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          {JSON.stringify(
            {
              yaw: debugInfo.yaw.toFixed(3),
              pitch: debugInfo.pitch.toFixed(3),
              interocularWidth: debugInfo.interocularWidth.toFixed(1),
              referenceWidth: debugInfo.referenceWidth.toFixed(1),
              distanceFactor: debugInfo.distanceFactor.toFixed(2),
              effectiveYawThreshold: debugInfo.effectiveYawThreshold.toFixed(3),
              effectivePitchThresholdDown: debugInfo.effectivePitchThresholdDown.toFixed(3),
              effectivePitchThresholdUp: debugInfo.effectivePitchThresholdUp.toFixed(3),
              facing: debugInfo.facing,
              awayForMs: debugInfo.awayForMs,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
