# Linux Desktop Bible App Implementation Plan

## Objective

Build the approved offline-first Linux desktop application with Tauri. Preserve
the existing frontend behavior while replacing runtime JSON loading, the search
Web Worker, and `localStorage` persistence with Rust commands backed by separate
Bible and user SQLite databases.

## Guardrails

- Follow test-driven development for each functional change.
- Keep the current static app runnable until the equivalent Tauri path is
  verified.
- Do not add notes, bookmarks, commentary, video, or update features.
- Do not optimize search beyond the agreed implementation ladder without a
  failing performance measurement.
- Never modify the source `data.db` in place.
- Generate the packaged runtime database as a build artifact.

## Target Repository Layout

```text
Cargo.toml
frontend/
  index.html
  app.js
  styles.css
  manifest.webmanifest
  icons/
src-tauri/
  Cargo.toml
  tauri.conf.json
  capabilities/
  icons/
  src/
    lib.rs
    main.rs
    commands.rs
    corpus.rs
    search.rs
    settings.rs
    error.rs
  resources/
    .gitkeep
tools/
  bible-db-builder/
    Cargo.toml
    src/main.rs
tests/
  fixtures/
docs/plans/
```

`src-tauri/resources/bible.db` is generated and ignored by Git. The committed
`data.db` remains the source corpus.

## Phase 1: Establish the Rust Workspace

### Files

- Add root `Cargo.toml`.
- Add `src-tauri/Cargo.toml`.
- Add `src-tauri/src/lib.rs`.
- Add `src-tauri/src/main.rs`.
- Add `.gitignore` entries for Rust, Tauri, and generated database artifacts.

### Work

1. Create a Cargo workspace containing the Tauri application and database
   builder.
2. Add a minimal library crate entry so database logic is testable without
   launching a WebView.
3. Add a smoke test that starts the Rust test suite with no GUI.
4. Confirm `cargo test --workspace` passes before adding application logic.

### Verification

```sh
cargo test --workspace
cargo fmt --all -- --check
```

## Phase 2: Build the Runtime Corpus Database

### Files

- Add `tools/bible-db-builder/Cargo.toml`.
- Add `tools/bible-db-builder/src/main.rs`.
- Add builder integration tests and a small SQLite fixture.

### Tests first

Create failing tests that verify the generated database:

- contains translation and book metadata in canonical order;
- contains the same verse count as the source fixture;
- does not include mutable or import-only source tables;
- stores a normalized `search_text` for every verse;
- has indexes supporting chapter lookup by book, chapter, and translation;
- is reproducible from the same source data;
- never modifies the source database.

### Implementation

1. Read the existing `data.db` in SQLite read-only mode.
2. Create a new database at an explicit output path.
3. Create `metadata`, `translations`, `books`, and `verses`.
4. Convert book names to stable numeric IDs using the existing canonical
   ordering.
5. Compute Unicode NFKC plus lowercase `search_text`.
6. Insert rows in one transaction and create runtime indexes after insertion.
7. Run SQLite integrity checks before reporting success.

### Verification

```sh
cargo test -p bible-db-builder
cargo run -p bible-db-builder -- data.db /tmp/bible-runtime.db
```

Compare row counts and representative passages with the source database.

## Phase 3: Implement Read-only Corpus Access

### Files

- Add `src-tauri/src/corpus.rs`.
- Add `src-tauri/src/error.rs`.
- Add corpus fixtures and integration tests.

### Tests first

Create failing tests for:

- opening a valid database read-only;
- rejecting a missing, invalid, or unsupported database;
- returning manifest metadata;
- returning one chapter with only requested translations;
- preserving verse and translation order;
- rejecting unknown books, chapters, and translations;
- preventing writes through the corpus connection.

### Implementation

1. Open the bundled database with immutable/read-only SQLite options.
2. Validate schema and content version once at startup.
3. Define serializable manifest, chapter, verse, and translation response
   types.
4. Query only selected translations for the requested chapter.
5. Return typed application errors without exposing raw SQL to the frontend.

### Verification

```sh
cargo test -p bible-desktop corpus
```

Add a benchmark or timing test for representative short and long chapters.

## Phase 4: Implement Substring Search

### Files

- Add `src-tauri/src/search.rs`.
- Add parity fixtures generated from current search JSON.
- Add search benchmarks.

### Tests first

Create failing tests that cover:

- English, Korean, and Chinese substring matches;
- Unicode normalization equivalence;
- case-insensitive English matching;
- empty and invalid queries;
- selected-translation filtering;
- canonical reference ordering;
- current per-book, per-translation result limits;
- total counts and truncation state;
- parity with representative results from `search-worker.js`.

### Implementation

1. Normalize the query with the corpus normalization policy.
2. Stream rows for selected translations and compare `search_text` with
   `contains`.
