const STORAGE_KEY = "side-by-side-bible:v1";
const TRANSLATION_COLORS = {
  ESV: "#9b5c34",
  NIV: "#476f9b",
  KJV: "#79652f",
  NASB: "#42808a",
  NRSV: "#8a6d1f",
  NLT: "#8c4678",
  GAE: "#2f7663",
  KRV: "#6b7d3d",
  SAENEW: "#805692",
  WLB: "#a24f62",
  KLB: "#b0632e",
  EASY: "#3c8c46",
  CNV: "#5d5fa0",
  HEB: "#9c6b1f",
  GRK: "#4a5aa8",
};
const TRANSLATION_GROUPS = [
  { label: "English", ids: ["NIV", "ESV", "KJV", "NASB", "NRSV", "NLT"] },
  { label: "Korean", ids: ["GAE", "KRV", "SAENEW", "WLB", "KLB", "EASY"] },
  { label: "Chinese", ids: ["CNV"] },
];
const TRANSLATION_CANONICAL_ORDER = TRANSLATION_GROUPS.flatMap((group) => group.ids);
const DEFAULT_ENABLED_TRANSLATIONS = ["NIV", "GAE"];
const DEFAULT_HIGHLIGHTED_TRANSLATIONS = [];
const DEFAULT_DIMMED_TRANSLATIONS = [];

// Hebrew/Greek interlinear "translations" are synthetic: they are not part of
// manifest.translations (no exported text data exists for them yet), so they
// are resolved via ORIGINAL_LANGUAGE_META instead of the manifest lookup.
// Exactly one of the two may be enabled per panel at a time, and it always
// tracks the testament of the panel's current book (see
// syncOriginalLanguageForTestament).
const ORIGINAL_LANGUAGE_META = {
  HEB: { id: "HEB", label: "HEB", name: "Hebrew Interlinear", testament: "old" },
  GRK: { id: "GRK", label: "GRK", name: "Greek Interlinear", testament: "new" },
};
const ORIGINAL_LANGUAGE_IDS = Object.keys(ORIGINAL_LANGUAGE_META);

function blendTranslationColors(whiteRatio) {
  return Object.fromEntries(
    Object.entries(TRANSLATION_COLORS).map(([id, hex]) => {
      const channel = (start) => {
        const value = Number.parseInt(hex.slice(start, start + 2), 16);
        return Math.round(value + (255 - value) * whiteRatio);
      };
      return [id, `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`];
    }),
  );
}
// Chip background: very pale. Chip border, once highlighted: midway between
// that pale background and the translation's own full-strength text color.
// Dimmed chip text: paler than full strength but still legible on white.
const PALE_TRANSLATION_COLORS = blendTranslationColors(0.85);
const MEDIUM_TRANSLATION_COLORS = blendTranslationColors(0.45);
const DIM_TRANSLATION_COLORS = blendTranslationColors(0.55);
const ASSET_VERSION = document.querySelector('meta[name="asset-version"]').content;
const MOBILE_LAYOUT_QUERY = "(max-width: 820px), (max-width: 1366px) and (any-pointer: coarse)";
const mobileLayout = window.matchMedia(MOBILE_LAYOUT_QUERY);
const landscapeMobile = window.matchMedia(
  "(orientation: landscape) and (max-width: 1366px) and (any-pointer: coarse)",
);
const touchPanelToggleLayout = window.matchMedia(
  "(orientation: landscape) and (max-width: 1366px) and (any-pointer: coarse), "
    + "(min-width: 600px) and (max-width: 1366px) and (any-pointer: coarse)",
);
const phonePortraitLayout = window.matchMedia("(orientation: portrait) and (max-width: 599px)");
const portraitLayout = window.matchMedia("(orientation: portrait)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const panelTrack = document.querySelector("#panel-track");
const panelTemplate = document.querySelector("#panel-template");
const addPanelButton = document.querySelector("#add-panel");
const searchDialog = document.querySelector("#search-dialog");
const openSearchButton = document.querySelector("#open-search");
const closeSearchButton = document.querySelector("#close-search");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchHistoryBackButton = document.querySelector("#search-history-back");
const searchHistoryForwardButton = document.querySelector("#search-history-forward");
const searchTranslationList = document.querySelector("#search-translation-list");
const searchTranslationPicker = document.querySelector("#search-translation-picker");
const searchTranslationPickerToggle = document.querySelector("#search-translation-picker-toggle");
const searchTranslationPickerMenu = document.querySelector("#search-translation-picker-menu");
const searchMeta = document.querySelector("#search-meta");
const searchTranslationControls = document.querySelector("#search-translation-controls");
const searchBookList = document.querySelector("#search-book-list");
const searchResults = document.querySelector("#search-results");
const fontSizeDownButton = document.querySelector("#font-size-down");
const fontSizeUpButton = document.querySelector("#font-size-up");
const fontSizeValue = document.querySelector("#font-size-value");
const panelCountOneButton = document.querySelector("#panel-count-one");
const panelCountTwoButton = document.querySelector("#panel-count-two");
const copyDialog = document.querySelector("#copy-dialog");
const closeCopyButton = document.querySelector("#close-copy");
const cancelCopyButton = document.querySelector("#cancel-copy");
const confirmCopyButton = document.querySelector("#confirm-copy");
const copyReference = document.querySelector("#copy-reference");
const copyTranslations = document.querySelector("#copy-translations");
const copyTranslationPicker = document.querySelector("#copy-translation-picker");
const copyTranslationPickerToggle = document.querySelector("#copy-translation-picker-toggle");
const copyTranslationPickerMenu = document.querySelector("#copy-translation-picker-menu");
const copyStatus = document.querySelector("#copy-status");
const moveDialog = document.querySelector("#move-dialog");
const closeMoveButton = document.querySelector("#close-move");
const moveReference = document.querySelector("#move-reference");
const moveTargetButtons = document.querySelectorAll(".move-panel-option, .move-panel-add");
const moveTargetLeftButton = document.querySelector("#move-target-left");
const moveTargetRightButton = document.querySelector("#move-target-right");
let pendingMoveReference = null;
const strongsDialog = document.querySelector("#strongs-dialog");
const closeStrongsButton = document.querySelector("#close-strongs");
const strongsDialogTitle = document.querySelector("#strongs-dialog-title");
const strongsBiblehubLink = document.querySelector("#strongs-biblehub-link");
const strongsDialogBody = document.querySelector("#strongs-dialog-body");
const strongsNavPrev = document.querySelector("#strongs-nav-prev");
const strongsNavNext = document.querySelector("#strongs-nav-next");
const strongsNavLang = document.querySelector("#strongs-nav-lang");
const strongsNavNumber = document.querySelector("#strongs-nav-number");
const strongsNavRange = document.querySelector("#strongs-nav-range");
const strongsNavSearch = document.querySelector("#strongs-nav-search");
const STRONGS_MAX_NUMBER = { H: 8674, G: 5624 };
const tskDialog = document.querySelector("#tsk-dialog");
const closeTskButton = document.querySelector("#close-tsk");
const tskDialogBody = document.querySelector("#tsk-dialog-body");
const tskHistoryBackButton = document.querySelector("#tsk-history-back");
const tskHistoryForwardButton = document.querySelector("#tsk-history-forward");
const tskBookInput = document.querySelector("#tsk-book-input");
const tskChapterInput = document.querySelector("#tsk-chapter-input");
const tskVerseInput = document.querySelector("#tsk-verse-input");
const tskTranslationControls = document.querySelector("#tsk-translation-controls");
const tskTranslationPicker = document.querySelector("#tsk-translation-picker");
const tskTranslationPickerToggle = document.querySelector("#tsk-translation-picker-toggle");
const tskTranslationPickerMenu = document.querySelector("#tsk-translation-picker-menu");
const tskTranslationList = document.querySelector("#tsk-translations");
const tskVerseText = document.querySelector("#tsk-verse-text");
const siteBrand = document.querySelector("#site-brand");
const tskResultsToggle = createResultsToggleAllController(tskDialogBody);
tskTranslationControls.append(tskResultsToggle.buildButton());

let manifest;
let state;
let activePanelId;
let panelIdCounter = 0;
let searchRequestId = 0;
let copyPanelState = null;
let copyTranslationOrder = [];
let copyTranslationControl = null;
let searchTranslationOrder = [];
let searchTranslationControl = null;
// The TSK dialog browses independently of any reading panel, like a small
// panel of its own -- book/chapter/verse combos, a translation picker, and
// the verse text (data), all scoped to whichever verse the link icon in
// copy-mode was last opened for.
const tskViewState = { book: 0, chapter: 1, verse: 1, data: null, anchors: [] };
let tskTranslationOrder = ["KJV"];
let tskTranslationControl = null;
let tskBookCombo = null;
let tskChapterCombo = null;
let tskVerseCombo = null;
let panelMutationInProgress = false;
let panelLayoutFrame = 0;
const chapterCache = new Map();
const interlinearCache = new Map();
let strongsDataPromise = null;
const englishmansCache = new Map();
const tskCache = new Map();
const panelElements = new Map();
const searchWorker = new Worker(`./search-worker.js?v=${ASSET_VERSION}`);

function freshState() {
  return {
    fontSize: 14,
    touchPanelCount: null,
    desktopPanelMode: null,
    copySelectionMode: "range",
    panels: [{
      book: 0,
      chapter: 1,
      verse: 1,
      enabledTranslations: [...DEFAULT_ENABLED_TRANSLATIONS],
      highlightedTranslations: [...DEFAULT_HIGHLIGHTED_TRANSLATIONS],
      dimmedTranslations: [...DEFAULT_DIMMED_TRANSLATIONS],
      verseLayout: "stacked",
      history: [{ book: 0, chapter: 1, verse: 1 }],
      historyIndex: 0,
    }],
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.panels)) return freshState();
    return { ...freshState(), ...stored };
  } catch {
    return freshState();
  }
}

function sanitizeState() {
  const validTranslations = new Set([
    ...manifest.translations.map((item) => item.id),
    ...ORIGINAL_LANGUAGE_IDS,
  ]);

  // Translations and verse layout used to be single global settings shared
  // by every panel; saves from before the per-panel switch carry them at
  // the top level here. Treat those as each panel's starting point, then
  // drop the globals so the per-panel fields are the only source of truth.
  let legacyEnabled = null;
  if (Array.isArray(state.enabledTranslations)) {
    legacyEnabled = state.enabledTranslations.filter((id) => validTranslations.has(id));
    if (Array.isArray(state.translationOrder)) {
      // Migrate saves from when a separate translationOrder drove the chip row.
      const position = new Map(state.translationOrder.map((id, index) => [id, index]));
      legacyEnabled.sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
    }
    legacyEnabled = [...new Set(legacyEnabled)];
  }
  delete state.enabledTranslations;
  delete state.translationOrder;
  const legacyVerseLayout = state.verseLayout === "columns" ? "columns" : null;
  delete state.verseLayout;

  state.fontSize = Math.max(10, Math.min(Number(state.fontSize) || 14, 22));
  state.copySelectionMode = state.copySelectionMode === "individual" ? "individual" : "range";
  const savedPanelCount = Number(state.touchPanelCount);
  state.touchPanelCount = phonePortraitLayout.matches
    ? 1
    : savedPanelCount === 1 || savedPanelCount === 2
    ? savedPanelCount
    : landscapeMobile.matches ? 2 : 1;
  const savedDesktopMode = Number(state.desktopPanelMode);
  state.desktopPanelMode = savedDesktopMode === 1 || savedDesktopMode === 2
    ? savedDesktopMode
    : desktopLikePanels() ? 2 : null;
  state.panels = state.panels
    .map((panel) => {
      const book = Math.max(0, Math.min(Number(panel.book) || 0, manifest.books.length - 1));
      const chapter = Math.max(1, Math.min(Number(panel.chapter) || 1, manifest.books[book].chapters));
      const verse = Math.max(1, Number(panel.verse) || 1);
      const width = panel.width == null ? Number.NaN : Number(panel.width);
      const preSplitWidth = panel.preSplitWidth == null ? Number.NaN : Number(panel.preSplitWidth);
      const history = Array.isArray(panel.history)
        ? panel.history
            .map((item) => ({
              book: Math.max(0, Math.min(Number(item.book) || 0, manifest.books.length - 1)),
              chapter: Math.max(1, Math.min(Number(item.chapter) || 1, manifest.books[
                Math.max(0, Math.min(Number(item.book) || 0, manifest.books.length - 1))
              ].chapters)),
              verse: Math.max(1, Number(item.verse) || 1),
            }))
            .slice(-100)
        : [];
      if (!history.length) history.push({ book, chapter, verse });
      const historyIndex = Math.max(0, Math.min(Number(panel.historyIndex) || 0, history.length - 1));
      const enabledTranslations = [...new Set(
        (Array.isArray(panel.enabledTranslations) ? panel.enabledTranslations : legacyEnabled ?? DEFAULT_ENABLED_TRANSLATIONS)
          .filter((id) => validTranslations.has(id)),
      )];
      const highlightedTranslations = [...new Set(
        (Array.isArray(panel.highlightedTranslations) ? panel.highlightedTranslations : DEFAULT_HIGHLIGHTED_TRANSLATIONS)
          .filter((id) => enabledTranslations.includes(id)),
      )];
      const dimmedTranslations = [...new Set(
        (Array.isArray(panel.dimmedTranslations) ? panel.dimmedTranslations : DEFAULT_DIMMED_TRANSLATIONS)
          .filter((id) => enabledTranslations.includes(id) && !highlightedTranslations.includes(id)),
      )];
      const verseLayout = panel.verseLayout === "columns" || panel.verseLayout === "stacked"
        ? panel.verseLayout
        : legacyVerseLayout ?? "stacked";
      return {
        book,
        chapter,
        verse,
        history,
        historyIndex,
        width: Number.isFinite(width) ? Math.max(1, Math.min(width, 5000)) : null,
        preSplitWidth: Number.isFinite(preSplitWidth) ? Math.max(1, Math.min(preSplitWidth, 5000)) : null,
        enabledTranslations,
        highlightedTranslations,
        dimmedTranslations,
        verseLayout,
      };
    })
    .slice(0, 12);
  if (!state.panels.length) state.panels = freshState().panels;
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      fontSize: state.fontSize,
      touchPanelCount: state.touchPanelCount,
      desktopPanelMode: state.desktopPanelMode,
      copySelectionMode: state.copySelectionMode,
      panels: state.panels.map(({
        book,
        chapter,
        verse,
        history,
        historyIndex,
        width,
        preSplitWidth,
        enabledTranslations,
        highlightedTranslations,
        dimmedTranslations,
        verseLayout,
      }) => ({
        book,
        chapter,
        verse,
        history,
        historyIndex,
        width,
        preSplitWidth,
        enabledTranslations,
        highlightedTranslations,
        dimmedTranslations,
        verseLayout,
      })),
    }),
  );
}

// Phones in landscape and tablets use the exact desktop panel mechanism
// (pixel widths, free scrolling, the 1/2/fit presets); only phone portrait
// keeps the one-panel pager.
function desktopLikePanels() {
  return !mobileLayout.matches || touchPanelToggleLayout.matches;
}

function forcePhonePortraitOnePanel() {
  if (!phonePortraitLayout.matches || !state) return false;
  panelTrack.classList.remove("fit-all-panels");
  resetPanelWidths();
  state.touchPanelCount = 1;
  return true;
}

// Touch layouts running the two-panel desktop preset keep the long-press
// panel swap (the hover move buttons need a mouse).
function isTwoPanelTouchMode() {
  return Boolean(state && touchPanelToggleLayout.matches && state.desktopPanelMode === 2);
}

function enabledTranslationIds(panelState) {
  return panelState ? panelState.enabledTranslations : [];
}

function effectiveVerseLayout(panelState) {
  return panelState?.verseLayout === "columns" ? "columns" : "stacked";
}

function updatePanelVerseLayoutControls(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const effectiveLayout = effectiveVerseLayout(panelState);
  elements.verseLayoutStacked.classList.toggle("selected", effectiveLayout === "stacked");
  elements.verseLayoutColumns.classList.toggle("selected", effectiveLayout === "columns");
  elements.verseLayoutStacked.setAttribute("aria-pressed", String(effectiveLayout === "stacked"));
  elements.verseLayoutColumns.setAttribute("aria-pressed", String(effectiveLayout === "columns"));
}

function applyPanelVerseLayout(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  elements.panel.dataset.verseLayout = effectiveVerseLayout(panelState);
  updatePanelVerseLayoutControls(panelState);
  renderPanelBody(panelState);
}

function setPanelVerseLayout(panelState, layout) {
  if (layout !== "stacked" && layout !== "columns") return;
  panelState.verseLayout = layout;
  saveState();
  applyPanelVerseLayout(panelState);
}

function updatePanelCountControls() {
  if (!state) return;
  const desktop = desktopLikePanels();
  const oneSelected = desktop ? state.desktopPanelMode === 1 : state.touchPanelCount === 1;
  const twoSelected = desktop ? state.desktopPanelMode === 2 : state.touchPanelCount !== 1;
  panelCountOneButton.classList.toggle("selected", oneSelected);
  panelCountTwoButton.classList.toggle("selected", twoSelected);
  panelCountOneButton.setAttribute("aria-pressed", String(oneSelected));
  panelCountTwoButton.setAttribute("aria-pressed", String(twoSelected));
}

function panelAvailableWidth() {
  const trackStyle = getComputedStyle(panelTrack);
  const horizontalPadding = (Number.parseFloat(trackStyle.paddingLeft) || 0)
    + (Number.parseFloat(trackStyle.paddingRight) || 0);
  return Math.max(1, panelTrack.clientWidth - horizontalPadding);
}

function exactPanelFitWidth(count) {
  const gap = Number.parseFloat(getComputedStyle(panelTrack).columnGap) || 0;
  return Math.max(1, (panelAvailableWidth() - gap * (count - 1)) / count);
}

function applyPanelWidth(panel, width, important = false) {
  panel.style.removeProperty("flex-basis");
  panel.style.removeProperty("width");
  panel.style.setProperty("flex-basis", `${width}px`, important ? "important" : "");
  if (important) panel.style.setProperty("width", `${width}px`, "important");
}

function setAllDesktopPanelWidths(width, important = false) {
  for (const panelState of state.panels) {
    panelState.width = width;
    const elements = panelElements.get(panelState.id);
    if (elements) applyPanelWidth(elements.panel, width, important);
  }
}

function resetPanelWidths() {
  for (const panelState of state.panels) {
    panelState.width = null;
    const panel = panelElements.get(panelState.id)?.panel;
    if (!panel) continue;
    panel.style.removeProperty("flex-basis");
    panel.style.removeProperty("width");
  }
}

function applyDesktopPanelWidths() {
  if (!state?.desktopPanelMode) return;
  const count = state.desktopPanelMode === 2 ? 2 : 1;
  setAllDesktopPanelWidths(exactPanelFitWidth(count));
}

function setDesktopPanelMode(mode) {
  if (mode !== 1 && mode !== 2) return;
  panelTrack.classList.remove("fit-all-panels");
  state.desktopPanelMode = mode;
  applyDesktopPanelWidths();
  updatePanelCountControls();
  saveState();
  alignPanelsAfterLayoutChange(panelIndexAtViewportStart());
}

// Manually resizing a panel breaks the uniform widths the desktop one/two
// panel presets promise, so the preset selection is dropped. Saving is left
// to the caller.
function clearDesktopPanelMode() {
  if (!state?.desktopPanelMode) return;
  state.desktopPanelMode = null;
  updatePanelCountControls();
}

function visiblePanelSpan() {
  const trackRect = panelTrack.getBoundingClientRect();
  let first = -1;
  let count = 0;
  state.panels.forEach((panelState, index) => {
    const panel = panelElements.get(panelState.id)?.panel;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.right > trackRect.left + 1 && rect.left < trackRect.right - 1) {
      if (first < 0) first = index;
      count += 1;
    }
  });
  return { first: Math.max(0, first), count: Math.max(1, count) };
}

// Desktop fits the panels currently on screen; touch layouts fit every panel
// into the screen, no matter how many panels are open.
function fitVisiblePanels() {
  if (mobileLayout.matches || state.panels.length < 2) return;
  const touchLayout = mobileLayout.matches;
  const { first, count: visibleCount } = visiblePanelSpan();
  const count = touchLayout ? state.panels.length : visibleCount;
  panelTrack.classList.toggle("fit-all-panels", touchLayout);
  setAllDesktopPanelWidths(exactPanelFitWidth(count), touchLayout);
  clearDesktopPanelMode();
  saveState();
  alignPanelsAfterLayoutChange(touchLayout ? 0 : first);
}

