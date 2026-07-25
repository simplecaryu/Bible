import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopApi } from "../desktop-api.js";

test("maps frontend data operations to Tauri commands", async () => {
  const calls = [];
  const invoke = async (command, arguments_) => {
    calls.push([command, arguments_]);
    if (command === "load_state") return '{"fontSize":16,"panels":[]}';
    return { ok: true };
  };
  const api = createDesktopApi(invoke);

  await api.getManifest();
  await api.getChapter(0, 1, ["NIV", "GAE"]);
  await api.search("God", ["NIV"]);
  assert.deepEqual(await api.loadState(), { fontSize: 16, panels: [] });
  await api.saveState({ fontSize: 18, panels: [] });

  assert.deepEqual(calls, [
    ["get_manifest", undefined],
    ["get_chapter", { bookId: 0, chapter: 1, translations: ["NIV", "GAE"] }],
    ["search", { query: "God", translations: ["NIV"] }],
    ["load_state", undefined],
    ["save_state", { payload: '{"fontSize":18,"panels":[]}' }],
  ]);
});
