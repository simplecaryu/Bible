use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::time::Instant;

use rusqlite::{params, params_from_iter, Connection, OpenFlags, OptionalExtension};
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
    schema_version: u32,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginalToken {
    pub index: i64,
    pub language: String,
    pub surface: String,
    pub transliteration: String,
    pub gloss: String,
    pub strong: String,
    pub morphology: String,
    pub lemma: String,
    pub definition: String,
}

#[derive(Debug, Serialize)]
pub struct ContentSource {
    pub name: String,
    pub license: String,
    pub revision: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginalVerse {
    pub b: i64,
    pub c: i64,
    pub v: i64,
    pub language: String,
    pub alignment_status: String,
    pub original_order: Vec<OriginalToken>,
    pub translation_order: Vec<OriginalToken>,
    pub source: ContentSource,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexiconEntry {
    pub strong: String,
    pub language: String,
    pub lemma: String,
    pub transliteration: String,
    pub gloss: String,
    pub definition: String,
    pub morphology_description: Option<String>,
    pub occurrence_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrongOccurrence {
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub token_index: i64,
    pub surface: String,
    pub lemma: String,
    pub transliteration: String,
    pub gloss: String,
    pub strong: String,
    pub morphology: String,
    pub texts: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrongOccurrencePage {
    pub strong_base: String,
    pub total: i64,
    pub offset: usize,
    pub has_more: bool,
    pub items: Vec<StrongOccurrence>,
}

fn normalize_search_text(value: &str) -> String {
    value.nfkc().flat_map(char::to_lowercase).collect()
}

fn normalize_strong_base(value: &str) -> String {
    value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic())
        .to_string()
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
        let schema_version = version
            .parse::<u32>()
            .map_err(|_| CorpusError::UnsupportedVersion(version.clone()))?;
        if !(1..=2).contains(&schema_version) {
            return Err(CorpusError::UnsupportedVersion(version));
        }
        Ok(Self {
            connection,
            schema_version,
        })
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
            version: self.schema_version,
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

    pub fn has_original_language(
        &self,
        book_id: i64,
        chapter: i64,
        verse: i64,
    ) -> Result<bool, CorpusError> {
        if self.schema_version < 2 {
            return Ok(false);
        }
        let count: i64 = self.connection.query_row(
            "
            SELECT COUNT(*)
            FROM original_tokens
            WHERE book_id = ?1 AND chapter = ?2 AND verse = ?3
            ",
            params![book_id, chapter, verse],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn original_verse(
        &self,
        book_id: i64,
        chapter: i64,
        verse: i64,
    ) -> Result<Option<OriginalVerse>, CorpusError> {
        if !self.has_original_language(book_id, chapter, verse)? {
            return Ok(None);
        }
        let mut statement = self.connection.prepare(
            "
            SELECT
                token_index, language, surface, transliteration, gloss,
                strong, morphology, lemma, definition, translation_order
            FROM original_tokens
            WHERE book_id = ?1 AND chapter = ?2 AND verse = ?3
            ORDER BY token_index
            ",
        )?;
        let rows = statement
            .query_map(params![book_id, chapter, verse], |row| {
                Ok((
                    OriginalToken {
                        index: row.get(0)?,
                        language: row.get(1)?,
                        surface: row.get(2)?,
                        transliteration: row.get(3)?,
                        gloss: row.get(4)?,
                        strong: row.get(5)?,
                        morphology: row.get(6)?,
                        lemma: row.get(7)?,
                        definition: row.get(8)?,
                    },
                    row.get::<_, i64>(9)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let original_order = rows
            .iter()
            .map(|(token, _)| token.clone())
            .collect::<Vec<_>>();
        let mut translation_rows = rows;
        translation_rows.sort_by_key(|(token, order)| (*order, token.index));
        let translation_order = translation_rows
            .into_iter()
            .map(|(token, _)| token)
            .collect::<Vec<_>>();
        let language = original_order
            .first()
            .map(|token| token.language.clone())
            .unwrap_or_default();
        let source = self.connection.query_row(
            "
            SELECT source.name, source.license, source.revision, source.url
            FROM original_tokens token
            JOIN content_sources source ON source.id = token.source_id
            WHERE token.book_id = ?1 AND token.chapter = ?2 AND token.verse = ?3
            LIMIT 1
            ",
            params![book_id, chapter, verse],
            |row| {
                Ok(ContentSource {
                    name: row.get(0)?,
                    license: row.get(1)?,
                    revision: row.get(2)?,
                    url: row.get(3)?,
                })
            },
        )?;
        Ok(Some(OriginalVerse {
            b: book_id,
            c: chapter,
            v: verse,
            language,
            alignment_status: "fallback-original".to_string(),
            original_order,
            translation_order,
            source,
        }))
    }

    pub fn original_chapter(
        &self,
        book_id: i64,
        chapter: i64,
    ) -> Result<Vec<OriginalVerse>, CorpusError> {
        if self.schema_version < 2 {
            return Ok(Vec::new());
        }
        let mut statement = self.connection.prepare(
            "
            SELECT DISTINCT verse
            FROM original_tokens
            WHERE book_id = ?1 AND chapter = ?2
            ORDER BY verse
            ",
        )?;
        let verses = statement
            .query_map(params![book_id, chapter], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        verses
            .into_iter()
            .filter_map(|verse| self.original_verse(book_id, chapter, verse).transpose())
            .collect()
    }

    pub fn strong_occurrences(
        &self,
        strong: &str,
        book_id: Option<i64>,
        morphology: Option<&str>,
        translation_ids: &[String],
        offset: usize,
        limit: usize,
    ) -> Result<StrongOccurrencePage, CorpusError> {
        let strong_base = normalize_strong_base(strong);
        let total = self.connection.query_row(
            "
            SELECT COUNT(*)
            FROM original_tokens
            WHERE strong_base = ?1
              AND (?2 IS NULL OR book_id = ?2)
              AND (?3 IS NULL OR morphology = ?3)
            ",
            params![strong_base, book_id, morphology],
            |row| row.get::<_, i64>(0),
        )?;
        let mut statement = self.connection.prepare(
            "
            SELECT book_id, chapter, verse, token_index, surface, lemma,
                   transliteration, gloss, strong, morphology
            FROM original_tokens
            WHERE strong_base = ?1
              AND (?2 IS NULL OR book_id = ?2)
              AND (?3 IS NULL OR morphology = ?3)
            ORDER BY book_id, chapter, verse, token_index
            LIMIT ?4 OFFSET ?5
            ",
        )?;
        let rows = statement.query_map(
            params![
                strong_base,
                book_id,
                morphology,
                limit as i64,
                offset as i64
            ],
            |row| {
                Ok(StrongOccurrence {
                    book_id: row.get(0)?,
                    chapter: row.get(1)?,
                    verse: row.get(2)?,
                    token_index: row.get(3)?,
                    surface: row.get(4)?,
                    lemma: row.get(5)?,
                    transliteration: row.get(6)?,
                    gloss: row.get(7)?,
                    strong: row.get(8)?,
                    morphology: row.get(9)?,
                    texts: BTreeMap::new(),
                })
            },
        )?;
        let mut items = rows.collect::<Result<Vec<_>, _>>()?;
        let mut text_statement = self.connection.prepare(
            "
            SELECT text
            FROM verses
            WHERE translation_id = ?1 AND book_id = ?2 AND chapter = ?3 AND verse = ?4
            ",
        )?;
        for item in &mut items {
            for translation_id in translation_ids {
                let text = text_statement
                    .query_row(
                        params![translation_id, item.book_id, item.chapter, item.verse],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()?;
                if let Some(text) = text {
                    item.texts.insert(translation_id.clone(), text);
                }
            }
        }
        Ok(StrongOccurrencePage {
            strong_base,
            total,
            offset,
            has_more: offset.saturating_add(items.len()) < total as usize,
            items,
        })
    }

    pub fn lexicon_entry(
        &self,
        strong: &str,
        morphology: &str,
        language: &str,
    ) -> Result<Option<LexiconEntry>, CorpusError> {
        if self.schema_version < 2 {
            return Ok(None);
        }
        let base = normalize_strong_base(strong);
        let pattern = format!("{base}%");
        let entry = self
            .connection
            .query_row(
                "
                SELECT strong, language, lemma, transliteration, gloss, definition
                FROM lexicon_entries
                WHERE strong = ?1 OR strong LIKE ?2
                ORDER BY CASE WHEN strong = ?1 THEN 0 ELSE 1 END, strong
                LIMIT 1
                ",
                params![strong, pattern],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()?;
        let Some((entry_strong, entry_language, lemma, transliteration, gloss, definition)) = entry
        else {
            return Ok(None);
        };
        let morphology_language = if language == "greek" {
            "greek"
        } else {
            "hebrew"
        };
        let morphology_description = self
            .connection
            .query_row(
                "
                SELECT description
                FROM morphology_entries
                WHERE code = ?1 AND language = ?2
                ",
                params![morphology, morphology_language],
                |row| row.get(0),
            )
            .optional()?;
        let occurrence_count = self.connection.query_row(
            "SELECT COUNT(*) FROM original_tokens WHERE strong_base = ?1",
            [&base],
            |row| row.get(0),
        )?;
        Ok(Some(LexiconEntry {
            strong: entry_strong,
            language: entry_language,
            lemma,
            transliteration,
            gloss,
            definition,
            morphology_description,
            occurrence_count,
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use bible_db_builder::{build_database, build_database_with_originals};
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
    fn returns_original_language_availability_and_verse_analysis() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("source.db");
        let manifest_path = directory.path().join("manifest.json");
        let originals_path = directory.path().join("originals.ndjson");
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
                    ('KJV', 'Genesis', 1, 1, 'In the beginning'),
                    ('KJV', 'Genesis', 1, 2, 'A second beginning'),
                    ('KJV', 'Exodus', 1, 1, 'These are the names');
                ",
            )
            .unwrap();
        drop(source);
        fs::write(
            &manifest_path,
            r#"{
                "version":2,
                "translations":[{"id":"KJV","label":"KJV","name":"King James Version"}],
                "books":[
                    {"id":0,"en":"Genesis","ko":"창세기","slug":"01-genesis","chapters":1},
                    {"id":1,"en":"Exodus","ko":"출애굽기","slug":"02-exodus","chapters":1}
                ]
            }"#,
        )
        .unwrap();
        fs::write(
            &originals_path,
            concat!(
                "{\"type\":\"source\",\"id\":\"step\",\"name\":\"STEPBible Data\",",
                "\"license\":\"CC BY 4.0\",\"revision\":\"abc123\",\"url\":\"https://example.test\"}\n",
                "{\"type\":\"token\",\"source\":\"step\",\"book\":\"Genesis\",\"chapter\":1,\"verse\":1,",
                "\"index\":1,\"language\":\"hebrew\",\"surface\":\"א\",\"transliteration\":\"a\",",
                "\"gloss\":\"first\",\"strong\":\"H0001\",\"morphology\":\"HNcmsa\",",
                "\"lemma\":\"א\",\"definition\":\"first letter\",\"translationOrder\":2}\n",
                "{\"type\":\"token\",\"source\":\"step\",\"book\":\"Genesis\",\"chapter\":1,\"verse\":2,",
                "\"index\":1,\"language\":\"hebrew\",\"surface\":\"א׳\",\"transliteration\":\"a\",",
                "\"gloss\":\"first again\",\"strong\":\"H0001A\",\"morphology\":\"HNcfsa\",",
                "\"lemma\":\"א\",\"definition\":\"first letter\",\"translationOrder\":1}\n",
                "{\"type\":\"token\",\"source\":\"step\",\"book\":\"Exodus\",\"chapter\":1,\"verse\":1,",
                "\"index\":1,\"language\":\"hebrew\",\"surface\":\"א\",\"transliteration\":\"a\",",
                "\"gloss\":\"first elsewhere\",\"strong\":\"H0001B\",\"morphology\":\"HNcmsa\",",
                "\"lemma\":\"א\",\"definition\":\"first letter\",\"translationOrder\":1}\n",
                "{\"type\":\"token\",\"source\":\"step\",\"book\":\"Genesis\",\"chapter\":1,\"verse\":1,",
                "\"index\":2,\"language\":\"hebrew\",\"surface\":\"ב\",\"transliteration\":\"b\",",
                "\"gloss\":\"second\",\"strong\":\"H0002\",\"morphology\":\"HNcmsa\",",
                "\"lemma\":\"ב\",\"definition\":\"second letter\",\"translationOrder\":1}\n",
                "{\"type\":\"lexicon\",\"source\":\"step\",\"strong\":\"H0001\",\"language\":\"hebrew\",",
                "\"lemma\":\"א\",\"transliteration\":\"a\",\"gloss\":\"first\",",
                "\"definition\":\"first letter in detail\"}\n",
                "{\"type\":\"morphology\",\"source\":\"step\",\"code\":\"HNcmsa\",",
                "\"language\":\"hebrew\",\"description\":\"Function=Noun; Number=Singular\"}\n",
            ),
        )
        .unwrap();
        build_database_with_originals(&source_path, &manifest_path, &originals_path, &corpus_path)
            .unwrap();

        let corpus = Corpus::open(&corpus_path).unwrap();
        assert!(corpus.has_original_language(0, 1, 1).unwrap());
        assert!(!corpus.has_original_language(0, 1, 3).unwrap());
        let analysis = corpus.original_verse(0, 1, 1).unwrap().unwrap();
        assert_eq!(analysis.language, "hebrew");
        assert_eq!(analysis.original_order[0].surface, "א");
        assert_eq!(analysis.translation_order[0].surface, "ב");
        assert_eq!(analysis.original_order[0].definition, "first letter");
        assert_eq!(analysis.source.license, "CC BY 4.0");
        assert_eq!(corpus.original_chapter(0, 1).unwrap().len(), 2);
        let lexicon = corpus
            .lexicon_entry("H0001", "HNcmsa", "hebrew")
            .unwrap()
            .unwrap();
        assert_eq!(lexicon.definition, "first letter in detail");
        assert_eq!(lexicon.occurrence_count, 3);
        assert_eq!(
            lexicon.morphology_description.as_deref(),
            Some("Function=Noun; Number=Singular")
        );
        let occurrences = corpus
            .strong_occurrences("H0001A", Some(0), None, &["KJV".to_string()], 0, 50)
            .unwrap();
        assert_eq!(occurrences.total, 2);
        assert!(!occurrences.has_more);
        assert_eq!(occurrences.items[0].verse, 1);
        assert_eq!(occurrences.items[1].verse, 2);
        assert_eq!(occurrences.items[1].strong, "H0001A");
        assert_eq!(occurrences.items[0].texts["KJV"], "In the beginning");
        let whole_bible = corpus
            .strong_occurrences("H0001", None, None, &["KJV".to_string()], 0, 2)
            .unwrap();
        assert_eq!(whole_bible.total, 3);
        assert!(whole_bible.has_more);
        assert_eq!(whole_bible.items.len(), 2);
        let matching_form = corpus
            .strong_occurrences("H0001", None, Some("HNcmsa"), &[], 0, 50)
            .unwrap();
        assert_eq!(matching_form.total, 2);
    }

    #[test]
    fn bundled_corpus_contains_hebrew_aramaic_and_greek() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("bible.db");
        let corpus = Corpus::open(&path).unwrap();

        assert_eq!(
            corpus.original_verse(0, 1, 1).unwrap().unwrap().language,
            "hebrew"
        );
        assert!(corpus
            .original_verse(26, 2, 4)
            .unwrap()
            .unwrap()
            .original_order
            .iter()
            .any(|token| token.language == "aramaic"));
        assert_eq!(
            corpus.original_verse(39, 1, 1).unwrap().unwrap().language,
            "greek"
        );
        let greek = corpus.original_verse(39, 1, 1).unwrap().unwrap();
        let jesus = greek
            .original_order
            .iter()
            .find(|token| token.strong == "G2424G")
            .unwrap();
        let lexicon = corpus
            .lexicon_entry(&jesus.strong, &jesus.morphology, &jesus.language)
            .unwrap()
            .unwrap();
        assert!(!lexicon.definition.is_empty());
        assert!(lexicon.occurrence_count > 0);
        assert!(lexicon.morphology_description.is_some());
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
