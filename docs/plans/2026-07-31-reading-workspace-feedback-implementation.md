# Reading Workspace Feedback Implementation Plan

## 1. Extract testable UI policy

- Extend `workspace-state.js` with continuous grid sizing.
- Add a small reading-workspace policy module for original visibility, analysis defaults, note shortcut eligibility, and note presence.
- Write frontend tests first and verify each new expectation fails.

## 2. Original selector and analysis behavior

- Persist `showOriginal` per Bible panel, defaulting missing values to `true`.
- Add `Original` to the panel version picker without sending it to translation corpus APIs.
- Skip original chapter requests and rendering when disabled.
- Open verse analysis in original order by default.

## 3. Analysis and divider layout fixes

- Replace rounded workspace ratios with continuous fractional columns.
- Constrain analysis token and detail tracks and give each independent overflow.
- Verify Bible + Bible + analysis at constrained height.

## 4. Note shortcut and presence

- Load note presence for each visible chapter using existing note APIs.
- Render book, chapter, and verse markers and accessible labels.
- Add the unmodified `N` shortcut with editable/dialog guards.
- Refresh markers after save, deletion, and import.

## 5. Verification and packaging

- Run frontend and Rust tests, clippy, formatting, syntax, and diff checks.
- Build the AppImage.
- Exercise original toggle, original-order analysis, compact analysis layout, continuous divider resizing, `N`, and saved-note markers in the packaged app.
- Commit the implementation without staging user-owned or generated files.
