# Original Languages, Notes, and Auxiliary Workspace Implementation Plan

## Objective

Implement the approved original-language study tools, hierarchical Markdown
notes, portable note archives, and full-height-main/right-auxiliary workspace
without regressing the existing offline Bible reader.

The approved design is
[`2026-07-31-original-languages-notes-workspace-design.md`](2026-07-31-original-languages-notes-workspace-design.md).

## Delivery Rules

- Use red-green-refactor for every behavioral change.
- Keep the application runnable at the end of every task.
- Preserve unrelated and pre-existing worktree changes.
- Commit each completed task separately and stage only its named files.
- Do not modify the committed source `data.db` in place.
- Treat generated `src-tauri/resources/bible.db`, downloaded upstream sources,
  note archives, and Tauri-generated schemas as artifacts, not source files.
- Do not begin original-language UI work until the imported corpus passes
  attribution, reference, order, and foreign-key validation.
- Do not guess missing interlinear alignment. Fall back to original order.
- Keep ordinary chapter requests independent of original-language tables.
- Run the focused test first, then the full verification suite for each phase.

## Proposed Source Layout

```text
app.js
desktop-api.js
index.html
styles.css
frontend/
  workspace-state.js
  notes-ui.js
  original-language-ui.js
frontend-tests/
  desktop-api.test.js
  workspace-state.test.js
  notes-ui.test.js
  original-language-ui.test.js
data/
  manifest.json
  original-sources.json
docs/
  attribution/
    original-language-sources.md
scripts/
  fetch_original_sources.py
src-tauri/
  capabilities/default.json
  src/
    archive.rs
    commands.rs
    corpus.rs
    lib.rs
    notes.rs
    original_language.rs
    services.rs
    settings.rs
tools/bible-db-builder/
  src/
    lib.rs
    main.rs
    original.rs
  tests/fixtures/original/
```

Downloaded upstream files live in an ignored staging directory such as
`tmp_original_sources/`. The checked-in `data/original-sources.json` contains
source names, expected filenames, revisions, URLs, licenses, attributions, and
checksums, but not third-party bulk data.

## Phase 0: Protect the Baseline

### Task 0.1: Separate existing work

Before feature changes:

1. Inspect `git status`, staged changes, generated files, and the current diff.
2. Preserve the existing WebKit DMABUF implementation and README change as
   their own work.
3. Do not stage `AGENTS.md`, `src-tauri/gen/`, or the existing
   `src-tauri/Cargo.toml` modification unless explicitly reviewed as part of a
   task.
4. Run and record the current verification suite.

### Verification

```sh
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
npm test
node --check app.js
```

## Phase 1: Introduce the Workspace State Model

### Task 1.1: Define a pure workspace state module

**Files**

- Add `frontend/workspace-state.js`.
- Add `frontend-tests/workspace-state.test.js`.

**RED**

Write tests for:

- migrating the current `panels` array so the first panel becomes `mainPanel`;
- moving remaining panels into `auxiliaryPanels`;
- preserving every Bible panel's reference, translations, layout, history,
  and width;
- creating default main-only state;
- adding multiple auxiliary Bible panels;
- reusing one notes panel and changing only its reference;
- reusing one analysis panel and changing only its reference;
- closing the last auxiliary panel and collapsing the auxiliary region;
- validating panel order and normalized size values;
- retaining unknown future state fields without allowing invalid panel types.

Run:

```sh
node --test frontend-tests/workspace-state.test.js
```

Confirm the tests fail because the module does not exist.

**GREEN**

Implement pure state transformations with no DOM access. Keep stable panel IDs
and version the saved workspace shape.

### Task 1.2: Render the main and auxiliary regions

**Files**

- Update `index.html`.
- Update `styles.css`.
- Update `app.js`.
- Extend `frontend-tests/workspace-state.test.js` with layout-derived state
  tests where possible.

**RED**

Add tests for calculated auxiliary visibility, normalized splitter ratios, and
minimum auxiliary heights. Use a short manual browser checklist for behavior
that requires layout measurement.

**GREEN**

1. Replace the single horizontal track with a workspace shell containing:
   - one full-height main region;
   - one optional auxiliary region;
   - a draggable vertical boundary;
   - vertically stacked auxiliary panel hosts.
2. Reuse the current Bible-panel renderer for both regions.
3. Restrict auxiliary resizing to animation frames.
4. Persist final sizes after pointer interaction rather than on every move.
5. Add small-screen main/auxiliary tab controls.

### Task 1.3: Verify current reader parity

Manually verify:

- navigation and passage history in main and auxiliary Bibles;
- translation ordering, highlight, dim, and verse layout;
- add, remove, and move Bible panels;
- search result navigation targets the active Bible panel;
- selection and copy;
- restart state migration;
- desktop, touch, and minimum-width behavior.

