export function originalTokens(analysis) {
  const tokens = analysis?.originalOrder;
  return Array.isArray(tokens) ? [...tokens] : [];
}

export function analysisTokenKey(reference, token) {
  return `${reference.b}:${reference.c}:${reference.v}:${token.index}:${token.strong}`;
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

export function occurrenceScopeLabel(bookName, total, wholeBible) {
  return wholeBible ? `성경 전체 용례 ${total}건` : `${bookName} 내 용례 ${total}건`;
}

export function wholeBibleOccurrenceLabel(total) {
  return `성경 전체 용례 보기 · 총 ${total}건`;
}

export function appendOccurrencePage(current, page) {
  return page.offset === 0 ? [...page.items] : [...current, ...page.items];
}

export function normalizeStrongCode(value, defaultPrefix = "") {
  const match = String(value).trim().toLocaleUpperCase().match(/^([GH])?(\d{1,5})$/);
  if (!match) return null;
  const prefix = match[1] || String(defaultPrefix).toLocaleUpperCase();
  if (prefix !== "G" && prefix !== "H") return null;
  return `${prefix}${match[2].padStart(4, "0")}`;
}

export function strongCodesInText(value) {
  const codes = String(value).toLocaleUpperCase().match(/\b[GH]\d{1,5}\b/g) ?? [];
  return [...new Set(codes.map((code) => normalizeStrongCode(code)).filter(Boolean))];
}