function alignPanelsAfterLayoutChange(index) {
  if (!state?.panels?.length || index < 0) return;
  const targetIndex = Math.max(0, Math.min(index, state.panels.length - 1));
  panelTrack.classList.add("panel-count-changing");
  requestAnimationFrame(() => {
    panelTrack.scrollLeft = panelScrollLeft(targetIndex);
    requestAnimationFrame(() => {
      panelTrack.scrollLeft = panelScrollLeft(targetIndex);
      panelTrack.classList.remove("panel-count-changing");
      panelTrack.scrollLeft = panelScrollLeft(targetIndex);
    });
  });
}

function applyTouchPanelCount(alignmentIndex = -1) {
  if (!state) return;
  forcePhonePortraitOnePanel();
  document.documentElement.dataset.touchPanelCount = String(state.touchPanelCount);
  updatePanelCountControls();
  if (panelElements.size) refreshPanelBodies();
  alignPanelsAfterLayoutChange(alignmentIndex);
}

function setTouchPanelCount(count) {
  if (count !== 1 && count !== 2) return;
  if (phonePortraitLayout.matches) {
    state.touchPanelCount = 1;
    saveState();
    applyTouchPanelCount(panelIndexAtViewportStart());
    return;
  }
  panelTrack.classList.remove("fit-all-panels");
  resetPanelWidths();
  const alignmentIndex = state.panels.length ? panelIndexAtViewportStart() : -1;
  state.touchPanelCount = count;
  saveState();
  applyTouchPanelCount(alignmentIndex);
}

function schedulePanelLayoutAlignment() {
  if (!state) return;
  cancelAnimationFrame(panelLayoutFrame);
  const activeIndex = state.panels.findIndex((panelState) => panelState.id === activePanelId);
  panelLayoutFrame = requestAnimationFrame(() => {
    if (touchPanelToggleLayout.matches) {
      panelTrack.classList.remove("fit-all-panels");
      if (state.desktopPanelMode !== 1 && state.desktopPanelMode !== 2) state.desktopPanelMode = 2;
      applyDesktopPanelWidths();
      saveState();
    }
    applyTouchPanelCount(Math.max(0, activeIndex));
  });
}

function resetSite() {
  if (searchDialog.open) closeSearch();
  if (copyDialog.open) closeCopyDialog();
  if (strongsDialog.open) closeStrongsDialog();
  if (tskDialog.open) closeTskDialog();
  localStorage.removeItem(STORAGE_KEY);

  for (const { panel, translationControl } of panelElements.values()) {
    translationControl.destroy();
    panel.remove();
  }
  panelElements.clear();
  state = freshState();
  sanitizeState();
  state.panels[0].historyIsProvisional = true;
  if (desktopLikePanels()) {
    if (touchPanelToggleLayout.matches) state.desktopPanelMode = 2;
    state.panels[0].width = touchPanelToggleLayout.matches
      ? exactPanelFitWidth(state.desktopPanelMode === 2 ? 2 : 1)
      : exactPanelFitWidth(2);
  }
  applyTouchPanelCount();
  activePanelId = undefined;
  applyFontSize();
  for (const panel of state.panels) createPanelElement(panel);
  if (desktopLikePanels()) applyDesktopPanelWidths();
  saveState();

  searchInput.value = "";
  searchMeta.textContent = "";
  searchBookList.replaceChildren();
  searchResults.replaceChildren();
  searchRequestId += 1;
}

function translationMeta(id) {
  return ORIGINAL_LANGUAGE_META[id] ?? manifest.translations.find((item) => item.id === id);
}

function translationLanguage(id) {
  if (id === "HEB") return "he";
  if (id === "GRK") return "grc";
  if (id === "CNV") return "zh";
  return ["ESV", "NIV", "KJV", "NASB", "NRSV", "NLT"].includes(id) ? "en" : "ko";
}

function testamentForBook(bookId) {
  return bookId < 39 ? "old" : "new";
}

function originalLanguageForTestament(testament) {
  return testament === "old" ? "HEB" : "GRK";
}

function activeOriginalLanguageId(panelState) {
  return panelState.enabledTranslations.find((id) => ORIGINAL_LANGUAGE_IDS.includes(id)) ?? null;
}

function canonicalTranslationRank(id) {
  const rank = TRANSLATION_CANONICAL_ORDER.indexOf(id);
  return rank >= 0 ? rank : TRANSLATION_CANONICAL_ORDER.length;
}

function insertTranslationInOrder(order, id) {
  if (!translationMeta(id) || order.includes(id)) return false;
  const rank = canonicalTranslationRank(id);
  let index = order.findIndex((existing) => canonicalTranslationRank(existing) > rank);
  if (index < 0) index = order.length;
  order.splice(index, 0, id);
  return true;
}

function moveTranslationInOrder(order, from, to) {
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return false;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  return true;
}

// Whether `id` (a Hebrew/Greek slot) is currently driving a panel's
// side-by-side split view -- reuses highlightedTranslations as the source
// of truth so the chip picks up the exact same chip-active styling every
// other emphasized translation gets, with no separate flag to keep in sync.
function isOriginalLanguageSplitActive(panelState, id) {
  return panelState.highlightedTranslations.includes(id);
}

// Clicking the HEB/GRK chip toggles this instead of the normal highlight/
// dim cycle: the chip gets highlighted (see isOriginalLanguageSplitActive),
// jumps to the end of the chip row, and the panel doubles in width so
// renderPanelBody can lay out each verse as translations-on-the-left,
// interlinear-on-the-right. Toggling off restores whatever width the panel
// had before (a prior manual resize, or nothing -- back to the CSS default).
function toggleOriginalLanguageSplit(panelState, panel, id) {
  const highlighted = new Set(panelState.highlightedTranslations);
  if (highlighted.has(id)) {
    highlighted.delete(id);
    panelState.width = panelState.preSplitWidth ?? null;
    panelState.preSplitWidth = null;
    if (panelState.width == null) {
      panel.style.removeProperty("flex-basis");
      panel.style.removeProperty("width");
    } else {
      applyPanelWidth(panel, panelState.width, mobileLayout.matches && !desktopLikePanels());
    }
  } else {
    highlighted.add(id);
    const order = [...panelState.enabledTranslations];
    const from = order.indexOf(id);
    if (from !== -1 && moveTranslationInOrder(order, from, order.length - 1)) {
      panelState.enabledTranslations = order;
    }
    panelState.preSplitWidth = panelState.width;
    panelState.width = Math.round(panel.getBoundingClientRect().width * 2);
    applyPanelWidth(panel, panelState.width, mobileLayout.matches && !desktopLikePanels());
    clearDesktopPanelMode();
  }
  panelState.highlightedTranslations = [...highlighted];
}

function renderTranslationChipList({ list, order, getEmphasis, onToggleActive, onRemove, onMove }) {
  list.replaceChildren();

  for (const id of order) {
    const meta = translationMeta(id);
    if (!meta) continue;
    const emphasis = getEmphasis?.(id) ?? "normal";
    const chip = document.createElement("div");
    chip.className = "translation-chip";
    chip.classList.toggle("chip-active", emphasis === "highlight");
    chip.classList.toggle("chip-dimmed", emphasis === "dim");
    chip.style.setProperty("--translation-color-pale", PALE_TRANSLATION_COLORS[id]);
    chip.style.setProperty("--translation-color-medium", MEDIUM_TRANSLATION_COLORS[id]);
    chip.style.setProperty("--translation-color-dim", DIM_TRANSLATION_COLORS[id]);
    chip.draggable = true;
    chip.dataset.translation = id;
    chip.setAttribute("aria-label", `${meta.label} translation`);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-hidden", "true");
    setupTouchReorder({
      item: chip,
      handle,
      container: list,
      itemClass: "translation-chip",
      id,
      getOrder: () => order,
      onReorder: onMove,
    });

    const name = document.createElement("span");
    name.className = "translation-name";
    name.lang = translationLanguage(id);
    name.textContent = meta.label;
    name.style.setProperty("--translation-color", TRANSLATION_COLORS[id]);

    if (onToggleActive) {
      chip.addEventListener("click", () => onToggleActive(id));
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "chip-remove close-button";
    removeButton.setAttribute("aria-label", `Remove ${meta.label}`);
    removeButton.title = `Remove ${meta.label}`;
    const removeIcon = document.createElement("span");
    removeIcon.setAttribute("aria-hidden", "true");
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onRemove(id);
    });
    removeButton.addEventListener("pointerdown", (event) => event.stopPropagation());

    chip.addEventListener("dragstart", (event) => {
      chip.classList.add("dragging");
      event.dataTransfer.setData("text/plain", id);
      event.dataTransfer.effectAllowed = "move";
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    chip.addEventListener("dragover", (event) => event.preventDefault());
    chip.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      const from = order.indexOf(draggedId);
      const to = order.indexOf(id);
      if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
    });

    chip.append(handle, name, removeButton);
    list.append(chip);
  }

  // Deferred a frame so a dialog opening in this same tick (showModal right
  // after render) has already become visible — scrollWidth/clientWidth read
  // 0/0 on a still-hidden <dialog>, which would misjudge overflow.
  requestAnimationFrame(() => {
    list.classList.toggle("translation-list--overflowing", list.scrollWidth > list.clientWidth + 1);
  });
}

// Native HTML5 drag-and-drop (dragstart/dragover/drop) does not fire on touch
// input, so touch reordering is driven by Pointer Events instead: the dragged
// item is lifted with a transform, elementFromPoint finds the item underneath
// the finger, and the swap only happens once on release (mirroring the mouse
// drop handler above). Touch drags start only on the ⠿ handle so that a swipe
// on the item body stays a native scroll of the surrounding list.
function setupTouchReorder({ item, handle, container, itemClass, id, getOrder, onReorder }) {
  let suppressClick = false;

  item.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  item.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    if (handle && !handle.contains(event.target)) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let hoverTarget = null;
    let dragging = false;

    item.setPointerCapture(pointerId);

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < 6) return;
      if (!dragging) {
        dragging = true;
        item.classList.add("dragging");
        item.style.position = "relative";
        item.style.zIndex = "5";
        item.style.pointerEvents = "none";
        document.body.classList.add("reordering-chip");
      }
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      item.style.transform = `translate(${dx}px, ${dy}px)`;
      const target = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest(`.${itemClass}`);
      const next = target && target !== item && target.parentElement === container ? target : null;
      if (hoverTarget && hoverTarget !== next) hoverTarget.classList.remove("drag-over");
      hoverTarget = next;
      hoverTarget?.classList.add("drag-over");
    };

    const finish = (finishEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      if (item.hasPointerCapture(pointerId)) item.releasePointerCapture(pointerId);
      item.removeEventListener("pointermove", move);
      item.removeEventListener("pointerup", finish);
      item.removeEventListener("pointercancel", finish);
      item.classList.remove("dragging");
      item.style.position = "";
      item.style.zIndex = "";
      item.style.pointerEvents = "";
      item.style.transform = "";
      document.body.classList.remove("reordering-chip");
      hoverTarget?.classList.remove("drag-over");
      if (dragging) {
        finishEvent.preventDefault();
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 350);
      }
      if (dragging && hoverTarget) {
        const order = getOrder();
        const from = order.indexOf(id);
        const to = order.indexOf(hoverTarget.dataset.translation);
        if (from >= 0 && to >= 0 && from !== to) onReorder(from, to);
      }
    };

    item.addEventListener("pointermove", move, { passive: false });
    item.addEventListener("pointerup", finish);
    item.addEventListener("pointercancel", finish);
  });
}

// Native-select feel for touch: a press that starts on `opener` opens the
// menu, sliding the finger highlights the option underneath (auto-scrolling
// near the menu's edges), and lifting on an option picks it. A drag that
// starts on the menu itself stays a normal scroll, and a plain tap falls
// through to the regular click handlers.
function setupPressDragPick({ opener, menu, optionSelector, onOpen, onPick, onGestureEnd }) {
  opener.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    onOpen?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startMenuScrollTop = menu.scrollTop;
    let dragging = false;
    let highlighted = null;
    let lastX = startX;
    let lastY = startY;
    let scrollFrame = 0;

    try {
      opener.setPointerCapture(pointerId);
    } catch {
      return;
    }

    const optionUnder = (x, y) => {
      const option = document.elementFromPoint(x, y)?.closest(optionSelector);
      return option && menu.contains(option) ? option : null;
    };
    const setHighlight = (option) => {
      if (highlighted === option) return;
      highlighted?.classList.remove("highlighted");
      highlighted = option;
      highlighted?.classList.add("highlighted");
    };
    const autoScroll = () => {
      scrollFrame = 0;
      if (!dragging || menu.scrollHeight <= menu.clientHeight) return;
      const rect = menu.getBoundingClientRect();
      const delta = lastY < rect.top + 36 ? -8 : lastY > rect.bottom - 36 ? 8 : 0;
      if (!delta) return;
      menu.scrollTop += delta;
      setHighlight(optionUnder(lastX, lastY));
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      if (!dragging && Math.hypot(lastX - startX, lastY - startY) < 7) return;
      dragging = true;
      moveEvent.preventDefault();
      menu.scrollTop = startMenuScrollTop - (lastY - startY);
      setHighlight(optionUnder(lastX, lastY));
      if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
    };
    const finish = (finishEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      opener.removeEventListener("pointermove", move);
      opener.removeEventListener("pointerup", finish);
      opener.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(scrollFrame);
      if (opener.hasPointerCapture(pointerId)) opener.releasePointerCapture(pointerId);
      const picked = dragging ? highlighted : null;
      setHighlight(null);
      if (dragging) finishEvent.preventDefault();
      if (picked) onPick(picked);
      if (dragging) onGestureEnd?.(Boolean(picked));
    };
    const cancel = (cancelEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      opener.removeEventListener("pointermove", move);
      opener.removeEventListener("pointerup", finish);
      opener.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(scrollFrame);
      setHighlight(null);
      if (dragging) onGestureEnd?.(false);
    };

    opener.addEventListener("pointermove", move, { passive: false });
    opener.addEventListener("pointerup", finish);
    opener.addEventListener("pointercancel", cancel);
  });
}

function buildTranslationPickerOption({ id, meta, isEnabled, disabled, onPick }) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "translation-picker-option";
  option.classList.toggle("selected", isEnabled);
  option.classList.toggle("translation-picker-option-disabled", disabled);
  option.disabled = disabled;
  option.dataset.translation = id;
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", String(isEnabled));
  if (disabled) option.setAttribute("aria-disabled", "true");

  const label = document.createElement("span");
  label.className = "picker-label";
  label.lang = translationLanguage(id);
  label.textContent = meta.label;
  label.style.setProperty("--translation-color", TRANSLATION_COLORS[id]);
  const name = document.createElement("span");
  name.className = "picker-name";
  name.textContent = meta.name;
  option.append(label, name);

  option.addEventListener("click", onPick);
  return option;
}

// originalLanguageTestament, when provided, adds a second menu column for the
// Hebrew/Greek interlinear "translations" — only the option matching the
// panel's current testament is clickable; the other is shown disabled.
function renderDialogTranslationPickerMenu({ menu, picker, getOrder, onToggle, originalLanguageTestament }) {
  menu.replaceChildren();
  if (!manifest) return;
  const order = getOrder();
  const rerender = () => {
    renderDialogTranslationPickerMenu({ menu, picker, getOrder, onToggle, originalLanguageTestament });
    positionTranslationPickerMenuFor(picker, menu);
  };

  const columns = document.createElement("div");
  columns.className = "translation-picker-columns";

  const mainColumn = document.createElement("div");
  mainColumn.className = "translation-picker-column";
  for (const group of TRANSLATION_GROUPS) {
    const ids = group.ids.filter((id) => translationMeta(id));
    if (!ids.length) continue;
    const section = document.createElement("div");
    section.className = "translation-picker-group";
    const heading = document.createElement("div");
    heading.className = "translation-picker-group-label";
    heading.textContent = group.label;
    section.append(heading);
    for (const id of ids) {
      const option = buildTranslationPickerOption({
        id,
        meta: translationMeta(id),
        isEnabled: order.includes(id),
        disabled: false,
        onPick: () => {
          onToggle(id);
          rerender();
        },
      });
      section.append(option);
    }
    mainColumn.append(section);
  }
  columns.append(mainColumn);

  if (originalLanguageTestament) {
    const languageColumn = document.createElement("div");
    languageColumn.className = "translation-picker-column translation-picker-column-languages";
    const heading = document.createElement("div");
    heading.className = "translation-picker-group-label";
    heading.textContent = "Original";
    languageColumn.append(heading);
    for (const id of ORIGINAL_LANGUAGE_IDS) {
      const isEnabled = order.includes(id);
      const disabled = !isEnabled && ORIGINAL_LANGUAGE_META[id].testament !== originalLanguageTestament;
      const option = buildTranslationPickerOption({
        id,
        meta: translationMeta(id),
        isEnabled,
        disabled,
        onPick: () => {
          onToggle(id);
          rerender();
        },
      });
      languageColumn.append(option);
    }
    columns.append(languageColumn);
  }

  menu.append(columns);
}

function positionTranslationPickerMenuFor(picker, menu) {
  if (menu.hidden) return;
  const inDialog = Boolean(picker.closest("dialog"));
  const width = menu.getBoundingClientRect().width;
  const anchor = picker.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  if (inDialog) {
    const gap = 6;
    const below = window.innerHeight - anchor.bottom - gap - 8;
    const above = anchor.top - gap - 8;
    const openAbove = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(480, openAbove ? above : below));
    menu.style.position = "fixed";
    menu.style.right = "auto";
    menu.style.left = `${left}px`;
    menu.style.top = openAbove ? "auto" : `${anchor.bottom + gap}px`;
    menu.style.bottom = openAbove ? `${window.innerHeight - anchor.top + gap}px` : "auto";
    menu.style.maxHeight = `${maxHeight}px`;
    return;
  }
  menu.style.position = "";
  menu.style.right = "auto";
  menu.style.left = `${left - anchor.left}px`;
  menu.style.top = "";
  menu.style.bottom = "";
  menu.style.maxHeight = "";
}

function setupDialogTranslationControl({
  picker,
  toggle,
  menu,
  list,
  getOrder,
  setOrder,
  getEmphasis,
  onToggleActive,
  onChange,
  getOriginalLanguageTestament,
}) {
  let suppressClickUntil = 0;
  let openedByTouchPress = false;
  const controls = picker.closest(".translation-controls");

  const renderMenu = () => {
    renderDialogTranslationPickerMenu({
      menu,
      picker,
      getOrder,
      onToggle,
      originalLanguageTestament: getOriginalLanguageTestament?.(),
    });
  };

  const render = () => {
    renderTranslationChipList({
      list,
      order: getOrder(),
      getEmphasis,
      onToggleActive: onToggleActive && ((id) => {
        onToggleActive(id);
        render();
        onChange?.();
      }),
      onRemove: (id) => {
        setOrder(getOrder().filter((item) => item !== id));
        render();
        onChange?.();
      },
      onMove: (from, to) => {
        const order = [...getOrder()];
        if (!moveTranslationInOrder(order, from, to)) return;
        setOrder(order);
        render();
        onChange?.();
      },
    });
    if (!menu.hidden) renderMenu();
  };

  // Hebrew and Greek occupy a single shared "original language" slot: picking
  // one always replaces the other rather than allowing both at once.
  // Hebrew and Greek occupy a single shared "original language" slot: picking
  // one always replaces the other rather than allowing both at once. Once
  // added, though, it's a full peer of any other translation -- reorderable,
  // participates in stacked/columns layout the same way.
  const onToggle = (id) => {
    const order = [...getOrder()];
    if (order.includes(id)) {
      setOrder(order.filter((item) => item !== id));
    } else {
      if (ORIGINAL_LANGUAGE_IDS.includes(id)) {
        const other = id === "HEB" ? "GRK" : "HEB";
        const otherIndex = order.indexOf(other);
        if (otherIndex >= 0) order.splice(otherIndex, 1);
      }
      if (insertTranslationInOrder(order, id)) setOrder(order);
    }
    render();
    onChange?.();
  };

  const open = () => {
    if (!menu.hidden) return;
    renderMenu();
    menu.hidden = false;
    controls?.classList.add("translation-picker-open");
    positionTranslationPickerMenuFor(picker, menu);
    toggle.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    openedByTouchPress = false;
    if (menu.hidden) return;
    menu.hidden = true;
    controls?.classList.remove("translation-picker-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const openedByThisPress = openedByTouchPress;
    openedByTouchPress = false;
    if (Date.now() < suppressClickUntil) return;
    if (menu.hidden) open();
    else if (!openedByThisPress) close();
  });

  const onOutsidePointerDown = (event) => {
    if (menu.hidden) return;
    if (picker.contains(event.target)) return;
    close();
    shieldOutsidePress(event);
  };
  document.addEventListener("pointerdown", onOutsidePointerDown, true);

  const onKeydown = (event) => {
    if (event.key === "Escape" && !menu.hidden) close();
  };
  document.addEventListener("keydown", onKeydown);

  setupPressDragPick({
    opener: toggle,
    menu,
    optionSelector: ".translation-picker-option",
    onOpen: () => {
      if (!menu.hidden) return;
      open();
      openedByTouchPress = true;
    },
    onPick: (option) => option.click(),
    onGestureEnd: () => {
      suppressClickUntil = Date.now() + 500;
    },
  });

  // Callers wired to a panel (which can be destroyed mid-session, unlike the
  // two dialogs this was originally built for) must be able to drop these
  // document-level listeners so a removed panel's picker/menu aren't kept
  // alive forever by them.
  const destroy = () => {
    controls?.classList.remove("translation-picker-open");
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onKeydown);
  };

  return { render, open, close, destroy };
}

