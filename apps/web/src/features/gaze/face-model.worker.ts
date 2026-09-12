import { env, InferenceSession, Tensor } from "onnxruntime-web/wasm";
import { decodePrediction, FACE_FEATURES, FACE_FRAMES, inputChange } from "./face-model";

env.wasm.numThreads = 1;
env.wasm.wasmPaths = `${self.location.origin}/face-models/ort/`;
let session: Promise<InferenceSession> | undefined;
let previousInput: Float32Array | null = null;
let previousGeneration: number | undefined;
let predictionId = 0;
self.onmessage = async (
  event: MessageEvent<{ values?: Float32Array; generation: number; frameId?: number }>,
) => {
  const { values, generation, frameId = 0 } = event.data;
  try {
    session ??= InferenceSession.create("/face-models/face.onnx", {
      executionProviders: ["wasm"],
      externalData: [{ path: "face.onnx.data", data: "/face-models/face.onnx.data" }],
    });
    const model = await session;
    if (!values) {
      self.postMessage({ generation, loaded: true });
      return;
    }
    const input = new Tensor("float32", values, [1, FACE_FRAMES, FACE_FEATURES]);
    let outputs: Awaited<ReturnType<typeof model.run>> | undefined;
    try {
      const started = performance.now();
      outputs = await model.run({ src: input, tgt: input });
      const inferenceMs = performance.now() - started;
      const output = outputs.output;
      if (output?.type !== "float32") throw new Error("Missing face model output");
      const change = inputChange(values, previousGeneration === generation ? previousInput : null);
      previousInput = values.slice();
      previousGeneration = generation;
      predictionId += 1;
      self.postMessage({
        generation,
        prediction: {
          ...decodePrediction(output.data as Float32Array),
          diagnostics: { predictionId, frameId, inferenceMs, inputChange: change },
        },
      });
    } finally {
      input.dispose();
      if (outputs) for (const output of Object.values(outputs)) output.dispose();
    }
  } catch (error) {
    self.postMessage({
      generation,
      prediction: {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
};
