# Reading Workspace Feedback Design

## Goals

Improve the reading workspace without changing its main-panel and auxiliary-panel model:

1. Treat original-language interlinear text as a per-Bible-panel selectable source.
2. Keep verse analysis usable when it shares the auxiliary column with another Bible.
3. Make the main/auxiliary divider resize the actual columns continuously.
4. Open verse analysis in original manuscript order by default.
5. Add a verse-note keyboard shortcut and visible note-presence markers.

Original-word concordance search is explicitly outside this change. The existing token detail continues to expose Strong's data and corpus occurrence counts.

## Original-language selection

Each Bible panel gains an `Original` pseudo-translation in its version picker. It is enabled by default for new panels and for saved panels that predate this setting. The setting is persisted per panel. When disabled, the panel neither requests nor renders original-language chapter data. The existing inline interlinear remains translation-ordered because it accompanies translated text.

## Verse analysis layout and order

Opening an inline interlinear selects `Original order` by default. The translation-order tab remains available.

The analysis panel uses bounded grid tracks with independent scrolling for the token collection and selected-token details. Neither region has a fixed minimum height that can force it over the other when the analysis panel occupies half of the auxiliary column.

## Workspace resizing

The divider stores the existing auxiliary ratio, but grid columns use that ratio directly instead of rounding it into fifths. Pointer movement therefore changes both the divider and the actual panel widths continuously. The existing 35–75% main-panel bounds remain.

## Notes

Pressing unmodified `N` opens the current verse note for the active Bible panel and focuses the Markdown editor. The shortcut is ignored in editable controls and while a dialog is open.

For the visible chapter, the app loads book-note, chapter-note, and verse-note presence. Existing notes receive a small persistent marker on their corresponding buttons. Presence is refreshed after a note is saved, deleted, or imported. The marker is represented in both visual styling and accessible labels.

## Testing

- Unit tests cover selectable-original migration and request decisions, continuous grid ratios, analysis default order, shortcut eligibility, and note-presence mapping.
- Existing frontend, Rust, formatting, and lint suites remain green.
- The packaged AppImage is tested at one Bible panel and at Bible + Bible + analysis layouts, including divider dragging, token selection, original toggling, note shortcut, and note markers.