Do not proceed until existing reader flows pass.

## Phase 2: Add Versioned Notes Storage

### Task 2.1: Migrate `user.db`

**Files**

- Add `src-tauri/src/notes.rs`.
- Update `src-tauri/src/lib.rs`.
- Update `src-tauri/src/services.rs`.
- Update `src-tauri/src/settings.rs` only where schema ownership requires it.

**RED**

Add Rust tests for:

- opening a schema-1 `user.db` and adding the notes schema;
- preserving the existing settings row byte-for-byte;
- rolling back a deliberately failed migration;
- creating notes storage in a new database;
- rejecting unsupported future schema versions;
- validating canonical `book`, `chapter`, and `verse` reference keys.

Then add tests for:

- loading a missing note as `None`;
- inserting and updating exactly one note per reference;
- preserving `created_at` while advancing `updated_at`;
- deleting a note when trimmed Markdown is empty;
- rejecting a scope/reference mismatch;
- listing chapter descendant notes in verse order;
- listing book descendants grouped in canonical chapter/verse order;
- generating short plain-text previews without Markdown syntax.

Run:

```sh
cargo test -p bible-desktop notes
```

**GREEN**

Implement a typed `NoteReference`, transactional migration, note CRUD, and
descendant indexes. Keep note content outside the settings JSON.

### Task 2.2: Expose note commands

**Files**

- Update `src-tauri/src/commands.rs`.
- Update `src-tauri/src/services.rs`.
- Update `src-tauri/src/lib.rs`.
- Update `desktop-api.js`.
- Update `frontend-tests/desktop-api.test.js`.

**RED**

Extend the frontend API test with:

- `get_note`;
- `save_note`;
- `delete_note`;
- `get_descendant_notes`.

Add Rust service tests for reference validation and error mapping.

**GREEN**

Add narrow typed Tauri commands. Enforce maximum Markdown payload size at the
Rust boundary.

## Phase 3: Build the Notes Panel

### Task 3.1: Add pure notes UI behavior

**Files**

- Add `frontend/notes-ui.js`.
- Add `frontend-tests/notes-ui.test.js`.

**RED**

Test:

- reference labels for book, chapter, and verse notes;
- Markdown draft state independent from persisted content;
- dirty, saving, saved, and failed states;
- a pending save flush before reference changes;
- stale save responses not overwriting a newer draft;
- descendant preview view models;
- empty-note deletion intent.

**GREEN**

Implement state and controller logic against an injected desktop API and timer.
Avoid DOM access in the state transition layer.

### Task 3.2: Render and reuse one notes panel

**Files**

- Update `index.html`.
- Update `styles.css`.
- Update `app.js`.
- Update `frontend/notes-ui.js`.

**Work**

1. Add book, chapter, and verse note controls.
2. Open or retarget the one auxiliary notes panel.
3. Add Markdown edit and read modes.
4. Render Markdown safely. Prefer Rust-side `pulldown-cmark` plus sanitization,
   or a reviewed locally bundled renderer; do not inject unsanitized HTML.
5. Add autosave with a short debounce, visible status, retry, and reference
   change flushing.
6. Render generated descendant indexes below the document.
7. Navigate the main Bible and notes panel together when a descendant is
   selected.

### Task 3.3: Notes manual verification

Verify book, chapter, and verse notes across restart, rapid reference changes,
save failures, deletion, empty notes, Korean Markdown, long documents, and
small-screen auxiliary tabs.

## Phase 4: Implement Notes Archives

### Task 4.1: Build archive domain logic

**Files**

- Add `src-tauri/src/archive.rs`.
- Update `src-tauri/Cargo.toml` with reviewed archive and checksum dependencies.
- Add tests in `src-tauri/src/archive.rs`.

**RED**

Use real temporary ZIP files and databases. Test:

- deterministic manifest construction;
- canonical Markdown paths and frontmatter;
- export followed by import inspection returning identical notes;
- unsupported format versions;
- missing, extra, and duplicate manifest entries;
- invalid UTF-8 and checksum mismatch;
- absolute paths, `..`, symlinks, and path traversal;
- compressed and expanded size limits;
- excessive file count and individual note size;
- invalid book/chapter/verse references;
- conflict classification;
- keep-current, replace-imported, and add-non-conflicting policies;
- no live DB changes before apply;
- all-or-nothing rollback during apply.

**GREEN**

Implement:

- archive value types independent of Tauri;
- temporary export plus atomic destination replacement;
- full inspection before database mutation;
- a short-lived validated import plan identified by an opaque ID;
- one-transaction apply.

Do not accept an arbitrary frontend-provided list of unchecked extracted
files.

### Task 4.2: Add native file selection and commands

**Files**

