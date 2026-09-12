// Shared by every tool that sends study material to a provider: turns a
// Material into the ProviderPart(s) a prompt attaches.
import type { Material } from "@grugchug/shared";
import type { ProviderPart } from "./provider";

export function materialParts(material: Material): ProviderPart[] {
  return material.kind === "text"
    ? [{ kind: "text", text: material.text }]
    : [{ kind: "document", mimeType: "application/pdf", base64: material.base64 }];
}
