# Notes and Upstream Study Features Design

## Summary

Improve hierarchical-note usability and selectively adapt useful features from
the upstream web application to the existing Tauri desktop architecture.

The work has four independently releasable stages:

1. Collapse linked notes by default so they cannot crowd out the editor.
2. Add session search history and a shared destination-panel picker for
   reference results.
3. Add offline Treasury of Scripture Knowledge (TSK) cross references.
4. Enrich the existing word-study panel with classic Strong's fields and
   direct Strong-number browsing.

The Debian/XFCE-only arrow reported beside the note editor is deferred because
it is not reproducible in the current HTML/CSS or Chromium diagnostic render
and is not materially disruptive.

## Constraints and Existing Capabilities

The desktop branch already has persistent per-panel passage history, original
language analysis, paged Strong occurrence lookup, morphology filtering, and a
lower Bible preview. Those capabilities remain authoritative and are not
replaced by the upstream web implementations.

The upstream branch is a static web application and stores its study data in
thousands of JSON files. The desktop application instead packages one immutable
`bible.db` and exposes bounded Rust commands. New study data follows the desktop
pattern rather than copying the upstream runtime architecture.

## Linked Notes

When a book or chapter note has descendants, the panel shows one disclosure
button labelled `연결된 메모 N개 · 열기`. A newly opened reference starts
collapsed. Activating the button expands the existing linked-note buttons and
changes the action label to `접기`.

Refreshing descendants for the same reference preserves the current disclosure
state. Switching to another reference resets it to collapsed. With no
descendants, the disclosure section remains hidden. The expanded list scrolls
independently and cannot occupy more than forty percent of the notes panel,
leaving the editor or preview usable.

The disclosure uses explicit Korean action text instead of an arrow icon. Its
button exposes `aria-expanded` and controls the linked-note list.

## Shared Result Navigation

Search, TSK, and Strong occurrence results share a destination picker. It lists
the active Bible panel first, every other ordinary Bible panel, and an action to
create a new auxiliary Bible panel. Temporary occurrence-preview panels are not
valid destinations.

Choosing a destination closes the picker, closes the source dialog or panel
when appropriate, activates the selected Bible panel, and navigates with normal
history recording. Cancelling the picker leaves the source view unchanged.

Search history is session-local and stores the query and selected translation
order. Submitting after stepping backward truncates the forward branch. The
history is capped at fifty entries and is not written to personal-data sync.

## TSK Cross References

### Data

The build pipeline imports the public-domain classic Treasury of Scripture
Knowledge data into `bible.db`. Raw target notation is parsed during the build,
not at runtime. Each record preserves:

- source book, chapter, and verse;
- KJV anchor phrase and source order;
- normalized target book, chapter, start verse, optional end verse, and order;
- content-source attribution.

Malformed source references fail the database build with a location-specific
error. Runtime queries never interpret the upstream shorthand.

### Backend

A bounded Tauri command accepts a canonical source reference plus a small list
of translation identifiers. Rust returns ordered anchor groups whose targets
include the requested verse text where available. Invalid references,
translations, or oversized requests are rejected before querying SQLite.

No TSK entry is a successful empty result. Database failures surface as a
retryable frontend error without closing other tools.

### Frontend

Each verse exposes a compact cross-reference action. It opens one reusable
cross-reference tool panel in the auxiliary workspace. The panel shows the
source verse, anchor groups, result references and texts, copy actions, and
shared destination-picker actions.

The panel maintains an in-memory, one-hundred-entry passage history with back
and forward controls. Opening a new source after going back truncates its
forward branch. Closing the panel discards this tool history.

## Strong's Enrichment

The existing STEP-based token, morphology, and occurrence data remains the
source for verse analysis. A classic Strong's source augments lexicon entries
with optional pronunciation, derivation, and KJV rendering fields. Its source,
license, and revision are recorded in `content_sources`; UI attribution remains
available with the existing original-language source metadata.

The word-study panel gains a Strong-number navigator that accepts canonical
`H` or `G` codes, skips absent numbers when moving backward or forward, and can
open linked codes found in derivation text. Direct lookup uses the existing
analysis panel and occurrence list rather than introducing a second dictionary
dialog.

Open Scriptures Strong's digitization is CC BY-SA. The importer and packaged
attribution must retain that notice. The Englishman's concordance export is not
included because the existing corpus occurrence query already provides the
same primary workflow without another data copy.

## Error Handling

- Linked-note disclosure state never affects note persistence.
- Stale note and tool-panel requests cannot replace a newer reference.
- Empty TSK and Strong results have distinct empty states.
- Retry actions repeat only the failed read.
- A failed destination navigation leaves the source result available.
- Schema or source-data errors stop corpus construction rather than producing a
  partially valid database.

## Verification

Use test-driven development for each stage.

- Frontend unit tests cover disclosure state, search history branching and
  limits, result destination selection, TSK history, and Strong code parsing.
- Rust unit and integration tests cover source parsing, schema creation,
  ordered TSK queries, translation validation, lexicon enrichment, and absent
  Strong numbers.
- Existing frontend and Rust suites remain green after every stage.
- Final verification includes JavaScript syntax checks, a release AppImage
  build, an isolated-profile launch, and browser/WebKit layout inspection with
  many linked notes and cross-reference results.
- A short Debian/XFCE checklist covers the native WebKit rendering that cannot
  be reproduced on the development desktop.

## Deferred Work

- The unexplained Debian/XFCE note-editor arrow.
- Upstream original-language split view.
- A separate Englishman's concordance data set.
- Bible Hub or other online links.
- Mobile-only upstream layout refinements.
