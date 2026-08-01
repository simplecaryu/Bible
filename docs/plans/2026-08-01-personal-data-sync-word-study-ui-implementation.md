# 개인 데이터 자동 동기화와 원어 해설 작업공간 구현 계획

## 0. 작업 원칙과 기준선

설계 기준은
[`2026-08-01-personal-data-sync-word-study-ui-design.md`](2026-08-01-personal-data-sync-word-study-ui-design.md)다.

- 모든 동작 변경은 먼저 실패하는 Rust 또는 Node 테스트로 고정한다.
- `bible.db`는 읽기 전용 자료로 유지하고 동기화 대상에 넣지 않는다.
- 기존 `user.db`, 노트 ZIP과 저장된 작업공간을 제자리에서 마이그레이션한다.
- 실행 중인 SQLite DB를 동기화 폴더에 두지 않는다.
- `AGENTS.md`와 `src-tauri/gen/`은 사용자/생성 파일이므로 커밋하지 않는다.
- 각 단계 뒤 관련 테스트를 실행하고, 마지막에 전체 워크스페이스와 실제
  AppImage를 검증한다.

시작 기준선:

```bash
cargo test --workspace
npm test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --features desktop -- -D warnings
node --check app.js
git diff --check
```

## 1. 원문 어순 단일 모델로 단순화

**파일**

- `original-language-ui.js`
- `frontend-tests/original-language-ui.test.js`
- `app.js`
- `index.html`
- `frontend-tests/analysis-layout.test.js`

### RED

다음을 검증하는 테스트를 먼저 추가한다.

- 원어 토큰은 `originalOrder`만 사용한다.
- 개별 토큰 선택 모델이 verse reference와 token index를 안정적인 key로 만든다.
- HTML에 translation/original order 전환 컨트롤이 없다.
- 기존 절 전체 `analysis-tokens` 영역이 없다.
- 주 성경의 원어 단어가 button으로 렌더링되고 선택 상태를 표현한다.

테스트 실패를 확인한다.

```bash
node --test frontend-tests/original-language-ui.test.js frontend-tests/analysis-layout.test.js
```

### GREEN

- `orderedTokens`와 `orderNotice`의 mode 분기를 제거하고 원문 어순 helper로
  대체한다.
- `analysisMode`, order 버튼 event와 저장 상태 마이그레이션 코드를 제거한다.
- 원어 블록 전체 click/double-click으로 절 분석을 여는 동작을 제거한다.
- compact interlinear의 각 토큰을 키보드 접근 가능한 button으로 렌더링한다.
- 선택된 token key를 main panel 렌더 후에도 다시 강조한다.
- DB의 기존 `translation_order` 열은 이번 마이그레이션에서 읽지 않되 schema
  호환을 위해 즉시 제거하지 않는다.

관련 테스트와 `node --check app.js`를 통과시킨다.

## 2. 단어 해설을 오른쪽 전체 높이 패널로 변경

**파일**

- `index.html`
- `app.js`
- `styles.css`
- `workspace-state.js`
- `frontend-tests/workspace-state.test.js`
- `frontend-tests/analysis-layout.test.js`

### RED

순수 workspace 전환 함수를 테스트한다.

- 단어 해설 진입 시 현재 auxiliary panel IDs, 크기와 활성 panel을 snapshot한다.
- 해설 중 재선택은 snapshot을 덮어쓰지 않는다.
- 해설 종료 시 이전 workspace가 동일하게 복원된다.
- 해설 패널은 오른쪽 전체 높이를 차지한다.
- 해설 내용에는 중첩된 고정 높이 scroll container가 없다.

### GREEN

- 기존 analysis panel header를 `WORD STUDY` 역할로 바꾸고 절 제목 대신 선택한
  surface/lemma/Strong reference를 표시한다.
- 절 전체 token 목록을 제거하고 `analysis-token-detail`을 패널의 단일 scroll
  body로 만든다.
- 단어 선택 직전에 한 번만 auxiliary workspace snapshot을 저장한다.
- 기존 보조 성경과 notes panel을 DOM에서 파괴하지 않고 study mode 동안 숨긴다.
- 새 단어를 클릭하면 stale request guard를 유지한 채 detail만 교체한다.
- 닫기와 `Ctrl+W`는 study mode와 preview를 끝낸 뒤 기존 auxiliary workspace를
  복원한다.
- 원어 제목, lemma, Strong, morphology, dictionary definition과 attribution의
  font size, 행간과 label/value 대비를 넓은 패널에 맞게 조정한다.

## 3. 왼쪽 아래 용례 탐색 성경 패널

**파일**

- `index.html`
- `app.js`
- `styles.css`
- `workspace-state.js`
- `original-language-ui.js`
- `frontend-tests/workspace-state.test.js`
- `frontend-tests/original-language-ui.test.js`
- `frontend-tests/analysis-layout.test.js`

### RED

