"""Export the Englishman's Concordance into per-Strong's-code JSON files.

Reads data/englishmans-concordance.db and writes data/englishmans/<code>.json,
one file per Strong's code:

    {"lemma":..., "translit":..., "pronunciation":..., "def":..., "kjv":...,
     "occ": [[bookId, chapter, verse, english, morphology], ...]}

morphology is the occurrence's own tag (e.g. "robinson:N-NSM" for Greek,
"strongMorph:TH8804" for some Hebrew verbs), or "" where the source dataset
doesn't tag one (common for untagged Hebrew forms).
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "englishmans-concordance.db"
OUTPUT = ROOT / "data" / "englishmans"

# This dataset uses its own book abbreviations (distinct from STEPBible's
# 3-letter codes used elsewhere in this project's export scripts), in
# Genesis..Revelation order (matches manifest.json's books array; verified
# against the 66 distinct book prefixes actually present in the db).
BOOK_CODES = [
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam",
    "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov",
    "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
    "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
    "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph",
    "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas",
    "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
]
BOOK_ID_BY_CODE = {code: index for index, code in enumerate(BOOK_CODES)}
REF_RE = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)")


def parse_reference(reference: str) -> list[int] | None:
    match = REF_RE.match(reference)
    if not match:
        return None
    book_id = BOOK_ID_BY_CODE.get(match.group(1))
    if book_id is None:
        return None
    return [book_id, int(match.group(2)), int(match.group(3))]


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    if not DATABASE.exists():
        raise SystemExit(f"Database not found: {DATABASE}")
    connection = sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")

    lemmas = connection.execute(
        "SELECT code, lemma, transliteration, pronunciation, strongs_definition, kjv_renderings FROM lemmas"
    ).fetchall()

    exported = 0
    skipped_refs = 0
    for code, lemma, translit, pronunciation, definition, kjv in lemmas:
        occ_rows = connection.execute(
            "SELECT reference, english, morphology FROM occurrences WHERE code = ? ORDER BY position",
            (code,),
        ).fetchall()
        occurrences = []
        for reference, english, morphology in occ_rows:
            parsed = parse_reference(reference)
            if not parsed:
                skipped_refs += 1
                continue
            occurrences.append([*parsed, english, morphology or ""])
        payload = {
            "lemma": lemma,
            "translit": translit,
            "pronunciation": pronunciation,
            "def": definition,
            "kjv": kjv,
            "occ": occurrences,
        }
        write_json(OUTPUT / f"{code}.json", payload)
        exported += 1
    connection.close()

    print(f"Exported {exported:,} Englishman's concordance entries ({skipped_refs} unparsed references skipped)")


if __name__ == "__main__":
    main()
