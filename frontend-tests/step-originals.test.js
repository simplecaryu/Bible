import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseGreekToken,
  parseHebrewToken,
  parseLexiconEntry,
  parseMorphologyEntry,
  stepBookName,
  verifySourceFiles,
} from "../tools/step-originals.mjs";

test("normalizes STEP book abbreviations to manifest book names", () => {
  assert.equal(stepBookName("Gen"), "Genesis");
  assert.equal(stepBookName("1Co"), "1 Corinthians");
  assert.equal(stepBookName("Rev"), "Revelation");
});

test("verifies every manifest-listed source checksum", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bible-source-test-"));
  try {
    const content = "licensed source";
    await writeFile(path.join(directory, "source.txt"), content);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const source = { revision: "abc", files: [{ path: "source.txt", sha256 }] };
    await verifySourceFiles(directory, "abc", source);
    await writeFile(path.join(directory, "source.txt"), "tampered");
    await assert.rejects(
      verifySourceFiles(directory, "abc", source),
      /checksum mismatch/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("parses STEP brief lexicon and expanded morphology records", () => {
  assert.deepEqual(
    parseLexiconEntry(
      "H7225\tH7225G =\tH7225G\tרֵאשִׁית\tre.shit\tH:N-F\tfirst: beginning\tfirst, beginning, best",
      "hebrew",
    ),
    {
      strong: "H7225G",
      language: "hebrew",
      lemma: "רֵאשִׁית",
      transliteration: "re.shit",
      gloss: "first: beginning",
      definition: "first, beginning, best",
    },
  );
  assert.deepEqual(
    parseMorphologyEntry(
      "N-NSF\tFunction=Noun; Case=Nominative; Number=Singular; Gender=Feminine",
      "greek",
    ),
    {
      code: "N-NSF",
      language: "greek",
      description: "Function=Noun; Case=Nominative; Number=Singular; Gender=Feminine",
    },
  );
});

test("parses a baseline TAGNT token", () => {
  const token = parseGreekToken(
    "Mat.1.1#01=NKO\tΒίβλος (Biblos)\t[The] book\tG0976=N-NSF\tβίβλος=book\tNA28\t\t\t\tbook\t#01\tG0976",
  );

  assert.deepEqual(token, {
    book: "Matthew",
    chapter: 1,
    verse: 1,
    index: 1,
    language: "greek",
    surface: "Βίβλος",
    transliteration: "Biblos",
    gloss: "[The] book",
    strong: "G0976",
    morphology: "N-NSF",
    lemma: "βίβλος",
    definition: "book",
    translationOrder: 1,
  });
  assert.equal(parseGreekToken("Mat.1.1#01=K\tvariant"), null);
});

test("parses Hebrew compounds while selecting the lexical Strong entry", () => {
  const token = parseHebrewToken(
    "Gen.1.1#01=L\tבְּ/רֵאשִׁ֖ית\tbe./re.Shit\tin/ beginning\tH9003/{H7225G}\tHR/Ncfsa\t\t\tH7225G\t\tH9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}",
  );

  assert.equal(token.book, "Genesis");
  assert.equal(token.language, "hebrew");
  assert.equal(token.strong, "H7225G");
  assert.equal(token.lemma, "רֵאשִׁית");
  assert.match(token.definition, /beginning/);
  assert.equal(parseHebrewToken("Gen.1.1#01=K\tvariant"), null);
});
