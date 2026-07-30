"""Export the STEP Bible interlinear database into browser-friendly per-chapter JSON.

Reads data/interlinear-stepbible.db (see scripts/import_interlinear_stepbible.py)
and writes data/interlinear/<book-slug>/<chapter>.json, one file per chapter that
has any tokens, mirroring the shape of data/chapters/<slug>/<chapter>.json:

    {"b": bookId, "c": chapter, "v": [[verse, [[original, translit, gloss, strongs], ...]], ...]}
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "interlinear-stepbible.db"
MANIFEST = ROOT / "data" / "manifest.json"
OUTPUT = ROOT / "data" / "interlinear"

# STEPBible's own 3-letter book codes, in the same Genesis..Revelation order as
# manifest.json's books array (verified against the 66 distinct codes in the db).
BOOK_CODES = [
    "Gen", "Exo", "Lev", "Num", "Deu", "Jos", "Jdg", "Rut", "1Sa", "2Sa",
    "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh", "Est", "Job", "Psa", "Pro",
    "Ecc", "Sng", "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo",
    "Oba", "Jon", "Mic", "Nam", "Hab", "Zep", "Hag", "Zec", "Mal",
    "Mat", "Mrk", "Luk", "Jhn", "Act", "Rom", "1Co", "2Co", "Gal", "Eph",
    "Php", "Col", "1Th", "2Th", "1Ti", "2Ti", "Tit", "Phm", "Heb", "Jas",
    "1Pe", "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Rev",
]

# Trailing critical-apparatus marks that ride along on the last word of a
# paragraph/disputed section (¶ = new paragraph, ¬ / ]] = bracketed-passage
# markers e.g. Mark 16:9-20, John 7:53-8:11) -- not part of the word itself.
TRAILING_APPARATUS_RE = re.compile(r"[¶¬\[\]]+$")
# The OT source leaves a bare petuchah/setumah paragraph-division letter
# (פ/ס) after a verse's final backslash-escaped punctuation is stripped.
HEBREW_SECTION_MARK_RE = re.compile(r"\s*[פס]$")

# STEPBible tags each token's Strong's number in one of two shapes:
#   OT:  "H9003/{H7225G}" or "{H0430G}" -- braces mark the lexical entry;
#        bare H9xxx codes outside braces are STEPBible's own grammatical
#        particle tags (article/prefix/etc.), not real Strong's entries.
#   NT:  "G0976=N-NSF" -- code then "=" then morphology.
# Trailing single letters (e.g. the "G" in "H7225G") are STEPBible's Extended
# Strong's disambiguation suffix and aren't part of strongs-concordance.db's
# keys, so they're dropped too.
BRACED_STRONGS_RE = re.compile(r"\{([GH]\d{4})[A-Za-z]?\}")
PLAIN_STRONGS_RE = re.compile(r"^([GH]\d{4})")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def clean_original(text: str, testament: str) -> str:
    # The OT source also escapes certain punctuation (maqaf, sof pasuq, paseq)
    # with a literal backslash that isn't part of the text.
    text = text.replace("\\", "")
    if testament == "NT":
        text = TRAILING_APPARATUS_RE.sub("", text)
    else:
        text = HEBREW_SECTION_MARK_RE.sub("", text)
    return text


def extract_strongs(raw: str) -> str:
    braced = BRACED_STRONGS_RE.findall(raw)
    if braced:
        return braced[-1]
    match = PLAIN_STRONGS_RE.match(raw.split("=", 1)[0])
    return match.group(1) if match else ""


def main() -> None:
    if not DATABASE.exists():
        raise SystemExit(f"Database not found: {DATABASE}")
    with MANIFEST.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    books = manifest["books"]
    if len(books) != len(BOOK_CODES):
        raise SystemExit(f"Expected {len(BOOK_CODES)} books, manifest has {len(books)}")

    connection = sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")

    total_chapters = 0
    total_tokens = 0
    for book, code in zip(books, BOOK_CODES, strict=True):
        testament = "NT" if book["id"] >= 39 else "OT"
        for chapter in range(1, book["chapters"] + 1):
            rows = connection.execute(
                """
                SELECT verse, position, original, transliteration, english_gloss, strongs
                FROM tokens
                WHERE book = ? AND chapter = ? AND source_reference = reference
                ORDER BY verse, position
                """,
                (code, chapter),
            ).fetchall()
            if not rows:
                continue
            verses: dict[int, list] = {}
            for verse, _position, original, translit, gloss, strongs in rows:
                verses.setdefault(verse, []).append([
                    clean_original(original, testament),
                    translit,
                    gloss,
                    extract_strongs(strongs),
                ])
            payload = {
                "b": book["id"],
                "c": chapter,
                "v": [[verse, tokens] for verse, tokens in sorted(verses.items())],
            }
            write_json(OUTPUT / book["slug"] / f"{chapter}.json", payload)
            total_chapters += 1
            total_tokens += len(rows)
    connection.close()

    print(f"Exported {total_chapters} interlinear chapter files, {total_tokens:,} tokens")


if __name__ == "__main__":
    main()
