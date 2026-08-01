import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("word study uses one full-height scrolling detail surface", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const css = await readFile(path.join(root, "styles.css"), "utf8");
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const block = (selector) => css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

  assert.doesNotMatch(html, /analysis-translation-order|analysis-original-order|analysis-tokens/);
  assert.doesNotMatch(app, /analysisMode|orderedTokens|orderNotice/);
  assert.match(block(".analysis-panel"), /grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(block(".analysis-token-detail"), /overflow:\s*auto/);
  assert.doesNotMatch(block(".analysis-token-detail"), /max-height/);
});

test("main-panel original words are independent clickable buttons", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const app = await readFile(path.join(root, "app.js"), "utf8");

  assert.match(app, /document\.createElement\("button"\)[\s\S]{0,240}compact-interlinear-word/);
  assert.match(app, /originalTokens\(original\)/);
  assert.match(app, /openWordStudy\(panelState, original, token\)/);
  assert.doesNotMatch(app, /Open original-order verse analysis/);
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

test("occurrence activation opens one lower-left Bible preview without moving main", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const css = await readFile(path.join(root, "styles.css"), "utf8");

  const handler = app.match(/button\.addEventListener\("click", \(\) => \{([\s\S]*?)\n    \}\);/)?.[1] ?? "";
  assert.match(app, /openOccurrencePreviewPanel\(item\)/);
  assert.match(app, /occurrencePreview/);
  assert.match(css, /\.word-study-active\s+\.occurrence-preview/);
  assert.doesNotMatch(handler, /goToPassage\(panelState/);
});
