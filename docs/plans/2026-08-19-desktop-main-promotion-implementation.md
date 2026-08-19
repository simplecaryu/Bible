# Desktop Main Promotion Implementation Plan

## Goal

Make the offline Tauri/Rust desktop application the primary product on `main`,
preserve the former browser branch, and establish `Newhyuck2/unitedbibles` as a
reference upstream for selective feature and data intake.

## 1. Preserve the Browser Branch

1. Record the current `origin/main` and `desktop-rust` commit IDs.
2. Create `legacy-web` at the current `origin/main` commit.
3. Push `legacy-web` and verify its remote commit before changing `main`.

## 2. Update Project Identity and Upstream References

1. Read the current `Newhyuck2/unitedbibles` default-branch commit.
2. Verify that `data/tsk` and `data/strongs.json` exist, and compare their Git
   object IDs with the currently bundled snapshot.
3. Update the README introduction to identify the project as an independent
   Linux desktop fork and derivative.
4. Point the README's current data build at the preserved `legacy-web` snapshot;
   do not silently replace it with differing `unitedbibles` data.
5. Update committed attribution metadata that still names the removed
   `Newhyuck2/Bible` repository.
6. Retarget the local `upstream` remote to `Newhyuck2/unitedbibles`.

## 3. Verify and Commit Documentation

1. Search for stale `Newhyuck2/Bible` references.
2. Run whitespace and Markdown-link checks available in the repository.
3. Commit only the intended README, attribution, and plan changes.

## 4. Promote and Publish Main

1. Move local `main` to the verified `desktop-rust` tip without merging the
   former browser history.
2. Push `main` with `--force-with-lease` against the previously recorded remote
   tip.
3. Push the updated `desktop-rust` compatibility branch.
4. Verify that `origin/main` and `origin/desktop-rust` match and that
   `origin/legacy-web` retains the former main commit.
5. Confirm GitHub's default branch remains `main`.

## Safety Constraints

- Never stage `AGENTS.md` or `src-tauri/gen/`.
- Never merge `legacy-web` or `unitedbibles/main` into the desktop branch.
- Stop if the remote `main` tip changes from the recorded lease value.