const HANGUL_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

function hangulInitials(value) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code < 0xac00 || code > 0xd7a3) return character;
      return HANGUL_INITIALS[Math.floor((code - 0xac00) / 588)];
    })
    .join("");
}

function matchesBook(item, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  if (`${item.ko} ${item.en}`.toLocaleLowerCase().includes(needle)) return true;
  const compact = needle.replace(/\s+/g, "");
  return [...compact].every((character) => HANGUL_INITIALS.includes(character))
    && hangulInitials(item.ko).includes(compact);
}

function syncTrackFreeScroll() {
  panelTrack.classList.toggle("free-scroll", desktopLikePanels());
}
syncTrackFreeScroll();

mobileLayout.addEventListener("change", () => {
  updatePanelCountControls();
  syncTrackFreeScroll();
});

// Swallow the press that closed an open dropdown so it cannot reach — and
// act on — whatever sits underneath (e.g. a verse tap starting copy mode).
// Only that press's own click is swallowed: a new press or a short timeout
// disarms the guard.
function shieldOutsidePress(event) {
  event.preventDefault();
  event.stopPropagation();
  const swallowClick = (clickEvent) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    disarm();
  };
  const disarm = () => {
    document.removeEventListener("click", swallowClick, true);
    document.removeEventListener("pointerdown", disarm, true);
    window.clearTimeout(timer);
  };
  document.addEventListener("click", swallowClick, true);
  document.addEventListener("pointerdown", disarm, true);
  const timer = window.setTimeout(disarm, 700);
}

// A press outside an open book/chapter dropdown closes it; the input's text
// snaps back to the current selection (the combo listens for combo-restore).
// On touch the press is fully swallowed — it only dismisses the menu.
document.addEventListener(
  "pointerdown",
  (event) => {
    let closedByTouch = false;
    for (const menu of document.querySelectorAll(".combo-menu:not([hidden])")) {
      const combo = menu.closest(".combo");
      if (!combo || combo.contains(event.target)) continue;
      const input = combo.querySelector(".combo-input");
      if (event.pointerType === "touch") closedByTouch = true;
      if (document.activeElement === input) {
        // Blur closes the menu, restores the label, and puts the on-screen
        // keyboard away; on desktop the focus shift does it naturally.
        if (event.pointerType === "touch") input.blur();
        continue;
      }
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      combo.dispatchEvent(new CustomEvent("combo-restore"));
    }
    if (closedByTouch) shieldOutsidePress(event);
  },
  true,
);

// The portrait two-row header keeps the "Holy Bible" label only while it
// fits. The panel-count control sits in the flexible column of the top row,
// so when space runs out it is the first thing pushed into the brand: that
// overlap is the signal to drop the label (and re-measure on every resize
// so it comes back as soon as it fits again).
const brandLabel = siteBrand.querySelector("span:last-child");
const panelCountControl = panelCountOneButton.closest(".panel-count-control");

function updateBrandLabelVisibility() {
  if (!brandLabel) return;
  document.body.classList.remove("brand-label-hidden");
  if (phonePortraitLayout.matches) return;
  if (!mobileLayout.matches || touchPanelToggleLayout.matches) return;
  const brandRect = siteBrand.getBoundingClientRect();
  const controlLeft = panelCountControl.getBoundingClientRect().left;
  if (controlLeft < brandRect.right + 2) {
    document.body.classList.add("brand-label-hidden");
  }
}

let brandLabelFrame = 0;
function scheduleBrandLabelUpdate() {
  window.cancelAnimationFrame(brandLabelFrame);
  brandLabelFrame = window.requestAnimationFrame(updateBrandLabelVisibility);
}

window.addEventListener("resize", scheduleBrandLabelUpdate);
mobileLayout.addEventListener("change", scheduleBrandLabelUpdate);
phonePortraitLayout.addEventListener("change", scheduleBrandLabelUpdate);
touchPanelToggleLayout.addEventListener("change", scheduleBrandLabelUpdate);
scheduleBrandLabelUpdate();

// On desktop, wheel scrolling anywhere outside the reading surface — the app
// header bar, each panel's header bar, and the empty strips around the panels
// — pans the panel track. Wheel ticks arrive in coarse jumps, so instead of
// stepping instantly the deltas accumulate into a target the track glides
// toward each frame.
let headerPanTarget = null;
let headerPanFrame = 0;
let desktopPanelSnapTimer = 0;
let desktopPanelSnapping = false;

function shouldSnapDesktopPanels() {
  return !mobileLayout.matches && Boolean(state?.desktopPanelMode);
}

function scheduleDesktopPanelSnap(delay = 140) {
  if (!shouldSnapDesktopPanels() || desktopPanelSnapping) return;
  window.clearTimeout(desktopPanelSnapTimer);
  desktopPanelSnapTimer = window.setTimeout(snapDesktopPanelsToNearest, delay);
}

function snapDesktopPanelsToNearest() {
  desktopPanelSnapTimer = 0;
  if (!shouldSnapDesktopPanels() || desktopPanelSnapping) return;
  if (headerPanTarget != null || headerPanFrame) {
    scheduleDesktopPanelSnap(120);
    return;
  }
  const targetLeft = panelScrollLeft(panelIndexAtViewportStart());
  if (Math.abs(panelTrack.scrollLeft - targetLeft) <= 1) {
    panelTrack.scrollTo({ left: targetLeft, behavior: "instant" });
    return;
  }
  desktopPanelSnapping = true;
  animateTrackScroll(targetLeft, 220, () => {
    desktopPanelSnapping = false;
  });
}

function stepHeaderPan() {
  headerPanFrame = 0;
  if (headerPanTarget == null) return;
  const current = panelTrack.scrollLeft;
  const remaining = headerPanTarget - current;
  if (Math.abs(remaining) <= 1) {
    panelTrack.scrollTo({ left: headerPanTarget, behavior: "instant" });
    headerPanTarget = null;
    scheduleDesktopPanelSnap(80);
    return;
  }
  const step = Math.sign(remaining) * Math.max(1, Math.abs(remaining) * 0.16);
  panelTrack.scrollTo({ left: current + step, behavior: "instant" });
  headerPanFrame = requestAnimationFrame(stepHeaderPan);
}

function isWheelPanRegion(target) {
  if (!(target instanceof Element)) return false;
  // An open combo dropdown scrolls its own option list.
  if (target.closest(".combo-menu")) return false;
  // An open translation picker dropdown scrolls its own option list too.
  if (target.closest(".translation-picker-menu")) return false;
  if (target.closest(".app-header") || target.closest(".panel-header")) return true;
  // The track and workspace are only hit directly in the gaps around panels.
  return target === panelTrack || target.classList.contains("workspace");
}

function handleTranslationListWheel(event) {
  const list = event.target instanceof Element
    ? event.target.closest(".translation-list")
    : null;
  if (!list || list.scrollWidth <= list.clientWidth + 1) return false;
  const unit = event.deltaMode === 1 ? 16 : 1;
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
  if (!delta) return false;
  event.preventDefault();
  list.scrollLeft += delta;
  return true;
}

document.addEventListener(
  "wheel",
  (event) => {
    if (mobileLayout.matches || !state?.panels?.length) return;
    if (handleTranslationListWheel(event)) return;
    if (!isWheelPanRegion(event.target)) return;
    const unit = event.deltaMode === 1 ? 16 : 1;
    const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    if (!delta) return;
    event.preventDefault();
    const maxScroll = Math.max(0, panelTrack.scrollWidth - panelTrack.clientWidth);
    const base = headerPanTarget ?? panelTrack.scrollLeft;
    headerPanTarget = Math.max(0, Math.min(base + delta, maxScroll));
    if (reducedMotion.matches) {
      panelTrack.scrollTo({ left: headerPanTarget, behavior: "instant" });
      headerPanTarget = null;
      scheduleDesktopPanelSnap(80);
      return;
    }
    if (!headerPanFrame) headerPanFrame = requestAnimationFrame(stepHeaderPan);
  },
  { passive: false },
);

// A selected desktop preset means "full screen" or "half screen", so the
// widths follow the window when it is resized.
let desktopModeResizeTimer = 0;
window.addEventListener("resize", () => {
  if (!desktopLikePanels() || !state?.desktopPanelMode) return;
  window.clearTimeout(desktopModeResizeTimer);
  desktopModeResizeTimer = window.setTimeout(() => {
    const alignmentIndex = panelIndexAtViewportStart();
    applyDesktopPanelWidths();
    alignPanelsAfterLayoutChange(alignmentIndex);
    saveState();
  }, 150);
});

panelTrack.addEventListener(
  "scroll",
  () => {
    if (
      desktopPanelSnapping
      || headerPanTarget != null
      || panelTrack.classList.contains("panel-count-changing")
      || panelTrack.classList.contains("removing-panel")
    ) {
      return;
    }
    scheduleDesktopPanelSnap();
  },
  { passive: true },
);

function panelScrollLeft(index) {
  const panelState = state.panels[index];
  const panel = panelState ? panelElements.get(panelState.id)?.panel : null;
  if (!panel) return panelTrack.scrollLeft;
  const paddingLeft = Number.parseFloat(getComputedStyle(panelTrack).paddingLeft) || 0;
  return Math.max(0, panel.offsetLeft - paddingLeft);
}

function panelIndexAtViewportStart() {
  if (!state?.panels?.length) return 0;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  state.panels.forEach((panelState, index) => {
    if (!panelElements.has(panelState.id)) return;
    const distance = Math.abs(panelTrack.scrollLeft - panelScrollLeft(index));
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function scrollToPanelIndex(index, behavior = "smooth", activate = true) {
  if (!state.panels.length) return;
  const targetIndex = Math.max(0, Math.min(index, state.panels.length - 1));
  panelTrack.scrollTo({ left: panelScrollLeft(targetIndex), behavior });
  const targetState = state.panels[targetIndex];
  if (activate && targetState) setActivePanel(targetState.id);
}

function setupCombobox({ input, menu, items, selectedValue, matches, onSelect }) {
  let allItems = items;
  let selected = selectedValue;
  let filtered = [];
  let highlighted = 0;
  const comboKind = menu.closest(".book-combo")
    ? "book"
    : menu.closest(".chapter-combo")
      ? "chapter"
      : menu.closest(".verse-combo")
        ? "verse"
        : "";

  function selectedItem() {
    return allItems.find((item) => item.value === selected);
  }

  function close() {
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  function resetMenuPosition() {
    menu.style.removeProperty("left");
    menu.style.removeProperty("right");
    menu.style.removeProperty("width");
  }

  function positionMenu() {
    if (comboKind !== "book" || !mobileLayout.matches) {
      resetMenuPosition();
      return;
    }
    const combo = input.closest(".combo");
    const boundary = input.closest(".panel-selectors");
    if (!combo || !boundary) return;
    const comboRect = combo.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    if (!comboRect.width || !boundaryRect.width) return;
    menu.style.left = `${Math.round(boundaryRect.left - comboRect.left)}px`;
    menu.style.right = "auto";
    menu.style.width = `${Math.floor(boundaryRect.width)}px`;
  }

  function choose(item, notify = true) {
    if (!item) return;
    selected = item.value;
    input.value = item.label;
    close();
    if (notify) onSelect(item.value);
  }

  function menuHeading(text, extraClass = "") {
    const heading = document.createElement("div");
    heading.className = `combo-menu-heading${extraClass ? ` ${extraClass}` : ""}`;
    heading.textContent = text;
    return heading;
  }

  function render(query = "") {
    filtered = allItems.filter((item) => matches(item, query));
    // With no query, start the list from the current selection instead of
    // the top; while typing, keep the first match highlighted.
    const selectedIndex = query.trim() ? -1 : filtered.findIndex((item) => item.value === selected);
    highlighted = selectedIndex >= 0 ? selectedIndex : 0;
    menu.replaceChildren();
    const emptyQuery = !query.trim();
    if (emptyQuery && comboKind === "chapter") menu.append(menuHeading("CHAPTER"));
    if (emptyQuery && comboKind === "verse") menu.append(menuHeading("VERSE"));
    let addedNewTestamentHeading = false;
    if (emptyQuery && comboKind === "book") {
      menu.append(menuHeading("OLD TESTAMENT", "combo-menu-heading-old"));
    }
    for (const [index, item] of filtered.entries()) {
      if (
        emptyQuery &&
        comboKind === "book" &&
        !addedNewTestamentHeading &&
        item.testament === "new"
      ) {
        menu.append(menuHeading("NEW TESTAMENT", "combo-menu-heading-new"));
        addedNewTestamentHeading = true;
      }
      const option = document.createElement("button");
      option.type = "button";
      option.className = "combo-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(item.value === selected));
      option.textContent = item.label;
      option.addEventListener("click", () => choose(item));
      if (index === highlighted) option.classList.add("highlighted");
      menu.append(option);
    }
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "combo-empty";
      empty.textContent = "No matches";
      menu.append(empty);
    }
    if (query.trim()) menu.scrollTop = 0;
  }

  function updateHighlight(nextIndex) {
    if (!filtered.length) return;
    highlighted = (nextIndex + filtered.length) % filtered.length;
    menu.querySelectorAll(".combo-option").forEach((option, index) => {
      option.classList.toggle("highlighted", index === highlighted);
    });
    menu.querySelectorAll(".combo-option")[highlighted]?.scrollIntoView({ block: "nearest" });
  }

  function moveHighlight(nextIndex) {
    if (!filtered.length) return false;
    if (nextIndex < 0 || nextIndex >= filtered.length) return false;
    updateHighlight(nextIndex);
    return true;
  }

  function keyboardTarget(key) {
    const options = [...menu.querySelectorAll(".combo-option")];
    const current = options[highlighted];
    if (!current) return null;
    const currentRect = current.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;
    const sameRowTolerance = currentRect.height * 0.55;
    const sameColumnTolerance = currentRect.width * 0.55;
    let bestIndex = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const [index, option] of options.entries()) {
      if (index === highlighted) continue;
      const rect = option.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - currentX;
      const dy = y - currentY;
      let valid = false;
      let score = Number.POSITIVE_INFINITY;
      if (key === "ArrowRight" && dx > 0 && Math.abs(dy) <= sameRowTolerance) {
        valid = true;
        score = dx + Math.abs(dy) * 8;
      } else if (key === "ArrowLeft" && dx < 0 && Math.abs(dy) <= sameRowTolerance) {
        valid = true;
        score = Math.abs(dx) + Math.abs(dy) * 8;
      } else if (key === "ArrowDown" && dy > 0 && Math.abs(dx) <= sameColumnTolerance) {
        valid = true;
        score = dy + Math.abs(dx) * 8;
      } else if (key === "ArrowUp" && dy < 0 && Math.abs(dx) <= sameColumnTolerance) {
        valid = true;
        score = Math.abs(dy) + Math.abs(dx) * 8;
      }
      if (valid && score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function centerHighlighted() {
    const option = menu.querySelectorAll(".combo-option")[highlighted];
    if (!option) return;
    menu.scrollTop = option.offsetTop - (menu.clientHeight - option.offsetHeight) / 2;
  }

  // Opening fresh empties the input (ready to type) and shows the full list
  // scrolled so the current selection sits centered; the selection itself is
  // kept and snaps back if the menu is left without choosing.
  function open(clearText = false, focusInput = false) {
    if (clearText) input.value = "";
    render(clearText ? "" : input.value === selectedItem()?.label ? "" : input.value);
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    positionMenu();
    if (focusInput) input.focus({ preventScroll: true });
    centerHighlighted();
  }

  let menuPointerActive = false;

  input.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !mobileLayout.matches) return;
    event.preventDefault();
    if (menu.hidden) open(true);
    input.blur();
  });
  input.addEventListener("focus", () => {
    if (menu.hidden) open(true);
  });
  input.addEventListener("click", () => {
    if (menu.hidden) open(true);
  });
  input.addEventListener("input", () => {
    render(input.value);
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    positionMenu();
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      event.preventDefault();
      if (menu.hidden) open();
      const nextIndex = keyboardTarget(event.key);
      if (nextIndex != null) moveHighlight(nextIndex);
    } else if (event.key === "Enter") {
      if (!menu.hidden && filtered.length) {
        event.preventDefault();
        choose(filtered[highlighted]);
      }
    } else if (event.key === "Escape") {
      close();
      input.value = selectedItem()?.label ?? "";
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (menuPointerActive) return;
      close();
      input.value = selectedItem()?.label ?? "";
    }, 100);
  });
  const releaseMenuPointer = () => {
    window.setTimeout(() => {
      menuPointerActive = false;
    }, 150);
  };
  menu.addEventListener("pointerdown", (event) => {
    menuPointerActive = true;
    const pointerId = event.pointerId;
    const release = (releaseEvent) => {
      if (releaseEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      releaseMenuPointer();
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  });
  // The outside-press closer (see the document pointerdown listener) asks
  // the combo to put the selected label back after it hides the menu.
  input.closest(".combo").addEventListener("combo-restore", () => {
    input.value = selectedItem()?.label ?? "";
  });

  choose(selectedItem(), false);
  close();

  return {
    open,
    close,
    setItems(nextItems) {
      allItems = nextItems;
      render();
    },
    setValue(value) {
      selected = value;
      choose(selectedItem(), false);
    },
  };
}

// Momentum for continuous touch panning: the track keeps gliding with the
// finger's release velocity (px per ms) and decays.
let panelGlideFrame = 0;
const TOUCH_PANEL_FLICK_VELOCITY = 0.55;
const TOUCH_PANEL_FLICK_DISTANCE = 24;

function cancelPanelGlide() {
  cancelAnimationFrame(panelGlideFrame);
  panelGlideFrame = 0;
}

function startPanelGlide(velocity) {
  cancelPanelGlide();
  if (!Number.isFinite(velocity) || Math.abs(velocity) < 0.08 || reducedMotion.matches) return;
  let speed = Math.max(-4, Math.min(velocity, 4));
  let previous = performance.now();
  const step = (now) => {
    panelGlideFrame = 0;
    const elapsed = Math.min(now - previous, 40);
    previous = now;
    panelTrack.scrollLeft += speed * elapsed;
    speed *= 0.95 ** (elapsed / 16);
    const maxScroll = Math.max(0, panelTrack.scrollWidth - panelTrack.clientWidth);
    if (Math.abs(speed) < 0.04 || panelTrack.scrollLeft <= 0 || panelTrack.scrollLeft >= maxScroll) return;
    panelGlideFrame = requestAnimationFrame(step);
  };
  panelGlideFrame = requestAnimationFrame(step);
}

function snapTouchPanelsAfterSwipe({ velocityX = 0, startIndex = null, totalDeltaX = 0 } = {}) {
  if (!mobileLayout.matches) return false;
  if (!phonePortraitLayout.matches && (!touchPanelToggleLayout.matches || !state?.desktopPanelMode)) {
    return false;
  }
  cancelPanelGlide();
  let targetIndex = panelIndexAtViewportStart();
  const isFlick = Math.abs(velocityX) >= TOUCH_PANEL_FLICK_VELOCITY
    && Math.abs(totalDeltaX) >= TOUCH_PANEL_FLICK_DISTANCE;
  if (isFlick) {
    const baseIndex = Number.isInteger(startIndex) ? startIndex : targetIndex;
    const direction = velocityX < 0 ? 1 : -1;
    targetIndex = Math.max(0, Math.min(baseIndex + direction, state.panels.length - 1));
  }
  animateTrackScroll(panelScrollLeft(targetIndex), 220);
  return true;
}


// Horizontal touch drags on a panel pan the track by hand, following the
// finger position directly with momentum on release.
function setupPanelSwipe(panel) {
  let gesture = null;
  let suppressClick = false;
  const findTouch = (touches, id) => {
    for (let index = 0; index < touches.length; index += 1) {
      if (touches[index].identifier === id) return touches[index];
    }
    return null;
  };
  const shouldIgnoreSwipeStart = (target) => (
    target.closest("button, input, textarea, select, .combo-menu, .panel-resize-handle")
  );

  panel.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  panel.addEventListener("touchstart", (event) => {
    cancelPanelGlide();
    if (event.touches.length !== 1) {
      gesture = null;
      document.body.classList.remove("swiping-panels");
      return;
    }
    if (!mobileLayout.matches) return;
    if (shouldIgnoreSwipeStart(event.target)) return;
    const touch = event.touches[0];
    gesture = {
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      startScrollLeft: panelTrack.scrollLeft,
      startIndex: panelIndexAtViewportStart(),
      axis: null,
      samples: [{ time: performance.now(), x: touch.clientX }],
    };
  }, { passive: true });

  panel.addEventListener("touchmove", (event) => {
    if (!gesture) return;
    if (event.touches.length !== 1) {
      gesture = null;
      document.body.classList.remove("swiping-panels");
      return;
    }
    if (panelTrack.classList.contains("panel-reorder-active")) {
      gesture = null;
      return;
    }
    const touch = findTouch(event.touches, gesture.touchId);
    if (!touch) return;
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    const distanceX = Math.abs(deltaX);
    const distanceY = Math.abs(deltaY);

    if (!gesture.axis && Math.max(distanceX, distanceY) >= 3) {
      gesture.axis = distanceX > distanceY ? "horizontal" : "vertical";
    }
    if (gesture.axis !== "horizontal") return;
    if (state.panels.length < 2) return;

    event.preventDefault();
    document.body.classList.add("swiping-panels");
    panelTrack.scrollLeft = gesture.startScrollLeft - deltaX;
    const now = performance.now();
    gesture.samples.push({ time: now, x: touch.clientX });
    while (gesture.samples.length > 8 || now - gesture.samples[0].time > 160) {
      gesture.samples.shift();
    }
  }, { passive: false });

  const finish = (event, cancelled = false) => {
    if (!gesture) return;
    const touch = findTouch(event.changedTouches, gesture.touchId);
    if (!touch) return;
    const hadDrag = Boolean(gesture.axis);
    if (gesture.axis === "horizontal") {
      const samples = gesture.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocityX = first && last && last.time > first.time
        ? (last.x - first.x) / (last.time - first.time)
        : 0;
      if (snapTouchPanelsAfterSwipe({
        velocityX: cancelled ? 0 : velocityX,
        startIndex: gesture.startIndex,
        totalDeltaX: touch.clientX - gesture.startX,
      })) {
        // The one/two-panel touch presets always land on a panel edge.
      } else if (!cancelled && first && last && last.time > first.time) {
        startPanelGlide(-velocityX);
      }

      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 400);
    } else if (hadDrag) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 300);
    }
    document.body.classList.remove("swiping-panels");
    gesture = null;
  };

  panel.addEventListener("touchend", (event) => finish(event));
  panel.addEventListener("touchcancel", (event) => finish(event, true));
}

