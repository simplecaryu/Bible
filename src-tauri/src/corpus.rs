use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::time::Instant;

use rusqlite::{params, params_from_iter, Connection, OpenFlags};
use serde::Serialize;
use thiserror::Error;
use unicode_normalization::UnicodeNormalization;

const MAX_MATCHES_PER_TRANSLATION_PER_BOOK: usize = 25;

#[derive(Debug, Error)]
pub enum CorpusError {
    #[error("could not open the Bible database: {0}")]
    Open(#[source] rusqlite::Error),
    #[error("Bible database query failed: {0}")]
    Query(#[from] rusqlite::Error),
    #[error("unsupported Bible database schema version: {0}")]
    UnsupportedVersion(String),
}

pub struct Corpus {
    connection: Connection,
}

#[derive(Debug, Serialize)]
pub struct Manifest {
    pub version: u32,
    pub translations: Vec<Translation>,
    pub books: Vec<Book>,
    pub stats: Stats,
}

#[derive(Debug, Serialize)]
pub struct Translation {
    pub id: String,
    pub label: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct Book {
    pub id: i64,
    pub en: String,
    pub ko: String,
    pub slug: String,
    pub chapters: i64,
}

#[derive(Debug, Serialize)]
pub struct Stats {
    pub chapters: i64,
    pub verses: BTreeMap<String, i64>,
}

#[derive(Debug, Serialize)]
pub struct Chapter {
    pub b: i64,
    pub c: i64,
    pub v: Vec<(i64, BTreeMap<String, String>)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub query: String,
    pub matches: Vec<(String, i64, i64, i64, String)>,
    pub book_counts: Vec<(i64, usize)>,
    pub total_translation_matches: usize,
    pub truncated: bool,
    pub elapsed_ms: f64,
}

fn normalize_search_text(value: &str) -> String {
    value.nfkc().flat_map(char::to_lowercase).collect()
}

impl Corpus {
    pub fn open(path: &Path) -> Result<Self, CorpusError> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(CorpusError::Open)?;
        let version: String = connection.query_row(
            "SELECT value FROM metadata WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )?;
        if version != "1" {
            return Err(CorpusError::UnsupportedVersion(version));
        }
        Ok(Self { connection })
    }

    pub fn manifest(&self) -> Result<Manifest, CorpusError> {
        let mut translation_statement = self
            .connection
            .prepare("SELECT id, label, name FROM translations ORDER BY sort_order")?;
        let translations = translation_statement
            .query_map([], |row| {
                Ok(Translation {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    name: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut book_statement = self
            .connection
            .prepare("SELECT id, en, ko, slug, chapters FROM books ORDER BY id")?;
        let books = book_statement
            .query_map([], |row| {
                Ok(Book {
                    id: row.get(0)?,
                    en: row.get(1)?,
                    ko: row.get(2)?,
                    slug: row.get(3)?,
                    chapters: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut count_statement = self
            .connection
            .prepare("SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id")?;
        let verses = count_statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<BTreeMap<String, i64>, _>>()?;
        let chapters = books.iter().map(|book| book.chapters).sum();

        Ok(Manifest {
            version: 1,
            translations,
            books,
            stats: Stats { chapters, verses },
        })
    }

    pub fn get_chapter(
        &self,
        book_id: i64,
        chapter: i64,
        translations: &[String],
    ) -> Result<Chapter, CorpusError> {
        let mut verses: BTreeMap<i64, BTreeMap<String, String>> = BTreeMap::new();
        if translations.is_empty() {
            let mut statement = self.connection.prepare(
                "SELECT DISTINCT verse
                 FROM verses
                 WHERE book_id = ?1 AND chapter = ?2
                 ORDER BY verse",
            )?;
            for result in statement.query_map(params![book_id, chapter], |row| row.get(0))? {
                verses.insert(result?, BTreeMap::new());
            }
        } else {
            let placeholders = (0..translations.len())
                .map(|index| format!("?{}", index + 3))
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!(
                "SELECT verse, translation_id, text
                 FROM verses
                 WHERE book_id = ?1
                   AND chapter = ?2
                   AND translation_id IN ({placeholders})
                 ORDER BY verse, translation_id"
            );
            let mut values = Vec::with_capacity(translations.len() + 2);
            values.push(rusqlite::types::Value::Integer(book_id));
            values.push(rusqlite::types::Value::Integer(chapter));
            values.extend(
                translations
                    .iter()
                    .cloned()
                    .map(rusqlite::types::Value::Text),
            );
            let mut statement = self.connection.prepare(&sql)?;
            let mut rows = statement.query(params_from_iter(values))?;
            while let Some(row) = rows.next()? {
                let verse: i64 = row.get(0)?;
                let translation: String = row.get(1)?;
                let text: String = row.get(2)?;
                verses.entry(verse).or_default().insert(translation, text);
            }
        }

        Ok(Chapter {
            b: book_id,
            c: chapter,
            v: verses.into_iter().collect(),
        })
    }

    pub fn search(
        &self,
        query: &str,
        translations: &[String],
    ) -> Result<SearchResult, CorpusError> {
        let started = Instant::now();
        let needle = normalize_search_text(query);
        let mut matches = Vec::new();
        let mut verse_keys_by_book: BTreeMap<i64, BTreeSet<(i64, i64)>> = BTreeMap::new();
        let mut total_translation_matches = 0;
        let mut truncated = false;
        let mut statement = self.connection.prepare(
            "
            SELECT book_id, chapter, verse, text
            FROM verses
            WHERE translation_id = ?1 AND instr(search_text, ?2) > 0
            ORDER BY book_id, chapter, verse
            ",
        )?;

        for translation in translations {
            let mut displayed_by_book: BTreeMap<i64, usize> = BTreeMap::new();
            let mut rows = statement.query(params![translation, needle])?;
            while let Some(row) = rows.next()? {
                let book: i64 = row.get(0)?;
                let chapter: i64 = row.get(1)?;
                let verse: i64 = row.get(2)?;
                let text: String = row.get(3)?;
                total_translation_matches += 1;
                verse_keys_by_book
                    .entry(book)
                    .or_default()
                    .insert((chapter, verse));
                let displayed = displayed_by_book.entry(book).or_default();
                if *displayed < MAX_MATCHES_PER_TRANSLATION_PER_BOOK {
                    matches.push((translation.clone(), book, chapter, verse, text));
                    *displayed += 1;
                } else {
                    truncated = true;
                }
            }
        }

        Ok(SearchResult {
            query: query.to_string(),
            matches,
            book_counts: verse_keys_by_book
                .into_iter()
                .map(|(book, verses)| (book, verses.len()))
                .collect(),
            total_translation_matches,
            truncated,
            elapsed_ms: started.elapsed().as_secs_f64() * 1_000.0,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use bible_db_builder::build_database;
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::Corpus;

    fn corpus_fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("source.db");
        let manifest_path = directory.path().join("manifest.json");
        let corpus_path = directory.path().join("bible.db");
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
                INSERT INTO verses VALUES
                    ('NIV', 'Genesis', 1, 1, 'In the beginning God'),
                    ('GAE', 'Genesis', 1, 1, '태초에 하나님이'),
                    ('NIV', 'Genesis', 1, 2, 'The earth was formless'),
                    ('GAE', 'Genesis', 1, 2, '땅이 혼돈하고');
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
        build_database(&source_path, &manifest_path, &corpus_path).unwrap();
        (directory, corpus_path)
    }

    #[test]
    fn returns_manifest_and_selected_chapter_translations() {
        let (_directory, path) = corpus_fixture();
        let corpus = Corpus::open(&path).unwrap();

        let manifest = corpus.manifest().unwrap();
        assert_eq!(manifest.version, 1);
        assert_eq!(manifest.translations[0].id, "NIV");
        assert_eq!(manifest.books[0].ko, "창세기");
        assert_eq!(manifest.stats.verses["NIV"], 2);

        let chapter = corpus.get_chapter(0, 1, &["GAE".to_string()]).unwrap();
        assert_eq!(chapter.b, 0);
        assert_eq!(chapter.c, 1);
        assert_eq!(chapter.v.len(), 2);
        assert_eq!(chapter.v[0].0, 1);
        assert_eq!(chapter.v[0].1["GAE"], "태초에 하나님이");
        assert!(!chapter.v[0].1.contains_key("NIV"));
    }

    #[test]
    fn searches_normalized_text_in_selected_translations() {
        let (_directory, path) = corpus_fixture();
        let corpus = Corpus::open(&path).unwrap();

        let result = corpus.search("ＧＯＤ", &["NIV".to_string()]).unwrap();

        assert_eq!(result.query, "ＧＯＤ");
        assert_eq!(result.total_translation_matches, 1);
        assert_eq!(
            result.matches,
            vec![(
                "NIV".to_string(),
                0,
                1,
                1,
                "In the beginning God".to_string()
            )]
        );
        assert_eq!(result.book_counts, vec![(0, 1)]);
        assert!(!result.truncated);
    }
}
