"""Create a local SQLite copy of CrossWire's KJV Strong/morphology OSIS data."""

from __future__ import annotations

import argparse
import html
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "_sources" / "kjv-osis" / "kjv.xml"
OUTPUT = ROOT / "data" / "kjv-strong-morphology.db"

VERSE_RE = re.compile(
    r'<verse\s+osisID="(?P<reference>[^"]+)"\s+sID="[^"]+"\s*/>'
    r'(?P<content>.*?)<verse\s+eID="[^"]+"\s*/>',
    re.DOTALL,
)
WORD_RE = re.compile(r"<w\b(?P<attrs>[^>]*)>(?P<text>.*?)</w>", re.DOTALL)
ATTR_RE = re.compile(r'(?P<name>lemma|morph)="(?P<value>[^"]*)"')
TAG_RE = re.compile(r"<[^>]+>")
NOTE_RE = re.compile(r"<note\b.*?</note>", re.DOTALL)
WS_RE = re.compile(r"\s+")


def clean(markup: str) -> str:
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub("", NOTE_RE.sub("", markup)))).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    source = args.source.resolve()
    if not source.exists():
        raise SystemExit(f"Missing source file: {source}")
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    markup = source.read_text(encoding="utf-8")
    with sqlite3.connect(output) as db:
        db.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE verses (
              reference TEXT PRIMARY KEY,
              text TEXT NOT NULL
            );
            CREATE TABLE tags (
              tag_id INTEGER PRIMARY KEY,
              reference TEXT NOT NULL,
              position INTEGER NOT NULL,
              english TEXT NOT NULL,
              strongs TEXT NOT NULL DEFAULT '',
              morphology TEXT NOT NULL DEFAULT ''
            );
            """
        )
        verse_rows, tag_rows = [], []
        for verse in VERSE_RE.finditer(markup):
            reference = verse.group("reference")
            content = verse.group("content")
            verse_rows.append((reference, clean(content)))
            for position, word in enumerate(WORD_RE.finditer(content), start=1):
                attrs = dict(ATTR_RE.findall(word.group("attrs")))
                tag_rows.append(
                    (
                        reference,
                        position,
                        clean(word.group("text")),
                        attrs.get("lemma", ""),
                        attrs.get("morph", ""),
                    )
                )
        if len(verse_rows) < 31_000:
            raise SystemExit(f"Only found {len(verse_rows):,} verses; source parsing failed.")
        db.executemany("INSERT INTO verses VALUES (?, ?)", verse_rows)
        db.executemany(
            "INSERT INTO tags(reference, position, english, strongs, morphology) VALUES (?, ?, ?, ?, ?)",
            tag_rows,
        )
        db.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [
                ("source_name", "CrossWire KJV OSIS (KJV2011)"),
                ("source_url", "https://www.crosswire.org/~dmsmith/kjv2011/"),
                ("source_file", source.name),
                ("license", "CrossWire Bible Society public license; KJV base text public domain"),
                ("description", "KJV English tags carrying Strong's lemma identifiers and, where supplied, morphology."),
            ],
        )
        db.execute("CREATE INDEX tags_reference ON tags(reference, position)")
        db.execute("CREATE INDEX tags_strongs ON tags(strongs)")
        db.commit()
    with_morphology = sum(1 for row in tag_rows if row[4])
    print(f"Wrote {output}: {len(verse_rows):,} verses, {len(tag_rows):,} tagged units, {with_morphology:,} with morphology")


if __name__ == "__main__":
    main()
