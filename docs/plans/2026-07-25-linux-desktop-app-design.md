# Linux Desktop Bible App Design

## Summary

Convert the current static Bible comparison website into an offline-first Linux
desktop application. Preserve the existing HTML, CSS, and interaction model.
Replace browser JSON loading and the search Web Worker with a Tauri Rust backend
that reads a bundled, read-only SQLite database.

The first release provides feature parity with the current website:

- side-by-side Bible panels;
- per-panel translation selection and ordering;
- stacked and column verse layouts;
- passage and history navigation;
- verse selection and copying;
- exact substring search;
- persistent layout and reading state.

Notes, bookmarks, commentary, and video integrations are not part of the first
release. They remain possible extensions, but must not affect the offline core.

## Goals

- Run fully offline after installation.
- Show the first passage within one second on a typical Linux laptop.
- Change chapters within 100 ms.
- Search two translations within 100 ms.
- Search every installed translation within 300 ms.
- Keep scrolling and panel movement at 60 frames per second.
- Preserve the current UI and behavior as closely as possible.
- Keep local reading and search independent from all future online services.

## Non-goals

- Rewriting the UI in a native Rust GUI toolkit.
- Supporting Windows or macOS in the first release.
- Adding notes, bookmarks, commentary, or video features.
- Adding stemming, morphology, fuzzy matching, or boolean search.
- Shipping automatic application updates in the first release.
- Building a search server or requiring a local HTTP server.

## Chosen Approach

Use Tauri with the existing web frontend and a Rust backend.

This approach retains the mature panel and touch interactions in `app.js` and
the existing styles, while removing the runtime dependency on exported chapter
and search JSON files. A fully native Rust UI would require recreating the
current interaction model for little expected performance benefit. Keeping a
local web server would preserve unnecessary process, port, and browser
lifecycle concerns.

## Architecture

```text
Tauri application
├── Existing HTML, CSS, and JavaScript frontend
│   ├── Panels and navigation
│   ├── Translation controls
│   ├── Search result presentation
│   └── Copy and settings UI
├── Rust backend
│   ├── Chapter queries
│   ├── Substring search
│   ├── Database validation and migrations
│   └── User-setting persistence
├── bible.db
│   └── Bundled, immutable Bible content
└── user.db
    └── Mutable local application state
```

The frontend requests data through narrow Tauri commands. It does not read
SQLite directly and does not fetch local JSON over HTTP.

## Data Design

### Bible database

`bible.db` is bundled as an application resource and opened read-only. Its
runtime schema contains explicit translation and book metadata plus verses:

```text
translations
books
verses
  translation_id
  book_id
  chapter
  verse
  text
  search_text
```

The database primary and secondary indexes must support fetching one chapter
for a selected set of translations without scanning unrelated verses.

`search_text` is generated ahead of time using the same Unicode normalization
and case-folding policy as the application search. SQLite's built-in
case-conversion behavior is not used for multilingual normalization.

The current `data.db` contains empty `notes`, `bookmarks`, and `library` tables.
These are not connected to the current UI and are not treated as implemented
features. Import bookkeeping such as `chapter_downloads` and source payloads in
`verse_blob` are not required in the packaged runtime database.

### User database

`user.db` is created in the standard per-user application data directory. The
first schema contains application settings and saved UI state. Bible data and
user data remain separate so an application or corpus update cannot overwrite
personal state.

Future notes and bookmarks belong in `user.db`, not `bible.db`.

## Data Flow

### Application startup

1. Locate and validate the bundled `bible.db`.
2. Create or migrate `user.db`.
3. Restore the last valid UI state, or use defaults.
4. Query the initial chapter for the enabled translations.
5. Render the existing panel UI.

Startup never waits for an internet connection.

### Chapter loading

The frontend sends the book, chapter, and selected translations to Rust. Rust
queries only those rows and returns a compact serializable chapter response.
The frontend renders it with the existing panel code.

A small in-process chapter cache may be retained, but local SQLite performance
must be measured before adding cache complexity.

### Search

The first implementation performs exact substring matching against precomputed
`search_text`. Rust reads only selected translations and preserves the current
book, chapter, verse, and translation result ordering. It also preserves the
current per-book, per-translation display limit and total match counts.

Implementation proceeds in this order:

1. Build a simple streaming scan.
2. Benchmark two-translation and all-translation searches.
3. Parallelize by translation only if the agreed target is missed.
4. Add a prebuilt trigram index only if scanning still misses the target.

This avoids committing to a larger index format without evidence that it is
needed.

## State Persistence

Panel locations, enabled translations, translation order, font size, layouts,
history, and other existing settings move from WebView `localStorage` to
`user.db`.

Frontend changes are applied immediately. Persistence may be debounced so
continuous drag, resize, or font-size operations do not create excessive
transactions. Writes use transactions and never modify `bible.db`.

## Error Handling

- A missing or invalid `bible.db` shows a repair-oriented startup error.
- An invalid `user.db` is preserved for diagnosis; the app starts with safe
  default settings rather than silently deleting it.
- A chapter or search failure is contained to the requesting view.
- User-facing messages remain concise; diagnostic details go to local logs.
- No online failure may block startup, reading, navigation, or local search.

## Future Online Features

Online features are added behind a separate provider boundary:

```text
OnlineContentProvider
├── commentary(reference)
├── videos(reference)
└── open_external(url)
```

Providers use explicit timeouts, domain allowlists, and independent caches.
Video links open in the system browser by default. In-app embedding is optional
and limited to providers whose policies and platform behavior support it.

Secrets are never stored in frontend JavaScript or `bible.db`. If future
providers require credentials, they use an operating-system secret store.

## Testing

### Rust tests

- Unicode normalization and substring matching.
- Chapter lookup and ordering.
- Search result ordering, limits, and counts.
- Read-only corpus database behavior.
- User database creation and migration.
- Recovery behavior for missing and invalid databases.

### Parity tests

Run representative searches through both the current Web Worker algorithm and
the Rust search implementation, then compare references, translations, text,
counts, truncation state, and ordering.

Exercise the current UI flows for:

- panel creation, removal, movement, and resizing;
- book, chapter, verse, and history navigation;
- translation selection, ordering, highlighting, and dimming;
- stacked and column layouts;
- search, result navigation, and copying;
- settings restoration after restart.

### Performance tests

Record:

- cold startup to first passage;
- chapter query and render latency;
- two-translation search latency;
- all-translation search latency;
- interaction frame rates during panel motion and scrolling.

CI reports both the absolute targets and regressions from a recorded baseline.
Because CI machines vary, an absolute timing miss begins as a warning rather
than an unconditional release failure.

## Linux Distribution

The first distributable is an AppImage containing:

- the Tauri executable;
- the existing frontend assets;
- `bible.db`.

Mutable data stays in the standard user data directory, so replacing the
AppImage preserves settings. The first release uses manual AppImage
replacement. Debian packages, Flatpak, and automatic updates are later
distribution improvements.

## Acceptance Criteria

- The application runs without a local web server.
- Reading, navigation, search, copying, and settings work without internet.
- Existing web-app behavior is preserved unless a reviewed desktop adaptation
  is necessary.
- The packaged application does not use chapter or search JSON at runtime.
- Bible and user data are stored separately.
- The agreed startup, navigation, search, and frame-rate targets are measured
  and met on the reference Linux system.
- Future online providers can be added without changing the local Bible query
  interfaces.
