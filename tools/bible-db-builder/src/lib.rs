use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OpenFlags};
use serde::Deserialize;
use unicode_normalization::UnicodeNormalization;

#[derive(Deserialize)]
struct Manifest {
    version: u32,
    translations: Vec<Translation>,
    books: Vec<Book>,
}

#[derive(Deserialize)]
struct Translation {
    id: String,
    label: String,
    name: String,
}

#[derive(Deserialize)]
struct Book {
    id: i64,
    en: String,
    ko: String,
    slug: String,
    chapters: i64,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum OriginalRecord {
    Source {
        id: String,
        name: String,
        license: String,
        revision: String,
        url: String,
    },
    Token {
        source: String,
        book: String,
        chapter: i64,
        verse: i64,
        index: i64,
        language: String,
        surface: String,
        transliteration: String,
        gloss: String,
        strong: String,
        morphology: String,
        lemma: String,
        definition: String,
        #[serde(rename = "translationOrder")]
        translation_order: i64,
    },
    Lexicon {
        source: String,
        strong: String,
        language: String,
        lemma: String,
        transliteration: String,
        gloss: String,
        definition: String,
    },
    Morphology {
        source: String,
        code: String,
        language: String,
        description: String,
    },
    CrossReference {
        source: String,
        book: String,
        chapter: i64,
        verse: i64,
        anchor: String,
        #[serde(rename = "anchorOrder")]
        anchor_order: i64,
        #[serde(rename = "targetBook")]
        target_book: String,
        #[serde(rename = "targetChapter")]
        target_chapter: i64,
        #[serde(rename = "targetVerse")]
        target_verse: i64,
        #[serde(rename = "targetEndVerse")]
        target_end_verse: Option<i64>,
        #[serde(rename = "targetOrder")]
        target_order: i64,
    },
    StrongLexicon {
        source: String,
        strong: String,
        language: String,
        lemma: String,
        transliteration: String,
        pronunciation: String,
        derivation: String,
        definition: String,
        #[serde(rename = "kjvRenderings")]
        kjv_renderings: String,
    },
}

#[derive(Debug, PartialEq, Eq)]
pub struct BuildPaths {
    pub source: PathBuf,
    pub manifest: PathBuf,
    pub originals: Option<PathBuf>,
    pub output: PathBuf,
}

pub fn parse_paths<I, S>(arguments: I) -> Result<BuildPaths, String>
where
    I: IntoIterator<Item = S>,
    S: Into<std::ffi::OsString>,
{
    let arguments: Vec<PathBuf> = arguments
        .into_iter()
        .skip(1)
        .map(|value| PathBuf::from(value.into()))
        .collect();
    if arguments.len() != 3 && arguments.len() != 4 {
        return Err(
            "usage: bible-db-builder <source.db> <manifest.json> [originals.ndjson] <output.db>"
                .to_string(),
        );
    }
    Ok(BuildPaths {
        source: arguments[0].clone(),
        manifest: arguments[1].clone(),
        originals: (arguments.len() == 4).then(|| arguments[2].clone()),
        output: arguments.last().unwrap().clone(),
    })
}

pub fn normalize_search_text(value: &str) -> String {
    value.nfkc().flat_map(char::to_lowercase).collect()
}

pub fn normalize_strong_base(value: &str) -> String {
    value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic())
        .to_string()
}

pub fn build_database(
    source_path: &Path,
    manifest_path: &Path,
    output_path: &Path,
) -> Result<(), Box<dyn Error>> {
    build_database_internal(source_path, manifest_path, None, output_path)
}

pub fn build_database_with_originals(
    source_path: &Path,
    manifest_path: &Path,
    originals_path: &Path,
    output_path: &Path,
) -> Result<(), Box<dyn Error>> {
    build_database_internal(
        source_path,
        manifest_path,
        Some(originals_path),
        output_path,
    )
}

