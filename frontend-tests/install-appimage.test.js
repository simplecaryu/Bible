import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(repoRoot, "scripts", "install-appimage.sh");

test("installs the AppImage and application-menu entry into user XDG paths", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "bible-appimage-install-"));
  const sourceAppImage = path.join(fixtureRoot, "Bible.AppImage");
  const dataHome = path.join(fixtureRoot, "xdg-data");
  writeFileSync(sourceAppImage, "appimage-v1");

  const result = spawnSync("sh", [installer, sourceAppImage], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: fixtureRoot,
      XDG_DATA_HOME: dataHome,
    },
  });

  assert.equal(result.status, 0, result.stderr);

  const installedAppImage = path.join(fixtureRoot, ".local", "opt", "bible", "Bible.AppImage");
  const desktopFile = path.join(dataHome, "applications", "com.cha.bible.desktop");
  const installedIcon = path.join(
    dataHome,
    "icons",
    "hicolor",
    "512x512",
    "apps",
    "com.cha.bible.png",
  );

  assert.equal(readFileSync(installedAppImage, "utf8"), "appimage-v1");
  assert.ok(statSync(installedAppImage).mode & 0o100, "installed AppImage must be executable");
  assert.ok(statSync(installedIcon).isFile());

  const desktop = readFileSync(desktopFile, "utf8");
  assert.match(desktop, /^\[Desktop Entry\]$/m);
  assert.match(desktop, /^Type=Application$/m);
  assert.match(desktop, /^Name=Bible$/m);
  assert.match(desktop, new RegExp(`^Exec=${installedAppImage}$`, "m"));
  assert.match(desktop, /^Icon=com\.cha\.bible$/m);
  assert.match(desktop, /^Terminal=false$/m);
  assert.match(desktop, /^Categories=Education;$/m);
});
