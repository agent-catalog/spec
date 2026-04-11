import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadVectors(subdir: "positive" | "negative"): Promise<Array<{ name: string; catalog: unknown }>> {
  const dir = resolve(__dirname, subdir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const vectors: Array<{ name: string; catalog: unknown }> = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const text = await readFile(resolve(dir, entry), "utf-8");
    vectors.push({ name: entry, catalog: JSON.parse(text) });
  }
  return vectors;
}

describe("conformance: positive vectors", async () => {
  const vectors = await loadVectors("positive");
  if (vectors.length === 0) {
    it("(no positive vectors yet)", () => {
      expect(true).toBe(true);
    });
    return;
  }
  for (const { name, catalog } of vectors) {
    it(`accepts ${name}`, async () => {
      const result = await validateCatalog(catalog);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

describe("conformance: negative vectors", async () => {
  const vectors = await loadVectors("negative");
  if (vectors.length === 0) {
    it("(no negative vectors yet)", () => {
      expect(true).toBe(true);
    });
    return;
  }
  for (const { name, catalog } of vectors) {
    it(`rejects ${name}`, async () => {
      const result = await validateCatalog(catalog);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }
});
