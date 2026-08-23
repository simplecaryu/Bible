import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("search history and reference destinations are wired into the desktop UI", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);

  assert.match(html, /id="search-history-back"/);
  assert.match(html, /id="search-history-forward"/);
  assert.match(html, /id="reference-destination-dialog"/);
  assert.match(html, /id="reference-destination-list"/);
  assert.match(app, /recordSearchHistory/);
  assert.match(app, /moveSearchHistory/);
  assert.match(app, /referenceDestinationPanels/);
  assert.match(css, /\.reference-destination-dialog\s*\{/);
});

test("cross references use a reusable workspace tool panel", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);

  assert.match(html, /class="workspace-tool-panel cross-reference-panel"/);
  assert.match(html, /id="cross-reference-history-back"/);
  assert.match(html, /id="cross-reference-results"/);
  assert.match(app, /getCrossReferences/);
  assert.match(app, /recordReferenceHistory/);
  assert.match(app, /cross-reference-button/);
  assert.match(css, /\.cross-reference-results\s*\{/);
});

test("verse note and cross-reference controls stay in one click-safe action rail", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);
  const actionRailRule = css.match(/\.verse-actions\s*\{([^}]*)\}/)?.[1] ?? "";
  const crossReferenceRule = css.match(/\.cross-reference-button\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(app, /verseActions\.className = "verse-actions"/);
  assert.match(app, /verseActions\.append\(noteButton, crossReferenceButton\)/);
  assert.match(actionRailRule, /position:\s*absolute/);
  assert.match(actionRailRule, /display:\s*flex/);
  assert.doesNotMatch(crossReferenceRule, /top:\s*60px/);
});

test("unmodified C is wired to the existing cross-reference opening path", async () => {
  const app = await readFile(new URL("app.js", root), "utf8");

  assert.match(app, /function handleCrossReferenceShortcut\(event\)/);
  assert.match(app, /shouldHandleCrossReferenceShortcut\(event, dialogOpen\)/);
  assert.match(app, /openCrossReferences\(panelState, verse\)/);
  assert.match(app, /document\.addEventListener\("keydown", handleCrossReferenceShortcut\)/);
});

test("word study provides direct Strong navigation and classic dictionary details", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);

  assert.match(html, /id="strong-browser-input"/);
  assert.match(html, /id="strong-browser-previous"/);
  assert.match(html, /id="strong-browser-next"/);
  assert.match(app, /getStrongEntry/);
  assert.match(app, /normalizeStrongCode/);
  assert.match(app, /classicDefinition/);
  assert.match(app, /strongCodesInText/);
  assert.match(css, /\.strong-browser\s*\{/);
});
