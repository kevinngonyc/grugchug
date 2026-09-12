// Eye tracking. Reads the webcam, estimates where on the viewport the user is
// looking, and turns that into GazeSample values and attention metrics.
// Everything exported from here must work without the 3D scene.
export type { GazeSample } from "@grugchug/shared";