다음을 순수 함수와 정적 layout 테스트로 고정한다.

- 첫 용례 클릭 시 main translations를 복사한 독립 preview state를 만든다.
- 다음 클릭은 동일 preview ID를 유지하고 reference만 바꾼다.
- 이전/다음 절 이동은 장 경계와 책 경계를 정확히 처리한다.
- preview translation 변경은 main panel state를 바꾸지 않는다.
- 용례 클릭은 main reference와 main scroll snapshot을 바꾸지 않는다.
- study 종료 시 preview가 제거되고 왼쪽 main이 전체 높이를 회복한다.

### GREEN

- 왼쪽 main region 안에 main Bible과 preview Bible을 담는 vertical split
  container를 추가한다.
- preview는 클릭한 절과 선택 번역 본문만 요청하고 표시한다.
- 첫 open에서 main 번역 배열을 clone하며 이후 picker는 preview state만 갱신한다.
- reference label, translation picker와 이전/다음 절 버튼을 제공한다.
- resize handle로 main/preview 높이 비율을 연속 조절하고 pointer capture를 쓴다.
- preview를 갱신해도 main Bible DOM과 scrollTop을 재렌더하거나 변경하지 않는다.
- 작은 화면에서는 word study와 occurrence preview를 별도 tab으로 노출한다.

## 4. 단어 사전과 용례 레이아웃 개선

**파일**

- `app.js`
- `styles.css`
- `original-language-ui.js`
- `frontend-tests/original-language-ui.test.js`
- `frontend-tests/analysis-layout.test.js`

### RED

- 사전 필드 순서와 비어 있는 field 생략을 pure view model로 테스트한다.
- current-book, morphology-only, whole-Bible와 paging 상태를 테스트한다.
- occurrence result activation이 preview request를 만들고 main navigation을 만들지
  않는 정적 테스트를 추가한다.

### GREEN

- 기존 Strong lexicon/occurrence API와 stale response protection을 재사용한다.
- 사전 정보, morphology, source, occurrence를 하나의 scroll 흐름으로 렌더링한다.
- 현재 권 용례 자동 조회, 형태론 필터, 성경 전체 전환과 50건 paging을 유지한다.
- occurrence click/Enter는 `goToPassage(mainPanel)` 대신 preview open/update를
  호출한다.
- loading, empty, retry와 partial failure 상태가 이미 로드된 detail을 지우지 않게
  한다.

## 5. 동기화용 로컬 스키마와 장치 설정

**파일**

- `src-tauri/src/settings.rs`
- `src-tauri/src/notes.rs`
- `src-tauri/src/sync.rs` (신규)
- `src-tauri/src/lib.rs`
- `src-tauri/src/services.rs`
- `src-tauri/Cargo.toml`

### RED

임시 `user.db`로 다음 테스트를 먼저 만든다.

- 기존 schema-1 DB가 노트와 settings를 보존하며 새 sync schema로 열린다.
- 장치 ID와 sync folder는 local-only preference로 왕복한다.
- note delete가 row를 조용히 없애는 대신 tombstone을 만든다.
- note resave가 이전 tombstone을 무효화한다.
- note/settings의 sync baseline hash와 dirty 상태가 저장된다.

### GREEN

- 기존 metadata version을 단계적으로 migration한다.
- local preferences, sync metadata, per-note baseline/tombstone과 unresolved conflict
  table을 추가한다.
- 장치 ID는 최초 실행에 한 번 생성하고 동기화하지 않는다.
- notes save/delete와 settings save transaction이 sync dirty marker를 함께
  갱신한다.
- 기존 NoteStore/Settings API와 ZIP archive 결과를 보존한다.

## 6. 버전이 지정된 동기화 스냅샷 포맷

**파일**

- `src-tauri/src/sync.rs`
- `src-tauri/Cargo.toml`

### RED

네트워크와 Tauri 없이 실행되는 domain 테스트를 추가한다.

- notes, tombstones와 settings의 deterministic serialization;
- format version, snapshot/base/device IDs와 timestamp;
- payload checksum 왕복;
- 변경된 byte, 누락 field와 미래 version 거부;
- 임시 파일에서 최종 파일로 성공한 경우만 교체;
- write/read interruption 뒤 기존 valid snapshot 유지.

### GREEN

- 내부 SQLite table과 독립적인 serde snapshot structs를 만든다.
- checksum은 checksum field를 제외한 canonical payload에 대해 계산한다.
- 선택한 folder 내부에서 unique temporary file을 만들고 flush/sync/validate 후
  atomic rename한다.
- 최종 snapshot과 마지막 known-good backup의 수를 제한해 보존한다.
- path traversal, symlink와 예상 밖 file type을 거부한다.

## 7. 순차 장치 병합과 충돌 보존

**파일**

- `src-tauri/src/sync.rs`
- `src-tauri/src/services.rs`

### RED