function chapterItems(bookIndex) {
  return Array.from({ length: manifest.books[bookIndex].chapters }, (_, index) => ({
    value: index + 1,
    label: String(index + 1),
  }));
}

function verseItems(panelState) {
  // Before the chapter data for this panel has loaded, fall back to a
  // single-item list holding the panel's own verse instead of a hardcoded
  // 1 — otherwise the pre-fetch updatePanelControls call below would clamp
  // (and persist) an in-progress or restored verse down to 1.
  const verses = panelState.data?.v?.map(([verse]) => Number(verse)).filter(Number.isFinite)
    ?? [Math.max(1, Number(panelState.verse) || 1)];
  return verses.map((verse) => ({ value: verse, label: String(verse) }));
}

function normalizePassage(book, chapter, verse = 1) {
  const normalizedBook = Math.max(0, Math.min(Number(book) || 0, manifest.books.length - 1));
  const normalizedChapter = Math.max(
    1,
    Math.min(Number(chapter) || 1, manifest.books[normalizedBook].chapters),
  );
  return {
    book: normalizedBook,
    chapter: normalizedChapter,
    verse: Math.max(1, Number(verse) || 1),
  };
}

function samePassage(a, b) {
  return Boolean(a && b && a.book === b.book && a.chapter === b.chapter && a.verse === b.verse);
}

function currentPassage(panelState) {
  return normalizePassage(panelState.book, panelState.chapter, panelState.verse);
}

function ensurePanelHistory(panelState) {
  if (!Array.isArray(panelState.history) || !panelState.history.length) {
    panelState.history = [currentPassage(panelState)];
    panelState.historyIndex = 0;
  }
  panelState.historyIndex = Math.max(
    0,
    Math.min(Number(panelState.historyIndex) || 0, panelState.history.length - 1),
  );
}

function recordPanelHistory(panelState, passage = currentPassage(panelState)) {
  ensurePanelHistory(panelState);
  if (samePassage(panelState.history[panelState.historyIndex], passage)) return;
  // The passage a fresh/reset panel starts on isn't a real visited stop —
  // replace it in place instead of recording a back-target for it, but only
  // for this first navigation; after that history behaves normally.
  if (panelState.historyIsProvisional) {
    panelState.historyIsProvisional = false;
    panelState.history[panelState.historyIndex] = passage;
    return;
  }
  panelState.history = panelState.history.slice(0, panelState.historyIndex + 1);
  panelState.history.push(passage);
  if (panelState.history.length > 100) panelState.history.shift();
  panelState.historyIndex = panelState.history.length - 1;
}

function maximumPanelWidth() {
  return Math.max(320, panelAvailableWidth());
}

function setupPanelResize(panel, handle, panelState) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    document.body.classList.add("resizing-panel");
    handle.setPointerCapture(event.pointerId);

    const resize = (moveEvent) => {
      const width = Math.max(320, Math.min(startWidth + moveEvent.clientX - startX, maximumPanelWidth()));
      panelState.width = Math.round(width);
      applyPanelWidth(panel, panelState.width);
      clearDesktopPanelMode();
    };
    const finish = () => {
      document.body.classList.remove("resizing-panel");
      handle.removeEventListener("pointermove", resize);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      saveState();
    };

    handle.addEventListener("pointermove", resize);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });

  handle.addEventListener("dblclick", () => {
    panelState.width = null;
    panel.style.removeProperty("flex-basis");
    panel.style.removeProperty("width");
    clearDesktopPanelMode();
    saveState();
  });
}

function setupPanelMoveReveal(panel, moveLeft, moveRight) {
  const clear = () => {
    moveLeft.classList.remove("revealed");
    moveRight.classList.remove("revealed");
  };

  panel.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = panel.getBoundingClientRect();
    const nearMiddle = Math.abs(event.clientY - (rect.top + rect.height / 2)) <= 82;
    moveLeft.classList.toggle("revealed", nearMiddle && event.clientX - rect.left <= 64);
    moveRight.classList.toggle("revealed", nearMiddle && rect.right - event.clientX <= 64);
  });
  panel.addEventListener("pointerleave", clear);
}

function createPanelElement(panelState, shouldScroll = false) {
  const id = `panel-${++panelIdCounter}`;
  panelState.id = id;
  const fragment = panelTemplate.content.cloneNode(true);
  const panel = fragment.querySelector(".bible-panel");
  const header = fragment.querySelector(".panel-header");
  const bookInput = fragment.querySelector(".book-input");
  const chapterInput = fragment.querySelector(".chapter-input");
  const verseInput = fragment.querySelector(".verse-input");
  const content = fragment.querySelector(".panel-content");
  const translationPickerEl = fragment.querySelector(".panel-translation-picker");
  const translationPickerToggleEl = fragment.querySelector(".panel-translation-picker-toggle");
  const translationPickerMenuEl = fragment.querySelector(".panel-translation-picker-menu");
  const translationListEl = fragment.querySelector(".panel-translation-list");
  const verseLayoutStackedEl = fragment.querySelector(".panel-verse-layout-stacked");
  const verseLayoutColumnsEl = fragment.querySelector(".panel-verse-layout-columns");
  const verseActions = fragment.querySelector(".verse-actions");
  const copy = fragment.querySelector(".copy-selection");
  const tskSelection = fragment.querySelector(".tsk-selection");
  const selectionModeControl = fragment.querySelector(".selection-mode-control");
  const selectionModeRange = fragment.querySelector(".selection-mode-range");
  const selectionModeIndividual = fragment.querySelector(".selection-mode-individual");
  const cancelSelection = fragment.querySelector(".cancel-selection");
  const wordActions = fragment.querySelector(".word-actions");
  const wordDictionary = fragment.querySelector(".word-dictionary");
  const wordCopy = fragment.querySelector(".word-copy");
  const wordCancel = fragment.querySelector(".word-cancel");
  const remove = fragment.querySelector(".remove-panel");
  const historyBack = fragment.querySelector(".panel-history-back");
  const historyForward = fragment.querySelector(".panel-history-forward");
  const moveLeft = fragment.querySelector(".panel-move-left");
  const moveRight = fragment.querySelector(".panel-move-right");
  const previous = fragment.querySelector(".previous-chapter");
  const next = fragment.querySelector(".next-chapter");
  const resizeHandle = fragment.querySelector(".panel-resize-handle");

  panel.dataset.panelId = id;
  panelState.selectionAnchor = null;
  panelState.selectionEnd = null;
  panelState.selectedVerses = new Set();
  panelState.selectionMode = state.copySelectionMode;
  panelState.selectedWord = null;
  panelState.verse = Number(panelState.verse) || 1;
  ensurePanelHistory(panelState);
  if (panelState.width) {
    const renderedWidth = desktopLikePanels()
      ? Math.min(panelState.width, maximumPanelWidth())
      : panelState.width;
    applyPanelWidth(panel, renderedWidth, mobileLayout.matches && !desktopLikePanels());
  }
  panel.addEventListener("pointerdown", () => setActivePanel(id));
  panel.addEventListener("focusin", () => setActivePanel(id));

  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  const bookCombo = setupCombobox({
    input: bookInput,
    menu: fragment.querySelector(".book-combo .combo-menu"),
    items: bookItems,
    selectedValue: panelState.book,
    matches: matchesBook,
    onSelect: (book) => {
      goToPassage(panelState, { book, chapter: 1, verse: 1 }, { record: true });
    },
  });
  const chapterCombo = setupCombobox({
    input: chapterInput,
    menu: fragment.querySelector(".chapter-combo .combo-menu"),
    items: chapterItems(panelState.book),
    selectedValue: panelState.chapter,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (chapter) => {
      goToPassage(panelState, { book: panelState.book, chapter, verse: 1 }, { record: true });
    },
  });
  const verseCombo = setupCombobox({
    input: verseInput,
    menu: fragment.querySelector(".verse-combo .combo-menu"),
    items: [{ value: panelState.verse, label: String(panelState.verse) }],
    selectedValue: panelState.verse,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      goToPassage(
        panelState,
        { book: panelState.book, chapter: panelState.chapter, verse },
        { record: true },
      );
    },
  });
  const translationControl = setupDialogTranslationControl({
    picker: translationPickerEl,
    toggle: translationPickerToggleEl,
    menu: translationPickerMenuEl,
    list: translationListEl,
    getOrder: () => panelState.enabledTranslations,
    setOrder: (order) => {
      panelState.enabledTranslations = order;
      panelState.highlightedTranslations = panelState.highlightedTranslations.filter((id) => order.includes(id));
      panelState.dimmedTranslations = panelState.dimmedTranslations.filter((id) => order.includes(id));
    },
    getOriginalLanguageTestament: () => testamentForBook(panelState.book),
    getEmphasis: (id) => (
      panelState.highlightedTranslations.includes(id) ? "highlight"
        : panelState.dimmedTranslations.includes(id) ? "dim"
        : "normal"
    ),
    // Clicking a version chip cycles normal -> highlight -> dim -> normal.
    // Hebrew/Greek skip that cycle entirely -- clicking it instead toggles
    // the panel's side-by-side original-language split view.
    onToggleActive: (id) => {
      if (ORIGINAL_LANGUAGE_IDS.includes(id)) {
        toggleOriginalLanguageSplit(panelState, panel, id);
        return;
      }
      const highlighted = new Set(panelState.highlightedTranslations);
      const dimmed = new Set(panelState.dimmedTranslations);
      if (highlighted.has(id)) {
        highlighted.delete(id);
        dimmed.add(id);
      } else if (dimmed.has(id)) {
        dimmed.delete(id);
      } else {
        highlighted.add(id);
      }
      panelState.highlightedTranslations = [...highlighted];
      panelState.dimmedTranslations = [...dimmed];
    },
    onChange: () => {
      saveState();
      renderPanelBody(panelState);
    },
  });
  verseLayoutStackedEl.addEventListener("click", () => setPanelVerseLayout(panelState, "stacked"));
  verseLayoutColumnsEl.addEventListener("click", () => setPanelVerseLayout(panelState, "columns"));
  copy.addEventListener("click", () => openCopyDialog(panelState));
  tskSelection.addEventListener("click", () => openTskDialog(panelState));
  selectionModeRange.addEventListener("click", () => setPanelSelectionMode(panelState, "range"));
  selectionModeIndividual.addEventListener("click", () => setPanelSelectionMode(panelState, "individual"));
  cancelSelection.addEventListener("click", () => clearPanelSelection(panelState));
  wordDictionary.addEventListener("click", () => openStrongsDialog(panelState));
  wordCopy.addEventListener("click", () => copySelectedWord(panelState));
  wordCancel.addEventListener("click", () => clearWordLookup(panelState));
  remove.addEventListener("click", () => removePanel(id));
  historyBack.addEventListener("click", () => navigatePanelHistory(panelState, -1));
  historyForward.addEventListener("click", () => navigatePanelHistory(panelState, 1));
  moveLeft.addEventListener("click", (event) => {
    event.stopPropagation();
    movePanelBy(panelState, -1);
  });
  moveRight.addEventListener("click", (event) => {
    event.stopPropagation();
    movePanelBy(panelState, 1);
  });
  previous.addEventListener("click", () => navigateChapter(panelState, -1));
  next.addEventListener("click", () => navigateChapter(panelState, 1));
  setupPanelResize(panel, resizeHandle, panelState);
  setupPanelMoveReveal(panel, moveLeft, moveRight);
  setupPanelSwipe(panel);

  panelElements.set(id, {
    panel,
    header,
    bookCombo,
    chapterCombo,
    verseCombo,
    content,
    verseActions,
    copy,
    tskSelection,
    selectionModeControl,
    selectionModeRange,
    selectionModeIndividual,
    cancelSelection,
    wordActions,
    wordDictionary,
    wordCopy,
    wordCancel,
    remove,
    historyBack,
    historyForward,
    moveLeft,
    moveRight,
    previous,
    next,
    translationControl,
    verseLayoutStacked: verseLayoutStackedEl,
    verseLayoutColumns: verseLayoutColumnsEl,
  });
  panelTrack.append(fragment);
  translationControl.render();
  applyPanelVerseLayout(panelState);
  updatePanelNumbers();
  updatePanelMoveButtons();
  updateRemoveButtons();
  updatePanelCountControls();
  setActivePanel(id);
  loadPanel(panelState, panelState.verse);

  if (shouldScroll) {
    requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" }));
  }
  return panel;
}

function setActivePanel(id) {
  activePanelId = id;
  for (const [panelId, elements] of panelElements) {
    elements.panel.classList.toggle("active", panelId === id);
  }
}

