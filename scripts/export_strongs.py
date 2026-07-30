"""Export the Strong's dictionary into a single browser-friendly JSON file.

Reads data/strongs-concordance.db and writes data/strongs.json, keyed by
Strong's code (e.g. "H7225", "G2532"). Small enough (~14k entries) to load
as one file rather than splitting per chapter.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "strongs-concordance.db"
OUTPUT = ROOT / "data" / "strongs.json"


def main() -> None:
    if not DATABASE.exists():
        raise SystemExit(f"Database not found: {DATABASE}")
    connection = sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")
    rows = connection.execute(
        """
        SELECT code, lemma, transliteration, pronunciation, derivation, strongs_definition, kjv_renderings
        FROM entries
        """
    ).fetchall()
    entries = {
        code: {
            "lemma": lemma,
            "translit": translit,
            "pronunciation": pronunciation,
            "derivation": derivation,
            "def": definition,
            "kjv": kjv,
        }
        for code, lemma, translit, pronunciation, derivation, definition, kjv in rows
    }
    connection.close()

    OUTPUT.write_text(
        json.dumps(entries, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Exported {len(entries):,} Strong's entries to {OUTPUT}")


if __name__ == "__main__":
    main()
