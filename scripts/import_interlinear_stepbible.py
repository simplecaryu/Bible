"""Import the CC BY 4.0 STEP Bible interlinear sources into SQLite.

The source checkout is deliberately kept outside the generated database.  Fetch it with:
  git clone --depth=1 https://github.com/STEPBible/STEPBible-Data.git data/_sources/stepbible
Then run this script from the repository root.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "_sources" / "stepbible"
DEFAULT_OUTPUT = ROOT / "data" / "interlinear-stepbible.db"
REF_RE = re.compile(
    r"^(?P<book>[1-3]?[A-Za-z]{2,3})\.(?P<chapter>\d+)\.(?P<verse>\d+)"
    r"(?P<alternate>(?:\([^)]*\)|\[[^]]*\])?)"
    r"(?:#(?P<position>\d+)(?:=(?P<word_type>[^\t]+))?)?$"
)
TRANSLIT_RE = re.compile(r"^(?P<word>.*?)\s+\((?P<translit>[^()]*)\)$")


def revision(source: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-c", f"safe.directory={source.as_posix()}", "-C", str(source), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def parse_ref(value: str):
    match = REF_RE.match(value)
    if not match:
        return None
    data = match.groupdict()
    return (
        f"{data['book']}.{data['chapter']}.{data['verse']}",
        f"{data['book']}.{data['chapter']}.{data['verse']}{data['alternate']}",
        data["book"],
        int(data["chapter"]),
        int(data["verse"]),
        int(data["position"]) if data["position"] else None,
        data["word_type"] or "",
    )


def init_db(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE verses (
            source_reference TEXT PRIMARY KEY,
            reference TEXT NOT NULL,
            testament TEXT NOT NULL,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            original_line TEXT NOT NULL DEFAULT '',
            gloss_line TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE tokens (
            token_id INTEGER PRIMARY KEY,
            source_reference TEXT NOT NULL,
            testament TEXT NOT NULL,
            reference TEXT NOT NULL,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            position INTEGER NOT NULL,
            word_type TEXT NOT NULL,
            original TEXT NOT NULL,
            transliteration TEXT NOT NULL DEFAULT '',
            english_gloss TEXT NOT NULL DEFAULT '',
            strongs TEXT NOT NULL DEFAULT '',
            grammar TEXT NOT NULL DEFAULT '',
            lemma_gloss TEXT NOT NULL DEFAULT '',
            editions TEXT NOT NULL DEFAULT '',
            meaning_variants TEXT NOT NULL DEFAULT '',
            spelling_variants TEXT NOT NULL DEFAULT '',
            extra TEXT NOT NULL DEFAULT '{}'
        );
        """
    )


def put_verse(
    connection: sqlite3.Connection,
    testament: str,
    ref_data,
    original_line: str | None = None,
    gloss_line: str | None = None,
) -> None:
    reference, source_reference, book, chapter, verse, _, _ = ref_data
    connection.execute(
        """
        INSERT INTO verses(source_reference, reference, testament, book, chapter, verse, original_line, gloss_line)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_reference) DO UPDATE SET
          original_line = CASE WHEN excluded.original_line != '' THEN excluded.original_line ELSE verses.original_line END,
          gloss_line = CASE WHEN excluded.gloss_line != '' THEN excluded.gloss_line ELSE verses.gloss_line END
        """,
        (source_reference, reference, testament, book, chapter, verse, original_line or "", gloss_line or ""),
    )