function addPanel() {
  if (panelMutationInProgress) return;
  const previousCount = state.panels.length;
  const viewportStart = panelIndexAtViewportStart();
  const source = state.panels.find((panel) => panel.id === activePanelId) ?? state.panels.at(-1);
  const panelState = {
    book: source?.book ?? 0,
    chapter: source?.chapter ?? 1,
    width: source?.width ?? null,
    enabledTranslations: source?.enabledTranslations ? [...source.enabledTranslations] : [...DEFAULT_ENABLED_TRANSLATIONS],
    highlightedTranslations: source?.highlightedTranslations ? [...source.highlightedTranslations] : [...DEFAULT_HIGHLIGHTED_TRANSLATIONS],
    dimmedTranslations: source?.dimmedTranslations ? [...source.dimmedTranslations] : [...DEFAULT_DIMMED_TRANSLATIONS],
    verseLayout: source?.verseLayout ?? "stacked",
  };
  state.panels.push(panelState);
  saveState();
  const twoPanelTouchMode = isTwoPanelTouchMode();
  const panel = createPanelElement(panelState, !twoPanelTouchMode);
  if (twoPanelTouchMode) {
    panel.animate(
      [
        { opacity: 0, transform: "translateX(24px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: reducedMotion.matches ? 0 : 280, easing: "cubic-bezier(.2,.75,.25,1)" },
    );
    const targetIndex = previousCount < 2 ? 0 : Math.min(viewportStart + 1, state.panels.length - 1);
    requestAnimationFrame(() => scrollToPanelIndex(targetIndex, "smooth", false));
  }
  return panelState;
}

function removePanel(id) {
  if (state.panels.length === 1 || panelMutationInProgress) return;
  const index = state.panels.findIndex((panel) => panel.id === id);
  if (index < 0) return;
  panelMutationInProgress = true;
  const isLast = index === state.panels.length - 1;
  const wasViewingRemoved = panelIndexAtViewportStart() === index;
  const removedElements = panelElements.get(id);
  const removedPanel = removedElements?.panel;
  removedElements?.translationControl.destroy();

  state.panels.splice(index, 1);
  panelElements.delete(id);
  if (activePanelId === id) setActivePanel(state.panels[Math.min(index, state.panels.length - 1)].id);
  saveState();
  updatePanelNumbers();
  updateRemoveButtons();
  updatePanelMoveButtons();
  updatePanelCountControls();

  if (!removedPanel || reducedMotion.matches) {
    removedPanel?.remove();
    panelMutationInProgress = false;
    return;
  }

  try {
    removedPanel.style.pointerEvents = "none";
    const collapse = () =>
      collapsePanel(removedPanel, () => {
        panelMutationInProgress = false;
      });

    if (isLast && mobileLayout.matches && wasViewingRemoved) {
      // The rightmost panel fills the phone screen, so collapsing it in
      // place would swap the view with no motion at all: glide to the
      // neighbor first, then collapse the leaving panel off-screen.
      // Mandatory snap would fight the glide, so disable it for the
      // duration (collapsePanel's finish restores it).
      panelTrack.classList.add("removing-panel");
      const target = isTwoPanelTouchMode() ? state.panels.length - 2 : state.panels.length - 1;
      animateTrackScroll(panelScrollLeft(Math.max(0, target)), 320, collapse);
    } else {
      collapse();
    }
  } catch {
    removedPanel.remove();
    panelMutationInProgress = false;
  }
}

// Native scrollTo({behavior: "smooth"}) is unreliable mid-removal — snap
// containers can cut it short and some browsers finish it instantly — so
// the glide is driven by hand, which also lets the collapse chain exactly
// when the scroll lands.
function animateTrackScroll(targetLeft, duration, done) {
  const startLeft = panelTrack.scrollLeft;
  const distance = targetLeft - startLeft;
  if (!distance || reducedMotion.matches) {
    panelTrack.scrollLeft = targetLeft;
    done?.();
    return;
  }
  const startTime = performance.now();
  const easeOutCubic = (t) => 1 - (1 - t) ** 3;
  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    panelTrack.scrollLeft = startLeft + distance * easeOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function collapsePanel(panel, done) {
  const width = panel.getBoundingClientRect().width;
  const gap = Number.parseFloat(getComputedStyle(panelTrack).columnGap) || 0;
  // Inline styles with the "important" priority beat the mobile stylesheet's
  // !important flex-basis, and pinning the start size in px keeps the
  // shrink-to-zero transition animatable.
  panel.style.setProperty("flex-basis", `${width}px`, "important");
  panel.style.setProperty("width", `${width}px`, "important");
  panel.style.setProperty("--removed-gap", `${gap}px`);
  panel.style.setProperty("--removed-width", `${width}px`);
  panelTrack.classList.add("removing-panel");
  panel.getBoundingClientRect();
  panel.classList.add("panel-removing");
  panel.style.setProperty("flex-basis", "0px", "important");
  panel.style.setProperty("width", "0px", "important");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    panel.remove();
    if (!panelTrack.querySelector(".panel-removing")) panelTrack.classList.remove("removing-panel");
    done?.();
  };
  panel.addEventListener("transitionend", (event) => {
    if (event.target === panel && event.propertyName === "flex-basis") finish();
  });
  window.setTimeout(finish, 460);
}

function movePanel(from, to, { animate = true } = {}) {
  if (from === to || from < 0 || to < 0 || to >= state.panels.length) return;
  const previousLefts = new Map(
    state.panels.map((panelState) => [
      panelState.id,
      panelElements.get(panelState.id).panel.getBoundingClientRect().left,
    ]),
  );
  const [moved] = state.panels.splice(from, 1);
  state.panels.splice(to, 0, moved);
  const movedPanel = panelElements.get(moved.id).panel;
  const nextState = state.panels[to + 1];
  // Reordering must swap panels in place: browsers otherwise scroll to follow
  // the moved node (scroll anchoring / snap), dragging the whole view along.
  const savedScrollLeft = panelTrack.scrollLeft;
  panelTrack.classList.add("panel-count-changing");
  panelTrack.insertBefore(movedPanel, nextState ? panelElements.get(nextState.id).panel : null);
  panelTrack.scrollLeft = savedScrollLeft;
  requestAnimationFrame(() => {
    panelTrack.scrollLeft = savedScrollLeft;
    panelTrack.classList.remove("panel-count-changing");
    panelTrack.scrollLeft = savedScrollLeft;
  });
  saveState();
  updatePanelNumbers();
  updatePanelMoveButtons();
  if (!animate || reducedMotion.matches) return;
  for (const [panelId, oldLeft] of previousLefts) {
    const panel = panelElements.get(panelId)?.panel;
    if (!panel) continue;
    const delta = oldLeft - panel.getBoundingClientRect().left;
    if (Math.abs(delta) < 1) continue;
    panel.animate(
      [{ transform: `translateX(${delta}px)` }, { transform: "translateX(0)" }],
      { duration: 260, easing: "cubic-bezier(.2,.75,.25,1)" },
    );
  }
}

function movePanelBy(panelState, direction) {
  if (panelMutationInProgress) return;
  const from = state.panels.findIndex((item) => item.id === panelState.id);
  movePanel(from, from + direction);
}

function updatePanelNumbers() {
}

function updatePanelMoveButtons() {
  state.panels.forEach((panelState, index) => {
    const elements = panelElements.get(panelState.id);
    if (!elements) return;
    elements.moveLeft.disabled = index === 0;
    elements.moveRight.disabled = index === state.panels.length - 1;
  });
}

function updateRemoveButtons() {
  const disabled = state.panels.length === 1;
  for (const { remove } of panelElements.values()) {
    remove.disabled = disabled;
  }
}

function chapterPath(bookIndex, chapter) {
  return `./data/chapters/${manifest.books[bookIndex].slug}/${chapter}.json?v=${ASSET_VERSION}`;
}

async function getChapter(bookIndex, chapter) {
  const key = `${bookIndex}:${chapter}`;
  if (chapterCache.has(key)) return chapterCache.get(key);
  const response = await fetch(chapterPath(bookIndex, chapter), { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load this chapter (${response.status})`);
  const data = await response.json();
  chapterCache.set(key, data);
  if (chapterCache.size > 40) chapterCache.delete(chapterCache.keys().next().value);
  return data;
}

function interlinearPath(bookIndex, chapter) {
  return `./data/interlinear/${manifest.books[bookIndex].slug}/${chapter}.json?v=${ASSET_VERSION}`;
}

// Not every chapter has interlinear tokens exported yet, so a 404 is treated
// as "no tokens for this chapter" rather than an error (see scripts/export_interlinear.py).
async function getInterlinearChapter(bookIndex, chapter) {
  const key = `${bookIndex}:${chapter}`;
  if (interlinearCache.has(key)) return interlinearCache.get(key);
  const response = await fetch(interlinearPath(bookIndex, chapter), { cache: "no-store" });
  const data = response.ok ? await response.json() : { v: [] };
  interlinearCache.set(key, data);
  if (interlinearCache.size > 40) interlinearCache.delete(interlinearCache.keys().next().value);
  return data;
}

// Lazily fetches this panel's interlinear chapter data when Hebrew/Greek is
// active, keyed to the panel's current book/chapter so a navigation or
// language swap triggers a fresh fetch. Re-renders the panel once loaded.
function ensureInterlinearData(panelState) {
  const activeId = activeOriginalLanguageId(panelState);
  if (!activeId) {
    panelState.interlinearVerses = null;
    return;
  }
  const cache = panelState.interlinearVerses;
  if (cache && cache.book === panelState.book && cache.chapter === panelState.chapter) return;
  const requestBook = panelState.book;
  const requestChapter = panelState.chapter;
  panelState.interlinearVerses = { book: requestBook, chapter: requestChapter, loading: true, map: new Map() };
  getInterlinearChapter(requestBook, requestChapter)
    .then((data) => {
      if (panelState.book !== requestBook || panelState.chapter !== requestChapter) return;
      if (!activeOriginalLanguageId(panelState)) return;
      panelState.interlinearVerses = { book: requestBook, chapter: requestChapter, loading: false, map: new Map(data.v) };
      renderPanelBody(panelState);
    })
    .catch(() => {
      if (panelState.book !== requestBook || panelState.chapter !== requestChapter) return;
      panelState.interlinearVerses = { book: requestBook, chapter: requestChapter, loading: false, map: new Map() };
      renderPanelBody(panelState);
    });
}

function interlinearTokensForVerse(panelState, verseNumber) {
  const cache = panelState.interlinearVerses;
  if (!cache || cache.loading || cache.book !== panelState.book || cache.chapter !== panelState.chapter) return null;
  return cache.map.get(verseNumber) ?? null;
}

// Strong's dictionary is small enough to load as one file (see
// scripts/export_strongs.py), keyed by code (e.g. "H7225").
function getStrongsData() {
  if (!strongsDataPromise) {
    strongsDataPromise = fetch(`./data/strongs.json?v=${ASSET_VERSION}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return strongsDataPromise;
}

// The Englishman's Concordance is exported one file per Strong's code (see
// scripts/export_englishmans.py), fetched lazily on first lookup.
async function getEnglishmansEntry(code) {
  if (englishmansCache.has(code)) return englishmansCache.get(code);
  const response = await fetch(`./data/englishmans/${code}.json?v=${ASSET_VERSION}`, { cache: "no-store" });
  const data = response.ok ? await response.json() : null;
  englishmansCache.set(code, data);
  return data;
}

function tskPath(bookIndex, chapter) {
  return `./data/tsk/${manifest.books[bookIndex].slug}/${chapter}.json?v=${ASSET_VERSION}`;
}

// Not every chapter has TSK entries, so a 404 is treated as "no entries"
// rather than an error (see scripts/export_tsk.py).
async function getTskChapter(bookIndex, chapter) {
  const key = `${bookIndex}:${chapter}`;
  if (tskCache.has(key)) return tskCache.get(key);
  const response = await fetch(tskPath(bookIndex, chapter), { cache: "no-store" });
  const data = response.ok ? await response.json() : { v: [] };
  tskCache.set(key, data);
  if (tskCache.size > 40) tskCache.delete(tskCache.keys().next().value);
  return data;
}

// Each token is a [original, transliteration, gloss, strongs] tuple (see
// scripts/export_interlinear.py). Rendered as a row of word blocks, right-to-
// left for Hebrew so words read in their natural order. Clicking a word
// stops the click from also reaching the verse-group (which would otherwise
// start a verse-copy selection instead) and reports the word back via
// onWordClick so the caller can enter word-lookup mode for it.
function buildInterlinearWordRow(tokens, lang, onWordClick) {
  const row = document.createElement("div");
  row.className = "interlinear-word-row";
  row.dir = lang === "he" ? "rtl" : "ltr";
  for (const token of tokens) {
    const [original, transliteration, gloss, strongs] = token;
    const word = document.createElement("span");
    word.className = "interlinear-word";
    word.lang = lang;

    const translitEl = document.createElement("span");
    translitEl.className = "interlinear-translit";
    translitEl.textContent = transliteration;

    const originalEl = document.createElement("span");
    originalEl.className = "interlinear-original";
    originalEl.textContent = original;

    const glossEl = document.createElement("span");
    glossEl.className = "interlinear-gloss";
    glossEl.textContent = gloss;

    word.append(translitEl, originalEl, glossEl);
    word.addEventListener("click", (event) => {
      event.stopPropagation();
      onWordClick?.(word, { original, transliteration, gloss, strongs, lang });
    });
    row.append(word);
  }
  return row;
}

function selectionBounds(panelState) {
  if (panelState.selectionAnchor == null || panelState.selectionEnd == null) return null;
  return [
    Math.min(panelState.selectionAnchor, panelState.selectionEnd),
    Math.max(panelState.selectionAnchor, panelState.selectionEnd),
  ];
}

function selectedVerseNumbers(panelState) {
  if (panelState.selectionMode === "individual") {
    return [...(panelState.selectedVerses ?? new Set())].sort((a, b) => a - b);
  }
  const bounds = selectionBounds(panelState);
  if (!bounds) return [];
  const [start, end] = bounds;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function hasVerseSelection(panelState) {
  return selectedVerseNumbers(panelState).length > 0;
}

function syncSelectedVersesFromRange(panelState) {
  panelState.selectedVerses = new Set(selectedVerseNumbers(panelState));
}

function selectionModeButtonState(elements, mode) {
  elements.selectionModeRange.classList.toggle("selected", mode === "range");
  elements.selectionModeIndividual.classList.toggle("selected", mode === "individual");
  elements.selectionModeRange.setAttribute("aria-pressed", String(mode === "range"));
  elements.selectionModeIndividual.setAttribute("aria-pressed", String(mode === "individual"));
}

function updatePanelSelection(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const selected = new Set(selectedVerseNumbers(panelState));
  const hasSelection = selected.size > 0;
  elements.content.querySelectorAll(".verse-group").forEach((group) => {
    const verse = Number(group.dataset.verse);
    group.classList.toggle("selected", selected.has(verse));
  });
  elements.panel.classList.toggle("selection-active", hasSelection);
  elements.verseActions.hidden = !hasSelection;
  selectionModeButtonState(elements, panelState.selectionMode);
}

// Clicking an interlinear word enters a separate "word lookup" mode
// (dictionary/index/copy/cancel), mutually exclusive with verse-copy mode
// above -- entering one clears the other (see selectVerse and
// selectInterlinearWord).
function updateWordLookup(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const active = Boolean(panelState.selectedWord);
  elements.panel.classList.toggle("word-lookup-active", active);
  elements.wordActions.hidden = !active;
}

function clearWordLookup(panelState) {
  if (!panelState.selectedWord) return;
  panelState.selectedWord = null;
  const elements = panelElements.get(panelState.id);
  elements?.content.querySelectorAll(".interlinear-word.selected").forEach((el) => el.classList.remove("selected"));
  updateWordLookup(panelState);
}

function selectInterlinearWord(panelState, verseNumber, wordEl, word) {
  if (wordEl.classList.contains("selected")) {
    clearWordLookup(panelState);
    return;
  }
  clearPanelSelection(panelState);
  const elements = panelElements.get(panelState.id);
  elements?.content.querySelectorAll(".interlinear-word.selected").forEach((el) => el.classList.remove("selected"));
  wordEl.classList.add("selected");
  panelState.selectedWord = { verse: verseNumber, ...word };
  updateWordLookup(panelState);
}

// The floating copy/cancel buttons overlap the bottom edge of the reading
// area, so a verse tapped near the bottom is nudged up just far enough to
// clear them (.verse-group's scroll-margin-bottom sets the clearance).
function revealVerseAboveActions(panelState, verse) {
  const elements = panelElements.get(panelState.id);
  const group = elements?.content.querySelector(`.verse-group[data-verse="${verse}"]`);
  if (!group) return;
  const contentRect = elements.content.getBoundingClientRect();
  const groupRect = group.getBoundingClientRect();
  const clearance = Number.parseFloat(getComputedStyle(group).scrollMarginBottom) || 0;
  const overlap = groupRect.bottom - (contentRect.bottom - clearance);
  if (overlap <= 0) return;
  // A verse taller than the panel keeps its start in view instead.
  const maxUpward = Math.max(0, groupRect.top - contentRect.top - 8);
  elements.content.scrollBy({
    top: Math.min(overlap, maxUpward),
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
}

function clearPanelSelection(panelState) {
  panelState.selectionAnchor = null;
  panelState.selectionEnd = null;
  panelState.selectedVerses = new Set();
  updatePanelSelection(panelState);
}

function setPanelSelectionMode(panelState, mode) {
  if (mode !== "range" && mode !== "individual") return;
  const previous = panelState.selectionMode;
  panelState.selectionMode = mode;
  state.copySelectionMode = mode;
  if (mode === "individual" && previous !== "individual") {
    syncSelectedVersesFromRange(panelState);
  } else if (mode === "range" && previous !== "range") {
    const verses = selectedVerseNumbers(panelState);
    if (verses.length) {
      panelState.selectionAnchor = verses[0];
      panelState.selectionEnd = verses[verses.length - 1];
    }
    syncSelectedVersesFromRange(panelState);
  }
  saveState();
  updatePanelSelection(panelState);
}

function selectVerse(panelState, verse) {
  panelState.lastClickedVerse = verse;
  clearWordLookup(panelState);
  if (!hasVerseSelection(panelState)) {
    panelState.selectionMode = state.copySelectionMode;
  }
  if (panelState.selectionMode === "individual") {
    if (!panelState.selectedVerses) panelState.selectedVerses = new Set();
    if (panelState.selectedVerses.has(verse)) panelState.selectedVerses.delete(verse);
    else panelState.selectedVerses.add(verse);
    if (panelState.selectedVerses.size) {
      const verses = selectedVerseNumbers(panelState);
      panelState.selectionAnchor = verses[0];
      panelState.selectionEnd = verses[verses.length - 1];
    } else {
      panelState.selectionAnchor = null;
      panelState.selectionEnd = null;
    }
    updatePanelSelection(panelState);
    if (hasVerseSelection(panelState)) revealVerseAboveActions(panelState, verse);
    return;
  }
  const bounds = selectionBounds(panelState);
  if (!bounds) {
    panelState.selectionAnchor = verse;
    panelState.selectionEnd = verse;
  } else if (panelState.selectionAnchor === panelState.selectionEnd) {
    if (panelState.selectionAnchor === verse) {
      panelState.selectionAnchor = null;
      panelState.selectionEnd = null;
    } else {
      panelState.selectionEnd = verse;
    }
  } else {
    panelState.selectionAnchor = verse;
    panelState.selectionEnd = verse;
  }
  syncSelectedVersesFromRange(panelState);
  updatePanelSelection(panelState);
  if (hasVerseSelection(panelState)) revealVerseAboveActions(panelState, verse);
}

function scrollVerseToTop(panelState, verse) {
  const elements = panelElements.get(panelState.id);
  const group = elements?.content.querySelector(`.verse-group[data-verse="${verse}"]`);
  if (!group) return;
  group.scrollIntoView({ behavior: "auto", block: "start" });
}

async function loadPanel(panelState, targetVerse = null) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return false;
  const requestKey = `${panelState.book}:${panelState.chapter}:${Date.now()}`;
  elements.panel.dataset.requestKey = requestKey;
  clearPanelSelection(panelState);
  clearWordLookup(panelState);
  elements.content.innerHTML = '<div class="panel-message">Loading…</div>';
  updatePanelControls(panelState);

  try {
    const data = await getChapter(panelState.book, panelState.chapter);
    if (elements.panel.dataset.requestKey !== requestKey) return false;
    panelState.data = data;
    panelState.verse = targetVerse || 1;
    panelState.scrollTargetVerse = panelState.verse;
    renderPanelBody(panelState);
    return true;
  } catch (error) {
    elements.content.innerHTML = `<div class="panel-message error">${escapeHtml(error.message)}<br />Use a local HTTP server when previewing.</div>`;
    return false;
  }
}

async function goToPassage(panelState, passage, { record = true } = {}) {
  const target = normalizePassage(passage.book, passage.chapter, passage.verse);
  const chapterChanged = panelState.book !== target.book || panelState.chapter !== target.chapter || !panelState.data;
  panelState.book = target.book;
  panelState.chapter = target.chapter;
  panelState.verse = target.verse;
  saveState();
  let loaded = true;
  if (chapterChanged) {
    loaded = await loadPanel(panelState, target.verse);
  } else {
    updatePanelControls(panelState);
    scrollVerseToTop(panelState, target.verse);
  }
  if (!loaded) return false;
  if (record) recordPanelHistory(panelState, target);
  updatePanelControls(panelState);
  saveState();
  return true;
}

function navigatePanelHistory(panelState, direction) {
  ensurePanelHistory(panelState);
  const nextIndex = panelState.historyIndex + direction;
  if (nextIndex < 0 || nextIndex >= panelState.history.length) return;
  panelState.historyIndex = nextIndex;
  goToPassage(panelState, panelState.history[nextIndex], { record: false });
}

// Re-rendering replaces the verse nodes while scrollTop stays put, so when
// row heights change (enabling another translation, switching layouts) the
// reader loses their place. Anchor on a visible selected verse when there is
// one, else the verse nearest the panel's vertical center, and restore its
// on-screen position after the swap.
function captureVerseAnchor(content, panelState) {
  const contentRect = content.getBoundingClientRect();
  if (!contentRect.height) return null;
  const selected = new Set(selectedVerseNumbers(panelState));
  const middle = contentRect.top + contentRect.height / 2;
  let anchor = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const group of content.querySelectorAll(".verse-group")) {
    const rect = group.getBoundingClientRect();
    if (rect.bottom <= contentRect.top || rect.top >= contentRect.bottom) continue;
    const verse = Number(group.dataset.verse);
    if (selected.has(verse)) {
      return { verse, offset: rect.top - contentRect.top };
    }
    const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      anchor = { verse, offset: rect.top - contentRect.top };
    }
  }
  return anchor;
}

function restoreVerseAnchor(content, anchor) {
  if (!anchor) return;
  const group = content.querySelector(`.verse-group[data-verse="${anchor.verse}"]`);
  if (!group) return;
  const drift = group.getBoundingClientRect().top - content.getBoundingClientRect().top - anchor.offset;
  if (Math.abs(drift) > 1) content.scrollTop += drift;
}

// Keeps a panel's original-language slot in sync with its current book: if
// the panel navigates from OT to NT (or back) while Hebrew/Greek is active,
// swap it for the other rather than leaving a mismatched language enabled.
function syncOriginalLanguageForTestament(panelState) {
  const active = activeOriginalLanguageId(panelState);
  if (!active) return;
  const desired = originalLanguageForTestament(testamentForBook(panelState.book));
  if (active === desired) return;
  const index = panelState.enabledTranslations.indexOf(active);
  panelState.enabledTranslations[index] = desired;
  panelState.highlightedTranslations = panelState.highlightedTranslations.map((id) => (id === active ? desired : id));
  panelState.dimmedTranslations = panelState.dimmedTranslations.map((id) => (id === active ? desired : id));
  panelElements.get(panelState.id)?.translationControl.render();
}

function renderPanelBody(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements || !panelState.data) return;
  syncOriginalLanguageForTestament(panelState);
  ensureInterlinearData(panelState);

  // Hebrew/Greek is a full peer of any other translation here: it takes
  // whatever slot it holds in enabledTranslations and follows the same
  // stacked/columns layout, just with a row of word blocks instead of text
  // -- UNLESS its chip has toggled the split view (see
  // toggleOriginalLanguageSplit), in which case it's pulled out of the
  // normal per-translation loop entirely and rendered on its own in a
  // second pane per verse, left completely untouched otherwise.
  const enabled = enabledTranslationIds(panelState);
  const columnLayout = effectiveVerseLayout(panelState) === "columns";
  const activeOriginalId = activeOriginalLanguageId(panelState);
  const splitActive = activeOriginalId != null && isOriginalLanguageSplitActive(panelState, activeOriginalId);
  const leftEnabled = splitActive ? enabled.filter((id) => id !== activeOriginalId) : enabled;
  elements.panel.classList.toggle("single-translation", leftEnabled.length <= 1);
  elements.panel.classList.toggle("panel-original-split", splitActive);
  const fragment = document.createDocumentFragment();

  if (columnLayout && leftEnabled.length) {
    const columnHeader = document.createElement("div");
    columnHeader.className = "column-translation-header";
    columnHeader.style.setProperty("--translation-count", String(leftEnabled.length));
    for (const translation of leftEnabled) {
      const heading = document.createElement("span");
      heading.className = "column-translation-heading";
      heading.lang = translationLanguage(translation);
      heading.textContent = translationMeta(translation).label;
      heading.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
      columnHeader.append(heading);
    }
    if (splitActive) {
      // The sticky bar still needs to bleed edge-to-edge for its own
      // background/shadow, but the labels themselves must only occupy the
      // left pane's width -- a second heading mirrors .verse-split-right
      // (same flex-basis, same gap) so the two line up exactly, and names
      // the original-language column the same way the left side is named.
      const headerWrap = document.createElement("div");
      headerWrap.className = "column-translation-header-wrap";
      const spacer = document.createElement("div");
      spacer.className = "column-translation-header-spacer";
      const originalHeading = document.createElement("span");
      originalHeading.className = "column-translation-heading";
      originalHeading.lang = translationLanguage(activeOriginalId);
      originalHeading.textContent = translationMeta(activeOriginalId).label;
      originalHeading.style.setProperty("--translation-color", TRANSLATION_COLORS[activeOriginalId]);
      spacer.append(originalHeading);
      headerWrap.append(columnHeader, spacer);
      fragment.append(headerWrap);
    } else {
      fragment.append(columnHeader);
    }
  }

  for (const [verseNumber, texts] of panelState.data.v) {
    const group = document.createElement("section");
    group.className = "verse-group";
    group.dataset.verse = String(verseNumber);
    group.addEventListener("click", () => selectVerse(panelState, verseNumber));
    const number = document.createElement("span");
    number.className = "verse-number";
    number.textContent = String(verseNumber);
    group.append(number);
    group.style.setProperty("--translation-count", String(Math.max(leftEnabled.length, 1)));

    let leftPane = group;
    let rightPane = null;
    if (splitActive) {
      leftPane = document.createElement("div");
      leftPane.className = "verse-split-left";
      rightPane = document.createElement("div");
      rightPane.className = "verse-split-right";
      group.append(leftPane, rightPane);
    }

    let rendered = 0;
    leftEnabled.forEach((translation, index) => {
      const isOriginalLanguage = ORIGINAL_LANGUAGE_IDS.includes(translation);
      const tokens = isOriginalLanguage ? interlinearTokensForVerse(panelState, verseNumber) : null;
      const translationText = isOriginalLanguage ? null : texts[translation];
      const hasContent = isOriginalLanguage ? Boolean(tokens?.length) : Boolean(translationText);
      if (!hasContent && !columnLayout) return;
      if (hasContent) rendered += 1;
      const line = document.createElement("div");
      line.className = "translation-line";
      line.classList.toggle("translation-line--highlight", panelState.highlightedTranslations.includes(translation));
      line.classList.toggle("translation-line--dim", panelState.dimmedTranslations.includes(translation));
      line.lang = translationLanguage(translation);
      line.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
      if (columnLayout) line.style.gridColumn = String(index + 1);
      const label = document.createElement("span");
      label.className = "translation-label";
      label.textContent = translationMeta(translation).label;
      line.append(label);
      if (isOriginalLanguage) {
        if (tokens?.length) {
          line.append(buildInterlinearWordRow(tokens, translationLanguage(translation), (wordEl, word) =>
            selectInterlinearWord(panelState, verseNumber, wordEl, word)));
        }
      } else {
        const text = document.createElement("p");
        text.className = "translation-text";
        text.textContent = translationText || "";
        line.append(text);
      }
      leftPane.append(line);
    });

    if (!rendered) {
      const empty = document.createElement("p");
      empty.className = "empty-translation";
      empty.textContent = "Select at least one translation.";
      leftPane.append(empty);
    }

    if (splitActive) {
      const rightTokens = interlinearTokensForVerse(panelState, verseNumber);
      if (rightTokens?.length) {
        const rightLine = document.createElement("div");
        rightLine.className = "translation-line translation-line--no-label";
        rightLine.classList.toggle("translation-line--highlight", panelState.highlightedTranslations.includes(activeOriginalId));
        rightLine.classList.toggle("translation-line--dim", panelState.dimmedTranslations.includes(activeOriginalId));
        rightLine.lang = translationLanguage(activeOriginalId);
        rightLine.style.setProperty("--translation-color", TRANSLATION_COLORS[activeOriginalId]);
        rightLine.append(buildInterlinearWordRow(rightTokens, translationLanguage(activeOriginalId), (wordEl, word) =>
          selectInterlinearWord(panelState, verseNumber, wordEl, word)));
        rightPane.append(rightLine);
      }
    }
    fragment.append(group);
  }

  // A navigation to a specific verse can still have its Hebrew/Greek
  // interlinear data loading, which re-renders again once it arrives (see
  // ensureInterlinearData above). That second render must keep scrolling to
  // the same target verse rather than anchor-preserving -- otherwise the
  // interlinear row's height change (e.g. verse 1 growing once its Hebrew/
  // Greek tokens arrive) shifts whichever verse the anchor logic picked,
  // occasionally leaving some other verse at the top instead of verse 1.
  const pendingScrollVerse = panelState.scrollTargetVerse ?? null;
  const interlinearLoadPending = Boolean(panelState.interlinearVerses?.loading);
  const anchor = pendingScrollVerse == null ? captureVerseAnchor(elements.content, panelState) : null;
  elements.content.replaceChildren(fragment);
  if (pendingScrollVerse != null) {
    scrollVerseToTop(panelState, pendingScrollVerse);
    if (!interlinearLoadPending) panelState.scrollTargetVerse = null;
  } else {
    restoreVerseAnchor(elements.content, anchor);
  }
  updatePanelSelection(panelState);
  updatePanelControls(panelState);
}

function refreshPanelBodies() {
  for (const panel of state.panels) renderPanelBody(panel);
}

function updatePanelControls(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  elements.bookCombo.setValue(panelState.book);
  elements.chapterCombo.setItems(chapterItems(panelState.book));
  elements.chapterCombo.setValue(panelState.chapter);
  const verses = verseItems(panelState);
  const maxVerse = verses.at(-1)?.value ?? 1;
  panelState.verse = Math.max(1, Math.min(Number(panelState.verse) || 1, maxVerse));
  elements.verseCombo.setItems(verses);
  elements.verseCombo.setValue(panelState.verse);
  ensurePanelHistory(panelState);
  elements.historyBack.disabled = panelState.historyIndex <= 0;
  elements.historyForward.disabled = panelState.historyIndex >= panelState.history.length - 1;
  elements.previous.disabled = panelState.book === 0 && panelState.chapter === 1;
  const finalBook = manifest.books.length - 1;
  elements.next.disabled =
    panelState.book === finalBook && panelState.chapter === manifest.books[finalBook].chapters;
}

function navigateChapter(panelState, direction) {
  let { book, chapter } = panelState;
  chapter += direction;
  if (chapter < 1 && book > 0) {
    book -= 1;
    chapter = manifest.books[book].chapters;
  } else if (chapter > manifest.books[book].chapters && book < manifest.books.length - 1) {
    book += 1;
    chapter = 1;
  }
  if (book === panelState.book && chapter === panelState.chapter) return;
  goToPassage(panelState, { book, chapter, verse: 1 }, { record: true });
}

// state.fontSize is the actual CSS pixel size (unchanged, so the rendered
// text stays exactly as tuned); the number shown next to the +/- buttons
// is offset down by this much so the same default reads as 11 instead of 14.
const FONT_SIZE_DISPLAY_OFFSET = 3;

function applyFontSize() {
  document.documentElement.style.setProperty("--verse-font-size", `${state.fontSize}px`);
  const displayValue = String(state.fontSize - FONT_SIZE_DISPLAY_OFFSET);
  fontSizeValue.value = displayValue;
  fontSizeValue.textContent = displayValue;
  fontSizeDownButton.disabled = state.fontSize <= 10;
  fontSizeUpButton.disabled = state.fontSize >= 22;
}

function changeFontSize(delta) {
  state.fontSize = Math.max(10, Math.min(state.fontSize + delta, 22));
  applyFontSize();
  saveState();
}

function formatVerseReference(chapter, verses) {
  if (!verses.length) return `${chapter}:`;
  const parts = [];
  for (let index = 0; index < verses.length; index += 1) {
    const start = verses[index];
    let end = start;
    while (index + 1 < verses.length && verses[index + 1] === end + 1) {
      index += 1;
      end = verses[index];
    }
    parts.push(start === end ? String(start) : `${start}-${end}`);
  }
  return `${chapter}:${parts.join(", ")}`;
}

function openCopyDialog(panelState) {
  const selectedVerses = selectedVerseNumbers(panelState);
  if (!selectedVerses.length || !panelState.data) return;
  copyPanelState = panelState;
  copyStatus.textContent = "";
  const book = manifest.books[panelState.book];
  const reference = formatVerseReference(panelState.chapter, selectedVerses);
  copyReference.textContent = `${book.en} ${book.ko} ${reference}`;
  // Offer only the translations currently shown in this panel, in their reading
  // order. Hebrew/Greek have no exported text yet, so they are never copyable.
  copyTranslationOrder = enabledTranslationIds(panelState).filter((id) => !ORIGINAL_LANGUAGE_IDS.includes(id));
  copyTranslationControl?.render();
  copyDialog.showModal();
}

function closeCopyDialog() {
  copyTranslationControl?.close();
  copyDialog.close();
  copyPanelState = null;
}

// Opens the "which panel?" picker for a result-list navigate icon (TSK,
// word search, Englishman's concordance) instead of jumping straight to
// the active panel -- closeSource is whichever of those three dialogs
// should close once a target is actually picked (not before, so
// cancelling via the X returns them to the list undisturbed).
function openMoveDialog(bookId, chapter, verse, closeSource) {
  pendingMoveReference = { bookId, chapter, verse, closeSource };
  const book = manifest.books[bookId];
  moveReference.textContent = `${book.en} ${book.ko} ${chapter}:${verse}`;
  updateMoveDialogState();
  moveDialog.showModal();
}

function closeMoveDialog() {
  moveDialog.close();
  pendingMoveReference = null;
}

function updateMoveDialogState() {
  const index = state.panels.findIndex((panel) => panel.id === activePanelId);
  moveTargetLeftButton.disabled = index <= 0;
  moveTargetRightButton.disabled = index < 0 || index === state.panels.length - 1;
}

// Each option acts the instant it's clicked -- there's no separate confirm
// step, so this both picks the target and performs the move.
function moveToTarget(target) {
  if (!pendingMoveReference) return;
  const { bookId, chapter, verse, closeSource } = pendingMoveReference;
  const index = state.panels.findIndex((panel) => panel.id === activePanelId);
  let targetPanelState;
  if (target === "left") {
    targetPanelState = state.panels[index - 1];
  } else if (target === "right") {
    targetPanelState = state.panels[index + 1];
  } else if (target === "new") {
    targetPanelState = addPanel();
  } else {
    targetPanelState = state.panels[index] ?? state.panels[0];
  }
  if (!targetPanelState) return;
  closeMoveDialog();
  closeSource?.();
  setActivePanel(targetPanelState.id);
  const elements = panelElements.get(targetPanelState.id);
  elements?.panel.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  goToPassage(targetPanelState, { book: bookId, chapter, verse }, { record: true });
}

function buildCopyText(panelState, translations, order) {
  const selectedVerses = selectedVerseNumbers(panelState);
  const selected = new Set(selectedVerses);
  const book = manifest.books[panelState.book];
  const verses = panelState.data.v.filter(([verse]) => selected.has(verse));
  const lines = [];
  const bookNameFor = (translation) =>
    translationLanguage(translation) === "en" ? book.en : book.ko;
  const range = formatVerseReference(panelState.chapter, selectedVerses);

  if (order === "translation") {
    for (const translation of translations) {
      lines.push(`${bookNameFor(translation)} ${range}, ${translationMeta(translation).label}`);
      for (const [verse, texts] of verses) {
        if (texts[translation]) lines.push(`${verse} ${texts[translation]}`);
      }
      lines.push("");
    }
  } else {
    const bookName = bookNameFor(translations[0]);
    const translationNames = translations.map((translation) => translationMeta(translation).label).join("-");
    lines.push(`${bookName} ${range}, ${translationNames}`);
    for (const [verse, texts] of verses) {
      for (const translation of translations) {
        if (texts[translation]) lines.push(`${verse} ${texts[translation]}`);
      }
      // With only one version there's nothing to visually separate within
      // a verse's own block, so skip the blank line and keep verses back
      // to back; multi-version blocks still get one to set them apart.
      if (translations.length > 1) lines.push("");
    }
  }
  return lines.join("\n").trim();
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
}

async function copySelectedVerses() {
  if (!copyPanelState) return;
  const translations = [...copyTranslationOrder];
  if (!translations.length) {
    copyStatus.textContent = "Select a version.";
    return;
  }
  const order = copyDialog.querySelector('input[name="copy-order"]:checked').value;
  const text = buildCopyText(copyPanelState, translations, order);
  try {
    await writeClipboard(text);
    copyStatus.textContent = "Copied";
    const copiedPanelState = copyPanelState;
    if (copiedPanelState) clearPanelSelection(copiedPanelState);
    window.setTimeout(closeCopyDialog, 450);
  } catch (error) {
    copyStatus.textContent = error.message;
  }
}

function appendLookupField(container, label, value, { lang } = {}) {
  if (!value) return;
  const block = document.createElement("div");
  block.className = "lookup-entry";
  const labelEl = document.createElement("div");
  labelEl.className = "lookup-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("p");
  valueEl.className = "lookup-value";
  if (lang) valueEl.lang = lang;
  valueEl.textContent = value;
  block.append(labelEl, valueEl);
  container.append(block);
}

// Matches Strong's codes as they appear in derivation text (e.g. "G1615",
// "H08012" -- Hebrew codes here are sometimes padded to 5 digits, unlike
// this app's own 4-digit-padded data keys, hence the normalize step below).
const STRONGS_CODE_RE = /([GH])(\d{1,6})/g;

function normalizeStrongsCode(letter, digits) {
  return `${letter}${String(Number(digits)).padStart(4, "0")}`;
}

// Word Origin text often references other Strong's codes ("from G1537 and
// G5055"); wrap each as a button that reopens this same dialog for that
// code, so following a derivation chain doesn't require a fresh word click.
function appendDerivationField(container, label, value, lang) {
  if (!value) return;
  const block = document.createElement("div");
  block.className = "lookup-entry";
  const labelEl = document.createElement("div");
  labelEl.className = "lookup-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("p");
  valueEl.className = "lookup-value";
  if (lang) valueEl.lang = lang;
  STRONGS_CODE_RE.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = STRONGS_CODE_RE.exec(value))) {
    if (match.index > lastIndex) valueEl.append(document.createTextNode(value.slice(lastIndex, match.index)));
    const code = normalizeStrongsCode(match[1], match[2]);
    const link = document.createElement("button");
    link.type = "button";
    link.className = "lookup-strongs-link";
    link.textContent = match[0];
    link.addEventListener("click", () => openStrongsDialogForCode(code));
    valueEl.append(link);
    lastIndex = match.index + match[0].length;
  }
  valueEl.append(document.createTextNode(value.slice(lastIndex)));
  block.append(labelEl, valueEl);
  container.append(block);
}

function showLookupEmpty(container, message) {
  container.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "lookup-empty";
  empty.textContent = message;
  container.append(empty);
}

// Keeps the TSK/search/word-dictionary dialogs the same height as the
// reading panel behind them. Re-run on window resize while one is open,
// since the panel's own height is viewport-dependent. Skipped on mobile/
// touch layouts, where these dialogs go edge-to-edge full screen instead
// (see the mobile @media rules) -- matching panel height there would leave
// a gap rather than true full screen.
function syncDialogHeightToPanel(dialogEl) {
  if (mobileLayout.matches) {
    dialogEl.style.removeProperty("height");
    dialogEl.style.removeProperty("max-height");
    const shell = dialogEl.querySelector(".lookup-shell, .search-shell");
    shell?.style.removeProperty("height");
    shell?.style.removeProperty("max-height");
    return;
  }
  const panel = panelElements.get(activePanelId)?.panel ?? document.querySelector(".bible-panel");
  const height = panel?.getBoundingClientRect().height;
  if (!height) return;
  dialogEl.style.height = `${height}px`;
  dialogEl.style.maxHeight = `${height}px`;
  const shell = dialogEl.querySelector(".lookup-shell, .search-shell");
  if (shell) {
    shell.style.height = `${height}px`;
    shell.style.maxHeight = `${height}px`;
  }
}

window.addEventListener("resize", () => {
  if (searchDialog.open) syncDialogHeightToPanel(searchDialog);
  if (tskDialog.open) syncDialogHeightToPanel(tskDialog);
  if (strongsDialog.open) syncDialogHeightToPanel(strongsDialog);
});

// Shared by the two ways this dialog gets its content: clicking an
// interlinear word (word has book/chapter context via panelState, plus its
// own verse, for the Morphology toggle's default) and clicking a Strong's-code
// link inside a Word Origin field (just the code -- there's no clicked
// instance, so the Morphology toggle has nothing to default to and stays
// disabled).
// e.g. "H0430" -> https://biblehub.com/hebrew/430.htm -- Bible Hub keys its
// per-number pages by the plain number, no letter prefix or zero-padding.
function biblehubUrl(code) {
  const language = code[0] === "H" ? "hebrew" : "greek";
  return `https://biblehub.com/${language}/${Number(code.slice(1))}.htm`;
}

function strongsCodeFromParts(lang, number) {
  return `${lang}${String(number).padStart(4, "0")}`;
}

function strongsRangeLabel(lang) {
  return lang === "H" ? `Hebrew 1 - ${STRONGS_MAX_NUMBER.H}` : `Greek 1 - ${STRONGS_MAX_NUMBER.G}`;
}

// Keeps the prev/next arrows, language select, and number field in sync with
// whichever word is currently loaded, so paging always continues from where
// the dialog actually is rather than whatever was last typed.
function updateStrongsNav(word) {
  const lang = word.strongs ? word.strongs[0] : (word.lang === "he" ? "H" : "G");
  const number = word.strongs ? Number(word.strongs.slice(1)) : null;
  strongsNavLang.value = lang;
  strongsNavNumber.value = number ?? "";
  strongsNavRange.textContent = strongsRangeLabel(lang);
  strongsNavPrev.disabled = !number || number <= 1;
  strongsNavNext.disabled = !number || number >= STRONGS_MAX_NUMBER[lang];
}

// Both arrows and the search button read the language/number fields live
// (rather than the word that was last rendered), so switching the language
// select or editing the number always wins over whatever was loaded before.
function goToStrongsNavNumber(number) {
  const lang = strongsNavLang.value;
  const clamped = Math.min(Math.max(1, number), STRONGS_MAX_NUMBER[lang]);
  openStrongsDialogForCode(strongsCodeFromParts(lang, clamped));
}

strongsNavLang.addEventListener("change", () => {
  strongsNavRange.textContent = strongsRangeLabel(strongsNavLang.value);
});
strongsNavNumber.addEventListener("focus", () => {
  strongsNavRange.hidden = false;
});
strongsNavNumber.addEventListener("blur", () => {
  strongsNavRange.hidden = true;
});
strongsNavNumber.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  strongsNavSearch.click();
});
strongsNavPrev.addEventListener("click", () => {
  const current = Number(strongsNavNumber.value);
  if (!current) return;
  goToStrongsNavNumber(current - 1);
});
strongsNavNext.addEventListener("click", () => {
  const current = Number(strongsNavNumber.value);
  if (!current) return;
  goToStrongsNavNumber(current + 1);
});
strongsNavSearch.addEventListener("click", () => {
  const number = Number(strongsNavNumber.value);
  if (!number) return;
  goToStrongsNavNumber(number);
});

