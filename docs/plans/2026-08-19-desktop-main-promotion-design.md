# Desktop Main Promotion Design

## Context

The repository's `main` branch represents the former browser application, while
`desktop-rust` is the actively maintained offline Linux desktop product. The
browser branch has diverged from Newhyuck's continuing development, which now
lives at `Newhyuck2/unitedbibles`, and is no longer a useful primary branch for
this repository.

## Decision

Promote the current `desktop-rust` history directly to `main`. Do not merge the
diverged browser `main` into the desktop code.

Before moving `main`, preserve its current tip as `legacy-web` locally and on
the `simplecaryu/Bible` remote. Keep `desktop-rust` temporarily at the same tip
as the new `main` so existing clones and links continue to work during the
transition.

## Project Relationship

Describe this project as an independently maintained Linux desktop fork and
derivative of `Newhyuck2/unitedbibles`. GitHub does not record the repositories
as a formal fork network, so the README must state the relationship explicitly.

Retarget the local `upstream` remote to `Newhyuck2/unitedbibles`. This remote is
a reference for reviewing features and source-data changes, not a branch that is
merged wholesale into the desktop product.

## Upstream Intake

Future upstream changes are handled selectively:

1. Fetch and review `unitedbibles/main` for useful product and data changes.
2. Decide whether each change belongs in the offline desktop product.
3. Reimplement or adapt accepted changes for the Tauri/Rust and SQLite
   architecture with desktop-specific tests.
4. Record data provenance and pinned revisions when importing upstream data.

## README and Data References

Update the README introduction with the upstream relationship and independent
desktop scope. Replace the removed `Newhyuck2/Bible` clone instruction with a
pinned `Newhyuck2/unitedbibles` revision after verifying that its TSK and
Strong's data paths remain available.

## Safety

- Create and push `legacy-web` before changing remote `main`.
- Use a lease when replacing remote `main` so unexpected concurrent changes are
  not overwritten.
- Leave the untracked `AGENTS.md` and `src-tauri/gen/` paths untouched.
- Verify the preserved and promoted commit IDs before and after each push.
