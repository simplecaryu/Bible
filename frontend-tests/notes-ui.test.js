import assert from "node:assert/strict";
import test from "node:test";

import * as notesUi from "../notes-ui.js";
import {
  createNotesController,
  importConflictMessage,
  linkedNotesDisclosureLabel,
  markdownBlocks,
  noteReferenceLabel,
  noteTargetVerse,
  reduceLinkedNotesDisclosure,
} from "../notes-ui.js";

test("starts linked notes collapsed when the note reference changes", () => {
  const expanded = {
    referenceKey: "chapter:0:1",
    count: 2,
    expanded: true,
  };

  assert.deepEqual(
    reduceLinkedNotesDisclosure(expanded, {
      type: "sync",
      referenceKey: "book:0",
      count: 30,
    }),
    { referenceKey: "book:0", count: 30, expanded: false },
  );
});

test("preserves linked-note expansion while the same reference refreshes", () => {
  const expanded = {
    referenceKey: "book:0",
    count: 2,
    expanded: true,
  };

  assert.deepEqual(
    reduceLinkedNotesDisclosure(expanded, {
      type: "sync",
      referenceKey: "book:0",
      count: 3,
    }),
    { referenceKey: "book:0", count: 3, expanded: true },
  );
});

test("toggles linked notes only when descendants exist", () => {
  const collapsed = { referenceKey: "book:0", count: 3, expanded: false };
  assert.deepEqual(
    reduceLinkedNotesDisclosure(collapsed, { type: "toggle" }),
    { ...collapsed, expanded: true },
  );
  assert.deepEqual(
    reduceLinkedNotesDisclosure({ ...collapsed, count: 0 }, { type: "toggle" }),
    { ...collapsed, count: 0, expanded: false },
  );
});

test("labels linked-note disclosure with count and explicit action", () => {
  assert.equal(linkedNotesDisclosureLabel(30, false), "연결된 메모 30개 · 열기");
  assert.equal(linkedNotesDisclosureLabel(30, true), "연결된 메모 30개 · 접기");
});

test("maps existing book chapter and verse notes to visible markers", () => {
  assert.equal(typeof notesUi.notePresenceKeys, "function");
  assert.deepEqual(
    [...notesUi.notePresenceKeys({
      bookNote: { referenceKey: "book:0", markdown: "Book" },
      chapterNote: null,
      verseNotes: [
        { referenceKey: "verse:0:1:2" },
        { referenceKey: "verse:0:1:5" },
      ],
    })],
    ["book:0", "verse:0:1:2", "verse:0:1:5"],
  );
});

test("accepts unmodified N outside editable controls and dialogs", () => {
  assert.equal(typeof notesUi.shouldHandleNoteShortcut, "function");
  const event = {
    key: "n",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { tagName: "DIV", isContentEditable: false },
  };
  assert.equal(notesUi.shouldHandleNoteShortcut(event, false), true);
  assert.equal(notesUi.shouldHandleNoteShortcut({ ...event, key: "N" }, false), true);
  assert.equal(
    notesUi.shouldHandleNoteShortcut({
      ...event,
      target: { tagName: "TEXTAREA", isContentEditable: false },
    }, false),
    false,
  );
  assert.equal(notesUi.shouldHandleNoteShortcut(event, true), false);
});

test("formats book chapter and verse note labels", () => {
  const books = [{ en: "Genesis", ko: "창세기" }];
  assert.equal(noteReferenceLabel("book:0", books), "창세기 · 권 메모");
  assert.equal(noteReferenceLabel("chapter:0:2", books), "창세기 2 · 장 메모");
  assert.equal(noteReferenceLabel("verse:0:2:3", books), "창세기 2:3 · 절 메모");
});

test("flushes a dirty note before opening another reference", async () => {
  const calls = [];
  const api = {
    getNote: async (key) => ({ referenceKey: key, markdown: "" }),
    getDescendantNotes: async () => [],
    saveNote: async (key, markdown) => calls.push([key, markdown]),
  };
  const controller = createNotesController(api, { delay: 60_000 });

  await controller.open("verse:0:1:1");
  controller.update("# First");
  await controller.open("chapter:0:1");

  assert.deepEqual(calls, [["verse:0:1:1", "# First"]]);
  assert.equal(controller.snapshot().referenceKey, "chapter:0:1");
});

