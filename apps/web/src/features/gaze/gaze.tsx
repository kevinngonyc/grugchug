import { useCallback, useEffect, useRef, useState } from "react";
// Face prediction temporarily disabled.
// import { FacePrediction } from "./face-prediction";
import { faceTracker } from "./face-tracker";

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
   * Called whenever the debounced "looking away" message changes — the same
   * value shown in this component's own text, gated by `awayThresholdMs` and
   * the miss tolerance below, unlike `onFacing`'s raw per-tick reading. For a
   * caller that wants to reflect the headline state (a border colour, an
   * icon) without re-deriving the debouncing itself.
   */
  onLookingAwayChange?: (lookingAway: boolean) => void;
  /**
   * Show live head-pose numbers under the message, and the webcam
   * preview — for tuning the thresholds
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
const SMOOTHING_SAMPLES = 5;

// How quickly the "reference distance" (typical interocular width) adapts
// to a real change in seating position, per 200ms tick. ~0.02 gives a time
// constant of roughly 10s — slow enough that a few seconds turned away, or
// normal head-turn jitter, barely moves it, but a real move to sit closer
// or farther away is picked up within well under a minute.
const DISTANCE_REFERENCE_EMA_ALPHA = 0.02;

// Clamp how far distance-scaling is allowed to stretch/shrink the base
// thresholds, so a corrupted first reading (or someone briefly leaning
// right into the lens) can't make the thresholds absurd.
const MIN_DISTANCE_FACTOR = 0.6;
const MAX_DISTANCE_FACTOR = 1.8;

// How often head pose is read from the tracker.
const SAMPLE_INTERVAL_MS = 200;

// A run of misses this short is treated as noise (a blink, one bad frame)
// rather than as looking away: reuse the last known pose instead of
// resetting smoothing and reporting not-facing. Only a longer run — which
// awayThresholdMs above still gates before anything is shown — means no face
// is really there. 3 ticks is 600ms, comfortably longer than a blink.
const MISS_TOLERANCE = 3;

// One camera and continuous MediaPipe detection loop shared across mounts.
let trackerReady: Promise<void> | null = null;
let trackerUsers = 0;

function startTracker(): Promise<void> {
  trackerReady ??= (async () => {
    await faceTracker.begin();
  })().catch((error: unknown) => {
    // Let the next mount try again (a camera permission granted later).
    trackerReady = null;
    throw error;
  });
  return trackerReady;
}

function releaseTracker(): void {
  trackerUsers -= 1;
  const ready = trackerReady;
  if (!ready) return;
  void ready.then(
    () => {
      if (trackerUsers > 0 || trackerReady !== ready) return;
      trackerReady = null;
      faceTracker.end();
    },
    () => {},
  );
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
  onLookingAwayChange,
  debug = false,
}: GazeProps) {
  const [lookingAway, setLookingAway] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const lastOnScreenAtRef = useRef(Date.now());
  const yawHistoryRef = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);
  const widthHistoryRef = useRef<number[]>([]);
  const referenceWidthRef = useRef<number | null>(null);
  const missesRef = useRef(0);
  // Held in refs so a caller passing an inline arrow does not restart
  // MediaPipe — and the camera — on every render.
  const onFacingRef = useRef(onFacing);
  onFacingRef.current = onFacing;
  const onLookingAwayChangeRef = useRef(onLookingAwayChange);
  onLookingAwayChangeRef.current = onLookingAwayChange;
  const lookingAwayRef = useRef(false);

  // Only the transitions, not every tick that reaffirms the same value. Reads
  // only refs and the stable setState, so this identity never changes.
  const reportLookingAway = useCallback((value: boolean) => {
    if (lookingAwayRef.current !== value) {
      lookingAwayRef.current = value;
      onLookingAwayChangeRef.current?.(value);
    }
    setLookingAway(value);
  }, []);

  useEffect(() => {
    faceTracker.showVideoPreview(debug);

    let disposed = false;
    let ready = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const stopSampling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const markAway = () => {
      onFacingRef.current?.(false);
      reportLookingAway(true);
    };

    const sample = () => {
      const positions = faceTracker.getPositions();
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
        missesRef.current = 0;
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
      } else if (missesRef.current < MISS_TOLERANCE) {
        // A short gap — a blink, one bad frame — is not a real "away": hold
        // the previous reading rather than snapping to not-facing over it.
        missesRef.current += 1;
        return;
      } else {
        // No face for a real stretch — reset smoothing so a reappearing face
        // isn't averaged against stale history. Leave the learned reference
        // distance alone; it shouldn't reset just because you looked away.
        yawHistoryRef.current = [];
        pitchHistoryRef.current = [];
        widthHistoryRef.current = [];
      }

      onFacingRef.current?.(facing);

      if (facing) {
        lastOnScreenAtRef.current = Date.now();
      }

      const awayForMs = Date.now() - lastOnScreenAtRef.current;
      reportLookingAway(awayForMs >= awayThresholdMs);

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

    const startSampling = () => {
      stopSampling();
      interval = setInterval(sample, SAMPLE_INTERVAL_MS);
    };

    // Background tabs still ran face mesh before this — pause the tracker and
    // the sample loop while hidden, and treat the learner as away.
    const onVisibility = () => {
      if (document.hidden) {
        stopSampling();
        faceTracker.pause();
        markAway();
      } else if (ready) {
        void faceTracker.resume().then(() => {
          if (!disposed && !document.hidden) startSampling();
        });
      }
    };

    trackerUsers += 1;
    startTracker().then(
      () => {
        if (disposed) return;
        ready = true;
        if (document.hidden) {
          faceTracker.pause();
          markAway();
        } else {
          startSampling();
        }
      },
      () => {
        // The prediction panel shows the camera/model error.
        if (!disposed) markAway();
      },
    );
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stopSampling();
      releaseTracker();
    };
  }, [
    awayThresholdMs,
    yawThreshold,
    pitchThresholdDown,
    pitchThresholdUp,
    debug,
    reportLookingAway,
  ]);

  return (
    <div style={{ padding: 16, fontFamily: "monospace" }}>
      <div>{lookingAway ? "Looking away from the screen" : "Looking at the screen"}</div>
      {/* <FacePrediction /> */}
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
