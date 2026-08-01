# Strong 용례 검색 구현 계획

**목표:** 원어 분석 패널에서 클릭한 Strong 번호의 현재 권 용례를 자동 표시하고,
사용자 요청 시 성경 전체 결과를 50건씩 확장한다.

**기준 설계:**
[`2026-08-01-strong-occurrence-search-design.md`](2026-08-01-strong-occurrence-search-design.md)

## 1. DB 스키마와 정규화

대상: `tools/bible-db-builder/src/lib.rs`

1. 확장 Strong 코드를 기본 코드로 정규화하는 실패 테스트를 추가한다.
2. 생성된 `original_tokens`에 `strong_base`가 저장되고
   `original_tokens_by_strong_reference` 인덱스가 존재하는 실패 테스트를 추가한다.
3. 최소 구현으로 스키마, import와 인덱스 생성을 추가한다.
4. builder 테스트를 실행한다.

## 2. Rust corpus 용례 조회

대상: `src-tauri/src/corpus.rs`

1. 테스트 fixture에 여러 권, 여러 형태, 여러 번역의 동일 Strong 용례를 추가한다.
2. 현재 권 범위, 성경 전체 범위, 형태 필터와 페이지 경계를 검증하는 실패 테스트를
   작성한다.
3. `StrongOccurrence`, `StrongOccurrencePage` 응답 타입을 추가한다.
4. `Corpus::strong_occurrences`를 구현한다. 결과는 정경·장·절·토큰 순서이며 요청한
   번역 본문을 참조별로 결합한다.
5. corpus 테스트를 실행한다.

## 3. 서비스와 Tauri 명령

대상: `src-tauri/src/services.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`

1. 서비스 위임과 명령 입력 검증의 실패 테스트를 작성한다.
2. Strong 형식, 권 ID, 번역 ID, offset과 1..=50 limit을 검증한다.
3. `get_strong_occurrences` 명령을 등록한다.
4. Rust 단위·통합 테스트를 실행한다.

## 4. 프런트엔드 용례 상태 모듈

대상: `original-language-ui.js`, `frontend-tests/original-language-ui.test.js`

1. 현재 권/전체 범위 레이블, 전체 확장 가능 여부, 페이지 누적과 형태 필터 상태의
   실패 테스트를 작성한다.
2. DOM과 분리된 순수 상태/표현 helper를 구현한다.
3. 프런트엔드 해당 테스트를 실행한다.

## 5. 데스크톱 API와 분석 패널 연결

대상: `desktop-api.js`, `app.js`, `styles.css`, 관련 프런트엔드 테스트

1. `getStrongOccurrences` invoke 인자를 검증하는 실패 테스트를 추가한다.
2. 단어 상세 로드 후 현재 활성 패널의 권과 번역으로 현재 권 첫 페이지를 요청한다.
3. 상세 영역에 범위·형태 컨트롤과 용례 목록을 렌더링한다.
4. 전체 범위 전환과 다음 50건 누적 로딩을 연결한다.
5. 결과 버튼을 누르거나 Enter를 누르면 활성 패널이 해당 절로 이동하게 한다.
6. 토큰 전환 및 패널 이동 중 stale response를 무시한다.
7. 로딩·빈 결과·재시도 오류 상태를 구현한다.

## 6. 회귀 및 성능 검증

1. `npm test`
2. `node --check app.js`
3. `cargo fmt --all -- --check`
4. `cargo test --workspace`
5. `cargo clippy --workspace --all-targets -- -D warnings`
6. 대표적인 희귀·빈번 Strong fixture에서 첫 페이지가 50건을 넘지 않는지 확인한다.

## 7. 실앱 및 배포 검증

1. 실제 bundled corpus를 다시 생성해 새 스키마를 반영한다.
2. Tauri 앱에서 단어 클릭, 현재 권 결과, 전체 확장, 형태 필터와 본문 이동을 확인한다.
3. `cargo tauri build`로 AppImage를 만든다.
4. 변경을 논리적 단위로 커밋해 `origin/desktop-rust`에 push한다.
5. `simplecaryu/Bible`에 prerelease를 만들고 AppImage와 실행 안내를 첨부한다.