async function renderStrongsDialog(word, panelState) {
  strongsDialogTitle.textContent = "Strong's Concordance";
  strongsBiblehubLink.hidden = !word.strongs;
  if (word.strongs) strongsBiblehubLink.href = biblehubUrl(word.strongs);
  updateStrongsNav(word);
  if (!word.strongs) {
    showLookupEmpty(strongsDialogBody, "No Strong's number for this word.");
    return;
  }
  showLookupEmpty(strongsDialogBody, "Loading…");
  const [entries, concordance] = await Promise.all([getStrongsData(), getEnglishmansEntry(word.strongs)]);
  if (!strongsDialog.open) return;
  const entry = entries[word.strongs];
  // A dedicated wrapper (rather than appending fields straight into
  // strongsDialogBody) keeps it down to exactly two children -- fields,
  // then the concordance section -- so #strongs-dialog-body can use the
  // same auto/1fr grid split as .lookup-shell to let the concordance
  // section grow to fill the rest of the dialog's height.
  const fields = document.createElement("div");
  fields.className = "word-dictionary-fields";
  if (entry) {
    appendLookupField(fields, "Original Word", entry.lemma, { lang: word.lang });
    appendLookupField(fields, "Transliteration", entry.translit);
    appendLookupField(fields, "KJV", entry.kjv);
    appendDerivationField(fields, "Word Origin", entry.derivation, word.lang);
    appendLookupField(fields, "Definition", entry.def);
  } else {
    const empty = document.createElement("p");
    empty.className = "lookup-empty";
    empty.textContent = "No dictionary entry found.";
    fields.append(empty);
  }
  strongsDialogBody.replaceChildren(fields);
  strongsDialogBody.scrollTop = 0;
  await renderConcordanceSection(panelState, word, concordance);
}

