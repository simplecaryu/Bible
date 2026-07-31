export function parseNoteReference(referenceKey) {
  const [scope, bookText, chapterText, verseText] = String(referenceKey).split(":");
  const book = Number(bookText);
  const chapter = chapterText == null ? null : Number(chapterText);
  const verse = verseText == null ? null : Number(verseText);
  if (
    !["book", "chapter", "verse"].includes(scope)
    || !Number.isInteger(book)
    || book < 0
    || book > 65
    || (scope !== "book" && (!Number.isInteger(chapter) || chapter < 1))
    || (scope === "verse" && (!Number.isInteger(verse) || verse < 1))
  ) {
    throw new Error(`Invalid note reference: ${referenceKey}`);
  }
  return { scope, book, chapter, verse, referenceKey };
}

export function noteReferenceLabel(referenceKey, books) {
  const reference = parseNoteReference(referenceKey);
  const book = books[reference.book];
  const name = book?.ko || book?.en || `Book ${reference.book + 1}`;
  if (reference.scope === "book") return `${name} · 권 메모`;
  if (reference.scope === "chapter") return `${name} ${reference.chapter} · 장 메모`;
  return `${name} ${reference.chapter}:${reference.verse} · 절 메모`;
}

export function notePresenceKeys({ bookNote, chapterNote, verseNotes = [] }) {
  const keys = [];
  for (const note of [bookNote, chapterNote, ...verseNotes]) {
    if (note?.referenceKey && (note.markdown == null || note.markdown.trim())) {
      keys.push(note.referenceKey);
    }
  }
  return new Set(keys);
}

export function shouldHandleNoteShortcut(event, dialogOpen = false) {
  if (dialogOpen || event.key?.toLocaleLowerCase() !== "n") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const tagName = event.target?.tagName?.toLocaleLowerCase();
  return !event.target?.isContentEditable
    && !["input", "textarea", "select", "button"].includes(tagName);
}

export function noteTargetVerse(panelState) {
  const lastInteractedVerse = Number(panelState?.lastInteractedVerse);
  if (Number.isInteger(lastInteractedVerse) && lastInteractedVerse > 0) {
    return lastInteractedVerse;
  }
  const navigatedVerse = Number(panelState?.verse);
  return Number.isInteger(navigatedVerse) && navigatedVerse > 0 ? navigatedVerse : 1;
}

export function markdownBlocks(markdown) {
  const blocks = [];
  const lines = String(markdown).replaceAll("\r\n", "\n").split("\n");
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^\s*[-*+]\s+(.+)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
    } else if (item) {
      flushParagraph();
      list.push(item[1]);
    } else if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quote[1] });
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function importConflictMessage(inspection) {
  return `${inspection.imported.length}개 메모를 찾았습니다. 기존 메모와 충돌하는 항목은 ${inspection.conflicts.length}개입니다.`;
}

export function createNotesController(api, options = {}) {
  const delay = options.delay ?? 500;
  const notify = options.onChange ?? (() => {});
  const schedule = options.setTimer ?? setTimeout;
  const cancel = options.clearTimer ?? clearTimeout;
  let timer = null;
  let requestId = 0;
  let descendantsRequestId = 0;
  let state = {
    referenceKey: null,
    draft: "",
    persisted: "",
    status: "idle",
    descendants: [],
    error: null,
  };

  const emit = () => notify({ ...state, descendants: [...state.descendants] });

  async function flush() {
    if (timer != null) {
      cancel(timer);
      timer = null;
    }
    if (!state.referenceKey || state.draft === state.persisted) return;
    const referenceKey = state.referenceKey;
    const markdown = state.draft;
    state = { ...state, status: "saving", error: null };
    emit();
    try {
      await api.saveNote(referenceKey, markdown);
      if (state.referenceKey === referenceKey && state.draft === markdown) {
        state = { ...state, persisted: markdown, status: "saved", error: null };
        emit();
      }
    } catch (error) {
      if (state.referenceKey === referenceKey) {
        state = { ...state, status: "failed", error };
        emit();
      }
      throw error;
    }
  }

  async function open(referenceKey, { force = false } = {}) {
    parseNoteReference(referenceKey);
    if (state.referenceKey === referenceKey && !force) {
      try {
        await refreshDescendants();
      } catch {
        // Reopening an editor must not fail just because its linked-note list did.
      }
      return;
    }
    await flush();
    const currentRequest = ++requestId;
    const currentDescendantsRequest = ++descendantsRequestId;
    state = {
      referenceKey,
      draft: "",
      persisted: "",
      status: "loading",
      descendants: [],
      error: null,
    };
    emit();
    try {
      const [note, descendants] = await Promise.all([
        api.getNote(referenceKey),
        api.getDescendantNotes(referenceKey),
      ]);
      if (currentRequest !== requestId || currentDescendantsRequest !== descendantsRequestId) return;
      const markdown = note?.markdown ?? "";
      state = {
        ...state,
        draft: markdown,
        persisted: markdown,
        status: "saved",
        descendants,
      };
      emit();
    } catch (error) {
      if (currentRequest !== requestId) return;
      state = { ...state, status: "failed", error };
      emit();
      throw error;
    }
  }

  async function refreshDescendants() {
    const referenceKey = state.referenceKey;
    if (!referenceKey) return;
    const currentRequest = ++descendantsRequestId;
    const descendants = await api.getDescendantNotes(referenceKey);
    if (currentRequest !== descendantsRequestId || state.referenceKey !== referenceKey) return;
    state = { ...state, descendants };
    emit();
  }

  function update(markdown) {
    state = { ...state, draft: markdown, status: "dirty", error: null };
    if (timer != null) cancel(timer);
    timer = schedule(() => {
      timer = null;
      flush().catch(() => {});
    }, delay);
    timer?.unref?.();
    emit();
  }

  return {
    open,
    update,
    flush,
    refreshDescendants,
    snapshot: () => ({ ...state, descendants: [...state.descendants] }),
  };
}
