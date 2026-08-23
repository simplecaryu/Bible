# Cross-Reference Click and Shortcut Implementation Plan

## 1. Add failing shortcut-policy tests

- Test lowercase and uppercase unmodified `C` outside editable controls.
- Test modifier, dialog, interactive-control, and content-editable guards.
- Run the focused test and confirm it fails because the policy helper is absent.

## 2. Add a failing action-rail regression test

- Require note and cross-reference controls to be appended to one verse action container.
- Require the action rail to remain inside the verse and reject the obsolete `top: 60px` cross-reference placement.
- Run the focused test and confirm the current markup and CSS fail it.

## 3. Implement the minimal fix

- Add the pure cross-reference shortcut policy helper.
- Wrap the existing verse note and cross-reference controls in the compact action rail.
- Update CSS so the rail and both hit targets stay inside short verse rows.
- Add the document-level `C` handler using the existing active-panel, verse-target, and cross-reference paths.

## 4. Verify

- Run the focused shortcut and layout tests.
- Run the complete frontend test suite.
- Reproduce the app with a temporary desktop API mock and verify click hit-testing and `C` behavior in a browser.
- Review the final diff without touching unrelated `AGENTS.md` or generated Tauri schema files.
