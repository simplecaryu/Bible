import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("linked notes use an accessible collapsed disclosure with a bounded list", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);

  assert.match(html, /id="descendant-notes-toggle"[^>]*aria-expanded="false"/);
  assert.match(html, /id="descendant-notes-list"[^>]*hidden/);
  assert.match(app, /reduceLinkedNotesDisclosure/);
  assert.match(app, /linkedNotesDisclosureLabel/);
  assert.match(app, /descendantNotes\.classList\.toggle\("expanded"/);
  assert.match(css, /\.descendant-notes\.expanded\s*\{[^}]*height:\s*min\(180px, 32dvh\)/s);
  assert.match(css, /\.descendant-notes-list\s*\{[^}]*overflow:\s*auto/s);
});