- Update `src-tauri/Cargo.toml`.
- Update `src-tauri/src/lib.rs`.
- Update `src-tauri/src/commands.rs`.
- Update `src-tauri/capabilities/default.json`.
- Update `desktop-api.js`.
- Update `frontend-tests/desktop-api.test.js`.

Add the minimum Tauri dialog capability needed for a user-selected export or
import path. Do not grant broad filesystem permissions.

### Task 4.3: Add archive UI

**Files**

- Update `frontend/notes-ui.js`.
- Update `frontend-tests/notes-ui.test.js`.
- Update `index.html`, `styles.css`, and `app.js`.

Test and implement:

- export progress, completion, cancel, and failure;
- import inspection;
- conflict counts and previews;
- explicit policy selection before apply;
- post-import note/index refresh.

## Phase 5: Define and Fetch Original-language Sources

### Task 5.1: Commit source provenance

**Files**

- Add `data/original-sources.json`.
- Add `docs/attribution/original-language-sources.md`.
- Add validation tests in the database builder.

Record exact upstream files and revisions only after inspecting their current
format and license files. Required categories:

- OSHB Hebrew/Aramaic text and morphology;
- STEPBible tagged Hebrew/Aramaic and Greek text;
- STEPBible brief Hebrew and Greek lexicons;
- STEPBible Hebrew and Greek morphology descriptions;
- official Berean interlinear alignment resources, if their downloadable
  source exposes the verified English ordering.

The manifest must include SHA-256 checksums. If a suitable redistributable
English-order alignment file is not available, mark English order unavailable
and ship original order rather than substituting scraped or inferred data.

### Task 5.2: Add a reproducible fetcher

**Files**

- Add `scripts/fetch_original_sources.py`.
- Update `.gitignore`.
- Update `README.md`.

The fetcher:

- downloads only manifest-listed URLs;
- verifies checksums before replacing cached files;
- uses a temporary file and atomic rename;
- reports licenses and revisions;
- supports an offline `--verify-only` mode;
- never downloads during application startup or AppImage execution.

Test the parsing and checksum logic with a local fixture; avoid live-network
tests in the normal suite.

## Phase 6: Extend the Corpus Builder

### Task 6.1: Add schema-2 original-language tables

**Files**

- Add `tools/bible-db-builder/src/original.rs`.
- Update `tools/bible-db-builder/src/lib.rs`.
- Update `tools/bible-db-builder/src/main.rs`.
- Add small fixtures under `tools/bible-db-builder/tests/fixtures/original/`.

**RED**

Build a fixture containing:

- one Hebrew verse;
- one Biblical Aramaic verse;
- one Greek verse;
- one-to-one, one-to-many, and many-to-one English alignments;
- a traditional and extended Strong's relationship;
- known morphology and lexicon entries.

Test:

- token preservation and original positions;
- language classification;
- right-to-left text preservation without normalization damage;
- English group order and many-to-many joins;
- Strong's and morphology integrity;
- source attribution rows;
- indexes used by verse and occurrence queries;
- schema version 2;
- reproducible output from identical inputs.

**GREEN**

Create normalized original-language tables and indexes. Insert existing
translation rows unchanged. Use a single build transaction followed by
foreign-key and quick integrity checks.

### Task 6.2: Parse each upstream format independently

For each dataset:

1. Write a fixture and a failing parser test.
2. Parse typed records with source file and line/record context in every error.
3. Normalize identifiers without removing Hebrew cantillation or Greek
   diacritics from display text.
4. Map source versification explicitly.
5. Reject duplicate token IDs, missing references, and unknown required codes.
6. Verify whole-corpus counts against source metadata.

Keep source-specific parsing out of the application runtime.

### Task 6.3: Build and inspect the real corpus

Generate `src-tauri/resources/bible.db`, run database integrity checks, and
record:

- rows by language;
- coverage by book and verse;
- aligned versus original-only verses;
- unmatched Strong's and morphology codes;
- source versions and checksums;
- output size and build duration.

Stop for review if any canonical verse coverage or referential integrity check
fails.

## Phase 7: Add Original-language Runtime Queries

### Task 7.1: Query compact chapter interlinear data

**Files**

- Add `src-tauri/src/original_language.rs`.
- Update `src-tauri/src/corpus.rs`.
- Update `src-tauri/src/services.rs`.

**RED**

Using the builder fixture, test:

- English-order groups for aligned verses;
- explicit original-order fallback status;
- every source token appears exactly once in the compact result;
- Hebrew/Aramaic/Greek language values;
- chapter and reference validation;
- ordinary `get_chapter` response remains unchanged.

**GREEN**

Return a compact typed chapter response only on explicit request.

### Task 7.2: Query complete verse analysis

**RED**

Test original-order tokens, surface text, lemma, transliteration, Strong's,
morphology descriptions, contextual gloss, and source attribution. Verify
Hebrew and Aramaic verses retain source order independently of visual RTL.

