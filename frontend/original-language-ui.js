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
