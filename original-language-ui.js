export function orderedTokens(analysis, mode) {
  const tokens = mode === "original" ? analysis?.originalOrder : analysis?.translationOrder;
  return Array.isArray(tokens) ? [...tokens] : [];
}

export function languageDirection(language) {
  return language === "hebrew" || language === "aramaic" ? "rtl" : "ltr";
}

export function languageLabel(language) {
  return {
    hebrew: "Hebrew",
    aramaic: "Aramaic",
    greek: "Greek",
  }[language] ?? "Original language";
}

export function orderNotice(analysis, mode) {
  if (mode === "original") return "Original manuscript order";
  return analysis?.alignmentStatus === "verified"
    ? "Verified English translation order"
    : "Verified English alignment unavailable · original order shown";
}

export function occurrenceScopeLabel(bookName, total, wholeBible) {
  return wholeBible ? `성경 전체 용례 ${total}건` : `${bookName} 내 용례 ${total}건`;
}

export function wholeBibleOccurrenceLabel(total) {
  return `성경 전체 용례 보기 · 총 ${total}건`;
}

export function appendOccurrencePage(current, page) {
  return page.offset === 0 ? [...page.items] : [...current, ...page.items];
}
