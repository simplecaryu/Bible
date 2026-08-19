const AUXILIARY_TYPES = new Set(["bible", "notes", "analysis"]);
export const ORIGINAL_SOURCE_ID = "ORIGINAL";

function normalizedRatio(value) {
  const ratio = Number(value);
  return Number.isFinite(ratio) ? Math.max(0.25, Math.min(ratio, 0.65)) : 0.4;
}

function nextPanelId(panels, type) {
  let number = 1;
  const used = new Set(panels.map(({ id }) => id));
  while (used.has(`${type}-${number}`)) number += 1;
  return `${type}-${number}`;
}

function normalizedAuxiliaryPanel(panel, index) {
  const type = AUXILIARY_TYPES.has(panel?.type) ? panel.type : "bible";
  return {
    ...panel,
    id: panel?.id || `${type}-${index + 1}`,
    type,
    size: Math.max(0.25, Number(panel?.size) || 1),
  };
}

export function normalizeWorkspace(savedState, fallbackMainPanel = null) {
  const savedWorkspace = savedState?.workspace;
  if (savedWorkspace?.mainPanel) {
    return {
      version: 1,
      mainPanel: savedWorkspace.mainPanel,
      auxiliaryPanels: (savedWorkspace.auxiliaryPanels ?? []).map(normalizedAuxiliaryPanel),
      auxiliaryRatio: normalizedRatio(savedWorkspace.auxiliaryRatio),
    };
  }

  const legacyPanels = Array.isArray(savedState?.panels) ? savedState.panels : [];
  const mainPanel = legacyPanels[0] ?? fallbackMainPanel;
  return {
    version: 1,
    mainPanel,
    auxiliaryPanels: legacyPanels.slice(1).map((panel, index) => ({
      id: `bible-${index + 2}`,
      type: "bible",
      panel,
      size: 1,
    })),
    auxiliaryRatio: 0.4,
  };
}

export function ensureAuxiliaryPanel(workspace, type, payload = {}) {
  if (!AUXILIARY_TYPES.has(type)) throw new Error(`Unsupported auxiliary panel type: ${type}`);
  const auxiliaryPanels = workspace.auxiliaryPanels.map((panel) => ({ ...panel }));
  const reusable = type === "notes" || type === "analysis";
  const existingIndex = reusable
    ? auxiliaryPanels.findIndex((panel) => panel.type === type)
    : -1;
  if (existingIndex >= 0) {
    auxiliaryPanels[existingIndex] = { ...auxiliaryPanels[existingIndex], ...payload };
  } else {
    auxiliaryPanels.push({
      id: nextPanelId(auxiliaryPanels, type),
      type,
      ...payload,
      size: Math.max(0.25, Number(payload.size) || 1),
    });
  }
  return { ...workspace, auxiliaryPanels };
}

export function closeAuxiliaryPanel(workspace, id) {
  return {
    ...workspace,
    auxiliaryPanels: workspace.auxiliaryPanels.filter((panel) => panel.id !== id),
  };
}

export function closeShortcutTarget({
  visibleTools = [],
  recentTool = null,
  activePanelId = null,
  mainPanelId = null,
} = {}) {
  const visible = new Set(visibleTools);
  if (recentTool && visible.has(recentTool)) return { type: "tool", id: recentTool };
  const fallbackTool = visibleTools.at(-1);
  if (fallbackTool) return { type: "tool", id: fallbackTool };
  if (activePanelId && activePanelId !== mainPanelId) {
    return { type: "bible", id: activePanelId };
  }
  return null;
}

export function beginWordStudySession(existing, { auxiliaryPanelIds = [], activePanelId = null }) {
  if (existing) return existing;
  return {
    hiddenPanelIds: [...auxiliaryPanelIds],
    activePanelId,
    preview: null,
  };
}

export function openOccurrencePreview(session, mainPanel, reference) {
  const preview = session.preview
    ? { ...session.preview }
    : {
        id: "occurrence-preview",
        enabledTranslations: [...mainPanel.enabledTranslations],
        highlightedTranslations: [...(mainPanel.highlightedTranslations ?? [])],
        dimmedTranslations: [...(mainPanel.dimmedTranslations ?? [])],
      };
  Object.assign(preview, reference);
  return { ...session, preview };
}

export function adjacentVerseReference(reference, direction, books, verseCount) {
  const step = direction < 0 ? -1 : 1;
  const count = verseCount(reference.book, reference.chapter);
  if (step > 0 && reference.verse < count) return { ...reference, verse: reference.verse + 1 };
  if (step < 0 && reference.verse > 1) return { ...reference, verse: reference.verse - 1 };

  let book = reference.book;
  let chapter = reference.chapter + step;
  if (chapter < 1) {
    book -= 1;
    if (book < 0) return null;
    chapter = books[book].chapters;
  } else if (chapter > books[book].chapters) {
    book += 1;
    if (book >= books.length) return null;
    chapter = 1;
  }
  return {
    book,
    chapter,
    verse: step > 0 ? 1 : verseCount(book, chapter),
  };
}

