import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Tauri bundles every local module imported by app.js", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const config = JSON.parse(
    await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  const bundled = new Set(config.build.frontendDist);
  const imports = [...app.matchAll(/from\s+"\.\/([^"]+)"/g)].map((match) => `../${match[1]}`);

  for (const imported of imports) {
    assert.ok(bundled.has(imported), `${imported} is imported but missing from frontendDist`);
  }
});