**GREEN**

Add one indexed verse-analysis query.

### Task 7.3: Query lexicon and occurrences

**RED**

Test:

- extended Strong's lookup;
- traditional Strong's display compatibility;
- missing entry behavior;
- language separation;
- frequency count;
- canonical paged occurrences;
- maximum page size.

**GREEN**

Implement indexed, paginated queries.

### Task 7.4: Expose commands and frontend API

Update:

- `src-tauri/src/commands.rs`;
- `src-tauri/src/lib.rs`;
- `desktop-api.js`;
- `frontend-tests/desktop-api.test.js`.

Commands:

- `get_original_chapter`;
- `get_verse_analysis`;
- `get_lexicon_entry`;
- `get_lexicon_occurrences`.

Validate all enum values, ranges, and page limits in Rust.

## Phase 8: Render Compact English-order Interlinear

### Task 8.1: Add pure interlinear view models

**Files**

- Add `frontend/original-language-ui.js`.
- Add `frontend-tests/original-language-ui.test.js`.

**RED**

Test:

- Old Testament Hebrew/Aramaic and New Testament Greek availability;
- English-order alignment group rendering;
- one-to-many and many-to-one token grouping;
- original-only fallback labels;
- stable token and group keys;
- compact surface, transliteration, and gloss labels;
- stale chapter response rejection.

**GREEN**

Implement view-model transformations independently from DOM rendering.

### Task 8.2: Add original-language controls and chapter rendering

**Files**

- Update `app.js`, `index.html`, and `styles.css`.
- Update saved panel-state migration.

Add:

- `Hebrew/Aramaic` availability in the Old Testament;
- `Greek` availability in the New Testament;
- compact English-order lines;
- visible `English order` or `Original order only` status;
- double-click and explicit detail controls;
- chapter cache keys that distinguish ordinary and original-language data.

Do not make original-language data part of every chapter request.

## Phase 9: Build the Verse-analysis Panel

### Task 9.1: Add analysis controller behavior

**Files**

- Extend `frontend/original-language-ui.js`.
- Extend `frontend-tests/original-language-ui.test.js`.

**RED**

Test:

- reusing one analysis panel while changing reference;
- stale verse-analysis and lexicon response rejection;
- token selection;
- RTL/LTR direction selection by language;
- lexicon detail state;
- paged occurrence loading and deduplication;
- occurrence navigation intent.

**GREEN**

Implement controller state against the injected desktop API.

### Task 9.2: Render original-order analysis

**Files**

- Update `index.html`, `styles.css`, and `app.js`.

Render:

- the complete verse in original order;
- Hebrew/Aramaic RTL and Greek LTR;
- selectable word units;
- surface form, transliteration, gloss, Strong's, and morphology;
- detailed English lexicon content;
- frequency and paged occurrences;
- source attribution;
- main Bible navigation from an occurrence.

Verify keyboard navigation, visible focus, screen-reader labels, text
selection, and touch activation. Double-click remains a shortcut, never the
only way to open analysis.

## Phase 10: Integration, Performance, and Packaging

### Task 10.1: Full automated verification

```sh
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
npm test
node --check app.js
```

Add targeted checks for any new JavaScript modules.

### Task 10.2: Measure performance

Compare with `docs/performance/2026-07-25-linux-baseline.md`:

- cold startup to first passage;
- ordinary chapter query and render;
- two-translation and all-translation search;
- compact original-language chapter query;
- complete verse analysis;
- lexicon occurrence first page;
- resize and scroll responsiveness.

Existing ordinary reading and search measurements may regress by no more than
ten percent. Local complete verse analysis must stay below 100 ms on the
reference system.

### Task 10.3: Migration and recovery matrix

Manually test:

- clean profile;
- current schema-1 `user.db`;
- saved one-panel and multi-panel layouts;
- missing optional original-language data;
- incomplete English alignment;
- unknown morphology or lexicon code;
- note save failure and retry;
- corrupt import archive;
- export/import between separate clean profiles.

### Task 10.4: AppImage acceptance

Build and run:

```sh
cargo tauri build
```

Verify the AppImage:

- starts without the repository or a local server;
- applies the Linux WebKit DMABUF stability setting;
- contains corpus source attributions;
- reads existing translations;
- opens and persists notes;
- exports and imports note archives through native dialogs;
- renders Hebrew, Aramaic, and Greek offline;
- preserves notes when the AppImage is replaced.

## Completion Definition

Implementation is complete only when:

- every behavioral task has a test observed failing before production code;
- all focused and full test suites pass without warnings;
- the existing reader parity checklist passes;
- real source provenance and corpus integrity reports are recorded;
- performance targets pass;
- migration and archive recovery cases pass;
- a packaged AppImage completes the end-to-end acceptance flow;
- no unrelated worktree files are included in feature commits.
