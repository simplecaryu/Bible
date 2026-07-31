import assert from "node:assert/strict";
import test from "node:test";

import {
  languageDirection,
  languageLabel,
  orderNotice,
  orderedTokens,
} from "../frontend/original-language-ui.js";

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
