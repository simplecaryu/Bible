"""Build an offline Englishman's-style concordance from local KJV Strong tags.

This indexes every tagged KJV word or phrase under its Strong's number.  It is
not a transcription of George V. Wigram's historical concordances.
"""

from __future__ import annotations

import re
import sqlite3
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KJV_DB = ROOT / "data" / "kjv-strong-morphology.db"
LEXICON_DB = ROOT / "data" / "strongs-concordance.db"
OUTPUT_DB = ROOT / "data" / "englishmans-concordance.db"
STRONG_RE = re.compile(r"\bstrong:([HG])(\d+)\b", re.IGNORECASE)


def normalize_code(letter: str, number: str) -> str:
    return f"{letter.upper()}{int(number):04d}"


def main() -> None:
    if not KJV_DB.exists() or not LEXICON_DB.exists():
        raise SystemExit("Required local KJV and Strong's databases are missing.")

    if OUTPUT_DB.exists():
        OUTPUT_DB.unlink()

    source = sqlite3.connect(KJV_DB)
    lexicon = sqlite3.connect(LEXICON_DB)
    output = sqlite3.connect(OUTPUT_DB)
    output.execute("PRAGMA journal_mode = OFF")
    output.execute("PRAGMA synchronous = OFF")

    output.executescript(
        """
        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE lemmas (
            code TEXT PRIMARY KEY,
            language TEXT,
            lemma TEXT,
            transliteration TEXT,
            pronunciation TEXT,
            strongs_definition TEXT,
            kjv_renderings TEXT,
            occurrence_count INTEGER NOT NULL
        );

        CREATE TABLE occurrences (
            occurrence_id INTEGER PRIMARY KEY,
            code TEXT NOT NULL,
            reference TEXT NOT NULL,
            position INTEGER NOT NULL,
            english TEXT NOT NULL,
            morphology TEXT
        );

        CREATE INDEX idx_occurrences_code_ref
            ON occurrences (code, reference, position);
        CREATE INDEX idx_occurrences_reference
            ON occurrences (reference, position);
        """
    )

    counts: Counter[str] = Counter()
    occurrence_rows: list[tuple[str, str, int, str, str | None]] = []
    for reference, position, english, strongs, morphology in source.execute(
        "SELECT reference, position, english, strongs, morphology FROM tags "
        "WHERE strongs IS NOT NULL AND strongs <> '' ORDER BY tag_id"
    ):
        codes = {
            normalize_code(letter, number)
            for letter, number in STRONG_RE.findall(strongs)
        }
        for code in sorted(codes):
            counts[code] += 1
            occurrence_rows.append((code, reference, position, english, morphology))

    output.executemany(
        "INSERT INTO occurrences (code, reference, position, english, morphology) "
        "VALUES (?, ?, ?, ?, ?)",
        occurrence_rows,
    )

    entries = {
        row[0]: row[1:]
        for row in lexicon.execute(
            "SELECT code, language, lemma, transliteration, pronunciation, "
            "strongs_definition, kjv_renderings FROM entries"
        )
    }
    lemma_rows = []
    for code, occurrence_count in sorted(counts.items()):
        details = entries.get(code, (None, None, None, None, None, None))
        lemma_rows.append((code, *details, occurrence_count))
    output.executemany(
        "INSERT INTO lemmas (code, language, lemma, transliteration, pronunciation, "
        "strongs_definition, kjv_renderings, occurrence_count) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        lemma_rows,
    )

    metadata = {
        "title": "Englishman's-style KJV Strong Concordance",
        "description": (
            "Generated Strong's lemma-to-KJV tagged phrase index. It is not a "
            "transcription of George V. Wigram's historical Englishman's Concordance."
        ),
        "kjv_tag_source": "CrossWire KJV Strong/Morphology OSIS module",
        "kjv_tag_source_url": "https://www.crosswire.org/~dmsmith/kjv2011/",
        "lexicon_source": "Open Scriptures Strong's JSON digitisation",
        "lexicon_source_url": "https://github.com/openscriptures/strongs",
        "occurrence_count": str(len(occurrence_rows)),
        "strong_code_count": str(len(counts)),
    }
    output.executemany("INSERT INTO metadata (key, value) VALUES (?, ?)", metadata.items())
    output.commit()

    print(f"Wrote {OUTPUT_DB}")
    print(f"{len(occurrence_rows):,} indexed occurrences across {len(counts):,} Strong's codes")

    source.close()
    lexicon.close()
    output.close()


if __name__ == "__main__":
    main()
