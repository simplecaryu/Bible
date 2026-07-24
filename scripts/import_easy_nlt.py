"""Import Easy Bible and NLT sources into data.db.

The source files are cached in tmp_bibles:

  - tmp_bibles/easy.bdb: Agape Easy Bible
  - tmp_bibles/NLT.json: New Living Translation from bolls.life

This script imports the verse text into data.db only. It intentionally does
not edit scripts/export_data.py, so these translations are not exported to the
browser JSON or shown in the page until they are explicitly added there later.
"""

from __future__ import annotations

import html
import json
import re
import sqlite3
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data.db"

EASY_BDB = ROOT / "tmp_bibles" / "easy.bdb"
NLT_JSON = ROOT / "tmp_bibles" / "NLT.json"
EASY_URL = (
    "https://hasol.co/download/%EB%B2%A0%EB%93%A4%EB%A0%88%ED%97%B4%EC%84%B1%EA%B2%BD/"
    "BethlehemWin455/%EC%89%AC%EC%9A%B4%EC%84%B1%EA%B2%BD.bdb"
)
NLT_URL = "https://bolls.life/static/translations/NLT.json"

BOOK_ORDER = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
    "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
    "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
    "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah",
    "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
    "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
]


def collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def clean_bethlehem_html(text: str) -> str:
    # Bethlehem files store section headings and footnotes as styled spans.
    text = re.sub(r"<span\b[^>]*>.*?</span>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<sup\b[^>]*>.*?</sup>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>\s*<p[^>]*>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return collapse(html.unescape(text))


def download(url: str, path: Path) -> bytes:
    path.parent.mkdir(exist_ok=True)
    if not path.exists():
        print(f"Downloading {url}")
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def read_easy_source() -> list[tuple[str, str, int, int, str]]:
    download(EASY_URL, EASY_BDB)

    source = sqlite3.connect(f"file:{EASY_BDB.as_posix()}?mode=ro", uri=True)
    source.execute("PRAGMA query_only=ON")
    rows = source.execute(
        """
        SELECT book, chapter, verse, btext
        FROM Bible
        WHERE book BETWEEN 1 AND 66
        ORDER BY book, chapter, verse
        """
    ).fetchall()
    source.close()

    imported: list[tuple[str, str, int, int, str]] = []
    for book, chapter, verse, text in rows:
        imported.append(
            (
                "EASY",
                BOOK_ORDER[int(book) - 1],
                int(chapter),
                int(verse),
                clean_bethlehem_html(text or ""),
            )
        )
    return imported


def read_nlt_source() -> list[tuple[str, str, int, int, str]]:
    data = json.loads(download(NLT_URL, NLT_JSON).decode("utf-8-sig"))
    rows: list[tuple[str, str, int, int, str]] = []
    for row in data:
        if row["book"] > 66:
            continue
        rows.append(
            (
                "NLT",
                BOOK_ORDER[row["book"] - 1],
                row["chapter"],
                row["verse"],
                clean_bethlehem_html(row["text"]),
            )
        )
    return rows


def validate(
    translation: str,
    rows: list[tuple[str, str, int, int, str]],
    expected_chapters: set[tuple[str, int]],
) -> None:
    if not rows:
        raise SystemExit(f"{translation}: no rows found")

    chapters = {(book, chapter) for _, book, chapter, _, _ in rows}
    missing = sorted(expected_chapters - chapters)
    extra = sorted(chapters - expected_chapters)
    if missing or extra:
        raise SystemExit(
            f"{translation}: chapter mismatch missing={missing[:5]} extra={extra[:5]}"
        )

    keys = [(book, chapter, verse) for _, book, chapter, verse, _ in rows]
    if len(keys) != len(set(keys)):
        raise SystemExit(f"{translation}: duplicate verse keys")

    empty = [key for (_, *key, text) in rows if not text]
    if empty:
        raise SystemExit(f"{translation}: {len(empty)} empty verses, e.g. {empty[:5]}")

    tagged = [(book, chapter, verse) for _, book, chapter, verse, text in rows if "<" in text]
    if tagged:
        raise SystemExit(f"{translation}: leftover markup in {tagged[:5]}")

    print(f"{translation}: {len(rows):,} verses across {len(chapters):,} chapters OK")


def main() -> None:
    connection = sqlite3.connect(DATABASE)
    expected_chapters = set(
        connection.execute(
            "SELECT book_en, chapter FROM verses WHERE translation = 'ESV'"
        ).fetchall()
    )

    for translation, rows in (("EASY", read_easy_source()), ("NLT", read_nlt_source())):
        validate(translation, rows, expected_chapters)
        connection.execute("DELETE FROM verses WHERE translation = ?", (translation,))
        connection.executemany(
            """
            INSERT INTO verses (translation, book_en, chapter, verse, text)
            VALUES (?, ?, ?, ?, ?)
            """,
            rows,
        )

    connection.commit()
    for translation, count in connection.execute(
        "SELECT translation, COUNT(*) FROM verses GROUP BY translation ORDER BY translation"
    ):
        print(f"  {translation}: {count:,}")
    connection.close()


if __name__ == "__main__":
    main()
