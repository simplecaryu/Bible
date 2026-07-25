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

#[derive(Debug, PartialEq, Eq)]
pub struct BuildPaths {
    pub source: PathBuf,
    pub manifest: PathBuf,
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
    if arguments.len() != 3 {
        return Err("usage: bible-db-builder <source.db> <manifest.json> <output.db>".to_string());
    }
    Ok(BuildPaths {
        source: arguments[0].clone(),
        manifest: arguments[1].clone(),
        output: arguments[2].clone(),
    })
}

pub fn normalize_search_text(value: &str) -> String {
    value.nfkc().flat_map(char::to_lowercase).collect()
}

pub fn build_database(
    source_path: &Path,
    manifest_path: &Path,
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
    transaction.execute(
        "
        CREATE INDEX verses_by_chapter
        ON verses (book_id, chapter, translation_id, verse)
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

    use super::{build_database, normalize_search_text, parse_paths};

    #[test]
    fn normalizes_compatibility_characters_and_case() {
        assert_eq!(normalize_search_text("ＧＯＤ 하나님"), "god 하나님");
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
        assert_eq!(tables, ["books", "metadata", "translations", "verses"]);
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
        assert_eq!(paths.output, PathBuf::from("bible.db"));
    }
}
