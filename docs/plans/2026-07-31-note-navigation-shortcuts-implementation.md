# Note Navigation and Close Shortcut Implementation Plan

## 1. Protect note state and refresh linked notes

- Add frontend controller tests proving that reopening the same reference preserves a dirty draft.
- Add a test proving descendant-only refresh preserves the current draft and rejects stale responses.
- Implement same-reference no-op behavior and a descendant refresh method in `notes-ui.js`.
- Refresh linked notes when the same chapter or book note is opened again, without reloading its draft.

## 2. Target the last clicked verse

- Add pure tests for resolving the note target from a panel's last interacted verse with navigation fallback.
- Record the last clicked verse in both range and individual selection modes.
- Reset that value when navigation changes book or chapter.
- Use the resolved target for `N` without reloading an already-open note.

## 3. Add context-aware `Ctrl+W`

- Add pure tests for close-target priority.
- Track the most recently used tool panel.
- Close notes or analysis first, otherwise close the active non-main Bible panel.
- Preserve modal and main-panel safety behavior.

## 4. Verify and package

- Run frontend unit tests and Rust tests.
- Run the release build and confirm the AppImage artifact exists.
- Review the diff for unrelated generated or user-owned files before committing.
