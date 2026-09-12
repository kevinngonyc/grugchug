// Keep the notebook's model files authoritative; serve local runtime assets in dev/build.
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const target = resolve(root, "apps/web/public/face-models");
async function copy(source: string, destination: string) {
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, Bun.file(source));
}
for (const name of ["face_landmarker.task"]) {
  await copy(resolve(root, "ml", name), resolve(target, name));
}
for (const [pkg, subdir, output] of [
  ["@mediapipe/tasks-vision", "wasm", "mediapipe"],
  // Face prediction disabled: ["onnxruntime-web", "dist", "ort"],
] as const) {
  const entry = Bun.resolveSync(pkg, resolve(root, "apps/web"));
  const directory = resolve(dirname(entry), subdir);
  for await (const name of new Bun.Glob("*.{wasm,mjs,js}").scan(directory)) {
    await copy(resolve(directory, name), resolve(target, output, name));
  }
}
