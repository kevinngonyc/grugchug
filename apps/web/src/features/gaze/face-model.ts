// Contract of ml/face.onnx and the raw MediaPipe preprocessing in ml/face.ipynb.
export const FACE_FRAMES = 30;
export const FACE_FEATURES = 478 * 3;
export const FACE_LABELS = ["Boredom", "Engagement", "Confusion", "Frustration"] as const;
export interface Landmark {
  x: number;
  y: number;
  z: number;
}
export interface PredictionDiagnostics {
  predictionId: number;
  frameId: number;
  inferenceMs: number;
  inputChange: number | null;
}
export type PredictionState =
  | { status: "loading" | "no-face" | "paused" }
  | { status: "collecting"; frames: number }
  | { status: "ready"; scores: number[]; label: string; diagnostics?: PredictionDiagnostics }
  | { status: "error"; message: string };

export function flattenFace(face: readonly Landmark[]): Float32Array {
  if (face.length !== 478) throw new Error("Expected 478 face landmarks");
  const values = new Float32Array(FACE_FEATURES);
  face.forEach(({ x, y, z }, i) => {
    values.set([x, y, z], i * 3);
  });
  if (!values.every(Number.isFinite)) throw new Error("Invalid face coordinates");
  return values;
}

export function packSequence(frames: readonly Float32Array[]): Float32Array {
  if (frames.length !== FACE_FRAMES || frames.some((f) => f.length !== FACE_FEATURES)) {
    throw new Error("Expected 30 frames of 1434 coordinates");
  }
  const values = new Float32Array(FACE_FRAMES * FACE_FEATURES);
  frames.forEach((frame, i) => {
    values.set(frame, i * FACE_FEATURES);
  });
  return values;
}

export function decodePrediction(values: ArrayLike<number>): PredictionState {
  const scores = Array.from(values);
  if (scores.length !== 4 || !scores.every(Number.isFinite))
    throw new Error("Invalid face model output");
  const index = scores.indexOf(Math.max(...scores));
  return { status: "ready", scores, label: FACE_LABELS[index] ?? "Unknown" };
}

/** RMS change in the actual normalized coordinates sent to consecutive model runs. */
export function inputChange(current: Float32Array, previous: Float32Array | null): number | null {
  if (!previous || previous.length !== current.length) return null;
  let squared = 0;
  for (let i = 0; i < current.length; i++) {
    const difference = (current[i] ?? 0) - (previous[i] ?? 0);
    squared += difference * difference;
  }
  return Math.sqrt(squared / current.length);
}
