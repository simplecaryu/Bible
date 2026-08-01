import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("analysis tokens and word details scroll independently in a short auxiliary panel", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const css = await readFile(path.join(root, "styles.css"), "utf8");
  const block = (selector) => css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

  assert.match(block(".analysis-panel"), /overflow:\s*hidden/);
  assert.match(block(".analysis-tokens"), /min-height:\s*0/);
  assert.match(block(".analysis-tokens"), /overflow:\s*auto/);
  assert.match(block(".analysis-token-detail"), /min-height:\s*0/);
  assert.doesNotMatch(block(".analysis-token-detail"), /max-height/);
});

test("workspace divider is not covered by legacy Bible-panel resize handles", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const css = await readFile(path.join(root, "styles.css"), "utf8");
  const rule = css.match(
    /\.panel-track\.workspace-grid\s+\.panel-resize-handle\s*\{([^}]*)\}/,
  )?.[1] ?? "";

  assert.match(rule, /display:\s*none/);
});

test("analysis details wire book-first paged Strong occurrences without another dialog", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const css = await readFile(path.join(root, "styles.css"), "utf8");

  assert.match(app, /getStrongOccurrences\(/);
  assert.match(app, /wholeBible\s*\?\s*null\s*:\s*currentAnalysis\.b/);
  assert.match(app, /limit:\s*50/);
  assert.match(app, /wholeBibleOccurrenceLabel/);
  assert.match(css, /\.analysis-occurrence-results\s*\{/);
  assert.doesNotMatch(app, /strong-occurrence-dialog/);
});
