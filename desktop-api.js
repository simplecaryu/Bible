export function createDesktopApi(invoke) {
  return {
    getManifest() {
      return invoke("get_manifest");
    },

    getChapter(bookId, chapter, translations) {
      return invoke("get_chapter", { bookId, chapter, translations });
    },

    search(query, translations) {
      return invoke("search", { query, translations });
    },

    async loadState() {
      const payload = await invoke("load_state");
      return payload ? JSON.parse(payload) : null;
    },

    saveState(state) {
      return invoke("save_state", { payload: JSON.stringify(state) });
    },

    getNote(referenceKey) {
      return invoke("get_note", { referenceKey });
    },

    saveNote(referenceKey, markdown) {
      return invoke("save_note", { referenceKey, markdown });
    },

    deleteNote(referenceKey) {
      return invoke("delete_note", { referenceKey });
    },

    getDescendantNotes(referenceKey) {
      return invoke("get_descendant_notes", { referenceKey });
    },

    chooseNotesExportPath() {
      return invoke("choose_notes_export_path");
    },

    chooseNotesImportPath() {
      return invoke("choose_notes_import_path");
    },

    exportNotes(path) {
      return invoke("export_notes", { path });
    },

    inspectNotesArchive(path) {
      return invoke("inspect_notes_archive", { path });
    },

    applyNoteImport(path, policy) {
      return invoke("apply_note_import", { path, policy });
    },

    hasOriginalLanguage(bookId, chapter, verse) {
      return invoke("has_original_language", { bookId, chapter, verse });
    },

    getOriginalVerse(bookId, chapter, verse) {
      return invoke("get_original_verse", { bookId, chapter, verse });
    },

    getOriginalChapter(bookId, chapter) {
      return invoke("get_original_chapter", { bookId, chapter });
    },

    getLexiconEntry(strong, morphology, language) {
      return invoke("get_lexicon_entry", { strong, morphology, language });
    },

    getStrongOccurrences(strong, bookId, morphology, translationIds, offset, limit) {
      return invoke("get_strong_occurrences", {
        strong,
        bookId,
        morphology,
        translationIds,
        offset,
        limit,
      });
    },
  };
}
