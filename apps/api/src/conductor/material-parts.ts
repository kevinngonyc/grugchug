// Shared by every tool that sends study material to a provider: turns the
// learner's uploaded materials into the ProviderParts a prompt attaches. One
// route covers every file they uploaded, so this always takes the whole list.
import type { Material } from "@grugchug/shared";
import type { ProviderPart } from "./provider";

export function materialParts(materials: readonly Material[]): ProviderPart[] {
  return materials.map((material) =>
    material.kind === "text"
      ? ({ kind: "text", text: material.text } as const)
      : ({ kind: "document", mimeType: "application/pdf", base64: material.base64 } as const),
  );
}