3. Accumulate counts and bounded display results without retaining all matches.
4. Measure two-translation and all-translation searches.
5. Parallelize at translation boundaries only if the sequential implementation
   misses the approved targets.
6. Stop and review before introducing a trigram index.

### Verification

```sh
cargo test -p bible-desktop search
cargo bench -p bible-desktop
```

Record the initial reference-machine baseline in a small checked-in performance
report.

## Phase 5: Implement User Settings

### Files

- Add `src-tauri/src/settings.rs`.
- Add migration and recovery tests.

### Tests first

Create failing tests for:

- creating `user.db` in an empty data directory;
- loading defaults when no saved state exists;
- round-tripping the current UI state;
- migrating a prior schema version;
- preserving an invalid database for diagnosis;
- preventing settings writes from touching `bible.db`.

### Implementation

1. Create a versioned settings schema in a separate database.
2. Store the current application state as validated JSON initially, keeping the
   migration surface small.
3. Use transactions for writes.
4. Return defaults plus a recoverable warning when saved state is invalid.
5. Leave notes and bookmarks out of the schema until their features are
   designed.

### Verification

```sh
cargo test -p bible-desktop settings
```

## Phase 6: Add the Tauri Shell and Commands

### Files

- Add `src-tauri/tauri.conf.json`.
- Add minimal Linux capabilities under `src-tauri/capabilities/`.
- Add `src-tauri/src/commands.rs`.
- Update `src-tauri/src/lib.rs` and `main.rs`.

### Tests first

Test the command-layer argument validation and response mapping without a
WebView:

- `get_manifest`;
- `get_chapter`;
- `search`;
- `load_state`;
- `save_state`.

### Implementation

1. Resolve `bible.db` from Tauri resources.
2. Resolve `user.db` and logs from standard application directories.
3. Initialize both database services once in managed application state.
4. Expose only the five commands required for current feature parity.
5. Configure a restrictive capability and content-security policy with no
   runtime network requirement.

### Verification

```sh
cargo test -p bible-desktop commands
cargo tauri dev
```

## Phase 7: Adapt the Existing Frontend

### Files

- Move the runtime frontend assets into `frontend/`.
- Update `frontend/app.js`.
- Update `frontend/index.html` only where Tauri bootstrap or desktop semantics
  require it.
- Remove `frontend/search-worker.js` after parity is verified.

### Work in small verified steps

1. Add a frontend data adapter with static-web and Tauri implementations.
2. Route manifest loading through `get_manifest` in Tauri.
3. Route chapter loading through `get_chapter`.
4. Route search through the Rust `search` command.
5. Make startup state loading asynchronous and route it through `load_state`.
6. Debounce `save_state` calls and route them through Rust.
7. Preserve the existing render functions and DOM structure.
8. Remove the static adapter and runtime JSON dependencies only after Tauri
   feature parity is proven.

### Verification

Manually and automatically exercise:

- initial state and restored state;
- adding, moving, resizing, and removing panels;
- book, chapter, verse, and history navigation;
- changing translations and layouts;
- searching and opening results;
- verse selection and copying;
- restarting the app without internet.

## Phase 8: Performance and Failure Acceptance

### Performance

Measure release builds on the reference Linux machine:

- process start to first rendered passage;
- chapter switch request to rendered content;
- default two-translation search;
- all-translation search;
- panel and reading-surface frame rates.

Compare against:

- startup: at most 1 second;
- chapter switch: at most 100 ms;
- two-translation search: at most 100 ms;
- all-translation search: at most 300 ms;
- interaction: 60 frames per second.

Profile before changing algorithms when a target is missed.

### Failure scenarios

Verify user-facing behavior for:

- missing and corrupt `bible.db`;
- unsupported corpus schema version;
- unwritable user data directory;
- invalid saved UI state;
- search errors;
- complete lack of network access.

## Phase 9: Package the Linux Release

### Files

- Add packaging metadata and Linux icons.
- Add a reproducible local build script or documented commands.
- Update `README.md` with desktop build, run, and data-generation instructions.

### Work

1. Generate `src-tauri/resources/bible.db`.
2. Build the Tauri application in release mode.
3. Produce an AppImage.
4. Launch the AppImage in a clean user-data directory.
5. Confirm no repository checkout, Python process, HTTP server, or internet
   connection is required.
6. Confirm replacing the AppImage preserves `user.db`.

### Final verification

```sh
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo tauri build
```

Record the artifact size, corpus version, test results, and measured performance
in the release notes.

## Commit Strategy

Keep changes reviewable with commits aligned to working vertical slices:

1. Rust workspace and test harness.
2. Runtime database builder.
3. Corpus chapter API.
4. Search API and parity tests.
5. User settings database.
6. Tauri shell and commands.
7. Frontend chapter integration.
8. Frontend search and settings integration.
9. Performance fixes supported by profiles.
10. Linux packaging and documentation.
