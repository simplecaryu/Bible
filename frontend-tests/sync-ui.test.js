import assert from "node:assert/strict";
import test from "node:test";

import * as syncUi from "../sync-ui.js";

test("labels personal data sync states without blocking local work", () => {
  assert.equal(typeof syncUi.syncStatusLabel, "function");
  assert.equal(syncUi.syncStatusLabel("unconfigured"), "동기화 폴더 미설정");
  assert.equal(syncUi.syncStatusLabel("syncing"), "개인 데이터 저장 중…");
  assert.equal(syncUi.syncStatusLabel("synced"), "개인 데이터 동기화됨");
  assert.equal(syncUi.syncStatusLabel("pulled"), "다른 컴퓨터의 변경 반영됨");
  assert.equal(syncUi.syncStatusLabel("conflict"), "충돌 확인 필요");
  assert.equal(syncUi.syncStatusLabel("waiting"), "동기화 폴더 연결 대기 중");
  assert.match(syncUi.syncStatusLabel("failed", "permission denied"), /permission denied/);
});

test("combines both conflict versions with explicit source headings", () => {
  assert.equal(typeof syncUi.mergeConflictMarkdown, "function");
  const merged = syncUi.mergeConflictMarkdown({
    local: { markdown: "local text", updatedAt: "2026-08-01T01:00:00Z" },
    remote: { markdown: "remote text", updatedAt: "2026-08-01T02:00:00Z" },
  });

  assert.match(merged, /현재 컴퓨터/);
  assert.match(merged, /local text/);
  assert.match(merged, /다른 컴퓨터/);
  assert.match(merged, /remote text/);
});

test("turns a conflict choice into an explicit resolution payload", () => {
  const conflict = {
    referenceKey: "verse:0:1:1",
    local: { markdown: "local", updatedAt: "2026-08-01T01:00:00Z" },
    remote: { markdown: null, updatedAt: "2026-08-01T02:00:00Z" },
  };

  assert.deepEqual(syncUi.conflictResolution(conflict, "local"), {
    referenceKey: "verse:0:1:1",
    markdown: "local",
  });
  assert.deepEqual(syncUi.conflictResolution(conflict, "remote"), {
    referenceKey: "verse:0:1:1",
    markdown: null,
  });
  assert.match(syncUi.conflictResolution(conflict, "merge").markdown, /local/);
});
