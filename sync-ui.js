export function syncStatusLabel(status, detail = "") {
  const labels = {
    unconfigured: "동기화 폴더 미설정",
    waiting: "동기화 폴더 연결 대기 중",
    syncing: "개인 데이터 저장 중…",
    synced: "개인 데이터 동기화됨",
    pulled: "다른 컴퓨터의 변경 반영됨",
    conflict: "충돌 확인 필요",
  };
  if (status === "failed") return `동기화 실패${detail ? ` · ${detail}` : ""}`;
  return labels[status] ?? "동기화 상태 확인 중…";
}

export function mergeConflictMarkdown(conflict) {
  const local = conflict.local.markdown ?? "*(삭제됨)*";
  const remote = conflict.remote.markdown ?? "*(삭제됨)*";
  return [
    `## 현재 컴퓨터 · ${conflict.local.updatedAt}`,
    local,
    "---",
    `## 다른 컴퓨터 · ${conflict.remote.updatedAt}`,
    remote,
  ].join("\n\n");
}

export function conflictResolution(conflict, choice) {
  const markdown = choice === "merge"
    ? mergeConflictMarkdown(conflict)
    : conflict[choice]?.markdown ?? null;
  return { referenceKey: conflict.referenceKey, markdown };
}
