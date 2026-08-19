import assert from "node:assert/strict";
import test from "node:test";

import { strongLexiconRecords, tskRecordsForChapter } from "../tools/study-data.mjs";

test("flattens ordered TSK chapter data into normalized study records", () => {
  const books = [{ en: "Genesis" }, { en: "Exodus" }];
  const records = tskRecordsForChapter({
    b: 0,
    c: 1,
    v: [[1, [
      ["beginning", [[1, 2, 3], [0, 1, 2]]],
      ["created", [[0, 1, 3]]],
    ]]],
  }, books);

  assert.deepEqual(records, [
    {
      type: "crossReference",
      source: "tsk",
      book: "Genesis",
      chapter: 1,
      verse: 1,
      anchor: "beginning",
      anchorOrder: 0,
      targetBook: "Exodus",
      targetChapter: 2,
      targetVerse: 3,
      targetOrder: 0,
    },
    {
      type: "crossReference",
      source: "tsk",
      book: "Genesis",
      chapter: 1,
      verse: 1,
      anchor: "beginning",
      anchorOrder: 0,
      targetBook: "Genesis",
      targetChapter: 1,
      targetVerse: 2,
      targetOrder: 1,
    },
    {
      type: "crossReference",
      source: "tsk",
      book: "Genesis",
      chapter: 1,
      verse: 1,
      anchor: "created",
      anchorOrder: 1,
      targetBook: "Genesis",
      targetChapter: 1,
      targetVerse: 3,
      targetOrder: 0,
    },
  ]);
});

test("rejects malformed TSK references before database construction", () => {
  assert.throws(
    () => tskRecordsForChapter({ b: 0, c: 1, v: [[1, [["bad", [[9, 1, 1]]]]]] }, [{ en: "Genesis" }]),
    /target book 9/,
  );
});

test("normalizes classic Strong dictionary entries for the study builder", () => {
  assert.deepEqual(strongLexiconRecords({
    H1: {
      lemma: "אָב",
      translit: "ab",
      pronunciation: "awb",
      derivation: "a primitive word",
      def: "father",
      kjv: "chief, father",
    },
    bad: {},
  }), [{
    type: "strongLexicon",
    source: "strongs",
    strong: "H0001",
    language: "hebrew",
    lemma: "אָב",
    transliteration: "ab",
    pronunciation: "awb",
    derivation: "a primitive word",
    definition: "father",
    kjvRenderings: "chief, father",
  }]);
});
