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

test("builds continuously adjustable rows for the occurrence preview", () => {
  assert.equal(typeof workspaceState.occurrencePreviewRows, "function");
  assert.equal(
    workspaceState.occurrencePreviewRows(0.4),
    "minmax(0, 0.6fr) 8px minmax(180px, 0.4fr)",
  );
  assert.notEqual(
    workspaceState.occurrencePreviewRows(0.41),
    workspaceState.occurrencePreviewRows(0.42),
  );
  assert.equal(
    workspaceState.occurrencePreviewRows(0.9),
    "minmax(0, 0.3fr) 8px minmax(180px, 0.7fr)",
  );
});

test("only disables occurrence verse navigation at the ends of the Bible", () => {
  const books = [{ chapters: 2 }, { chapters: 1 }];
  assert.deepEqual(
    workspaceState.occurrenceNavigationDisabled({ book: 0, chapter: 1, verse: 2 }, books, 5),
    { previous: false, next: false },
  );
  assert.deepEqual(
    workspaceState.occurrenceNavigationDisabled({ book: 0, chapter: 1, verse: 1 }, books, 5),
    { previous: true, next: false },
  );
  assert.deepEqual(
    workspaceState.occurrenceNavigationDisabled({ book: 1, chapter: 1, verse: 5 }, books, 5),
    { previous: false, next: true },
  );
});

test("keeps an existing preview passage intact until navigation can reload it", () => {
  const current = { book: 0, chapter: 1, verse: 1, enabledTranslations: ["GAE"] };
  const next = { book: 0, chapter: 2, verse: 3, enabledTranslations: ["GAE", "KJV"] };

  assert.deepEqual(workspaceState.prepareOccurrencePreviewNavigation(current, next), {
    panelPatch: { enabledTranslations: ["GAE", "KJV"] },
    target: { book: 0, chapter: 2, verse: 3 },
  });
});

test("word study snapshots the auxiliary workspace only once", () => {
  assert.equal(typeof workspaceState.beginWordStudySession, "function");
  const first = workspaceState.beginWordStudySession(null, {
    auxiliaryPanelIds: ["bible-2", "notes"],
    activePanelId: "notes",
  });
  const second = workspaceState.beginWordStudySession(first, {
    auxiliaryPanelIds: ["analysis"],
    activePanelId: "analysis",
  });

  assert.deepEqual(first.hiddenPanelIds, ["bible-2", "notes"]);
  assert.equal(first.activePanelId, "notes");
  assert.equal(second, first);
});

test("occurrence preview inherits main translations once and then reuses its identity", () => {
  assert.equal(typeof workspaceState.openOccurrencePreview, "function");
  const session = workspaceState.beginWordStudySession(null, {
    auxiliaryPanelIds: [],
    activePanelId: "bible-1",
  });
  const main = {
    enabledTranslations: ["NIV", "GAE"],
    highlightedTranslations: ["NIV"],
    dimmedTranslations: [],
  };
  const opened = workspaceState.openOccurrencePreview(session, main, {
    book: 0,
    chapter: 1,
    verse: 2,
  });
  opened.preview.enabledTranslations = ["KJV"];
  const moved = workspaceState.openOccurrencePreview(opened, main, {
    book: 1,
    chapter: 2,
    verse: 3,
  });

  assert.equal(moved.preview.id, "occurrence-preview");
  assert.deepEqual(moved.preview.enabledTranslations, ["KJV"]);
  assert.deepEqual(
    { book: moved.preview.book, chapter: moved.preview.chapter, verse: moved.preview.verse },
    { book: 1, chapter: 2, verse: 3 },
  );
  assert.deepEqual(main.enabledTranslations, ["NIV", "GAE"]);
});

