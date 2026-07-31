import assert from "node:assert/strict";
import test from "node:test";

import * as notesUi from "../notes-ui.js";
import {
  createNotesController,
  importConflictMessage,
  markdownBlocks,
  noteReferenceLabel,
} from "../notes-ui.js";

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
