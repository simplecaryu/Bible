# Upstream review — 2026-09-05

Compared the previously fetched upstream snapshot
`19cd34cba27a49d2b8caef57ccf7c87d9df7108e` (August 19) with
[September 3 upstream](https://github.com/Newhyuck2/unitedbibles/tree/4f2bf4db499e3201f112a8084b7b681d88a4e720)
(`version.json`: `20260903-1`). The current upstream history contains one `Deploy`
commit, so these are file differences between snapshots, not a chronological
commit review. Our app source was reviewed at `8ea1b48b`.

| Upstream addition/change | Benefit and recommendation for our desktop fork |
| --- | --- |
| Panel presets enforce a 320px minimum and clear stale presets when the window narrows | First priority: prevents crowded or overflowing panel controls. Our drag resize has a minimum, but preset sizing does not apply it. |
| Per-panel menu with translation-label visibility | Small, useful reading-density improvement. Persist the preference through our existing SQLite-backed workspace state. |
| Continuous reading mode for unlinked panels, with a translation picker and optional numbering | Good next feature: read prose in one panel while studying in another. Our frontend currently has no reading-mode implementation. |
| Reset keeps the leftmost panel's passage/translations and retains preferences | A gentler way to simplify a busy workspace. Review against our current reset behavior before adopting. |
| Linked-panel collapse/expand animation and width restoration | Useful polish; verify verse alignment and saved widths in the desktop layout. |
| Concordance result navigation can choose a destination panel; search and Strong's fields gain clear controls | Helpful study-navigation polish. Adapt to our dedicated study area and preview rather than transplanting the web dialog code. |
| Hebrew interlinear tokens now include morphology, plus STEPBible Hebrew/Aramaic morphology expansion | Upstream has filled a previous gap. Our SQLite corpus already imports STEPBible morphology descriptions, so use this as a source of comparison cases for compound tags rather than replacing our data pipeline. |

Evidence is in upstream `app.js` (`applyDesktopPanelWidths`,
`readingModeEligible`, `toggleTranslationNamesShown`, `resetSite`,
`applyLinkedPartnersVisibility`, `buildConcordanceResultRow`, and
`expandStepBibleHebrewMorphology`), `index.html`, and the interlinear chapter JSON.
For example, Genesis 1:1 changes from four-element word tuples to five-element
tuples containing tags such as `HR/Ncfsa` and `HVqp3ms`.

Across these snapshots, `data/manifest.json`, `data/strongs.json`, and `data/tsk/`
have no changes. This does not mean they match our older pinned data source:
our provenance documentation still applies. No new Bible translation is indicated
by the manifest comparison. No upstream code or corpus data was imported as part
of this review/release.

Our fork already provides offline SQLite search and original-language study,
TSK navigation, linked Markdown notes and ZIP backup/restore, personal-data folder
sync, and the August 23 cross-reference action-rail fix with the `C` shortcut.
The two codebases now differ substantially; selective reimplementation is more
appropriate than merging the upstream deployment snapshot wholesale.

The development gap is delivery: GitHub had only August 1 preview binaries and
`main` was two commits behind this checkout. The repository has frontend and Rust
tests, but its only GitHub workflow deploys Pages. Publishing a tagged AppImage
with checksums closes the immediate download gap; desktop CI and release
automation should be the next process improvement.
