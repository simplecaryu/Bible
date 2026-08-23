# Cross-Reference Click and Shortcut Design

## Scope

This change restores pointer access to each verse's cross-reference control and adds unmodified `C` as a keyboard shortcut for the same action.

The shortcut opens cross references for the active Bible panel's most recently interacted verse, falling back to its navigated verse. It is ignored while a dialog is open, inside interactive or editable controls, and whenever Control, Meta, or Alt is held.

## Root cause

Recent density changes reduced short verse rows to about 51 pixels, but the cross-reference button remained absolutely positioned 60 pixels below the row's top. The button was therefore outside its owning verse and covered by the following verse during hit testing. Browser reproduction confirmed that a click at the button's center landed on the next `.verse-group` instead.

## Verse action rail

The note and cross-reference buttons will share a compact action rail in the existing left gutter. The rail remains inside its verse row, so later verses cannot cover either control. The verse number stays above the actions, and the gutter grows only enough to provide non-overlapping pointer targets without increasing row height.

The existing click handlers remain authoritative: each button stops verse-selection propagation and opens its current tool panel.

## `C` behavior

A pure shortcut-policy helper will accept case-insensitive, unmodified `C` only outside inputs, textareas, selects, buttons, content-editable elements, and open dialogs. The document-level handler resolves the active Bible panel, chooses the same last-interacted/current verse target used by the note shortcut, prevents the default key action, and calls the existing cross-reference opening path.

## Verification

Automated tests will cover shortcut acceptance and guards, action-rail structure, and the absence of the obsolete out-of-row positioning. Browser verification will confirm that the button center resolves to the button itself and that both clicking the control and pressing `C` open the cross-reference panel. Existing frontend tests must remain green.
