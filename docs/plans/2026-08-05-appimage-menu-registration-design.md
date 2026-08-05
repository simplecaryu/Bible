# AppImage Application Menu Registration Design

## Goal

Register the current Bible AppImage in the current user's Linux application
menu without creating a desktop shortcut. Make later AppImage builds
installable with the same one-command workflow.

## Chosen approach

Add a repository-owned installer script that copies the built AppImage to a
stable per-user location and writes the matching XDG application-menu entry
and icon.

The installed files are:

- `~/.local/opt/bible/Bible.AppImage`
- `~/.local/share/applications/com.cha.bible.desktop`
- `~/.local/share/icons/hicolor/512x512/apps/com.cha.bible.png`

The menu entry launches the stable installed copy rather than the build-tree
artifact. This keeps the menu entry valid if the repository is moved or its
`target` directory is cleaned.

## Update flow

After producing a new release AppImage, run the installer script again. The
script validates the artifact, replaces the installed AppImage and icon, and
refreshes the desktop application cache when the system command is available.
The `.desktop` file keeps the same application identifier and path, so updates
do not create duplicate menu entries.

## Safety and errors

- Install only for the current user; do not require root access.
- Fail before changing the installation if the source AppImage or icon is
  missing.
- Create only the specific XDG directories needed by the app.
- Install files with explicit permissions and stable names.
- Treat desktop-cache refresh as optional because not every desktop provides
  `update-desktop-database`.

## Verification

- Test installer path generation and desktop-entry content in an isolated
  temporary home/XDG data directory.
- Confirm that repeated installation replaces the AppImage without producing
  duplicate desktop entries.
- Validate the installed desktop entry when `desktop-file-validate` is
  available.
- Confirm the installed AppImage remains executable.