// The merged dictionary popup: Strong's lexicon fields first, then the
// Englishman's concordance occurrences for the same Strong's code below.
async function openStrongsDialog(panelState) {
  const word = panelState.selectedWord;
  if (!word) return;
  strongsDialog.showModal();
  syncDialogHeightToPanel(strongsDialog);
  await renderStrongsDialog(word, panelState);
}

// A Strong's code linked from inside a Word Origin field -- the dialog is
// already open, so this just swaps its content in place.
async function openStrongsDialogForCode(code) {
  const panelState = state.panels.find((panel) => panel.id === activePanelId) ?? state.panels[0];
  await renderStrongsDialog({ strongs: code, original: code, lang: code.startsWith("H") ? "he" : "grc" }, panelState);
}

function closeStrongsDialog() {
  strongsDialog.close();
}

// Drives a dialog's "collapse/expand all" control: up to two buttons (a
// desktop placement and a fixed mobile one) share this one controller so a
// click on either toggles every .search-result currently inside `container`
// and keeps both icons in sync. `slot` lets a repeatedly-rebuilt placement
// (TSK's mobile button, recreated on every chapter/verse render) swap its
// old button out instead of accumulating stale, detached ones.
function createResultsToggleAllController(container) {
  let collapsed = false;
  let buttons = [];
  const sync = () => {
    for (const button of buttons) {
      button.classList.toggle("results-toggle-all--collapsed", collapsed);
      button.setAttribute("aria-label", collapsed ? "Expand all results" : "Collapse all results");
    }
  };
  const toggle = () => {
    collapsed = !collapsed;
    container.querySelectorAll(".search-result").forEach((row) => {
      row.classList.toggle("search-result--collapsed", collapsed);
    });
    sync();
  };
  const buildButton = (slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "results-toggle-all";
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"></path></svg>`;
    button.addEventListener("click", toggle);
    if (slot) {
      buttons = buttons.filter((existing) => existing.dataset.slot !== slot);
      button.dataset.slot = slot;
    }
    buttons.push(button);
    sync();
    return button;
  };
  const reset = () => {
    collapsed = false;
    sync();
  };
  return { buildButton, reset };
}

// Builds the Englishman's Concordance section header (a title, a Morphology
// toggle, and the collapse/expand-all control) and the results under it. The
// Morphology toggle, when on, filters occurrences down to just the
// grammatical form of the word that was actually clicked (its own occurrence
// entry, if this dataset happens to tag one for it) -- when there is no
// morphology entry for the current word (common for untagged Hebrew forms),
// the toggle is disabled since there is nothing to narrow down to.
async function renderConcordanceSection(panelState, word, concordance) {
  const section = document.createElement("div");
  section.className = "word-concordance";
  strongsDialogBody.append(section);

  if (!concordance || !concordance.occ.length) {
    showLookupEmpty(section, "No concordance entries found.");
    return;
  }

  const currentOccurrence = concordance.occ.find(
    ([bookId, chapter, verse]) => bookId === panelState.book && chapter === panelState.chapter && verse === word.verse,
  );
  const referenceMorphology = currentOccurrence?.[4] || null;

  let mode = "lemma";
  const controls = document.createElement("div");
  controls.className = "concordance-mode-control";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Concordance grouping");

  const title = document.createElement("span");
  title.className = "concordance-mode-title";
  title.textContent = "Englishman's Concordance";

  const morphButton = document.createElement("button");
  morphButton.type = "button";
  morphButton.className = "concordance-morphology-toggle";
  morphButton.setAttribute("aria-label", "Morphology");
  morphButton.setAttribute("aria-pressed", "false");
  morphButton.title = "Morphology";
  morphButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2.5 12.5V2.5h10l8.09 8.09a2 2 0 0 1 0 2.82Z"></path>
      <circle cx="7" cy="7" r="1.5"></circle>
    </svg>
  `;
  morphButton.disabled = !referenceMorphology;
  controls.append(title, morphButton);

  const resultsContainer = document.createElement("div");
  resultsContainer.className = "concordance-results-slot";

  const resultsToggle = createResultsToggleAllController(resultsContainer);
  controls.append(resultsToggle.buildButton());
  section.append(resultsContainer);

  const renderResults = async () => {
    const occurrences = mode === "morphology"
      ? concordance.occ.filter(([, , , , morphology]) => morphology === referenceMorphology)
      : concordance.occ;
    await renderConcordanceResults(resultsContainer, occurrences, controls);
    resultsToggle.reset();
  };

  morphButton.addEventListener("click", () => {
    if (morphButton.disabled) return;
    mode = mode === "morphology" ? "lemma" : "morphology";
    morphButton.classList.toggle("selected", mode === "morphology");
    morphButton.setAttribute("aria-pressed", String(mode === "morphology"));
    renderResults();
  });

  await renderResults();
}

// Word-search-style master/detail, grouped by book instead of by anchor
// word: a left nav of "Book (count)" buttons, and a right column of
// search-result-style rows with the occurrence's own phrase highlighted in
// the KJV verse text.
async function renderConcordanceResults(container, occurrences, controls) {
  if (!strongsDialog.open) return;
  if (!occurrences.length) {
    showLookupEmpty(container, "No occurrences for this form.");
    container.prepend(controls);
    return;
  }
  showLookupEmpty(container, "Loading…");
  container.prepend(controls);

  const chapterKeys = new Set();
  for (const [bookId, chapter] of occurrences) chapterKeys.add(`${bookId}:${chapter}`);
  const chapterEntries = await Promise.all(
    [...chapterKeys].map(async (key) => {
      const [bookId, chapter] = key.split(":").map(Number);
      return [key, await getChapter(bookId, chapter)];
    }),
  );
  if (!strongsDialog.open) return;
  const chaptersByKey = new Map(chapterEntries);

  // The source dataset's occurrence order isn't chapter/verse order within a
  // book (it's some cross-book concordance ordinal), so sort each group.
  const byBook = new Map();
  for (const occurrence of occurrences) {
    const bookId = occurrence[0];
    if (!byBook.has(bookId)) byBook.set(bookId, []);
    byBook.get(bookId).push(occurrence);
  }
  const bookIds = [...byBook.keys()].sort((a, b) => a - b);
  for (const bookOccurrences of byBook.values()) {
    bookOccurrences.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  }

  const results = document.createElement("div");
  results.className = "concordance-results";
  const nav = document.createElement("div");
  nav.className = "concordance-nav";
  const list = document.createElement("div");
  list.className = "concordance-list";

  const total = document.createElement("div");
  total.className = "concordance-nav-total";
  const totalName = document.createElement("span");
  totalName.className = "concordance-nav-name";
  totalName.textContent = "Total";
  const totalCount = document.createElement("span");
  totalCount.className = "concordance-nav-count";
  totalCount.textContent = ` (${occurrences.length})`;
  total.append(totalName, totalCount);
  nav.append(total);

  for (const bookId of bookIds) {
    const bookOccurrences = byBook.get(bookId);
    const groupId = `concordance-book-${bookId}`;

    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "concordance-nav-item";
    const name = document.createElement("span");
    name.className = "concordance-nav-name";
    name.textContent = manifest.books[bookId].en;
    const count = document.createElement("span");
    count.className = "concordance-nav-count";
    count.textContent = ` (${bookOccurrences.length})`;
    navButton.append(name, count);
    navButton.addEventListener("click", () => {
      list.querySelector(`[data-group-id="${groupId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(navButton);

    const group = document.createElement("section");
    group.className = "concordance-group";
    group.dataset.groupId = groupId;
    for (const [bkId, chapter, verse, english, morphology] of bookOccurrences) {
      group.append(buildConcordanceResultRow(bkId, chapter, verse, english, morphology, chaptersByKey));
    }
    list.append(group);
  }

  results.append(controls, nav, list);
  container.replaceChildren(results);
}

// Highlights the occurrence's own rendered phrase (which may be more than
// one word, e.g. "of Paul") within the fetched KJV verse text.
function appendWithHighlight(element, text, phrase) {
  const index = phrase ? text.toLowerCase().indexOf(phrase.toLowerCase()) : -1;
  if (index === -1) {
    element.textContent = text;
    return;
  }
  element.append(document.createTextNode(text.slice(0, index)));
  const span = document.createElement("span");
  span.className = "concordance-highlight";
  span.textContent = text.slice(index, index + phrase.length);
  element.append(span);
  element.append(document.createTextNode(text.slice(index + phrase.length)));
}

function buildConcordanceResultRow(bookId, chapter, verse, english, morphology, chaptersByKey) {
  const book = manifest.books[bookId];
  const item = document.createElement("article");
  item.className = "search-result";
  const content = document.createElement("div");
  content.className = "search-result-content";
  const reference = document.createElement("div");
  reference.className = "search-reference";
  const referenceTitle = document.createElement("div");
  referenceTitle.className = "search-reference-title";
  const referenceText = document.createElement("span");
  referenceText.textContent = `${book.en} ${chapter}:${verse}`;
  referenceTitle.append(referenceText);
  const code = morphology ? morphology.slice(morphology.indexOf(":") + 1) : "";
  if (code) {
    const codeText = document.createElement("span");
    codeText.className = "search-reference-morphology";
    codeText.textContent = code;
    referenceTitle.append(codeText);
  }
  reference.append(referenceTitle);
  content.append(reference);

  const body = document.createElement("div");
  body.className = "search-result-body";
  content.append(body);

  const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
  const verseEntry = chapterData?.v.find(([v]) => v === verse);
  const kjvText = verseEntry ? verseEntry[1].KJV : null;
  if (kjvText) {
    const row = document.createElement("div");
    row.className = "search-match-line";
    row.style.setProperty("--translation-color", TRANSLATION_COLORS.KJV);
    const label = document.createElement("span");
    label.className = "search-match-label";
    label.textContent = translationMeta("KJV").label;
    const textEl = document.createElement("span");
    textEl.lang = "en";
    appendWithHighlight(textEl, kjvText, english);
    row.append(label, textEl);
    body.append(row);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-translation";
    empty.textContent = "Verse text unavailable.";
    body.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "search-result-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button button-primary icon-only-button search-result-action";
  viewButton.setAttribute("aria-label", `View ${book.en} ${chapter}:${verse}`);
  viewButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14"></path>
      <path d="m13 6 6 6-6 6"></path>
    </svg>
  `;
  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openConcordanceResult(bookId, chapter, verse);
  });
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary icon-only-button search-result-action";
  copyButton.setAttribute("aria-label", `Copy ${book.en} ${chapter}:${verse}`);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"></rect>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    </svg>
  `;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    copyConcordanceResult(bookId, chapter, verse);
  });
  actions.append(viewButton, copyButton, buildTskLinkButton(bookId, chapter, verse));
  reference.append(actions);

  item.append(content);
  item.addEventListener("click", () => item.classList.toggle("search-result--collapsed"));
  return item;
}

// Matches openSearchResult exactly: jump to the reference in the active
// panel and close this dialog.
function openConcordanceResult(bookId, chapter, verse) {
  openMoveDialog(bookId, chapter, verse, closeStrongsDialog);
}

// Matches copySearchResult exactly: select the verse in the active panel and
// open the copy dialog, without closing this one.
async function copyConcordanceResult(bookId, chapter, verse) {
  const panelState = state.panels.find((panel) => panel.id === activePanelId) ?? state.panels[0];
  const elements = panelElements.get(panelState.id);
  elements.panel.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  const loaded = await goToPassage(panelState, { book: bookId, chapter, verse }, { record: true });
  if (!loaded) return;
  panelState.selectionMode = state.copySelectionMode;
  panelState.selectionAnchor = verse;
  panelState.selectionEnd = verse;
  panelState.selectedVerses = new Set([verse]);
  updatePanelSelection(panelState);
  openCopyDialog(panelState);
  // The concordance is itself KJV-based, so default the copy dialog to
  // just KJV rather than whatever versions the active panel happens to
  // have enabled.
  copyTranslationOrder = ["KJV"];
  copyTranslationControl?.render();
}

async function copySelectedWord(panelState) {
  const word = panelState.selectedWord;
  if (!word) return;
  try {
    await writeClipboard(`${word.original} (${word.transliteration})`);
    clearWordLookup(panelState);
  } catch {
    // No status area in this compact toolbar to report a clipboard failure.
  }
}

// Picking a book or chapter only updates the selectors themselves (and the
// verse combo's available options) -- it does not navigate. The dialog only
// jumps to a new passage once a verse is actually chosen from the verse
// combo, via goToTskPassage.
async function updateTskBookOrChapter(book, chapter) {
  const normalizedBook = Math.max(0, Math.min(Number(book) || 0, manifest.books.length - 1));
  const normalizedChapter = Math.max(1, Math.min(Number(chapter) || 1, manifest.books[normalizedBook].chapters));
  tskViewState.book = normalizedBook;
  tskViewState.chapter = normalizedChapter;
  tskBookCombo.setValue(normalizedBook);
  tskChapterCombo.setItems(chapterItems(normalizedBook));
  tskChapterCombo.setValue(normalizedChapter);
  const data = await getChapter(normalizedBook, normalizedChapter);
  if (tskViewState.book !== normalizedBook || tskViewState.chapter !== normalizedChapter) return;
  const verses = data.v.map(([verse]) => ({ value: Number(verse), label: String(verse) }));
  tskVerseCombo.setItems(verses);
  tskVerseCombo.setValue(verses[0]?.value ?? 1);
}

function setupTskControls() {
  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  tskBookCombo = setupCombobox({
    input: tskBookInput,
    menu: tskBookInput.closest(".book-combo").querySelector(".combo-menu"),
    items: bookItems,
    selectedValue: tskViewState.book,
    matches: matchesBook,
    onSelect: (book) => updateTskBookOrChapter(book, 1),
  });
  tskChapterCombo = setupCombobox({
    input: tskChapterInput,
    menu: tskChapterInput.closest(".chapter-combo").querySelector(".combo-menu"),
    items: chapterItems(tskViewState.book),
    selectedValue: tskViewState.chapter,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (chapter) => updateTskBookOrChapter(tskViewState.book, chapter),
  });
  tskVerseCombo = setupCombobox({
    input: tskVerseInput,
    menu: tskVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: tskViewState.verse,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => goToTskPassage({ book: tskViewState.book, chapter: tskViewState.chapter, verse }),
  });
  tskTranslationControl = setupDialogTranslationControl({
    picker: tskTranslationPicker,
    toggle: tskTranslationPickerToggle,
    menu: tskTranslationPickerMenu,
    list: tskTranslationList,
    getOrder: () => tskTranslationOrder,
    setOrder: (order) => {
      tskTranslationOrder = order;
    },
    onChange: () => {
      renderTskReferenceList();
    },
  });
  tskTranslationControl.render();
}

function updateTskControls() {
  tskBookCombo.setValue(tskViewState.book);
  tskChapterCombo.setItems(chapterItems(tskViewState.book));
  tskChapterCombo.setValue(tskViewState.chapter);
  const verses = verseItems(tskViewState);
  tskVerseCombo.setItems(verses);
  tskVerseCombo.setValue(tskViewState.verse);
}

async function loadTskChapter() {
  tskViewState.data = await getChapter(tskViewState.book, tskViewState.chapter);
  const verses = verseItems(tskViewState);
  const maxVerse = verses.at(-1)?.value ?? 1;
  tskViewState.verse = Math.max(1, Math.min(tskViewState.verse, maxVerse));
  updateTskControls();
  const tskChapterData = await getTskChapter(tskViewState.book, tskViewState.chapter);
  const verseTsk = tskChapterData.v.find(([verse]) => verse === tskViewState.verse);
  tskViewState.anchors = verseTsk ? verseTsk[1] : [];
  renderTskVerseText();
  await renderTskReferenceList();
}

async function goToTskPassage(passage, { record = true } = {}) {
  const normalized = normalizePassage(passage.book, passage.chapter, passage.verse);
  tskViewState.book = normalized.book;
  tskViewState.chapter = normalized.chapter;
  tskViewState.verse = normalized.verse;
  if (record) recordTskHistory(normalized);
  await loadTskChapter();
}

// Mirrors the panel's own back/forward history (see recordPanelHistory/
// navigatePanelHistory) but for the single shared TSK dialog: one running
// list of every passage it's shown, independent of whichever panel or verse
// list opened it.
let tskHistory = [];
let tskHistoryIndex = -1;

function recordTskHistory(passage) {
  if (tskHistoryIndex >= 0 && samePassage(tskHistory[tskHistoryIndex], passage)) return;
  tskHistory = tskHistory.slice(0, tskHistoryIndex + 1);
  tskHistory.push(passage);
  if (tskHistory.length > 100) tskHistory.shift();
  tskHistoryIndex = tskHistory.length - 1;
  updateTskHistoryButtons();
}

function navigateTskHistory(direction) {
  const nextIndex = tskHistoryIndex + direction;
  if (nextIndex < 0 || nextIndex >= tskHistory.length) return;
  tskHistoryIndex = nextIndex;
  goToTskPassage(tskHistory[nextIndex], { record: false });
}

function updateTskHistoryButtons() {
  tskHistoryBackButton.disabled = tskHistoryIndex <= 0;
  tskHistoryForwardButton.disabled = tskHistoryIndex < 0 || tskHistoryIndex >= tskHistory.length - 1;
}

tskHistoryBackButton.addEventListener("click", () => navigateTskHistory(-1));
tskHistoryForwardButton.addEventListener("click", () => navigateTskHistory(1));
updateTskHistoryButtons();

// Shared by the link icon on every verse-list row (TSK, word search,
// Englishman's concordance): jumps the TSK dialog to that reference's own
// cross references, opening it first (matching openTskDialog's own setup)
// if it isn't already open.
async function openTskFromResult(bookId, chapter, verse) {
  if (!tskDialog.open) {
    const panelState = state.panels.find((panel) => panel.id === activePanelId) ?? state.panels[0];
    tskTranslationOrder = enabledTranslationIds(panelState).filter((id) => !ORIGINAL_LANGUAGE_IDS.includes(id));
    tskTranslationControl?.render();
    tskDialog.showModal();
    syncDialogHeightToPanel(tskDialog);
  }
  await goToTskPassage({ book: bookId, chapter, verse });
}

function buildTskLinkButton(bookId, chapter, verse) {
  const book = manifest.books[bookId];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary icon-only-button search-result-action";
  button.setAttribute("aria-label", `Cross references for ${book.en} ${chapter}:${verse}`);
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openTskFromResult(bookId, chapter, verse);
  });
  return button;
}