두 장치 A/B를 메모리 record로 시뮬레이션한다.

- cloud 없음: local을 첫 snapshot으로 push;
- local clean + remote changed: remote 적용;
- local changed + remote unchanged: local push;
- 서로 다른 reference 변경: 자동 merge;
- 동일 reference 동일 변경: conflict 없음;
- 동일 reference 다른 변경: 양쪽 content conflict로 보존;
- local delete/remote unchanged: tombstone 전파;
- local delete/remote edit: delete/edit conflict;
- settings는 newest valid state 선택;
- remote absence/corruption은 local delete를 유발하지 않음.

### GREEN

- local baseline hashes와 dirty markers를 사용해 3-way decision을 수행한다.
- merge 결과를 한 transaction으로 user.db에 적용한다.
- unresolved conflict에는 local/remote content, deletion state, timestamps와 device
  ID를 모두 저장한다.
- conflict가 있으면 해당 note를 덮어쓰지 않고 non-conflicting records만 적용한다.
- 성공한 pull/merge/push 뒤 baseline과 last snapshot ID를 갱신한다.

## 8. Tauri 동기화 명령과 자동 실행

**파일**

- `src-tauri/src/commands.rs`
- `src-tauri/src/services.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `desktop-api.js`
- `frontend-tests/desktop-api.test.js`

### RED

- folder path, command input과 conflict resolution validation unit test;
- desktop API invoke mapping test;
- 동시에 두 sync 요청이 하나의 serialized operation이 되는 service test;
- configured/unconfigured/offline status transitions test.

### GREEN

다음 최소 command를 등록한다.

- choose personal-data sync folder;
- get sync configuration/status;
- configure/change/disable folder;
- sync now;
- list and resolve conflicts.

folder dialog에 필요한 최소 capability만 추가한다. frontend startup은 saved UI state를
읽기 전에 startup sync를 기다린다. note/settings save 성공 후 debounce sync를
예약하고, window focus 때 pull을 재검사한다. 종료 시 pending local saves와 sync를
best effort로 flush하되 종료를 무기한 막지 않는다.

## 9. 동기화 설정과 충돌 해결 UI

**파일**

- `index.html`
- `app.js`
- `styles.css`
- `sync-ui.js` (신규)
- `frontend-tests/sync-ui.test.js` (신규)
- `frontend-tests/analysis-layout.test.js`

### RED

pure UI model로 다음을 테스트한다.

- unconfigured, syncing, synced, pulled, waiting, failed, conflict labels;
- path를 노트 내용과 섞지 않는 local config model;
- local/remote/merge conflict decision payload;
- merge text가 양쪽 원문과 source heading을 보존함;
- disable이 delete request를 만들지 않음.

### GREEN

- 설정 dialog에 folder 선택, 변경, 해제와 `지금 동기화`를 추가한다.
- 상태를 global toolbar의 방해되지 않는 indicator와 설정 상세에 표시한다.
- waiting/failure는 Bible reading과 local note edit를 막지 않는다.
- conflict dialog는 reference label, local/remote timestamps와 두 Markdown preview를
  보여 주고 세 resolution을 제공한다.
- resolution 후 note marker, 열린 note와 sync status를 갱신한다.
- 기존 notes ZIP import/export는 독립 backup action으로 유지한다.

## 10. 통합 회귀 검증

모든 자동 검사를 실행한다.

```bash
cargo test --workspace
npm test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --features desktop -- -D warnings
node --check app.js
git diff --check
```

두 임시 app-data directory와 하나의 임시 sync directory를 사용한 통합 테스트로
A 저장/종료 → B 시작/수정/종료 → A 재시작을 검증한다. 실제 개인 Synology 폴더나
기존 `user.db`를 자동 테스트에서 수정하지 않는다.

## 11. AppImage와 실제 화면 검증

1. corpus와 frontend를 포함한 새 AppImage를 빌드한다.
2. 격리된 XDG profile로 실행한다.
3. 주 성경 원어 단어를 클릭해 오른쪽 full-height word study가 열리는지 확인한다.
4. 용례 클릭 후 왼쪽 아래 preview가 열리고 main reference/scroll이 그대로인지
   확인한다.
5. preview translation 변경과 장 경계 앞뒤 이동을 확인한다.
6. 닫기 후 이전 auxiliary workspace가 복원되는지 확인한다.
7. 임시 sync folder로 첫 push, 두 번째 profile의 pull, note deletion과 conflict
   dialog를 확인한다.
8. 네트워크를 사용하지 않고 본문, 원어, Strong 용례와 노트가 동작하는지 확인한다.

검증된 변경을 논리적 커밋으로 나누어 `desktop-rust`에 push하고, Draft PR을
갱신한다. 새 AppImage는 기존 프리릴리스에 덮어쓰지 않고 새 preview tag로 게시하며
checksum과 개인 데이터 마이그레이션 주의를 release notes에 기록한다.
