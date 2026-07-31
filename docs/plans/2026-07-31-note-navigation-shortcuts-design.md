# Note Navigation and Close Shortcut Design

## Scope

This change fixes two note-workflow regressions and adds a context-aware close shortcut:

- Refresh an open chapter or book note's linked-note list after a descendant note is saved or cleared.
- Make `N` open the note for the most recently clicked verse, independent of the current multi-verse copy selection.
- Make `Ctrl+W` close the most recently used visible tool panel first, then the active auxiliary Bible panel. The main Bible panel is never closed by this shortcut.

Multi-verse notes are intentionally deferred. They require a new persistent reference type, archive compatibility rules, and range markers; overloading the existing copy selection would make note ownership ambiguous.

## Note refresh

The notes controller will expose a descendant-only refresh operation. It fetches linked notes for the currently open reference without clearing or replacing the editor draft. After a verse or chapter note is successfully saved or cleared, the application refreshes the linked-note list when the open note is an ancestor of that saved reference.

Stale asynchronous responses must not replace data for a note that has since been changed or closed.

## `N` target

Each Bible panel records the most recently clicked verse. Verse clicks update this value even when they extend, toggle, or clear a copy selection. `N` uses that value, falling back to the panel's navigated verse when no verse has been clicked in the current chapter.

The shortcut continues to be ignored inside editable controls and open dialogs.

## `Ctrl+W` behavior

The application records which visible tool panel—notes or verse analysis—was most recently opened or interacted with. `Ctrl+W` follows this order:

1. Close the most recently used visible tool panel.
2. If no tool panel is visible, close the active auxiliary Bible panel.
3. If only the main Bible panel remains, do nothing.

Closing notes uses the existing save-before-close path. The shortcut is ignored inside an open modal dialog. On Linux and Windows the binding is `Ctrl+W`; `Meta+W` is not added because the current target is Linux desktop.

## Verification

Automated tests will cover descendant-only refresh without draft loss, ancestor detection, last-clicked verse targeting, and close-target selection. Existing frontend and Rust tests must remain green, followed by a release build and AppImage bundle check.
