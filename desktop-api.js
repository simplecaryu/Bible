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
  };
}