// Wraps each word matching a TSK anchor (case-insensitively, ignoring
// leading/trailing punctuation) in a highlight span; only meaningful for the
// KJV line, since TSK's anchors are themselves KJV words.
// TSK anchors are often whole phrases ("Let there", or even a full clause),
// not single words, so they're matched as substrings of the verse text
// rather than token-by-token. Overlapping/adjacent matches are merged into
// one highlighted run.
function findAnchorRanges(text, anchors) {
  const lowerText = text.toLowerCase();
  const ranges = [];
  for (const [anchor] of anchors) {
    const needle = anchor.trim().toLowerCase();
    if (!needle) continue;
    const index = lowerText.indexOf(needle);
    if (index !== -1) ranges.push([index, index + needle.length]);
  }
  if (!ranges.length) return ranges;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function appendWithAnchors(element, text, anchors) {
  const ranges = findAnchorRanges(text, anchors);
  if (!ranges.length) {
    element.textContent = text;
    return;
  }
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) element.append(document.createTextNode(text.slice(cursor, start)));
    const span = document.createElement("span");
    span.className = "tsk-anchor";
    span.textContent = text.slice(start, end);
    element.append(span);
    cursor = end;
  }
  if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
}

// The verse text is always plain KJV -- TSK's anchors are themselves KJV
// words, and this line is independent of the translation icons above, which
// only control the cross-reference results further down.
function renderTskVerseText() {
  tskVerseText.replaceChildren();
  const verseEntry = tskViewState.data?.v.find(([verse]) => verse === tskViewState.verse);
  const texts = verseEntry ? verseEntry[1] : {};
  const rawText = texts.KJV;
  const line = document.createElement("div");
  line.className = "translation-line tsk-verse-line";
  line.lang = translationLanguage("KJV");
  line.style.setProperty("--translation-color", TRANSLATION_COLORS.KJV);
  const label = document.createElement("span");
  label.className = "translation-label";
  label.textContent = translationMeta("KJV").label;
  const text = document.createElement("p");
  text.className = "translation-text";
  if (rawText && tskViewState.anchors.length) {
    appendWithAnchors(text, rawText, tskViewState.anchors);
  } else {
    text.textContent = rawText || "";
  }
  line.append(label, text);
  tskVerseText.append(line);
}

function buildTskResultRow(bookId, chapter, verse, chaptersByKey) {
  const book = manifest.books[bookId];
  const item = document.createElement("article");
  item.className = "search-result";
  const content = document.createElement("div");
  content.className = "search-result-content";
  const reference = document.createElement("div");
  reference.className = "search-reference";
  const referenceTitle = document.createElement("div");
  referenceTitle.className = "search-reference-title";
  const referenceText = document.createElement("span");
  referenceText.textContent = `${book.en} ${book.ko} ${chapter}:${verse}`;
  referenceTitle.append(referenceText);
  reference.append(referenceTitle);
  content.append(reference);

  const body = document.createElement("div");
  body.className = "search-result-body";
  content.append(body);

  const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
  const verseEntry = chapterData?.v.find(([v]) => v === verse);
  const texts = verseEntry ? verseEntry[1] : {};
  let anyText = false;
  for (const translation of tskTranslationOrder) {
    const text = texts[translation];
    if (!text) continue;
    anyText = true;
    const row = document.createElement("div");
    row.className = "search-match-line";
    row.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
    const label = document.createElement("span");
    label.className = "search-match-label";
    label.lang = translationLanguage(translation);
    label.textContent = translationMeta(translation).label;
    const textEl = document.createElement("span");
    textEl.lang = translationLanguage(translation);
    textEl.textContent = text;
    row.append(label, textEl);
    body.append(row);
  }
  if (!anyText) {
    const empty = document.createElement("p");
    empty.className = "empty-translation";
    empty.textContent = "Select at least one translation.";
    body.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "search-result-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button button-primary icon-only-button search-result-action";
  viewButton.setAttribute("aria-label", `View ${book.en} ${chapter}:${verse}`);
  viewButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14"></path>
      <path d="m13 6 6 6-6 6"></path>
    </svg>
  `;
  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openTskResult(bookId, chapter, verse);
  });
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary icon-only-button search-result-action";
  copyButton.setAttribute("aria-label", `Copy ${book.en} ${chapter}:${verse}`);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"></rect>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    </svg>
  `;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    copyTskResult(bookId, chapter, verse);
  });
  actions.append(viewButton, copyButton, buildTskLinkButton(bookId, chapter, verse));
  reference.append(actions);

  item.append(content);
  item.addEventListener("click", () => item.classList.toggle("search-result--collapsed"));
  return item;
}

async function renderTskReferenceList() {
  const anchors = tskViewState.anchors;
  if (!anchors.length) {
    showLookupEmpty(tskDialogBody, "No cross references found.");
    return;
  }
  showLookupEmpty(tskDialogBody, "Loading…");

  // Pre-fetch every distinct chapter these cross-references touch, in
  // parallel, into a request-scoped map rather than relying on the shared
  // chapterCache -- a single verse's cross-references can easily span more
  // chapters than that cache's LRU cap, which would evict early fetches
  // before this function gets a chance to read them back out.
  const chapterKeys = new Set();
  for (const [, refs] of anchors) {
    for (const [bookId, chapter] of refs) chapterKeys.add(`${bookId}:${chapter}`);
  }
  const chapterEntries = await Promise.all(
    [...chapterKeys].map(async (key) => {
      const [bookId, chapter] = key.split(":").map(Number);
      return [key, await getChapter(bookId, chapter)];
    }),
  );
  if (!tskDialog.open) return;
  const chaptersByKey = new Map(chapterEntries);

  // Word-search-style master/detail: the left nav lists each anchored KJV
  // word with its reference count, and clicking one scrolls the matching
  // section (its first reference verse) into view on the right.
  const results = document.createElement("div");
  results.className = "tsk-results";
  const nav = document.createElement("div");
  nav.className = "tsk-word-nav";
  const list = document.createElement("div");
  list.className = "tsk-anchor-list";

  anchors.forEach(([anchor, refs], index) => {
    const anchorId = `tsk-anchor-${index}`;

    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "tsk-word-nav-item";
    const word = document.createElement("span");
    word.className = "tsk-word-nav-word";
    word.textContent = anchor;
    const count = document.createElement("span");
    count.className = "tsk-word-nav-count";
    count.textContent = ` (${refs.length})`;
    navButton.append(word, count);
    navButton.addEventListener("click", () => {
      list.querySelector(`[data-anchor-id="${anchorId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(navButton);

    const section = document.createElement("section");
    section.className = "tsk-anchor-section";
    section.dataset.anchorId = anchorId;
    const heading = document.createElement("h3");
    heading.className = "tsk-anchor-heading";
    heading.textContent = anchor;
    section.append(heading);
    for (const [bookId, chapter, verse] of refs) {
      section.append(buildTskResultRow(bookId, chapter, verse, chaptersByKey));
    }
    list.append(section);
  });

  results.append(nav, list);
  tskDialogBody.replaceChildren(results);
  tskResultsToggle.reset();
}

// Matches openSearchResult exactly: jump to the reference in the active
// panel and close this dialog.
function openTskResult(bookId, chapter, verse) {
  openMoveDialog(bookId, chapter, verse, closeTskDialog);
}

// Matches copySearchResult exactly: select the verse in the active panel and
// open the copy dialog, without closing this one.
async function copyTskResult(bookId, chapter, verse) {
  const panelState = state.panels.find((panel) => panel.id === activePanelId) ?? state.panels[0];
  const elements = panelElements.get(panelState.id);
  elements.panel.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  const loaded = await goToPassage(panelState, { book: bookId, chapter, verse }, { record: true });
  if (!loaded) return;
  panelState.selectionMode = state.copySelectionMode;
  panelState.selectionAnchor = verse;
  panelState.selectionEnd = verse;
  panelState.selectedVerses = new Set([verse]);
  updatePanelSelection(panelState);
  openCopyDialog(panelState);
}

async function openTskDialog(panelState) {
  const verse = panelState.lastClickedVerse ?? panelState.verse;
  tskViewState.book = panelState.book;
  tskViewState.chapter = panelState.chapter;
  tskViewState.verse = verse;
  recordTskHistory(currentPassage(tskViewState));
  // The translation icons only govern which versions' text appears in the
  // cross-reference results below, so default them to whatever this panel is
  // currently showing (Hebrew/Greek excluded -- they have no TSK-indexed text).
  tskTranslationOrder = enabledTranslationIds(panelState).filter((id) => !ORIGINAL_LANGUAGE_IDS.includes(id));
  tskTranslationControl?.render();
  tskDialog.showModal();
  syncDialogHeightToPanel(tskDialog);
  await loadTskChapter();
}

function closeTskDialog() {
  tskDialog.close();
}

function openSearch() {
  // Search isn't tied to a single panel, so default it to whatever the
  // currently active panel is showing. Hebrew/Greek have no search index, so
  // they're never offered here even if the active panel has one enabled.
  const activePanel = state.panels.find((panel) => panel.id === activePanelId);
  searchTranslationOrder = enabledTranslationIds(activePanel).filter((id) => !ORIGINAL_LANGUAGE_IDS.includes(id));
  searchTranslationControl?.render();
  searchDialog.showModal();
  syncDialogHeightToPanel(searchDialog);
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearch() {
  searchTranslationControl?.close();
  searchDialog.close();
}

function runSearch(query) {
  const translations = [...searchTranslationOrder];
  searchBookList.replaceChildren();
  searchResults.replaceChildren();
  if (!translations.length) {
    searchMeta.textContent = "Select at least one translation.";
    return;
  }
  searchRequestId += 1;
  searchMeta.textContent = "";
  searchWorker.postMessage({ type: "search", requestId: searchRequestId, query, translations });
}

// One running list of every query submitted this session, independent of
// how many times the search dialog itself is closed and reopened.
let searchHistory = [];
let searchHistoryIndex = -1;

function recordSearchHistory(query) {
  if (searchHistoryIndex >= 0 && searchHistory[searchHistoryIndex] === query) return;
  searchHistory = searchHistory.slice(0, searchHistoryIndex + 1);
  searchHistory.push(query);
  if (searchHistory.length > 100) searchHistory.shift();
  searchHistoryIndex = searchHistory.length - 1;
  updateSearchHistoryButtons();
}

function navigateSearchHistory(direction) {
  const nextIndex = searchHistoryIndex + direction;
  if (nextIndex < 0 || nextIndex >= searchHistory.length) return;
  searchHistoryIndex = nextIndex;
  const query = searchHistory[nextIndex];
  searchInput.value = query;
  runSearch(query);
  updateSearchHistoryButtons();
}

function updateSearchHistoryButtons() {
  searchHistoryBackButton.disabled = searchHistoryIndex <= 0;
  searchHistoryForwardButton.disabled = searchHistoryIndex < 0 || searchHistoryIndex >= searchHistory.length - 1;
}

searchHistoryBackButton.addEventListener("click", () => navigateSearchHistory(-1));
searchHistoryForwardButton.addEventListener("click", () => navigateSearchHistory(1));
updateSearchHistoryButtons();

searchWorker.addEventListener("message", (event) => {
  const message = event.data;
  if (message.requestId !== searchRequestId) return;
  if (message.type === "progress") {
    searchMeta.textContent = "";
  } else if (message.type === "result") {
    renderSearchResults(
      message.query,
      message.matches,
      message.bookCounts,
      message.totalTranslationMatches,
      message.truncated,
      message.elapsedMs,
    );
  } else if (message.type === "error") {
    searchMeta.textContent = `Search failed: ${message.error}`;
  }
});

const searchResultsToggle = createResultsToggleAllController(searchResults);
searchTranslationControls.append(searchResultsToggle.buildButton());

function renderSearchResults(query, matches, bookCounts, totalTranslationMatches, truncated, elapsedMs) {
  searchResultsToggle.reset();
  searchBookList.replaceChildren();
  searchResults.replaceChildren();
  const grouped = new Map();
  for (const [translation, book, chapter, verse, text] of matches) {
    const key = `${book}:${chapter}:${verse}`;
    if (!grouped.has(key)) grouped.set(key, { book, chapter, verse, lines: [] });
    grouped.get(key).lines.push({ translation, text });
  }
  const groups = [...grouped.values()].sort(
    (a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse,
  );

  searchMeta.textContent = "";

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "panel-message";
    empty.textContent = "No results. Try another word or a shorter form.";
    searchResults.append(empty);
    return;
  }

  for (const [bookIndex, count] of bookCounts) {
    const book = manifest.books[bookIndex];
    const link = document.createElement("button");
    link.className = "search-book-link";
    link.type = "button";
    link.textContent = `${book.en} ${book.ko} (${count.toLocaleString()})`;
    link.addEventListener("click", () => {
      searchBookList.querySelectorAll(".search-book-link").forEach((item) => {
        item.toggleAttribute("aria-current", item === link);
      });
      const target = searchResults.querySelector(`.search-result[data-book="${bookIndex}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    searchBookList.append(link);
  }

  for (const result of groups) {
    const item = document.createElement("article");
    item.className = "search-result";
    item.dataset.book = String(result.book);
    const content = document.createElement("div");
    content.className = "search-result-content";
    const reference = document.createElement("div");
    reference.className = "search-reference";
    const referenceTitle = document.createElement("div");
    referenceTitle.className = "search-reference-title";
    const referenceText = document.createElement("span");
    const resultLanguages = new Set(result.lines.map((line) => translationLanguage(line.translation)));
    const book = manifest.books[result.book];
    if (resultLanguages.size === 1 && resultLanguages.has("ko")) {
      referenceText.lang = "ko";
      referenceText.textContent = `${book.ko} ${result.chapter}:${result.verse}`;
    } else if (resultLanguages.size === 1 && resultLanguages.has("en")) {
      referenceText.lang = "en";
      referenceText.textContent = `${book.en} ${result.chapter}:${result.verse}`;
    } else {
      referenceText.textContent = `${book.en} ${book.ko} ${result.chapter}:${result.verse}`;
    }
    referenceTitle.append(referenceText);
    reference.append(referenceTitle);
    content.append(reference);

    const body = document.createElement("div");
    body.className = "search-result-body";
    content.append(body);

    const translationOrder = searchTranslationOrder;
    result.lines.sort(
      (a, b) => translationOrder.indexOf(a.translation) - translationOrder.indexOf(b.translation),
    );
    for (const line of result.lines) {
      const row = document.createElement("div");
      row.className = "search-match-line";
      row.style.setProperty("--translation-color", TRANSLATION_COLORS[line.translation]);
      const label = document.createElement("span");
      label.className = "search-match-label";
      label.lang = translationLanguage(line.translation);
      label.textContent = translationMeta(line.translation).label;
      const text = document.createElement("span");
      appendHighlighted(text, line.text, query);
      row.append(label, text);
      body.append(row);
    }
    const actions = document.createElement("div");
    actions.className = "search-result-actions";
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button button-primary icon-only-button search-result-action";
    viewButton.setAttribute("aria-label", `View ${searchResultReferenceText(result)}`);
    viewButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14"></path>
        <path d="m13 6 6 6-6 6"></path>
      </svg>
    `;
    viewButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openSearchResult(result);
    });
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "button button-secondary icon-only-button search-result-action";
    copyButton.setAttribute("aria-label", `Copy ${searchResultReferenceText(result)}`);
    copyButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="11" height="11" rx="2"></rect>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
      </svg>
    `;
    copyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      copySearchResult(result);
    });
    actions.append(viewButton, copyButton, buildTskLinkButton(result.book, result.chapter, result.verse));
    reference.append(actions);
    item.append(content);
    item.addEventListener("click", () => item.classList.toggle("search-result--collapsed"));
    searchResults.append(item);
  }
}

function appendHighlighted(element, text, query) {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index < 0) {
      element.append(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (index > cursor) element.append(document.createTextNode(text.slice(cursor, index)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(index, index + query.length);
    element.append(mark);
    cursor = index + query.length;
  }
}

function searchResultReferenceText(result) {
  const book = manifest.books[result.book];
  const resultLanguages = new Set((result.lines ?? []).map((line) => translationLanguage(line.translation)));
  if (resultLanguages.size === 1 && resultLanguages.has("ko")) {
    return `${book.ko} ${result.chapter}:${result.verse}`;
  }
  if (resultLanguages.size === 1 && resultLanguages.has("en")) {
    return `${book.en} ${result.chapter}:${result.verse}`;
  }
  return `${book.en} ${book.ko} ${result.chapter}:${result.verse}`;
}

function openSearchResult(result) {
  openMoveDialog(result.book, result.chapter, result.verse, closeSearch);
}

async function copySearchResult(result) {
  const panelState = state.panels.find((panel) => panel.id === activePanelId) ?? state.panels[0];
  const elements = panelElements.get(panelState.id);
  elements.panel.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  const loaded = await goToPassage(
    panelState,
    { book: result.book, chapter: result.chapter, verse: result.verse },
    { record: true },
  );
  if (!loaded) return;
  panelState.selectionMode = state.copySelectionMode;
  panelState.selectionAnchor = result.verse;
  panelState.selectionEnd = result.verse;
  panelState.selectedVerses = new Set([result.verse]);
  updatePanelSelection(panelState);
  openCopyDialog(panelState);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  try {
    const response = await fetch(`./data/manifest.json?v=${ASSET_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load site data (${response.status})`);
    manifest = await response.json();
    state = loadState();
    sanitizeState();
    applyTouchPanelCount();
    applyFontSize();
    copyTranslationControl = setupDialogTranslationControl({
      picker: copyTranslationPicker,
      toggle: copyTranslationPickerToggle,
      menu: copyTranslationPickerMenu,
      list: copyTranslations,
      getOrder: () => copyTranslationOrder,
      setOrder: (order) => {
        copyTranslationOrder = order;
      },
      onChange: () => {
        copyStatus.textContent = "";
      },
    });
    searchTranslationOrder = [...DEFAULT_ENABLED_TRANSLATIONS];
    searchTranslationControl = setupDialogTranslationControl({
      picker: searchTranslationPicker,
      toggle: searchTranslationPickerToggle,
      menu: searchTranslationPickerMenu,
      list: searchTranslationList,
      getOrder: () => searchTranslationOrder,
      setOrder: (order) => {
        searchTranslationOrder = order;
      },
      onChange: () => {
        const query = searchInput.value.trim();
        if (searchDialog.open && query) runSearch(query);
      },
    });
    setupTskControls();
    for (const panel of state.panels) createPanelElement(panel);
    if (desktopLikePanels()) applyDesktopPanelWidths();
    saveState();
  } catch (error) {
    panelTrack.innerHTML = `<div class="panel-message error">Could not start the site: ${escapeHtml(error.message)}<br />Use a local HTTP server when previewing.</div>`;
  }
}

siteBrand.addEventListener("click", resetSite);
siteBrand.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  resetSite();
});
addPanelButton.addEventListener("click", addPanel);
panelCountOneButton.addEventListener("click", () => {
  if (desktopLikePanels()) setDesktopPanelMode(1);
  else setTouchPanelCount(1);
});
panelCountTwoButton.addEventListener("click", () => {
  if (desktopLikePanels()) setDesktopPanelMode(2);
  else setTouchPanelCount(2);
});
fontSizeDownButton.addEventListener("click", () => changeFontSize(-1));
fontSizeUpButton.addEventListener("click", () => changeFontSize(1));
openSearchButton.addEventListener("click", openSearch);
closeSearchButton.addEventListener("click", closeSearch);
searchDialog.addEventListener("click", (event) => {
  if (event.target === searchDialog) closeSearch();
});
closeCopyButton.addEventListener("click", closeCopyDialog);
cancelCopyButton?.addEventListener("click", closeCopyDialog);
confirmCopyButton.addEventListener("click", copySelectedVerses);
copyDialog.addEventListener("click", (event) => {
  if (event.target === copyDialog) closeCopyDialog();
});
closeMoveButton.addEventListener("click", closeMoveDialog);
moveDialog.addEventListener("click", (event) => {
  if (event.target === moveDialog) closeMoveDialog();
});
moveTargetButtons.forEach((button) => {
  button.addEventListener("click", () => moveToTarget(button.dataset.target));
});
closeStrongsButton.addEventListener("click", closeStrongsDialog);
strongsDialog.addEventListener("click", (event) => {
  if (event.target === strongsDialog) closeStrongsDialog();
});
closeTskButton.addEventListener("click", closeTskDialog);
tskDialog.addEventListener("click", (event) => {
  if (event.target === tskDialog) closeTskDialog();
});
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (query.length < 1) return;
  runSearch(query);
  recordSearchHistory(query);
});
portraitLayout.addEventListener("change", schedulePanelLayoutAlignment);
phonePortraitLayout.addEventListener("change", schedulePanelLayoutAlignment);
touchPanelToggleLayout.addEventListener("change", schedulePanelLayoutAlignment);
touchPanelToggleLayout.addEventListener("change", syncTrackFreeScroll);

init();
