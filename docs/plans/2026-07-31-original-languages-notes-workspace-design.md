# Original Languages, Notes, and Auxiliary Workspace Design

## Summary

Extend the offline Linux Bible application with three connected capabilities:

1. Hebrew, Biblical Aramaic, and Greek interlinear study with Strong's numbers,
   morphology, English glosses, lexicon entries, and per-verse analysis.
2. One Markdown note per book, chapter, or verse, including automatic links
   from broader notes to narrower notes and portable backup.
3. A stable main reading panel on the left and a vertically split auxiliary
   workspace on the right for secondary Bibles, notes, and verse analysis.

The existing translation corpus remains unchanged. New original-language data
comes from redistributable datasets rather than copied Bible Hub pages.
Bible Hub and other online study or media integrations are deferred to a later
online-content feature.

## Goals

- Preserve the current offline-first reading, comparison, search, and copy
  workflows.
- Keep one primary Bible panel visible at full height.
- Allow secondary Bible panels, one reusable notes panel, and one reusable
  verse-analysis panel in a right-side workspace.
- Show a compact English-order interlinear in Bible panels.
- Show the complete verse in original order in a dedicated analysis panel.
- Support Hebrew right-to-left layout, Greek left-to-right layout, and
  accurate Biblical Aramaic identification.
- Provide Strong's identifiers, lemmas, transliteration, morphology,
  contextual glosses, English lexicon definitions, frequency, and occurrences.
- Store one durable Markdown note for each book, chapter, or verse.
- Generate links from chapter and book notes to their populated descendant
  notes without modifying the user's Markdown.
- Export and import all notes in a portable, human-readable archive.
- Keep ordinary chapter navigation and search performance within ten percent
  of the current baseline.

## Non-goals

- Scraping Bible Hub or embedding Bible Hub pages.
- Adding commentary, sermon video, or other online study providers.
- Translating full lexicon entries into Korean.
- Automatically aligning original words to every installed English, Korean,
  or Chinese translation.
- Supporting multiple independent notes for the same reference.
- Rich-text or WYSIWYG note editing.
- Pinning multiple notes or analysis panels in the first release.
- Synchronizing notes between devices or through a cloud service.

## Data Sources and Licensing

Use public-domain or openly licensed source datasets:

- Open Scriptures Hebrew Bible for the Westminster Leningrad Codex text,
  identifiers, lemmas, and morphology.
- STEPBible data for Hebrew, Aramaic, and Greek tagged texts, extended Strong's
  identifiers, morphology descriptions, brief English lexicons, glosses, and
  occurrence data.
- Official public-domain Berean interlinear resources for the English-order
  alignment where the downloadable source contains the required mapping.

Every imported dataset records its name, upstream version or revision,
license, attribution text, and source URL in the built corpus. The packaged
application exposes those attributions. Import tools fail when required
source metadata or expected columns are missing.

Original order is authoritative. English order is displayed only where a
verified alignment is present. A verse with incomplete or ambiguous alignment
falls back to original order and says so explicitly; the application does not
invent an alignment.

## Chosen Architecture

Extend the current Tauri application instead of adding an online service or a
second runtime database:

```text
Tauri application
├── Frontend
│   ├── Full-height main Bible panel
│   └── Right auxiliary workspace
│       ├── Zero or more secondary Bible panels
│       ├── One reusable verse-analysis panel
│       └── One reusable notes panel
├── Rust backend
│   ├── Existing chapter and search services
│   ├── Original-language and lexicon queries
│   ├── Notes and descendant-note indexes
│   └── Notes archive import/export
├── bible.db
│   ├── Existing translations
│   └── Immutable original-language study data
└── user.db
    ├── Existing UI settings
    ├── Workspace state
    └── Mutable Markdown notes
```

Keeping all immutable Bible content in `bible.db` preserves one resource
version and one integrity check. Keeping notes in `user.db` ensures corpus and
application updates cannot overwrite personal writing.

## Workspace Model

The main Bible panel always occupies the full height of the left side. The
auxiliary workspace appears only when it contains a panel.

```text
┌──────────────────── main Bible ────────────────────┬─ auxiliary Bible ─┐
│                                                   ├───────────────────┤
│                                                   │  verse analysis   │
│                                                   ├───────────────────┤
│                                                   │       notes       │
└───────────────────────────────────────────────────┴───────────────────┘
```

- Auxiliary panels split only the right side vertically.
- Users can resize the boundary between the main and auxiliary regions.
- Users can resize auxiliary panels vertically.
- Secondary Bible panels may have multiple instances.
- Notes and verse analysis each have at most one instance. A new request
  changes the reference in the existing panel.
- Closing the final auxiliary panel collapses the right workspace.
- Existing saved layouts migrate by making the first Bible the main panel and
  all remaining Bibles auxiliary panels.