export function workspaceGrid(panelCount, auxiliaryRatio) {
  const auxiliaryCount = Math.max(0, Number(panelCount) - 1);
  if (!auxiliaryCount) {
    return {
      split: false,
      auxiliaryCount: 0,
      columns: "minmax(0, 1fr)",
      rows: "minmax(0, 1fr)",
    };
  }
  const ratio = normalizedRatio(auxiliaryRatio);
  return {
    split: true,
    auxiliaryCount,
    columns: `minmax(0, ${1 - ratio}fr) minmax(320px, ${ratio}fr)`,
    rows: `repeat(${auxiliaryCount}, minmax(0, 1fr))`,
  };
}

export function occurrencePreviewRows(previewRatio) {
  const ratio = Math.max(0.25, Math.min(Number(previewRatio) || 0.4, 0.7));
  const main = Number((1 - ratio).toFixed(4));
  const preview = Number(ratio.toFixed(4));
  return `minmax(0, ${main}fr) 8px minmax(180px, ${preview}fr)`;
}

export function occurrenceNavigationDisabled(reference, books, currentChapterVerseCount) {
  const finalBook = books.length - 1;
  return {
    previous: reference.book === 0 && reference.chapter === 1 && reference.verse === 1,
    next: reference.book === finalBook
      && reference.chapter === books[finalBook].chapters
      && reference.verse >= currentChapterVerseCount,
  };
}

export function prepareOccurrencePreviewNavigation(_current, next) {
  const { book, chapter, verse, ...panelPatch } = next;
  return {
    panelPatch,
    target: { book, chapter, verse },
  };
}

export function readingSourceOrder(translations, showOriginal) {
  const order = [...translations];
  if (showOriginal !== false && !order.includes(ORIGINAL_SOURCE_ID)) {
    order.push(ORIGINAL_SOURCE_ID);
  }
  return order;
}

export function splitReadingSourceOrder(order) {
  return {
    translations: order.filter((id) => id !== ORIGINAL_SOURCE_ID),
    showOriginal: order.includes(ORIGINAL_SOURCE_ID),
  };
}

export function panelFitCount(panelCount, preset) {
  const available = Math.max(1, Number(panelCount) || 1);
  const requested = Number(preset) === 2 ? 2 : 1;
  return Math.min(available, requested);
}

function sameSearchHistoryEntry(a, b) {
  return a?.query === b?.query
    && a?.translations?.length === b?.translations?.length
    && a.translations.every((translation, index) => translation === b.translations[index]);
}

export function recordSearchHistory(history, entry, limit = 50) {
  const normalized = {
    query: String(entry?.query ?? "").trim(),
    translations: [...new Set((entry?.translations ?? []).map(String))],
  };
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const index = Math.max(-1, Math.min(Number(history?.index) || 0, entries.length - 1));
  if (!normalized.query || sameSearchHistoryEntry(entries[index], normalized)) {
    return { entries: [...entries], index };
  }
  const maximum = Math.max(1, Number(limit) || 50);
  const nextEntries = [...entries.slice(0, index + 1), normalized].slice(-maximum);
  return { entries: nextEntries, index: nextEntries.length - 1 };
}

export function moveSearchHistory(history, direction) {
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  if (!entries.length) return { entries: [], index: -1 };
  const currentIndex = Math.max(0, Math.min(Number(history?.index) || 0, entries.length - 1));
  const step = direction < 0 ? -1 : 1;
  return {
    entries: [...entries],
    index: Math.max(0, Math.min(currentIndex + step, entries.length - 1)),
  };
}

export function currentSearchHistoryEntry(history) {
  return history?.entries?.[history.index] ?? null;
}

export function referenceDestinationPanels(panels, activePanelId) {
  const destinations = panels
    .filter((panel) => !panel.occurrencePreview)
    .map((panel, panelIndex) => ({
      id: panel.id,
      panelIndex,
      active: panel.id === activePanelId,
    }));
  return destinations.sort((a, b) => Number(b.active) - Number(a.active));
}

function sameReference(a, b) {
  return a?.book === b?.book && a?.chapter === b?.chapter && a?.verse === b?.verse;
}

export function recordReferenceHistory(history, reference, limit = 100) {
  const entry = {
    book: Number(reference?.book),
    chapter: Number(reference?.chapter),
    verse: Number(reference?.verse),
  };
  if (!Number.isInteger(entry.book) || entry.book < 0
    || !Number.isInteger(entry.chapter) || entry.chapter < 1
    || !Number.isInteger(entry.verse) || entry.verse < 1) {
    return { entries: [...(history?.entries ?? [])], index: history?.index ?? -1 };
  }
  const entries = Array.isArray(history?.entries) ? history.entries : [];
  const index = Math.max(-1, Math.min(Number(history?.index) || 0, entries.length - 1));
  if (sameReference(entries[index], entry)) return { entries: [...entries], index };
  const maximum = Math.max(1, Number(limit) || 100);
  const nextEntries = [...entries.slice(0, index + 1), entry].slice(-maximum);
  return { entries: nextEntries, index: nextEntries.length - 1 };
}

export function moveReferenceHistory(history, direction) {
  return moveSearchHistory(history, direction);
}

export function currentReferenceHistoryEntry(history) {
  return history?.entries?.[history.index] ?? null;
}