fn build_database_internal(
    source_path: &Path,
    manifest_path: &Path,
    originals_path: Option<&Path>,
    output_path: &Path,
) -> Result<(), Box<dyn Error>> {
    if output_path.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("output database already exists: {}", output_path.display()),
        )
        .into());
    }

    let manifest: Manifest = serde_json::from_slice(&fs::read(manifest_path)?)?;
    let source = Connection::open_with_flags(source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut output = Connection::open(output_path)?;
    output.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE translations (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL UNIQUE
        );
        CREATE TABLE books (
            id INTEGER PRIMARY KEY,
            en TEXT NOT NULL UNIQUE,
            ko TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            chapters INTEGER NOT NULL
        );
        CREATE TABLE verses (
            translation_id TEXT NOT NULL REFERENCES translations(id),
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            text TEXT NOT NULL,
            search_text TEXT NOT NULL,
            PRIMARY KEY (translation_id, book_id, chapter, verse)
        ) WITHOUT ROWID;
        CREATE TABLE content_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            license TEXT NOT NULL,
            revision TEXT NOT NULL,
            url TEXT NOT NULL
        );
        CREATE TABLE original_tokens (
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            token_index INTEGER NOT NULL,
            source_id TEXT NOT NULL REFERENCES content_sources(id),
            language TEXT NOT NULL,
            surface TEXT NOT NULL,
            transliteration TEXT NOT NULL,
            gloss TEXT NOT NULL,
            strong TEXT NOT NULL,
            strong_base TEXT NOT NULL,
            morphology TEXT NOT NULL,
            lemma TEXT NOT NULL,
            definition TEXT NOT NULL,
            translation_order INTEGER NOT NULL,
            PRIMARY KEY (book_id, chapter, verse, token_index)
        ) WITHOUT ROWID;
        CREATE TABLE lexicon_entries (
            strong TEXT PRIMARY KEY,
            source_id TEXT NOT NULL REFERENCES content_sources(id),
            language TEXT NOT NULL,
            lemma TEXT NOT NULL,
            transliteration TEXT NOT NULL,
            gloss TEXT NOT NULL,
            definition TEXT NOT NULL,
            classic_source_id TEXT REFERENCES content_sources(id),
            pronunciation TEXT NOT NULL DEFAULT '',
            derivation TEXT NOT NULL DEFAULT '',
            classic_definition TEXT NOT NULL DEFAULT '',
            kjv_renderings TEXT NOT NULL DEFAULT ''
        ) WITHOUT ROWID;
        CREATE TABLE morphology_entries (
            code TEXT NOT NULL,
            language TEXT NOT NULL,
            source_id TEXT NOT NULL REFERENCES content_sources(id),
            description TEXT NOT NULL,
            PRIMARY KEY (code, language)
        ) WITHOUT ROWID;
        CREATE TABLE cross_reference_targets (
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            source_id TEXT NOT NULL REFERENCES content_sources(id),
            anchor TEXT NOT NULL,
            anchor_order INTEGER NOT NULL,
            target_book_id INTEGER NOT NULL REFERENCES books(id),
            target_chapter INTEGER NOT NULL,
            target_verse INTEGER NOT NULL,
            target_end_verse INTEGER,
            target_order INTEGER NOT NULL,
            PRIMARY KEY (book_id, chapter, verse, anchor_order, target_order)
        ) WITHOUT ROWID;
        ",
    )?;

    let book_ids: HashMap<&str, i64> = manifest
        .books
        .iter()
        .map(|book| (book.en.as_str(), book.id))
        .collect();
    let translation_ids: HashSet<&str> = manifest
        .translations
        .iter()
        .map(|translation| translation.id.as_str())
        .collect();

    let transaction = output.transaction()?;
    transaction.execute(
        "INSERT INTO metadata (key, value) VALUES ('schema_version', ?1)",
        [manifest.version.to_string()],
    )?;
    for (sort_order, translation) in manifest.translations.iter().enumerate() {
        transaction.execute(
            "
            INSERT INTO translations (id, label, name, sort_order)
            VALUES (?1, ?2, ?3, ?4)
            ",
            params![
                translation.id,
                translation.label,
                translation.name,
                sort_order as i64
            ],
        )?;
    }
    for book in &manifest.books {
        transaction.execute(
            "
            INSERT INTO books (id, en, ko, slug, chapters)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ",
            params![book.id, book.en, book.ko, book.slug, book.chapters],
        )?;
    }

    let mut source_statement = source.prepare(
        "
        SELECT translation, book_en, chapter, verse, text
        FROM verses
        ORDER BY rowid
        ",
    )?;
    let mut rows = source_statement.query([])?;
    while let Some(row) = rows.next()? {
        let translation: String = row.get(0)?;
        let book: String = row.get(1)?;
        let chapter: i64 = row.get(2)?;
        let verse: i64 = row.get(3)?;
        let text: String = row.get(4)?;
        if !translation_ids.contains(translation.as_str()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("translation missing from manifest: {translation}"),
            )
            .into());
        }
        let book_id = book_ids.get(book.as_str()).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("book missing from manifest: {book}"),
            )
        })?;
        transaction.execute(
            "
            INSERT INTO verses
                (translation_id, book_id, chapter, verse, text, search_text)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ",
            params![
                translation,
                book_id,
                chapter,
                verse,
                text,
                normalize_search_text(&text)
            ],
        )?;
    }
    if let Some(originals_path) = originals_path {
        for (line_index, line) in fs::read_to_string(originals_path)?.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            let record: OriginalRecord = serde_json::from_str(line).map_err(|error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "invalid original-language record at line {}: {error}",
                        line_index + 1
                    ),
                )
            })?;
            match record {
                OriginalRecord::Source {
                    id,
                    name,
                    license,
                    revision,
                    url,
                } => {
                    transaction.execute(
                        "
                        INSERT INTO content_sources (id, name, license, revision, url)
                        VALUES (?1, ?2, ?3, ?4, ?5)
                        ",
                        params![id, name, license, revision, url],
                    )?;
                }
                OriginalRecord::Token {
                    source,
                    book,
                    chapter,
                    verse,
                    index,
                    language,
                    surface,
                    transliteration,
                    gloss,
                    strong,
                    morphology,
                    lemma,
                    definition,
                    translation_order,
                } => {
                    let book_id = book_ids.get(book.as_str()).ok_or_else(|| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("original-language book missing from manifest: {book}"),
                        )
                    })?;
                    let strong_base = normalize_strong_base(&strong);
                    transaction.execute(
                        "
                        INSERT INTO original_tokens (
                            book_id, chapter, verse, token_index, source_id, language,
                            surface, transliteration, gloss, strong, strong_base,
                            morphology, lemma, definition, translation_order
                        ) VALUES (
                            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
                        )
                        ",
                        params![
                            book_id,
                            chapter,
                            verse,
                            index,
                            source,
                            language,
                            surface,
                            transliteration,
                            gloss,
                            strong,
                            strong_base,
                            morphology,
                            lemma,
                            definition,
                            translation_order,
                        ],
                    )?;
                }
                OriginalRecord::Lexicon {
                    source,
                    strong,
                    language,
                    lemma,
                    transliteration,
                    gloss,
                    definition,
                } => {
                    transaction.execute(
                        "
                        INSERT INTO lexicon_entries (
                            strong, source_id, language, lemma,
                            transliteration, gloss, definition
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                        ",
                        params![
                            strong,
                            source,
                            language,
                            lemma,
                            transliteration,
                            gloss,
                            definition
                        ],
                    )?;
                }
                OriginalRecord::Morphology {
                    source,
                    code,
                    language,
                    description,
                } => {
                    transaction.execute(
                        "
                        INSERT INTO morphology_entries (
                            code, language, source_id, description
                        ) VALUES (?1, ?2, ?3, ?4)
                        ",
                        params![code, language, source, description],
                    )?;
                }
                OriginalRecord::CrossReference {
                    source,
                    book,
                    chapter,
                    verse,
                    anchor,
                    anchor_order,
                    target_book,
                    target_chapter,
                    target_verse,
                    target_end_verse,
                    target_order,
                } => {
                    let book_id = book_ids.get(book.as_str()).ok_or_else(|| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("cross-reference book missing from manifest: {book}"),
                        )
                    })?;
                    let target_book_id = book_ids.get(target_book.as_str()).ok_or_else(|| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!(
                                "cross-reference target book missing from manifest: {target_book}"
                            ),
                        )
                    })?;
                    if chapter < 1
                        || verse < 1
                        || target_chapter < 1
                        || target_verse < 1
                        || target_end_verse.is_some_and(|end| end < target_verse)
                        || anchor.trim().is_empty()
                    {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!(
                                "invalid cross reference: {book} {chapter}:{verse} -> {target_book} {target_chapter}:{target_verse}"
                            ),
                        )
                        .into());
                    }
                    transaction.execute(
                        "
                        INSERT INTO cross_reference_targets (
                            book_id, chapter, verse, source_id, anchor, anchor_order,
                            target_book_id, target_chapter, target_verse,
                            target_end_verse, target_order
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                        ",
                        params![
                            book_id,
                            chapter,
                            verse,
                            source,
                            anchor,
                            anchor_order,
                            target_book_id,
                            target_chapter,
                            target_verse,
                            target_end_verse,
                            target_order,
                        ],
                    )?;
                }
                OriginalRecord::StrongLexicon {
                    source,
                    strong,
                    language,
                    lemma,
                    transliteration,
                    pronunciation,
                    derivation,
                    definition,
                    kjv_renderings,
                } => {
                    let mut characters = strong.chars();
                    let valid_prefix = matches!(characters.next(), Some('H' | 'G'));
                    let digits = characters.collect::<String>();
                    if !valid_prefix
                        || !(1..=5).contains(&digits.len())
                        || !digits.chars().all(|character| character.is_ascii_digit())
                    {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("invalid classic Strong identifier: {strong}"),
                        )
                        .into());
                    }
                    transaction.execute(
                        "
                        INSERT INTO lexicon_entries (
                            strong, source_id, language, lemma, transliteration, gloss,
                            definition, classic_source_id, pronunciation, derivation,
                            classic_definition, kjv_renderings
                        ) VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?2, ?7, ?8, ?6, ?9)
                        ON CONFLICT(strong) DO UPDATE SET
                            classic_source_id = excluded.classic_source_id,
                            pronunciation = excluded.pronunciation,
                            derivation = excluded.derivation,
                            classic_definition = excluded.classic_definition,
                            kjv_renderings = excluded.kjv_renderings,
                            lemma = CASE WHEN lexicon_entries.lemma = '' THEN excluded.lemma ELSE lexicon_entries.lemma END,
                            transliteration = CASE WHEN lexicon_entries.transliteration = '' THEN excluded.transliteration ELSE lexicon_entries.transliteration END,
                            definition = CASE WHEN lexicon_entries.definition = '' THEN excluded.definition ELSE lexicon_entries.definition END
                        ",
                        params![
                            strong,
                            source,
                            language,
                            lemma,
                            transliteration,
                            definition,
                            pronunciation,
                            derivation,
                            kjv_renderings,
                        ],
                    )?;
                }
            }
        }
    }
    transaction.execute(
        "
        CREATE INDEX verses_by_chapter
        ON verses (book_id, chapter, translation_id, verse)
        ",
        [],
    )?;
    transaction.execute(
        "
        CREATE INDEX original_tokens_by_translation_order
        ON original_tokens (book_id, chapter, verse, translation_order)
        ",
        [],
    )?;
    transaction.execute(
        "
        CREATE INDEX original_tokens_by_strong_reference
        ON original_tokens (strong_base, book_id, chapter, verse, token_index)
        ",
        [],
    )?;
    transaction.execute(
        "
        CREATE INDEX cross_references_by_source
        ON cross_reference_targets (book_id, chapter, verse, anchor_order, target_order)
        ",
        [],
    )?;
    transaction.commit()?;

    let integrity: String = output.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("output database integrity check failed: {integrity}"),
        )
        .into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::{
        build_database, build_database_with_originals, normalize_search_text,
        normalize_strong_base, parse_paths,
    };

    #[test]
    fn normalizes_compatibility_characters_and_case() {
        assert_eq!(normalize_search_text("ＧＯＤ 하나님"), "god 하나님");
    }

    #[test]
    fn normalizes_extended_strong_codes_to_the_classic_index() {
        assert_eq!(normalize_strong_base("H7225G"), "H7225");
        assert_eq!(normalize_strong_base("G3056"), "G3056");
    }

    #[test]
    fn builds_a_read_only_runtime_corpus_without_user_tables() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("source.db");
        let manifest_path = directory.path().join("manifest.json");
        let output_path = directory.path().join("bible.db");
        let source = Connection::open(&source_path).unwrap();
        source
            .execute_batch(
                "
                CREATE TABLE verses (
                    translation TEXT NOT NULL,
                    book_en TEXT NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    PRIMARY KEY (translation, book_en, chapter, verse)
                );
                CREATE TABLE notes (
                    book_en TEXT NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    text TEXT NOT NULL
                );
                INSERT INTO verses VALUES
                    ('NIV', 'Genesis', 1, 1, 'In the beginning GOD'),
                    ('GAE', 'Genesis', 1, 1, '태초에 하나님이');
                INSERT INTO notes VALUES ('Genesis', 1, 1, 'private');
                ",
            )
            .unwrap();
        drop(source);
        fs::write(
            &manifest_path,
            r#"{
                "version": 1,
                "translations": [
                    {"id":"NIV","label":"NIV","name":"New International Version"},
                    {"id":"GAE","label":"개역개정","name":"Korean Revised Version"}
                ],
                "books": [
                    {"id":0,"en":"Genesis","ko":"창세기","slug":"01-genesis","chapters":1}
                ]
            }"#,
        )
        .unwrap();

        build_database(&source_path, &manifest_path, &output_path).unwrap();

        let output = Connection::open(&output_path).unwrap();
        let tables: Vec<String> = output
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            tables,
            [
                "books",
                "content_sources",
                "cross_reference_targets",
                "lexicon_entries",
                "metadata",
                "morphology_entries",
                "original_tokens",
                "translations",
                "verses"
            ]
        );
        assert_eq!(
            output
                .query_row(
                    "SELECT search_text FROM verses WHERE translation_id = 'NIV'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "in the beginning god"
        );
        assert_eq!(
            output
                .query_row("SELECT COUNT(*) FROM verses", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
        let source = Connection::open(&source_path).unwrap();
        assert_eq!(
            source
                .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn parses_the_three_required_command_paths() {
        let paths =
            parse_paths(["bible-db-builder", "source.db", "manifest.json", "bible.db"]).unwrap();

        assert_eq!(paths.source, PathBuf::from("source.db"));
        assert_eq!(paths.manifest, PathBuf::from("manifest.json"));
        assert_eq!(paths.originals, None);
        assert_eq!(paths.output, PathBuf::from("bible.db"));
    }

    #[test]
    fn parses_an_optional_original_language_input_path() {
        let paths = parse_paths([
            "bible-db-builder",
            "source.db",
            "manifest.json",
            "originals.ndjson",
            "bible.db",
        ])
        .unwrap();

        assert_eq!(paths.originals, Some(PathBuf::from("originals.ndjson")));
        assert_eq!(paths.output, PathBuf::from("bible.db"));
    }

    #[test]
    fn imports_normalized_original_language_tokens_and_provenance() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("source.db");
        let manifest_path = directory.path().join("manifest.json");
        let originals_path = directory.path().join("originals.ndjson");
        let output_path = directory.path().join("bible.db");
        let source = Connection::open(&source_path).unwrap();
        source
            .execute_batch(
                "
                CREATE TABLE verses (
                    translation TEXT NOT NULL,
                    book_en TEXT NOT NULL,
                    chapter INTEGER NOT NULL,
                    verse INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    PRIMARY KEY (translation, book_en, chapter, verse)
                );
                INSERT INTO verses VALUES ('KJV', 'Genesis', 1, 1, 'In the beginning');
                ",
            )
            .unwrap();
        drop(source);
        fs::write(
            &manifest_path,
            r#"{
                "version":2,
                "translations":[{"id":"KJV","label":"KJV","name":"King James Version"}],
                "books":[{"id":0,"en":"Genesis","ko":"창세기","slug":"01-genesis","chapters":1}]
            }"#,
        )
        .unwrap();
        fs::write(
            &originals_path,
            concat!(
                "{\"type\":\"source\",\"id\":\"step\",\"name\":\"STEPBible Data\",",
                "\"license\":\"CC BY 4.0\",\"revision\":\"abc123\",\"url\":\"https://github.com/STEPBible/STEPBible-Data\"}\n",
                "{\"type\":\"token\",\"source\":\"step\",\"book\":\"Genesis\",\"chapter\":1,\"verse\":1,",
                "\"index\":1,\"language\":\"hebrew\",\"surface\":\"בְּרֵאשִׁית\",\"transliteration\":\"bereshit\",",
                "\"gloss\":\"in beginning\",\"strong\":\"H7225\",\"morphology\":\"HR/Ncfsa\",",
                "\"lemma\":\"רֵאשִׁית\",\"definition\":\"beginning\",\"translationOrder\":2}\n",
                "{\"type\":\"lexicon\",\"source\":\"step\",\"strong\":\"H7225G\",\"language\":\"hebrew\",",
                "\"lemma\":\"רֵאשִׁית\",\"transliteration\":\"reshit\",\"gloss\":\"beginning\",",
                "\"definition\":\"first, beginning, best, chief\"}\n",
                "{\"type\":\"morphology\",\"source\":\"step\",\"code\":\"HNcfsa\",",
                "\"language\":\"hebrew\",\"description\":\"Noun; feminine; singular; absolute\"}\n",
                "{\"type\":\"source\",\"id\":\"tsk\",\"name\":\"Treasury of Scripture Knowledge\",",
                "\"license\":\"Public Domain\",\"revision\":\"classic\",\"url\":\"https://github.com/narthur/tsk-cli\"}\n",
                "{\"type\":\"crossReference\",\"source\":\"tsk\",\"book\":\"Genesis\",",
                "\"chapter\":1,\"verse\":1,\"anchor\":\"beginning\",\"anchorOrder\":0,",
                "\"targetBook\":\"Genesis\",\"targetChapter\":1,\"targetVerse\":1,\"targetOrder\":1}\n",
                "{\"type\":\"crossReference\",\"source\":\"tsk\",\"book\":\"Genesis\",",
                "\"chapter\":1,\"verse\":1,\"anchor\":\"creation\",\"anchorOrder\":1,",
                "\"targetBook\":\"Genesis\",\"targetChapter\":1,\"targetVerse\":1,\"targetEndVerse\":2,\"targetOrder\":0}\n",
                "{\"type\":\"source\",\"id\":\"strongs\",\"name\":\"Open Scriptures Strong's Dictionaries\",",
                "\"license\":\"CC BY-SA\",\"revision\":\"classic\",\"url\":\"https://github.com/openscriptures/strongs\"}\n",
                "{\"type\":\"strongLexicon\",\"source\":\"strongs\",\"strong\":\"H7225\",",
                "\"language\":\"hebrew\",\"lemma\":\"רֵאשִׁית\",\"transliteration\":\"reshith\",",
                "\"pronunciation\":\"ray-sheeth\",\"derivation\":\"from H7218\",",
                "\"definition\":\"the first\",\"kjvRenderings\":\"beginning, first\"}\n",
            ),
        )
        .unwrap();

        build_database_with_originals(&source_path, &manifest_path, &originals_path, &output_path)
            .unwrap();

        let output = Connection::open(output_path).unwrap();
        assert_eq!(
            output
                .query_row(
                    "SELECT strong_base FROM original_tokens WHERE strong = 'H7225'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "H7225"
        );
        assert_eq!(
            output
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master \
                     WHERE type = 'index' AND name = 'original_tokens_by_strong_reference'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
        assert_eq!(
            output
                .query_row(
                    "SELECT license FROM content_sources WHERE id = 'step'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "CC BY 4.0"
        );
        assert_eq!(
            output
                .query_row(
                    "SELECT definition FROM lexicon_entries WHERE strong = 'H7225G'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "first, beginning, best, chief"
        );
        assert_eq!(
            output
                .query_row(
                    "SELECT description FROM morphology_entries WHERE code = 'HNcfsa'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "Noun; feminine; singular; absolute"
        );
        let references = output
            .prepare(
                "SELECT anchor, anchor_order, target_order, target_end_verse \
                 FROM cross_reference_targets ORDER BY anchor_order, target_order",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            references,
            [
                ("beginning".to_string(), 0, 1, None),
                ("creation".to_string(), 1, 0, Some(2)),
            ]
        );
        assert_eq!(
            output
                .query_row(
                    "SELECT pronunciation, derivation, classic_definition, kjv_renderings \
                     FROM lexicon_entries WHERE strong = 'H7225'",
                    [],
                    |row| Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    )),
                )
                .unwrap(),
            (
                "ray-sheeth".to_string(),
                "from H7218".to_string(),
                "the first".to_string(),
                "beginning, first".to_string(),
            )
        );
    }
}