- Small screens use a main/auxiliary tab switch rather than compressed
  side-by-side panes.
- Persisted state includes panel type, reference, ordering, sizes, and the
  selected small-screen tab.

Panel layout must remain usable at minimum sizes. When the right side contains
more panels than can fit, the auxiliary region scrolls rather than shrinking
panels below their minimum height.

## Original-language Data Model

Increment the bundled corpus schema version and add the following logical
tables.

### `original_tokens`

One row per source token:

- immutable token identifier;
- book, chapter, and verse;
- language: Hebrew, Aramaic, or Greek;
- original-order position;
- surface form;
- normalized form used for lookup;
- lemma;
- transliteration;
- extended Strong's identifier and compatible traditional Strong's number;
- morphology code;
- contextual English gloss;
- source dataset identifier.

### `interlinear_groups`

One row per verified English-order alignment group:

- verse reference;
- English-order position;
- English display text or gloss;
- alignment status and source.

### `interlinear_group_tokens`

A many-to-many relation between alignment groups and original tokens. This
represents one-to-many and many-to-one translation relationships without
duplicating or discarding source tokens.

### `lexicon_entries`

Entries keyed by language and extended Strong's identifier:

- lemma and transliteration;
- traditional Strong's number when available;
- short English definition;
- detailed English definition;
- source and attribution identifier.

### `morphology_entries`

Human-readable morphology descriptions keyed by language and morphology code.
The UI labels fields in Korean, while the source description remains English
for the first release.

### `content_sources`

Dataset name, version or revision, license identifier, attribution, source URL,
and build timestamp. This makes packaged data provenance inspectable.

All reference columns and Strong's links receive integrity checks during the
build. Chapter and verse indexes support a one-verse analysis query without
scanning unrelated tokens.

## Original-language Data Flow

Normal chapter requests continue to return only selected Bible translations.
This prevents the larger study dataset from affecting ordinary reading.

When an original-language display is enabled:

1. The frontend requests compact interlinear data for the visible chapter.
2. Rust returns English-order groups when the alignment is verified.
3. The frontend renders original text, transliteration, and short glosses.
4. Missing English alignment falls back visibly to original order.

When the user double-clicks the original-language verse or selects its detail
control:

1. The reusable analysis panel opens or changes reference.
2. The frontend requests the complete verse analysis.
3. Rust returns every token in original order plus morphology and lexicon
   summaries.
4. Hebrew and Aramaic render right-to-left; Greek renders left-to-right.
5. Selecting a token loads its detailed lexicon entry, corpus frequency, and
   paged occurrence list.
6. Selecting an occurrence navigates the main Bible panel to that reference.

Occurrence queries use the normalized extended Strong's identifier, preserving
traditional Strong's compatibility only as a display and external-link field.

## Notes Data Model

Migrate `user.db` transactionally and add one `notes` table:

```text
notes
  reference_key  PRIMARY KEY
  scope          book | chapter | verse
  book_id
  chapter        nullable
  verse          nullable
  markdown
  created_at
  updated_at
```

Canonical reference keys avoid SQLite's nullable-unique behavior:

- `book:0`
- `chapter:0:1`
- `verse:0:1:1`

Database constraints and Rust validation ensure the scope agrees with the
reference columns. An empty Markdown value deletes the note so empty notes do
not appear in indexes.

The current settings payload remains separate from notes. Workspace UI state
may continue in the debounced settings document; note content always uses
dedicated transactional commands.

## Notes Interaction

- Book and chapter selectors expose a note control for the current reference.
- Every verse number exposes a verse-note control.
- Selecting a control opens the reusable notes panel at that reference.
- The panel switches between Markdown editing and rendered reading.
- Editing uses a short debounce and displays `Saving`, `Saved`, or `Save
  failed`.
- A failed save keeps the unsaved text in memory and offers retry.
- Changing references flushes a pending save before loading another note.
- The panel shows created and updated times for non-empty notes.

The backend generates descendant-note indexes:

- A chapter note lists populated verse notes in verse order.
- A book note groups populated chapter and verse notes by chapter.
- Each entry includes the reference and a short plain-text preview.
- Selecting an entry navigates the main Bible and changes the notes panel to
  that note.
- Generated indexes remain separate from Markdown and never appear as
  duplicated content in exports.

## Notes Export and Import

Export produces an archive with a versioned manifest and readable Markdown:

```text
bible-notes/
├── manifest.json
└── books/
    └── 01-genesis/
        ├── book.md
        └── chapters/
            └── 001/
                ├── chapter.md
                └── verses/
                    └── 001.md
```

The manifest records format version, export time, application version, note
references, update times, and checksums. Markdown files contain minimal
frontmatter for round-trip identity while remaining readable in any editor.

