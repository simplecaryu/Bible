import assert from "node:assert/strict";
import test from "node:test";

import {
  appendOccurrencePage,
  languageDirection,
  languageLabel,
  occurrenceScopeLabel,
  orderNotice,
  orderedTokens,
  wholeBibleOccurrenceLabel,
} from "../original-language-ui.js";

const analysis = {
  language: "hebrew",
  alignmentStatus: "fallback-original",
  originalOrder: [{ index: 1 }, { index: 2 }],
  translationOrder: [{ index: 2 }, { index: 1 }],
};

test("selects translation or source ordering without mutating the response", () => {
  assert.deepEqual(orderedTokens(analysis, "translation").map((token) => token.index), [2, 1]);
  assert.deepEqual(orderedTokens(analysis, "original").map((token) => token.index), [1, 2]);
  assert.deepEqual(analysis.originalOrder.map((token) => token.index), [1, 2]);
});

test("describes language direction and alignment fallback", () => {
  assert.equal(languageDirection("hebrew"), "rtl");
  assert.equal(languageDirection("aramaic"), "rtl");
  assert.equal(languageDirection("greek"), "ltr");
  assert.equal(languageLabel("aramaic"), "Aramaic");
  assert.match(orderNotice(analysis, "translation"), /unavailable/i);
  assert.equal(orderNotice(analysis, "original"), "Original manuscript order");
});

test("labels book-first and whole-Bible Strong occurrence scopes", () => {
  assert.equal(occurrenceScopeLabel("창세기", 3, false), "창세기 내 용례 3건");
  assert.equal(occurrenceScopeLabel("창세기", 51, true), "성경 전체 용례 51건");
  assert.equal(wholeBibleOccurrenceLabel(51), "성경 전체 용례 보기 · 총 51건");
});

test("replaces the first occurrence page and appends later pages", () => {
  const first = appendOccurrencePage([{ verse: 99 }], { offset: 0, items: [{ verse: 1 }] });
  assert.deepEqual(first, [{ verse: 1 }]);
  assert.deepEqual(
    appendOccurrencePage(first, { offset: 1, items: [{ verse: 2 }] }),
    [{ verse: 1 }, { verse: 2 }],
  );
});
