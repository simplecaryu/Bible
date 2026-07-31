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

export function defaultAnalysisOrder() {
  return "original";
}

export function panelFitCount(panelCount, preset) {
  const available = Math.max(1, Number(panelCount) || 1);
  const requested = Number(preset) === 2 ? 2 : 1;
  return Math.min(available, requested);
}
