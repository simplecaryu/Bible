"""Import the Open Scriptures digitisation of Strong's dictionaries into SQLite."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "_sources" / "openscriptures-strongs"
OUTPUT = ROOT / "data" / "strongs-concordance.db"
ASSIGNMENT_RE = re.compile(r"var\s+\w+\s*=\s*(\{.*\})\s*;", re.DOTALL)


def read_dictionary(path: Path) -> dict[str, dict[str, str]]:
    content = path.read_text(encoding="utf-8")
    match = ASSIGNMENT_RE.search(content)
    if not match:
        raise ValueError(f"Could not find JSON assignment in {path}")
    return json.loads(match.group(1))


def normalise(code: str) -> str:
    prefix, number = code[0].upper(), int(code[1:])
    return f"{prefix}{number:04d}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    source = args.source.resolve()
    greek = read_dictionary(source / "greek" / "strongs-greek-dictionary.js")
    hebrew = read_dictionary(source / "hebrew" / "strongs-hebrew-dictionary.js")
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    rows = []
    for language, entries in (("Greek", greek), ("Hebrew/Aramaic", hebrew)):
        for raw_code, entry in entries.items():
            rows.append(
                (
                    normalise(raw_code), raw_code, language,
                    entry.get("lemma", ""),
                    entry.get("translit", entry.get("xlit", "")),
                    entry.get("pron", ""),
                    entry.get("derivation", ""),
                    entry.get("strongs_def", ""),
                    entry.get("kjv_def", ""),
                )
            )
    with sqlite3.connect(output) as db:
        db.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE entries (
              code TEXT PRIMARY KEY,
              source_code TEXT NOT NULL,
              language TEXT NOT NULL,
              lemma TEXT NOT NULL,
              transliteration TEXT NOT NULL,
              pronunciation TEXT NOT NULL,
              derivation TEXT NOT NULL,
              strongs_definition TEXT NOT NULL,
              kjv_renderings TEXT NOT NULL
            );
            """
        )
        db.executemany("INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
        db.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [
                ("source_name", "Open Scriptures Strong's Dictionaries"),
                ("source_url", "https://github.com/openscriptures/strongs"),
                ("source_license", "Open Scriptures JSON digitisation: CC BY-SA; underlying Strong's dictionary: public domain"),
                ("attribution", "Open Scriptures; James Strong, Strong's Exhaustive Concordance (1890/1894)"),
                ("greek_entries", str(len(greek))),
                ("hebrew_aramaic_entries", str(len(hebrew))),
            ],
        )
        db.execute("CREATE INDEX entries_lemma ON entries(lemma)")
        db.commit()
    print(f"Wrote {output}: {len(greek):,} Greek and {len(hebrew):,} Hebrew/Aramaic entries")


if __name__ == "__main__":
    main()