test("keeps a dirty draft when the same note is opened again", async () => {
  let loads = 0;
  const api = {
    getNote: async (key) => {
      loads += 1;
      return { referenceKey: key, markdown: "" };
    },
    getDescendantNotes: async () => [],
    saveNote: async () => {},
  };
  const controller = createNotesController(api, { delay: 60_000 });

  await controller.open("verse:0:1:1");
  controller.update("Unsaved thought");
  await controller.open("verse:0:1:1");

  assert.equal(loads, 1);
  assert.equal(controller.snapshot().draft, "Unsaved thought");
  assert.equal(controller.snapshot().status, "dirty");
});

test("shows a saved verse note when its chapter note opens", async () => {
  const saved = new Map();
  const api = {
    getNote: async (key) => ({ referenceKey: key, markdown: saved.get(key) ?? "" }),
    getDescendantNotes: async (key) => key === "chapter:0:1"
      ? [...saved.entries()]
        .filter(([referenceKey, markdown]) => referenceKey.startsWith("verse:0:1:") && markdown)
        .map(([referenceKey, markdown]) => ({ referenceKey, preview: markdown }))
      : [],
    saveNote: async (key, markdown) => saved.set(key, markdown),
  };
  const controller = createNotesController(api, { delay: 60_000 });

  await controller.open("verse:0:1:2");
  controller.update("Linked thought");
  await controller.open("verse:0:1:2");
  await controller.open("chapter:0:1");

  assert.deepEqual(controller.snapshot().descendants, [{
    referenceKey: "verse:0:1:2",
    preview: "Linked thought",
  }]);
});

test("refreshes linked notes without replacing the current draft", async () => {
  let descendants = [];
  const api = {
    getNote: async (key) => ({ referenceKey: key, markdown: "Chapter draft" }),
    getDescendantNotes: async () => descendants,
    saveNote: async () => {},
  };
  const controller = createNotesController(api, { delay: 60_000 });

  await controller.open("chapter:0:1");
  controller.update("Edited chapter draft");
  descendants = [{ referenceKey: "verse:0:1:2", preview: "Linked" }];
  await controller.refreshDescendants();

  assert.equal(controller.snapshot().draft, "Edited chapter draft");
  assert.equal(controller.snapshot().status, "dirty");
  assert.deepEqual(controller.snapshot().descendants, descendants);
});

test("targets the most recently clicked verse independently of copy selection", () => {
  assert.equal(noteTargetVerse({ verse: 3, lastInteractedVerse: 8 }), 8);
  assert.equal(noteTargetVerse({ verse: 3, lastInteractedVerse: null }), 3);
});

test("ignores a stale note load after the panel changes reference", async () => {
  const resolvers = new Map();
  const api = {
    getNote: (key) => new Promise((resolve) => resolvers.set(key, resolve)),
    getDescendantNotes: async () => [],
    saveNote: async () => {},
  };
  const controller = createNotesController(api);

  const first = controller.open("verse:0:1:1");
  await Promise.resolve();
  const second = controller.open("verse:0:1:2");
  await Promise.resolve();
  resolvers.get("verse:0:1:2")({ referenceKey: "verse:0:1:2", markdown: "Second" });
  await second;
  resolvers.get("verse:0:1:1")({ referenceKey: "verse:0:1:1", markdown: "First" });
  await first;

  assert.equal(controller.snapshot().referenceKey, "verse:0:1:2");
  assert.equal(controller.snapshot().draft, "Second");
});

test("reports a failed save without discarding the draft", async () => {
  const api = {
    getNote: async (key) => ({ referenceKey: key, markdown: "" }),
    getDescendantNotes: async () => [],
    saveNote: async () => {
      throw new Error("disk full");
    },
  };
  const controller = createNotesController(api, { delay: 60_000 });

  await controller.open("book:0");
  controller.update("Keep me");
  await assert.rejects(controller.flush(), /disk full/);

  assert.equal(controller.snapshot().draft, "Keep me");
  assert.equal(controller.snapshot().status, "failed");
});

test("parses safe Markdown blocks without producing HTML", () => {
  assert.deepEqual(markdownBlocks("# Heading\n\n- one\n- two\n\n> quote"), [
    { type: "heading", level: 1, text: "Heading" },
    { type: "list", items: ["one", "two"] },
    { type: "quote", text: "quote" },
  ]);
});

test("summarizes note import conflicts before applying changes", () => {
  assert.equal(
    importConflictMessage({
      imported: [{}, {}, {}],
      conflicts: ["verse:0:1:1", "chapter:0:1"],
    }),
    "3개 메모를 찾았습니다. 기존 메모와 충돌하는 항목은 2개입니다.",
  );
});
