"""Export the Englishman's Concordance into per-Strong's-code JSON files.

Reads data/englishmans-concordance.db and writes data/englishmans/<code>.json,
one file per Strong's code:

    {"lemma":..., "translit":..., "pronunciation":..., "def":..., "kjv":...,
     "occ": [[bookId, chapter, verse, english, morphology], ...]}

morphology is the occurrence's own tag (e.g. "robinson:N-NSM" for Greek,
"strongMorph:TH8804" for some Hebrew verbs), or "" where the source dataset
doesn't tag one at all.

Chained words (e.g. "the Paul" is one KJV word standing for two Greek
words, G3588 "the" and G3972 "Paul") store both codes' tags space-separated
in englishmans-concordance.db, e.g. "robinson:T-ASM robinson:N-ASM", with no
way to tell from that table alone which token is which code's. To resolve
it, this cross-references data/kjv-strong-morphology.db's own tags table
(the source build_englishmans_concordance.py was built from) by
(reference, position): its strongs and morphology columns are the same
space-separated lists in matching order, so the token at whichever index
this code's "strong:<code>" appears at in the strongs list is this code's
own morphology. That alignment holds for ~99.99% of Greek (robinson-tagged)
chains; where the two lists' lengths don't match (common for Hebrew, where
untagged words like the object marker H0853 are dropped from the
morphology list entirely rather than left blank) there's no reliable index
to pick, so the tag is left blank rather than guessing.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "englishmans-concordance.db"
MORPHOLOGY_DATABASE = ROOT / "data" / "kjv-strong-morphology.db"
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


def load_raw_tags(morph_connection: sqlite3.Connection) -> dict[tuple[str, int], tuple[list[str], list[str]]]:
    tags: dict[tuple[str, int], tuple[list[str], list[str]]] = {}
    for reference, position, strongs, morphology in morph_connection.execute(
        "SELECT reference, position, strongs, morphology FROM tags"
    ):
        tags[(reference, position)] = (strongs.split(), morphology.split() if morphology else [])
    return tags


def resolve_morphology(
    code: str,
    reference: str,
    position: int,
    fallback: str,
    raw_tags: dict[tuple[str, int], tuple[list[str], list[str]]],
) -> str:
    entry = raw_tags.get((reference, position))
    if not entry:
        return fallback if fallback and " " not in fallback else ""
    strongs_tokens, morph_tokens = entry
    target = f"strong:{code}"
    if target not in strongs_tokens or len(strongs_tokens) != len(morph_tokens):
        return fallback if fallback and " " not in fallback else ""
    return morph_tokens[strongs_tokens.index(target)]


def main() -> None:
    if not DATABASE.exists():
        raise SystemExit(f"Database not found: {DATABASE}")
    if not MORPHOLOGY_DATABASE.exists():
        raise SystemExit(f"Database not found: {MORPHOLOGY_DATABASE}")
    connection = sqlite3.connect(f"file:{DATABASE.as_posix()}?mode=ro", uri=True)
    connection.execute("PRAGMA query_only=ON")
    morph_connection = sqlite3.connect(f"file:{MORPHOLOGY_DATABASE.as_posix()}?mode=ro", uri=True)
    morph_connection.execute("PRAGMA query_only=ON")
    raw_tags = load_raw_tags(morph_connection)
    morph_connection.close()

    lemmas = connection.execute(
        "SELECT code, lemma, transliteration, pronunciation, strongs_definition, kjv_renderings FROM lemmas"
    ).fetchall()

    exported = 0
    skipped_refs = 0
    resolved_chains = 0
    for code, lemma, translit, pronunciation, definition, kjv in lemmas:
        occ_rows = connection.execute(
            "SELECT reference, position, english, morphology FROM occurrences WHERE code = ? ORDER BY position",
            (code,),
        ).fetchall()
        occurrences = []
        for reference, position, english, morphology in occ_rows:
            parsed = parse_reference(reference)
            if not parsed:
                skipped_refs += 1
                continue
            if morphology and " " in morphology:
                resolved = resolve_morphology(code, reference, position, morphology, raw_tags)
                if resolved:
                    resolved_chains += 1
            else:
                resolved = morphology or ""
            occurrences.append([*parsed, english, resolved])
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

    print(
        f"Exported {exported:,} Englishman's concordance entries "
        f"({skipped_refs} unparsed references skipped, {resolved_chains:,} chained-word tags resolved by position)"
    )


if __name__ == "__main__":
    main()
