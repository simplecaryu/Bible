import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BOOKS = [
  ["Gen", "Genesis"], ["Exo", "Exodus"], ["Lev", "Leviticus"], ["Num", "Numbers"],
  ["Deu", "Deuteronomy"], ["Jos", "Joshua"], ["Jdg", "Judges"], ["Rut", "Ruth"],
  ["1Sa", "1 Samuel"], ["2Sa", "2 Samuel"], ["1Ki", "1 Kings"], ["2Ki", "2 Kings"],
  ["1Ch", "1 Chronicles"], ["2Ch", "2 Chronicles"], ["Ezr", "Ezra"], ["Neh", "Nehemiah"],
  ["Est", "Esther"], ["Job", "Job"], ["Psa", "Psalms"], ["Pro", "Proverbs"],
  ["Ecc", "Ecclesiastes"], ["Sng", "Song of Songs"], ["Isa", "Isaiah"],
  ["Jer", "Jeremiah"], ["Lam", "Lamentations"], ["Ezk", "Ezekiel"], ["Dan", "Daniel"],
  ["Hos", "Hosea"], ["Jol", "Joel"], ["Amo", "Amos"], ["Oba", "Obadiah"],
  ["Jon", "Jonah"], ["Mic", "Micah"], ["Nam", "Nahum"], ["Hab", "Habakkuk"],
  ["Zep", "Zephaniah"], ["Hag", "Haggai"], ["Zec", "Zechariah"], ["Mal", "Malachi"],
  ["Mat", "Matthew"], ["Mrk", "Mark"], ["Luk", "Luke"], ["Jhn", "John"],
  ["Act", "Acts"], ["Rom", "Romans"], ["1Co", "1 Corinthians"], ["2Co", "2 Corinthians"],
  ["Gal", "Galatians"], ["Eph", "Ephesians"], ["Php", "Philippians"],
  ["Col", "Colossians"], ["1Th", "1 Thessalonians"], ["2Th", "2 Thessalonians"],
  ["1Ti", "1 Timothy"], ["2Ti", "2 Timothy"], ["Tit", "Titus"], ["Phm", "Philemon"],
  ["Heb", "Hebrews"], ["Jas", "James"], ["1Pe", "1 Peter"], ["2Pe", "2 Peter"],
  ["1Jn", "1 John"], ["2Jn", "2 John"], ["3Jn", "3 John"], ["Jud", "Jude"],
  ["Rev", "Revelation"],
];
const BOOK_NAMES = new Map(BOOKS);
const REFERENCE = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)#(\d+)=([^\t]+)/;

export function stepBookName(abbreviation) {
  return BOOK_NAMES.get(abbreviation) ?? null;
}

function parseReference(value) {
  const match = value.match(REFERENCE);
  if (!match) return null;
  const book = stepBookName(match[1]);
  if (!book) return null;
  return {
    book,
    chapter: Number(match[2]),
    verse: Number(match[3]),
    index: Number(match[4]),
    type: match[5],
  };
}

export function parseGreekToken(line) {
  const columns = line.replace(/^\uFEFF/, "").split("\t");
  const reference = parseReference(columns[0] ?? "");
  if (!reference || !reference.type.includes("N")) return null;
  const surfaceValue = (columns[1] ?? "").trim();
  const surfaceMatch = surfaceValue.match(/^(.*?)\s+\(([^()]*)\)\s*$/u);
  const [strongValue = "", morphology = ""] = (columns[3] ?? "").split("=", 2);
  const strongCandidates = strongValue.match(/G\d{4,5}[A-Z]?/g) ?? [];
  const [lemma = "", ...definitionParts] = (columns[4] ?? "").split("=");
  return {
    book: reference.book,
    chapter: reference.chapter,
    verse: reference.verse,
    index: reference.index,
    language: "greek",
    surface: (surfaceMatch?.[1] ?? surfaceValue).trim(),
    transliteration: (surfaceMatch?.[2] ?? "").trim(),
    gloss: (columns[2] ?? "").trim(),
    strong: strongCandidates.at(-1) ?? (columns[11] ?? "").trim().replace(/_.*/, ""),
    morphology: morphology.trim(),
    lemma: lemma.trim(),
    definition: definitionParts.join("=").trim(),
    translationOrder: reference.index,
  };
}

