// Shared MediaPipe webcam landmarks drive head-pose attention and local ONNX
// face predictions. Predictions are display-only; attention owns the focus signal.
// Everything exported from here must work without the 3D scene.
export type { GazeSample } from "@grugchug/shared";

export { Gaze } from "./gaze";
