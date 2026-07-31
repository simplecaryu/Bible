"""Import the public-domain Treasury of Scripture Knowledge reference table."""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "_sources" / "tsk-cli" / "tskxref.txt"
OUTPUT = ROOT / "data" / "treasury-of-scripture-knowledge.db"
# The source occasionally prefixes an anchor with an Ussher-style chronology
# note ("A. M. 4034. A.D. 30. the third") ahead of the actual KJV phrase
# being cross-referenced ("the third"). Strip any such notes so the anchor
# is just the phrase -- otherwise it neither highlights in the verse text
# nor reads as a real word in the TSK dialog's word list.
CHRONOLOGY_SEGMENT = re.compile(
    r"^(?:A\.\s?M\.|A\.\s?D\.|B\.\s?C\.)\s*(?:cir\.\s+)?\d+(?:[-,]\s*\d+)*(?:,\s*etc)?\.?\s*"
)


def strip_chronology_note(words: str) -> str:
    result = words
    while True:
        match = CHRONOLOGY_SEGMENT.match(result)
        if not match:
            break
        result = result[match.end():]
    stripped = result.strip()
    return stripped if stripped else words


BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
    "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
    "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
    "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
    "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
    "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if not source.exists():
        raise SystemExit(f"Missing source file: {source}")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    rows = []
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            book_key = int(row["book"])
            if not 1 <= book_key <= len(BOOKS):
                continue  # The source also defines deuterocanonical book keys.
            references = row["refs"].strip()
            anchor = strip_chronology_note(row["words"].strip())
            rows.append(
                (
                    book_key, BOOKS[book_key - 1], int(row["chapter"]), int(row["verse"]),
                    int(row["sort"]), anchor, references,
                    len([item for item in references.split(";") if item.strip()]),
                )
            )
    with sqlite3.connect(output) as db:
        db.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE entries (
              entry_id INTEGER PRIMARY KEY,
              source_book_key INTEGER NOT NULL,
              book TEXT NOT NULL,
              chapter INTEGER NOT NULL,
              verse INTEGER NOT NULL,
              sort_order INTEGER NOT NULL,
              anchor TEXT NOT NULL,
              target_references TEXT NOT NULL,
              target_reference_count INTEGER NOT NULL
            );
            """
        )
        db.executemany(
            """INSERT INTO entries(
                source_book_key, book, chapter, verse, sort_order, anchor,
                target_references, target_reference_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        db.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [
                ("source_name", "Treasury of Scripture Knowledge (TSK) developer table"),
                ("source_url", "https://github.com/narthur/tsk-cli"),
                ("source_file", source.name),
                ("license", "Public domain TSK data (as listed by CrossWire)"),
                ("description", "Phrase-level KJV anchors with semicolon-separated TSK target references."),
                ("entry_count", str(len(rows))),
            ],
        )
        db.execute("CREATE INDEX entries_lookup ON entries(book, chapter, verse, sort_order)")
        db.commit()
    targets = sum(row[-1] for row in rows)
    print(f"Wrote {output}: {len(rows):,} phrase entries, {targets:,} target references")


if __name__ == "__main__":
    main()
