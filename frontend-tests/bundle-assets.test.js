import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Tauri exposes every local app.js import at its requested embedded path", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const config = JSON.parse(
    await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  // Tauri embeds each explicitly listed file relative to that file's parent,
  // so "../frontend/notes-ui.js" is served as "notes-ui.js", not
  // "frontend/notes-ui.js".
  const embeddedPaths = new Set(
    config.build.frontendDist.map((entry) => path.basename(entry)),
  );
  const imports = [...app.matchAll(/from\s+"\.\/([^"]+)"/g)].map((match) => match[1]);

  for (const imported of imports) {
    assert.ok(
      embeddedPaths.has(imported),
      `${imported} is imported but Tauri does not expose that embedded path`,
    );
  }
});