def import_file(connection: sqlite3.Connection, path: Path, testament: str) -> int:
    imported = 0
    current_verse = None
    batch = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\r\n")
            if not line:
                continue
            columns = line.split("\t")
            first = columns[0].strip()

            # The source preserves a punctuated, full-verse display above each token table.
            if first.startswith("# "):
                verse_ref = parse_ref(first[2:].strip())
                if verse_ref:
                    current_verse = verse_ref
                    put_verse(connection, testament, verse_ref, "\t".join(columns[1:]).rstrip())
                continue
            if first == "#_Translation" and current_verse:
                put_verse(connection, testament, current_verse, gloss_line="\t".join(columns[1:]).rstrip())
                continue

            ref_data = parse_ref(first)
            if not ref_data or ref_data[4] is None:
                continue
            reference, source_reference, book, chapter, verse, position, word_type = ref_data

            if testament == "OT":
                original = columns[1] if len(columns) > 1 else ""
                transliteration = columns[2] if len(columns) > 2 else ""
                gloss = columns[3] if len(columns) > 3 else ""
                strongs = columns[4] if len(columns) > 4 else ""
                grammar = columns[5] if len(columns) > 5 else ""
                meaning = columns[6] if len(columns) > 6 else ""
                spelling = columns[7] if len(columns) > 7 else ""
                extra = {
                    "root_strongs_instance": columns[8] if len(columns) > 8 else "",
                    "alternative_strongs_instance": columns[9] if len(columns) > 9 else "",
                    "conjoin_word": columns[10] if len(columns) > 10 else "",
                    "expanded_strong_tags": columns[11] if len(columns) > 11 else "",
                    "source_file": path.name,
                }
                lemma_gloss = ""
                editions = ""
            else:
                source_word = columns[1] if len(columns) > 1 else ""
                match = TRANSLIT_RE.match(source_word)
                original = match.group("word") if match else source_word
                transliteration = match.group("translit") if match else ""
                gloss = columns[2] if len(columns) > 2 else ""
                strongs = columns[3] if len(columns) > 3 else ""
                lemma_gloss = columns[4] if len(columns) > 4 else ""
                editions = columns[5] if len(columns) > 5 else ""
                meaning = columns[6] if len(columns) > 6 else ""
                spelling = columns[7] if len(columns) > 7 else ""
                grammar = strongs.partition("=")[2]
                extra = {
                    "spanish_gloss": columns[8] if len(columns) > 8 else "",
                    "sub_meaning": columns[9] if len(columns) > 9 else "",
                    "conjoin_word": columns[10] if len(columns) > 10 else "",
                    "strongs_instance": columns[11] if len(columns) > 11 else "",
                    "alternative_strongs": columns[12] if len(columns) > 12 else "",
                    "source_file": path.name,
                }

            put_verse(connection, testament, ref_data)
            batch.append(
                (
                    source_reference, testament, reference, book, chapter, verse, position, word_type,
                    original, transliteration, gloss, strongs, grammar, lemma_gloss,
                    editions, meaning, spelling, json.dumps(extra, ensure_ascii=False),
                )
            )
            if len(batch) >= 5000:
                connection.executemany(
                    """INSERT INTO tokens(
                        source_reference, testament, reference, book, chapter, verse, position, word_type,
                        original, transliteration, english_gloss, strongs, grammar, lemma_gloss, editions,
                        meaning_variants, spelling_variants, extra
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    batch,
                )
                imported += len(batch)
                batch.clear()
    if batch:
        connection.executemany(
            """INSERT INTO tokens(
                source_reference, testament, reference, book, chapter, verse, position, word_type,
                original, transliteration, english_gloss, strongs, grammar, lemma_gloss, editions,
                meaning_variants, spelling_variants, extra
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            batch,
        )
        imported += len(batch)
    return imported


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = args.source.resolve()
    source_dir = source / "Translators Amalgamated OT+NT"
    files = sorted(source_dir.glob("TAHOT *.txt")) + sorted(source_dir.glob("TAGNT *.txt"))
    if len(files) != 6:
        raise SystemExit(f"Expected 4 TAHOT and 2 TAGNT files in {source_dir}; found {len(files)}.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        args.output.unlink()

    with sqlite3.connect(args.output) as connection:
        init_db(connection)
        counts = {"OT": 0, "NT": 0}
        for path in files:
            testament = "OT" if path.name.startswith("TAHOT") else "NT"
            counts[testament] += import_file(connection, path, testament)
        connection.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [
                ("source_name", "STEP Bible Data: TAHOT and TAGNT"),
                ("source_url", "https://github.com/STEPBible/STEPBible-Data"),
                ("source_revision", revision(source)),
                ("license", "CC BY 4.0"),
                ("attribution", "STEP Bible (www.STEPBible.org), based on work at Tyndale House, Cambridge"),
                ("ot_token_count", str(counts["OT"])),
                ("nt_token_count", str(counts["NT"])),
            ],
        )
        connection.execute("CREATE INDEX tokens_lookup ON tokens(book, chapter, verse, position)")
        connection.execute("CREATE INDEX verses_lookup ON verses(book, chapter, verse)")
        connection.execute("CREATE INDEX tokens_strongs ON tokens(strongs)")
        connection.commit()
    print(f"Wrote {args.output}: OT {counts['OT']:,} tokens; NT {counts['NT']:,} tokens")


if __name__ == "__main__":
    main()
