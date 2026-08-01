import assert from "node:assert/strict";
import test from "node:test";

import * as workspaceState from "../workspace-state.js";
import {
  closeShortcutTarget,
  closeAuxiliaryPanel,
  ensureAuxiliaryPanel,
  panelFitCount,
  normalizeWorkspace,
  workspaceGrid,
} from "../workspace-state.js";

test("closes the most recently used visible tool before an auxiliary Bible", () => {
  assert.deepEqual(closeShortcutTarget({
    visibleTools: ["analysis", "notes"],
    recentTool: "analysis",
    activePanelId: "bible-2",
    mainPanelId: "bible-1",
  }), { type: "tool", id: "analysis" });
  assert.deepEqual(closeShortcutTarget({
    visibleTools: ["notes"],
    recentTool: "analysis",
    activePanelId: "bible-2",
    mainPanelId: "bible-1",
  }), { type: "tool", id: "notes" });
});

test("closes only a non-main Bible when no tool panel is visible", () => {
  assert.deepEqual(closeShortcutTarget({
    visibleTools: [],
    recentTool: null,
    activePanelId: "bible-2",
    mainPanelId: "bible-1",
  }), { type: "bible", id: "bible-2" });
  assert.equal(closeShortcutTarget({
    visibleTools: [],
    recentTool: null,
    activePanelId: "bible-1",
    mainPanelId: "bible-1",
  }), null);
});

test("keeps original language enabled by default and separates it from corpus translations", () => {
  assert.equal(typeof workspaceState.readingSourceOrder, "function");
  assert.deepEqual(workspaceState.readingSourceOrder(["NIV", "GAE"], undefined), [
    "NIV",
    "GAE",
    "ORIGINAL",
  ]);
  assert.deepEqual(workspaceState.splitReadingSourceOrder(["NIV", "ORIGINAL"]), {
    translations: ["NIV"],
    showOriginal: true,
  });
  assert.deepEqual(workspaceState.splitReadingSourceOrder(["NIV"]), {
    translations: ["NIV"],
    showOriginal: false,
  });
});

test("does not expose a second word-order mode", () => {
  assert.equal(workspaceState.defaultAnalysisOrder, undefined);
});

test("migrates the first legacy Bible panel to the full-height main panel", () => {
  const first = { book: 0, chapter: 1, enabledTranslations: ["NIV"] };
  const second = { book: 42, chapter: 3, enabledTranslations: ["GAE"] };

  const workspace = normalizeWorkspace({ panels: [first, second] });

  assert.equal(workspace.mainPanel, first);
  assert.deepEqual(workspace.auxiliaryPanels, [
    { id: "bible-2", type: "bible", panel: second, size: 1 },
  ]);
  assert.equal(workspace.auxiliaryRatio, 0.4);
});

test("one Bible always fills the reading workspace regardless of a two-panel preset", () => {
  assert.equal(panelFitCount(1, 2), 1);
  assert.equal(panelFitCount(3, 2), 2);
  assert.equal(panelFitCount(3, 1), 1);
});

test("creates a default main Bible when legacy state has no panels", () => {
  const fallback = { book: 0, chapter: 1 };

  const workspace = normalizeWorkspace({ panels: [] }, fallback);

  assert.equal(workspace.mainPanel, fallback);
  assert.deepEqual(workspace.auxiliaryPanels, []);
});

test("reuses notes and analysis auxiliary panels by type", () => {
  let workspace = normalizeWorkspace({ panels: [{ book: 0, chapter: 1 }] });

  workspace = ensureAuxiliaryPanel(workspace, "notes", { referenceKey: "verse:0:1:1" });
  workspace = ensureAuxiliaryPanel(workspace, "notes", { referenceKey: "chapter:0:1" });
  workspace = ensureAuxiliaryPanel(workspace, "analysis", { book: 0, chapter: 1, verse: 1 });

  assert.deepEqual(
    workspace.auxiliaryPanels.map(({ type }) => type),
    ["notes", "analysis"],
  );
  assert.equal(workspace.auxiliaryPanels[0].referenceKey, "chapter:0:1");
});

test("removes an auxiliary panel without changing the main panel", () => {
  const mainPanel = { book: 0, chapter: 1 };
  let workspace = normalizeWorkspace({ panels: [mainPanel] });
  workspace = ensureAuxiliaryPanel(workspace, "notes", { referenceKey: "book:0" });
  const notesId = workspace.auxiliaryPanels[0].id;

  workspace = closeAuxiliaryPanel(workspace, notesId);

  assert.equal(workspace.mainPanel, mainPanel);
  assert.deepEqual(workspace.auxiliaryPanels, []);
});

test("keeps the main panel full-height while auxiliary panels split the right side", () => {
  assert.deepEqual(workspaceGrid(1, 0.4), {
    split: false,
    auxiliaryCount: 0,
    columns: "minmax(0, 1fr)",
    rows: "minmax(0, 1fr)",
  });
  assert.deepEqual(workspaceGrid(3, 0.4), {
    split: true,
    auxiliaryCount: 2,
    columns: "minmax(0, 0.6fr) minmax(320px, 0.4fr)",
    rows: "repeat(2, minmax(0, 1fr))",
  });
});

test("changes actual grid columns for small divider movements", () => {
  assert.notEqual(workspaceGrid(2, 0.31).columns, workspaceGrid(2, 0.32).columns);
});
