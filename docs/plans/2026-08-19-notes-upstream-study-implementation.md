# Notes and Upstream Study Features Implementation Plan

## Phase 1: Linked-note disclosure

1. Add failing frontend tests for disclosure initialization, reference changes,
   same-reference refreshes, and labels.
2. Add a small pure disclosure-state helper to `notes-ui.js`.
3. Replace the static descendant heading in `index.html` with an accessible
   disclosure button and controlled list.
4. Wire disclosure rendering and clicks in `app.js`.
5. Constrain the expanded list in `styles.css` and verify the editor retains
   usable height.
6. Run the focused notes tests and the complete frontend suite.

## Phase 2: Search history and destination picker

1. Add failing tests for a reusable bounded branching-history helper.
2. Implement the helper in `workspace-state.js` and integrate it with searches.
3. Add back/forward search controls with disabled and accessible states.
4. Add failing tests for ordinary-panel destination enumeration and selection.
5. Implement a shared destination dialog that excludes tool and occurrence
   preview panels.
6. Route search results through the picker while retaining copy behavior.
7. Run focused and complete frontend tests.

## Phase 3: TSK data and tool panel

1. Add builder RED tests for normalized cross-reference records, ordering, and
   malformed references.
2. Extend the corpus schema and builder input with source, anchor, and target
   tables plus lookup indexes.
3. Convert the upstream public-domain TSK export into a compact builder input
   and record attribution.
4. Add RED corpus and command tests for empty, ordered, translated, and invalid
   cross-reference requests.
5. Implement Rust models, queries, services, commands, and desktop API binding.
6. Add frontend RED tests for TSK history and stale-request behavior.
7. Add the reusable cross-reference panel, verse action, history controls,
   result copy, retry/empty states, and destination-picker routing.
8. Run frontend, builder, and Tauri test suites and inspect packaged DB size.

## Phase 4: Strong's enrichment and browsing

1. Add builder RED tests for optional classic Strong's fields and source
   attribution.
2. Extend lexicon schema/import records without changing existing STEP token
   ownership.
3. Add RED query and command tests for direct canonical lookup and nearest
   previous/next valid code.
4. Implement bounded Rust lookup APIs and desktop bindings.
5. Add frontend RED tests for code parsing, language switching, absent-code
   behavior, and linked derivation codes.
6. Add the navigator and enriched fields to the existing analysis panel.
7. Keep existing occurrence paging, morphology filters, and lower preview
   unchanged.
8. Run all automated suites and verify attribution output.

## Final release verification

1. Run `npm test` and JavaScript syntax checks.
2. Run all workspace Rust tests.
3. Build the release AppImage.
4. Launch with isolated XDG data/config directories.
5. Verify linked-note collapse, search history branching, destination routing,
   TSK navigation, Strong-number browsing, and workspace resizing.
6. Record any Debian/XFCE-only observations separately from cross-platform
   regressions.
