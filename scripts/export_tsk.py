"""Export the Treasury of Scripture Knowledge into per-chapter JSON files.

Reads data/treasury-of-scripture-knowledge.db and writes
data/tsk/<book-slug>/<chapter>.json, mirroring data/chapters/<slug>/<chapter>.json:

    {"b": bookId, "c": chapter, "v": [[verse, [[anchor, target_references], ...]], ...]}

entries.source_book_key is 1-indexed and already matches manifest.json's
books array order (verified against manifest's English names), so
bookId = source_book_key - 1.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "treasury-of-scripture-knowledge.db"
MANIFEST = ROOT / "data" / "manifest.json"
OUTPUT = ROOT / "data" / "tsk"


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
                verses.setdefault(verse, []).append([anchor, target_references])
            payload = {
                "b": book["id"],
                "c": chapter,
                "v": [[verse, entries] for verse, entries in sorted(verses.items())],
            }
            write_json(OUTPUT / book["slug"] / f"{chapter}.json", payload)
            total_chapters += 1
            total_entries += len(rows)
    connection.close()

    print(f"Exported {total_chapters} TSK chapter files, {total_entries:,} entries")


if __name__ == "__main__":
    main()
