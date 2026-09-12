// One continuous MediaPipe loop feeds both head pose and the ONNX worker.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { FACE_FRAMES, flattenFace, type PredictionState } from "./face-model";
import { FaceWindow } from "./face-window";

// Temporarily disabled: keep MediaPipe head pose, but do not buffer or infer face scores.
const FACE_PREDICTION_ENABLED = false;

let prediction: PredictionState = { status: "loading" };
const listeners = new Set<() => void>();
function publish(value: PredictionState) {
  if (
    prediction.status === value.status &&
    (value.status === "loading" || value.status === "no-face" || value.status === "paused")
  )
    return;
  prediction = value;
  for (const listener of listeners) listener();
}
export const subscribePrediction = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPrediction = () => prediction;

let video: HTMLVideoElement | null = null;
let landmarker: FaceLandmarker | null = null;
let worker: Worker | null = null;
let positions: number[][] | null = null;
const frames = new FaceWindow();
let lastFace: Float32Array | null = null;
let lastFaceAt = 0;
let videoTime = -1;
let animation = 0;
let paused = true;
let busy = true;
let modelReady = false;
let modelFailed = false;
let generation = 0;
let preview = false;
let frameId = 0;

function resetSequence() {
  frames.clear();
  lastFace = null;
  positions = null;
  generation += 1;
}

function predictLatest() {
  if (paused || busy || !modelReady || modelFailed || !worker) return;
  const values = frames.takeLatest();
  if (!values) return;
  busy = true;
  worker.postMessage({ values, generation, frameId }, [values.buffer]);
}

function tick(now: number) {
  if (paused || !video || !landmarker) return;
  try {
    if (video.readyState >= 2 && video.currentTime !== videoTime) {
      videoTime = video.currentTime;
      const face = landmarker.detectForVideo(video, now).faceLandmarks[0];
      if (face) {
        // Existing head-pose thresholds use pixel distances; ONNX uses raw normalized xyz.
        positions = face.map(({ x, y }) => [
          x * (video?.videoWidth ?? 1),
          y * (video?.videoHeight ?? 1),
        ]);
        if (FACE_PREDICTION_ENABLED) lastFace = flattenFace(face);
        lastFaceAt = now;
      } else {
        positions = null;
      }
      if (FACE_PREDICTION_ENABLED && lastFace && now - lastFaceAt <= 700) {
        frameId += 1;
        frames.push(lastFace);
        if (!modelFailed && modelReady) {
          if (frames.size < FACE_FRAMES) publish({ status: "collecting", frames: frames.size });
          predictLatest();
        }
      }
    }
    // A stalled/ended camera must not leave a previous prediction on screen.
    if (now - lastFaceAt > 700) {
      if (lastFace || frames.size) resetSequence();
      positions = null;
      if (!modelFailed) publish({ status: "no-face" });
    }
  } catch (error) {
    publish({ status: "error", message: error instanceof Error ? error.message : String(error) });
    faceTracker.pause();
    return;
  }
  animation = requestAnimationFrame(tick);
}

export const faceTracker = {
  async begin() {
    frameId = 0;
    publish({ status: "loading" });
    try {
      const vision = await FilesetResolver.forVisionTasks("/face-models/mediapipe");
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/face-models/face_landmarker.task" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.style.cssText =
        "position:fixed;right:16px;top:16px;width:200px;z-index:30;transform:scaleX(-1)";
      video.hidden = !preview;
      document.body.append(video);
      video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      await video.play();
      if (FACE_PREDICTION_ENABLED) {
        worker = new Worker(new URL("./face-model.worker.ts", import.meta.url), { type: "module" });
        busy = true;
        modelReady = false;
        modelFailed = false;
        worker.onmessage = (event) => {
          busy = false;
          if (event.data.loaded) {
            modelReady = true;
            predictLatest();
            return;
          }
          if (event.data.prediction?.status === "error") {
            modelFailed = true;
            publish(event.data.prediction);
          } else if (event.data.generation === generation && !paused) {
            publish(event.data.prediction);
          }
          predictLatest();
        };
        worker.onerror = () => {
          busy = false;
          modelFailed = true;
          publish({ status: "error", message: "Face prediction worker failed to load" });
        };
        worker.postMessage({ generation });
      }
      await faceTracker.resume();
    } catch (error) {
      faceTracker.end();
      publish({ status: "error", message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },
  showVideoPreview(show: boolean) {
    preview = show;
    if (video) video.hidden = !show;
  },
  getPositions: () => positions,
  pause() {
    paused = true;
    cancelAnimationFrame(animation);
    resetSequence();
    if (prediction.status !== "error") publish({ status: "paused" });
  },
  async resume() {
    if (!paused) return;
    paused = false;
    videoTime = -1;
    resetSequence();
    if (!modelFailed)
      publish(modelReady ? { status: "collecting", frames: 0 } : { status: "loading" });
    animation = requestAnimationFrame(tick);
  },
  end() {
    faceTracker.pause();
    worker?.terminate();
    worker = null;
    landmarker?.close();
    landmarker = null;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    video?.remove();
    video = null;
    modelReady = false;
  },
};
