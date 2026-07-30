"""Export the Treasury of Scripture Knowledge into per-chapter JSON files.

Reads data/treasury-of-scripture-knowledge.db and writes
data/tsk/<book-slug>/<chapter>.json, mirroring data/chapters/<slug>/<chapter>.json:

    {"b": bookId, "c": chapter, "v": [[verse, [[anchor, [[refBookId, refChapter, refVerse], ...]], ...]], ...]}

entries.source_book_key is 1-indexed and already matches manifest.json's
books array order (verified against manifest's English names), so
bookId = source_book_key - 1.

target_references uses yet another (lowercase, TSK-specific) set of book
abbreviations, e.g. "pr 8:22-24;ps 33:6,9" -- parsed and expanded here so the
frontend only ever deals with plain [bookId, chapter, verse] triples. A
handful of entries (~18 out of ~306k reference segments) don't match the
normal pattern (stray OCR/formatting artifacts in the source); those are
silently dropped.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "treasury-of-scripture-knowledge.db"
MANIFEST = ROOT / "data" / "manifest.json"
OUTPUT = ROOT / "data" / "tsk"

# TSK's own lowercase book abbreviations, in Genesis..Revelation order
# (matches manifest.json's books array; verified against the distinct
# prefixes actually present in target_references). "exe" is a rare typo for
# Ezekiel (a single occurrence: "exe 39:2").
TSK_BOOK_CODES = [
    "ge", "ex", "le", "nu", "de", "jos", "jud", "ru", "1sa", "2sa",
    "1ki", "2ki", "1ch", "2ch", "ezr", "ne", "es", "job", "ps", "pr",
    "ec", "so", "isa", "jer", "la", "eze", "da", "ho", "joe", "am",
    "ob", "jon", "mic", "na", "hab", "zep", "hag", "zec", "mal",
    "mt", "mr", "lu", "joh", "ac", "ro", "1co", "2co", "ga", "eph",
    "php", "col", "1th", "2th", "1ti", "2ti", "tit", "phm", "heb", "jas",
    "1pe", "2pe", "1jo", "2jo", "3jo", "jude", "re",
]
BOOK_ID_BY_CODE = {code: index for index, code in enumerate(TSK_BOOK_CODES)}
BOOK_ID_BY_CODE["exe"] = BOOK_ID_BY_CODE["eze"]

REF_RE = re.compile(r"^([1-3]?[a-z]+)\s*(\d+):([\d,\- ]+)$")


def expand_verse_spec(book_id: int, chapter: int, verse_spec: str) -> list[list[int]]:
    refs = []
    for piece in verse_spec.split(","):
        piece = piece.strip()
        if not piece:
            continue
        if "-" in piece:
            start_str, _, end_str = piece.partition("-")
            try:
                start, end = int(start_str), int(end_str)
            except ValueError:
                continue
            for verse in range(start, end + 1):
                refs.append([book_id, chapter, verse])
        else:
            try:
                refs.append([book_id, chapter, int(piece)])
            except ValueError:
                continue
    return refs


def parse_target_references(raw: str) -> list[list[int]]:
    refs: list[list[int]] = []
    for segment in raw.split(";"):
        segment = segment.strip()
        if not segment:
            continue
        match = REF_RE.match(segment)
        if not match:
            continue
        book_id = BOOK_ID_BY_CODE.get(match.group(1))
        if book_id is None:
            continue
        refs.extend(expand_verse_spec(book_id, int(match.group(2)), match.group(3)))
    return refs


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    if not DATABASE.exists():
        raise SystemExit(f"Database not found: {DATABASE}")
    with MANIFEST.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    books = manifest["books"]

    connection = sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")

    total_chapters = 0
    total_entries = 0
    total_refs = 0
    for book in books:
        source_book_key = book["id"] + 1
        for chapter in range(1, book["chapters"] + 1):
            rows = connection.execute(
                """
                SELECT verse, anchor, target_references
                FROM entries
                WHERE source_book_key = ? AND chapter = ?
                ORDER BY verse, sort_order
                """,
                (source_book_key, chapter),
            ).fetchall()
            if not rows:
                continue
            verses: dict[int, list] = {}
            for verse, anchor, target_references in rows:
                refs = parse_target_references(target_references)
                if not refs:
                    continue
                verses.setdefault(verse, []).append([anchor, refs])
                total_refs += len(refs)
            if not verses:
                continue
            payload = {
                "b": book["id"],
                "c": chapter,
                "v": [[verse, entries] for verse, entries in sorted(verses.items())],
            }
            write_json(OUTPUT / book["slug"] / f"{chapter}.json", payload)
            total_chapters += 1
            total_entries += len(rows)
    connection.close()

    print(f"Exported {total_chapters} TSK chapter files, {total_entries:,} entries, {total_refs:,} expanded references")


if __name__ == "__main__":
    main()