Export writes to a temporary file and atomically moves only the completed
archive to the selected destination.

Import:

1. Rejects unsupported manifest versions, unsafe paths, duplicate references,
   invalid references, invalid UTF-8, checksum failures, and excessive file or
   archive sizes.
2. Loads and validates the complete archive without changing `user.db`.
3. Compares imported notes with current notes.
4. Shows conflicts before any write.
5. Applies one selected policy: keep current values, replace with imported
   values, or add only non-conflicting notes.
6. Commits the chosen result in one database transaction.

## Backend Interfaces

Add narrow Tauri commands through `AppServices`:

- compact original-language chapter data;
- complete original-order verse analysis;
- lexicon details and paged occurrences;
- load, save, and delete one note;
- descendant-note index for a chapter or book;
- export notes to a user-selected path;
- inspect a notes archive and return conflicts;
- apply a validated import plan.

The frontend never accesses SQLite or the filesystem directly. Rust validates
all reference ranges, enum values, archive paths, and payload sizes.

## Error Handling

- Missing or invalid optional original-language data disables original study
  controls but does not block Bible reading, search, or notes.
- Incomplete English alignment displays original order with a clear status.
- Unknown Strong's or morphology codes display the source code rather than
  hiding a word or guessing.
- Corpus source and parsing errors fail the build with the dataset and record
  location.
- A failed `user.db` migration rolls back fully.
- A note save failure retains the unsaved buffer in the WebView and allows a
  retry.
- Import validation occurs outside the live database transaction; application
  is all-or-nothing.
- Diagnostics contain technical detail while user messages remain concise and
  recovery-oriented.

## Performance

- Existing chapter navigation and search should regress by no more than ten
  percent from the recorded baseline.
- Original-language tables are queried only when their UI is enabled.
- A local complete verse-analysis query should complete within 100 ms.
- Lexicon occurrence results are paginated.
- The frontend renders one verse analysis at a time and avoids mounting
  lexicon details for unselected tokens.
- Auxiliary panel resize work stays inside animation frames and does not
  persist continuously; final sizes are saved after interaction.

## Implementation Sequence

1. Introduce the full-height main panel and right auxiliary workspace.
2. Add book, chapter, and verse Markdown notes with generated indexes.
3. Add archive export, inspection, conflict handling, and import.
4. Build source download, attribution, parsing, validation, and corpus
   generation tools for original-language datasets.
5. Add Rust original-language, lexicon, and occurrence queries.
6. Add compact English-order interlinear display to Bible panels.
7. Add the reusable original-order verse-analysis panel.
8. Run integration, performance, migration, and AppImage verification.

Each step ends with a runnable application and preserves existing behavior.

## Testing

### Data builder

- Source format and attribution validation.
- All 66 canonical books and supported versification mappings.
- Hebrew, Biblical Aramaic, and Greek language classification.
- Token order, alignment groups, and many-to-many mappings.
- Strong's, morphology, lexicon, and source foreign-key integrity.
- Explicit failure on incomplete required records.

### Rust

- English-order and original-order verse queries.
- Hebrew and Aramaic data preservation for right-to-left rendering.
- Greek data ordering.
- Lexicon detail, frequency, and paged occurrence queries.
- `user.db` migration rollback and preservation.
- One note per canonical reference.
- Descendant indexes and deletion of empty notes.
- Archive round trips, conflicts, corrupted archives, path traversal, size
  limits, and transactional import.

### Frontend

- Main-panel stability and right-only splitting.
- Auxiliary panel resize, reorder, close, and persistence.
- Reuse of notes and analysis panels.
- Migration of existing multi-Bible layouts.
- Small-screen main/auxiliary tabs.
- English-order rendering and explicit alignment fallback.
- Original-order analysis and token selection.
- Markdown edit/read states, autosave indicators, retry, and descendant links.

### Regression and manual verification

- Existing translation selection, panel navigation, search, copy, and state
  restoration.
- Existing performance baseline with and without original-language UI.
- Development execution and packaged AppImage.
- Export from one profile and import into a clean profile.

## Acceptance Criteria

- The left main Bible remains full height while all auxiliary content splits
  only the right workspace.
- Existing multi-panel saves migrate without losing Bible references or
  translation selections.
- Hebrew, Aramaic, and Greek study data works fully offline and exposes its
  source attribution.
- Compact interlinear content uses verified English alignment, and detailed
  analysis always preserves original order.
- Book, chapter, and verse notes survive restart and corpus replacement.
- Chapter and book notes automatically link to populated descendant notes.
- Notes export to readable Markdown and import transactionally with explicit
  conflict handling.
- Missing optional study data never prevents ordinary Bible reading or note
  access.
- Existing tests and the agreed performance targets pass.
