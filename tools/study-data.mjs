import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function tskRecordsForChapter(chapter, books) {
  const sourceBook = books[chapter?.b];
  if (!sourceBook || !Number.isInteger(chapter?.c) || chapter.c < 1 || !Array.isArray(chapter?.v)) {
    throw new Error(`invalid TSK chapter ${chapter?.b}:${chapter?.c}`);
  }
  const records = [];
  for (const verseEntry of chapter.v) {
    const [verse, anchors] = verseEntry;
    if (!Number.isInteger(verse) || verse < 1 || !Array.isArray(anchors)) {
      throw new Error(`invalid TSK verse ${chapter.b}:${chapter.c}:${verse}`);
    }
    anchors.forEach(([anchor, targets], anchorOrder) => {
      if (!String(anchor).trim() || !Array.isArray(targets)) {
        throw new Error(`invalid TSK anchor ${chapter.b}:${chapter.c}:${verse}:${anchorOrder}`);
      }
      targets.forEach((target, targetOrder) => {
        const [targetBookId, targetChapter, targetVerse] = target;
        const targetBook = books[targetBookId];
        if (!targetBook) throw new Error(`invalid TSK target book ${targetBookId}`);
        if (!Number.isInteger(targetChapter) || targetChapter < 1
          || !Number.isInteger(targetVerse) || targetVerse < 1) {
          throw new Error(`invalid TSK target ${targetBookId}:${targetChapter}:${targetVerse}`);
        }
        records.push({
          type: "crossReference",
          source: "tsk",
          book: sourceBook.en,
          chapter: chapter.c,
          verse,
          anchor: String(anchor).trim(),
          anchorOrder,
          targetBook: targetBook.en,
          targetChapter,
          targetVerse,
          targetOrder,
        });
      });
    });
  }
  return records;
}

export function strongLexiconRecords(entries) {
  const records = [];
  for (const [rawCode, entry] of Object.entries(entries ?? {})) {
    const match = rawCode.toLocaleUpperCase().match(/^([GH])(\d{1,5})$/);
    if (!match) continue;
    records.push({
      type: "strongLexicon",
      source: "strongs",
      strong: `${match[1]}${match[2].padStart(4, "0")}`,
      language: match[1] === "G" ? "greek" : "hebrew",
      lemma: String(entry?.lemma ?? "").trim(),
      transliteration: String(entry?.translit ?? "").trim(),
      pronunciation: String(entry?.pronunciation ?? "").trim(),
      derivation: String(entry?.derivation ?? "").trim(),
      definition: String(entry?.def ?? "").trim(),
      kjvRenderings: String(entry?.kjv ?? "").trim(),
    });
  }
  return records.sort((a, b) => a.strong.localeCompare(b.strong));
}

async function writeLine(output, value) {
  if (!output.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`)) {
    await once(output, "drain");
  }
}

async function copyNdjson(inputPath, output) {
  const lines = createInterface({
    input: createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line.trim()) await writeLine(output, line);
  }
}

export async function buildStudyData(
  originalsPath,
  tskDirectory,
  outputPath,
  manifestPath,
  strongsPath = null,
) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const output = createWriteStream(outputPath, { encoding: "utf8", flags: "wx" });
  let count = 0;
  try {
    await copyNdjson(originalsPath, output);
    await writeLine(output, {
      type: "source",
      id: "tsk",
      name: "Treasury of Scripture Knowledge",
      license: "Public Domain",
      revision: "classic TSK via narthur/tsk-cli",
      url: "https://github.com/narthur/tsk-cli",
    });
    for (const book of manifest.books) {
      for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
        const chapterPath = path.join(tskDirectory, book.slug, `${chapter}.json`);
        let payload;
        try {
          payload = JSON.parse(await readFile(chapterPath, "utf8"));
        } catch (error) {
          if (error?.code === "ENOENT") continue;
          throw error;
        }
        for (const record of tskRecordsForChapter(payload, manifest.books)) {
          await writeLine(output, record);
          count += 1;
        }
      }
    }
    if (strongsPath) {
      await writeLine(output, {
        type: "source",
        id: "strongs",
        name: "Open Scriptures Strong's Dictionaries",
        license: "CC BY-SA (digitization); underlying dictionaries Public Domain",
        revision: "Open Scriptures strongs",
        url: "https://github.com/openscriptures/strongs",
      });
      const entries = JSON.parse(await readFile(strongsPath, "utf8"));
      for (const record of strongLexiconRecords(entries)) {
        await writeLine(output, record);
        count += 1;
      }
    }
  } finally {
    const closed = once(output, "close");
    output.end();
    await closed;
  }
  return count;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , originalsPath, tskDirectory, outputPath, strongsPath] = process.argv;
  const manifestPath = fileURLToPath(new URL("../data/manifest.json", import.meta.url));
  if (!originalsPath || !tskDirectory || !outputPath) {
    console.error("usage: node tools/study-data.mjs <originals.ndjson> <tsk-directory> <output.ndjson> [strongs.json]");
    process.exitCode = 2;
  } else {
    const count = await buildStudyData(
      originalsPath,
      tskDirectory,
      outputPath,
      manifestPath,
      strongsPath,
    );
    console.log(`wrote ${count} TSK and Strong study records to ${outputPath}`);
  }
}