function lexicalHebrewEntry(columns) {
  const detail = columns.slice(6).filter(Boolean).at(-1) ?? "";
  const entries = [...detail.matchAll(/\{?(H\d{4}[A-Z]?)=([^=/{\\]+)=([^/}\\]+)/g)];
  return entries.find((entry) => !/^H90/.test(entry[1])) ?? entries.at(-1);
}

export function parseHebrewToken(line) {
  const columns = line.replace(/^\uFEFF/, "").split("\t");
  const reference = parseReference(columns[0] ?? "");
  if (!reference || (reference.type !== "L" && reference.type !== "Q")) return null;
  const lexical = lexicalHebrewEntry(columns);
  const strongCandidates = (columns[4] ?? "").match(/H\d{4}[A-Z]?/g) ?? [];
  const strong = lexical?.[1]
    ?? strongCandidates.findLast((value) => !/^H90/.test(value))
    ?? strongCandidates.at(-1)
    ?? "";
  const morphology = (columns[5] ?? "").trim();
  return {
    book: reference.book,
    chapter: reference.chapter,
    verse: reference.verse,
    index: reference.index,
    language: morphology.split("/").some((part) => part.startsWith("A"))
      ? "aramaic"
      : "hebrew",
    surface: (columns[1] ?? "").trim(),
    transliteration: (columns[2] ?? "").trim(),
    gloss: (columns[3] ?? "").trim(),
    strong,
    morphology,
    lemma: (lexical?.[2] ?? "").trim(),
    definition: (lexical?.[3] ?? "").trim(),
    translationOrder: reference.index,
  };
}

function plainDefinition(value) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function parseLexiconEntry(line, language) {
  const columns = line.replace(/^\uFEFF/, "").split("\t");
  if (columns.length < 8) return null;
  const strong = (columns[1] ?? "").match(/^([GH]\d{4,5}[A-Z]?)/)?.[1];
  if (!strong) return null;
  return {
    strong,
    language,
    lemma: (columns[3] ?? "").trim(),
    transliteration: (columns[4] ?? "").trim(),
    gloss: (columns[6] ?? "").trim(),
    definition: plainDefinition(columns[7] ?? ""),
  };
}

export function parseMorphologyEntry(line, language) {
  const columns = line.replace(/^\uFEFF/, "").split("\t");
  const code = (columns[0] ?? "").trim();
  const description = (columns[1] ?? "").trim();
  if (!/^[A-Z]/.test(code) || !description.includes("Function=")) return null;
  return { code, language, description };
}

export async function verifySourceFiles(stepDirectory, revision, source) {
  if (source.revision !== revision) {
    throw new Error(`source revision mismatch: expected ${source.revision}, got ${revision}`);
  }
  for (const file of source.files) {
    const content = await readFile(path.join(stepDirectory, file.path));
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== file.sha256) {
      throw new Error(`checksum mismatch for ${file.path}: expected ${file.sha256}, got ${actual}`);
    }
  }
}

async function transformFile(input, output, parser) {
  const lines = createInterface({
    input: createReadStream(input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let count = 0;
  for await (const line of lines) {
    const token = parser(line);
    if (!token) continue;
    output.write(`${JSON.stringify({ type: "token", source: "step", ...token })}\n`);
    count += 1;
  }
  return count;
}

async function transformReferenceFile(input, output, parser, language, type) {
  const lines = createInterface({
    input: createReadStream(input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const seen = new Set();
  let count = 0;
  for await (const line of lines) {
    const record = parser(line, language);
    const key = record?.strong ?? record?.code;
    if (!record || seen.has(key)) continue;
    seen.add(key);
    output.write(`${JSON.stringify({ type, source: "step", ...record })}\n`);
    count += 1;
  }
  return count;
}

export async function convertStepData(stepDirectory, revision, outputPath) {
  const manifestPath = fileURLToPath(
    new URL("../data/original-sources.json", import.meta.url),
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const source = manifest.sources.find((item) => item.id === "step");
  if (!source) throw new Error("STEPBible source is missing from original-sources.json");
  await verifySourceFiles(stepDirectory, revision, source);
  const base = path.join(stepDirectory, "Translators Amalgamated OT+NT");
  const files = [
    ["TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt", parseHebrewToken],
    ["TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt", parseHebrewToken],
    ["TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt", parseHebrewToken],
    ["TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt", parseHebrewToken],
    ["TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt", parseGreekToken],
    ["TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt", parseGreekToken],
  ];
  const output = createWriteStream(outputPath, { encoding: "utf8", flags: "wx" });
  output.write(`${JSON.stringify({
    type: "source",
    id: "step",
    name: "STEPBible Translators Amalgamated Hebrew and Greek",
    license: "CC BY 4.0",
    revision,
    url: "https://github.com/STEPBible/STEPBible-Data",
  })}\n`);
  let count = 0;
  for (const [file, parser] of files) {
    count += await transformFile(path.join(base, file), output, parser);
  }
  const referenceFiles = [
    ["Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt", parseLexiconEntry, "hebrew", "lexicon"],
    ["Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt", parseLexiconEntry, "greek", "lexicon"],
    ["Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt", parseMorphologyEntry, "hebrew", "morphology"],
    ["Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt", parseMorphologyEntry, "greek", "morphology"],
  ];
  for (const [file, parser, language, type] of referenceFiles) {
    count += await transformReferenceFile(
      path.join(stepDirectory, file),
      output,
      parser,
      language,
      type,
    );
  }
  await new Promise((resolve, reject) => {
    output.end(resolve);
    output.on("error", reject);
  });
  return count;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , stepDirectory, revision, outputPath] = process.argv;
  if (!stepDirectory || !revision || !outputPath) {
    console.error("usage: node tools/step-originals.mjs <STEPBible-Data> <revision> <output.ndjson>");
    process.exitCode = 2;
  } else {
    const count = await convertStepData(stepDirectory, revision, outputPath);
    console.log(`wrote ${count} original-language records to ${outputPath}`);
  }
}
