import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ALL_MODEL_URLS } from "./models";

const publicDir = join(import.meta.dir, "../../../public");

describe("model registry", () => {
  test("every model URL points at a committed file", async () => {
    for (const url of ALL_MODEL_URLS) {
      expect(await Bun.file(join(publicDir, url)).exists()).toBe(true);
    }
  });
});
