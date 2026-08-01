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
  await api.getNote("verse:0:1:1");
  await api.saveNote("verse:0:1:1", "# Creation");
  await api.deleteNote("verse:0:1:1");
  await api.getDescendantNotes("chapter:0:1");
  await api.chooseNotesExportPath();
  await api.chooseNotesImportPath();
  await api.exportNotes("/tmp/notes.zip");
  await api.inspectNotesArchive("/tmp/notes.zip");
  await api.applyNoteImport("/tmp/notes.zip", "replaceImported");
  await api.hasOriginalLanguage(39, 1, 1);
  await api.getOriginalVerse(39, 1, 1);
  await api.getOriginalChapter(39, 1);
  await api.getLexiconEntry("G3056", "N-NSM", "greek");
  await api.getStrongOccurrences("G3056A", 42, null, ["NIV", "GAE"], 0, 50);

  assert.deepEqual(calls, [
    ["get_manifest", undefined],
    ["get_chapter", { bookId: 0, chapter: 1, translations: ["NIV", "GAE"] }],
    ["search", { query: "God", translations: ["NIV"] }],
    ["load_state", undefined],
    ["save_state", { payload: '{"fontSize":18,"panels":[]}' }],
    ["get_note", { referenceKey: "verse:0:1:1" }],
    ["save_note", { referenceKey: "verse:0:1:1", markdown: "# Creation" }],
    ["delete_note", { referenceKey: "verse:0:1:1" }],
    ["get_descendant_notes", { referenceKey: "chapter:0:1" }],
    ["choose_notes_export_path", undefined],
    ["choose_notes_import_path", undefined],
    ["export_notes", { path: "/tmp/notes.zip" }],
    ["inspect_notes_archive", { path: "/tmp/notes.zip" }],
    ["apply_note_import", { path: "/tmp/notes.zip", policy: "replaceImported" }],
    ["has_original_language", { bookId: 39, chapter: 1, verse: 1 }],
    ["get_original_verse", { bookId: 39, chapter: 1, verse: 1 }],
    ["get_original_chapter", { bookId: 39, chapter: 1 }],
    ["get_lexicon_entry", { strong: "G3056", morphology: "N-NSM", language: "greek" }],
    ["get_strong_occurrences", {
      strong: "G3056A",
      bookId: 42,
      morphology: null,
      translationIds: ["NIV", "GAE"],
      offset: 0,
      limit: 50,
    }],
  ]);
});
