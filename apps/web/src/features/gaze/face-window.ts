// Retains the latest camera frames and coalesces updates while inference is busy.
import { FACE_FRAMES, packSequence } from "./face-model";

export class FaceWindow {
  private frames: Float32Array[] = [];
  private pending = false;

  get size() {
    return this.frames.length;
  }

  push(frame: Float32Array) {
    this.frames.push(frame);
    if (this.frames.length > FACE_FRAMES) this.frames.shift();
    this.pending = true;
  }

  takeLatest(): Float32Array | null {
    if (!this.pending || this.frames.length < FACE_FRAMES) return null;
    const values = packSequence(this.frames);
    this.pending = false;
    return values;
  }

  clear() {
    this.frames = [];
    this.pending = false;
  }
}
