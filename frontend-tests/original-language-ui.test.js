import assert from "node:assert/strict";
import test from "node:test";

import * as originalLanguageUi from "../original-language-ui.js";

const {
  appendOccurrencePage,
  languageDirection,
  languageLabel,
  normalizeStrongCode,
  occurrenceScopeLabel,
  strongCodesInText,
  wholeBibleOccurrenceLabel,
} = originalLanguageUi;

const analysis = {
  language: "hebrew",
  alignmentStatus: "fallback-original",
  originalOrder: [{ index: 1 }, { index: 2 }],
  translationOrder: [{ index: 2 }, { index: 1 }],
};

test("uses only original manuscript ordering without mutating the response", () => {
  assert.equal(typeof originalLanguageUi.originalTokens, "function");
  assert.deepEqual(originalLanguageUi.originalTokens(analysis).map((token) => token.index), [1, 2]);
  assert.deepEqual(analysis.originalOrder.map((token) => token.index), [1, 2]);
});

test("builds a stable key for a selected original-language word", () => {
  assert.equal(typeof originalLanguageUi.analysisTokenKey, "function");
  assert.equal(
    originalLanguageUi.analysisTokenKey({ b: 0, c: 1, v: 2 }, { index: 5, strong: "H2822" }),
    "0:1:2:5:H2822",
  );
});

test("describes original-language direction", () => {
  assert.equal(languageDirection("hebrew"), "rtl");
  assert.equal(languageDirection("aramaic"), "rtl");
  assert.equal(languageDirection("greek"), "ltr");
  assert.equal(languageLabel("aramaic"), "Aramaic");
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

test("normalizes direct Strong-number input", () => {
  assert.equal(normalizeStrongCode("g3056"), "G3056");
  assert.equal(normalizeStrongCode("H1"), "H0001");
  assert.equal(normalizeStrongCode("3056", "G"), "G3056");
  assert.equal(normalizeStrongCode("word"), null);
});

test("finds unique linked Strong numbers in derivation text", () => {
  assert.deepEqual(
    strongCodesInText("from G1537 and G5055; compare G1537"),
    ["G1537", "G5055"],
  );
});
