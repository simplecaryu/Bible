#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname -- "$script_dir")
source_appimage=${1:-"$repo_root/target/release/bundle/appimage/Bible_0.1.0_amd64.AppImage"}
source_icon="$repo_root/icons/icon-512.png"

if [ ! -f "$source_appimage" ]; then
  echo "AppImage not found: $source_appimage" >&2
  exit 1
fi

if [ ! -f "$source_icon" ]; then
  echo "Icon not found: $source_icon" >&2
  exit 1
fi

data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
install_dir="$HOME/.local/opt/bible"
applications_dir="$data_home/applications"
icons_dir="$data_home/icons/hicolor/512x512/apps"
installed_appimage="$install_dir/Bible.AppImage"
desktop_file="$applications_dir/com.cha.bible.desktop"

mkdir -p "$install_dir" "$applications_dir" "$icons_dir"
install -m 755 "$source_appimage" "$installed_appimage"
install -m 644 "$source_icon" "$icons_dir/com.cha.bible.png"

temp_desktop="$desktop_file.tmp"
trap 'rm -f "$temp_desktop"' EXIT HUP INT TERM

{
  echo '[Desktop Entry]'
  echo 'Type=Application'
  echo 'Name=Bible'
  echo 'Comment=Offline multi-translation Bible reader'
  echo "Exec=$installed_appimage"
  echo 'Icon=com.cha.bible'
  echo 'Terminal=false'
  echo 'Categories=Education;'
  echo 'StartupNotify=true'
} >"$temp_desktop"

chmod 644 "$temp_desktop"
mv -f "$temp_desktop" "$desktop_file"
trap - EXIT HUP INT TERM

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$applications_dir"
fi

echo "Installed Bible in the application menu."