test("preview verse navigation crosses chapter and book boundaries", () => {
  assert.equal(typeof workspaceState.adjacentVerseReference, "function");
  const books = [{ chapters: 2 }, { chapters: 1 }];
  const counts = new Map([["0:1", 3], ["0:2", 2], ["1:1", 4]]);
  const verseCount = (book, chapter) => counts.get(`${book}:${chapter}`);

  assert.deepEqual(
    workspaceState.adjacentVerseReference({ book: 0, chapter: 1, verse: 2 }, 1, books, verseCount),
    { book: 0, chapter: 1, verse: 3 },
  );
  assert.deepEqual(
    workspaceState.adjacentVerseReference({ book: 0, chapter: 1, verse: 3 }, 1, books, verseCount),
    { book: 0, chapter: 2, verse: 1 },
  );
  assert.deepEqual(
    workspaceState.adjacentVerseReference({ book: 1, chapter: 1, verse: 1 }, -1, books, verseCount),
    { book: 0, chapter: 2, verse: 2 },
  );
  assert.equal(
    workspaceState.adjacentVerseReference({ book: 0, chapter: 1, verse: 1 }, -1, books, verseCount),
    null,
  );
});

test("records bounded branching search history without duplicate current entries", () => {
  let history = { entries: [], index: -1 };
  history = workspaceState.recordSearchHistory(history, { query: "grace", translations: ["NIV"] }, 3);
  history = workspaceState.recordSearchHistory(history, { query: "faith", translations: ["KJV"] }, 3);
  history = workspaceState.recordSearchHistory(history, { query: "hope", translations: ["GAE"] }, 3);
  history = workspaceState.moveSearchHistory(history, -1);
  history = workspaceState.recordSearchHistory(history, { query: "love", translations: ["NRSV"] }, 3);
  history = workspaceState.recordSearchHistory(history, { query: "love", translations: ["NRSV"] }, 3);

  assert.deepEqual(history, {
    entries: [
      { query: "grace", translations: ["NIV"] },
      { query: "faith", translations: ["KJV"] },
      { query: "love", translations: ["NRSV"] },
    ],
    index: 2,
  });

  history = workspaceState.recordSearchHistory(history, { query: "peace", translations: ["ESV"] }, 3);
  assert.deepEqual(history.entries.map(({ query }) => query), ["faith", "love", "peace"]);
  assert.equal(history.index, 2);
});

test("moves search history only within available entries", () => {
  const history = {
    entries: [
      { query: "grace", translations: ["NIV"] },
      { query: "faith", translations: ["KJV"] },
    ],
    index: 1,
  };
  const back = workspaceState.moveSearchHistory(history, -1);
  assert.equal(back.index, 0);
  assert.deepEqual(workspaceState.currentSearchHistoryEntry(back), history.entries[0]);
  assert.equal(workspaceState.moveSearchHistory(back, -1).index, 0);
  assert.equal(workspaceState.moveSearchHistory(history, 1).index, 1);
});

test("lists ordinary Bible destinations with the active panel first", () => {
  const panels = [
    { id: "panel-1", book: 0 },
    { id: "occurrence-preview", occurrencePreview: true },
    { id: "panel-2", book: 39 },
  ];

  assert.deepEqual(workspaceState.referenceDestinationPanels(panels, "panel-2"), [
    { id: "panel-2", panelIndex: 1, active: true },
    { id: "panel-1", panelIndex: 0, active: false },
  ]);
});

test("records bounded branching reference history for reusable tool panels", () => {
  let history = { entries: [], index: -1 };
  history = workspaceState.recordReferenceHistory(history, { book: 0, chapter: 1, verse: 1 }, 3);
  history = workspaceState.recordReferenceHistory(history, { book: 0, chapter: 1, verse: 2 }, 3);
  history = workspaceState.recordReferenceHistory(history, { book: 0, chapter: 1, verse: 3 }, 3);
  history = workspaceState.moveReferenceHistory(history, -1);
  history = workspaceState.recordReferenceHistory(history, { book: 1, chapter: 1, verse: 1 }, 3);

  assert.deepEqual(history.entries, [
    { book: 0, chapter: 1, verse: 1 },
    { book: 0, chapter: 1, verse: 2 },
    { book: 1, chapter: 1, verse: 1 },
  ]);
  assert.deepEqual(workspaceState.currentReferenceHistoryEntry(history), history.entries[2]);
});
