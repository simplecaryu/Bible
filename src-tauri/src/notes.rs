use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NoteError {
    #[error("notes database failed: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("unsupported user database schema version: {0}")]
    UnsupportedVersion(String),
    #[error("invalid note reference: {0}")]
    InvalidReference(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NoteReference {
    Book {
        book_id: i64,
    },
    Chapter {
        book_id: i64,
        chapter: i64,
    },
    Verse {
        book_id: i64,
        chapter: i64,
        verse: i64,
    },
}

impl NoteReference {
    pub fn book(book_id: i64) -> Result<Self, NoteError> {
        validate_book(book_id)?;
        Ok(Self::Book { book_id })
    }

    pub fn chapter(book_id: i64, chapter: i64) -> Result<Self, NoteError> {
        validate_book(book_id)?;
        validate_positive("chapter", chapter)?;
        Ok(Self::Chapter { book_id, chapter })
    }

    pub fn verse(book_id: i64, chapter: i64, verse: i64) -> Result<Self, NoteError> {
        validate_book(book_id)?;
        validate_positive("chapter", chapter)?;
        validate_positive("verse", verse)?;
        Ok(Self::Verse {
            book_id,
            chapter,
            verse,
        })
    }

    pub fn parse(reference_key: &str) -> Result<Self, NoteError> {
        let parts = reference_key.split(':').collect::<Vec<_>>();
        let number = |index: usize| {
            parts
                .get(index)
                .ok_or_else(|| NoteError::InvalidReference(reference_key.to_string()))?
                .parse::<i64>()
                .map_err(|_| NoteError::InvalidReference(reference_key.to_string()))
        };
        match parts.as_slice() {
            ["book", _] => Self::book(number(1)?),
            ["chapter", _, _] => Self::chapter(number(1)?, number(2)?),
            ["verse", _, _, _] => Self::verse(number(1)?, number(2)?, number(3)?),
            _ => Err(NoteError::InvalidReference(reference_key.to_string())),
        }
    }

    pub fn key(&self) -> String {
        match self {
            Self::Book { book_id } => format!("book:{book_id}"),
            Self::Chapter { book_id, chapter } => format!("chapter:{book_id}:{chapter}"),
            Self::Verse {
                book_id,
                chapter,
                verse,
            } => format!("verse:{book_id}:{chapter}:{verse}"),
        }
    }

    fn columns(&self) -> (&'static str, i64, Option<i64>, Option<i64>) {
        match self {
            Self::Book { book_id } => ("book", *book_id, None, None),
            Self::Chapter { book_id, chapter } => ("chapter", *book_id, Some(*chapter), None),
            Self::Verse {
                book_id,
                chapter,
                verse,
            } => ("verse", *book_id, Some(*chapter), Some(*verse)),
        }
    }
}

fn validate_book(book_id: i64) -> Result<(), NoteError> {
    if (0..66).contains(&book_id) {
        Ok(())
    } else {
        Err(NoteError::InvalidReference(format!("book:{book_id}")))
    }
}

fn validate_positive(name: &str, value: i64) -> Result<(), NoteError> {
    if value > 0 {
        Ok(())
    } else {
        Err(NoteError::InvalidReference(format!("{name}:{value}")))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub reference_key: String,
    pub scope: String,
    pub book_id: i64,
    pub chapter: Option<i64>,
    pub verse: Option<i64>,
    pub markdown: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub reference_key: String,
    pub scope: String,
    pub book_id: i64,
    pub chapter: Option<i64>,
    pub verse: Option<i64>,
    pub preview: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTombstone {
    pub reference_key: String,
    pub deleted_at: String,
}

pub struct NoteStore {
    connection: Connection,
}

impl NoteStore {
    pub fn open(path: &Path) -> Result<Self, NoteError> {
        let mut connection = Connection::open(path)?;
        migrate(&mut connection)?;
        Ok(Self { connection })
    }

    pub fn load(&self, reference: &NoteReference) -> Result<Option<Note>, NoteError> {
        self.connection
            .query_row(
                "
                SELECT reference_key, scope, book_id, chapter, verse, markdown,
                       created_at, updated_at
                FROM notes
                WHERE reference_key = ?1
                ",
                [reference.key()],
                note_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn save(&mut self, reference: &NoteReference, markdown: &str) -> Result<(), NoteError> {
        if markdown.trim().is_empty() {
            return self.delete(reference);
        }
        let (scope, book_id, chapter, verse) = reference.columns();
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "
            INSERT INTO notes (
                reference_key, scope, book_id, chapter, verse, markdown,
                created_at, updated_at
            )
            VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            )
            ON CONFLICT(reference_key) DO UPDATE SET
                markdown = excluded.markdown,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            ",
            params![reference.key(), scope, book_id, chapter, verse, markdown],
        )?;
        transaction.execute(
            "DELETE FROM note_tombstones WHERE reference_key = ?1",
            [reference.key()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete(&mut self, reference: &NoteReference) -> Result<(), NoteError> {
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "DELETE FROM notes WHERE reference_key = ?1",
            [reference.key()],
        )?;
        transaction.execute(
            "
            INSERT INTO note_tombstones (reference_key, deleted_at)
            VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            ON CONFLICT(reference_key) DO UPDATE SET
                deleted_at = excluded.deleted_at
            ",
            [reference.key()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn tombstones(&self) -> Result<Vec<NoteTombstone>, NoteError> {
        let mut statement = self.connection.prepare(
            "SELECT reference_key, deleted_at FROM note_tombstones ORDER BY reference_key",
        )?;
        let tombstones = statement
            .query_map([], |row| {
                Ok(NoteTombstone {
                    reference_key: row.get(0)?,
                    deleted_at: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(NoteError::from)?;
        Ok(tombstones)
    }

    pub fn descendants(&self, reference: &NoteReference) -> Result<Vec<NoteSummary>, NoteError> {
        let (sql, values): (&str, Vec<i64>) = match reference {
            NoteReference::Book { book_id } => (
                "
                SELECT reference_key, scope, book_id, chapter, verse, markdown, updated_at
                FROM notes
                WHERE book_id = ?1 AND scope != 'book'
                ORDER BY chapter,
                         CASE scope WHEN 'chapter' THEN 0 ELSE 1 END,
                         COALESCE(verse, 0)
                ",
                vec![*book_id],
            ),
            NoteReference::Chapter { book_id, chapter } => (
                "
                SELECT reference_key, scope, book_id, chapter, verse, markdown, updated_at
                FROM notes
                WHERE book_id = ?1 AND chapter = ?2 AND scope = 'verse'
                ORDER BY verse
                ",
                vec![*book_id, *chapter],
            ),
            NoteReference::Verse { .. } => return Ok(Vec::new()),
        };
        let mut statement = self.connection.prepare(sql)?;
        let rows = statement.query_map(rusqlite::params_from_iter(values), |row| {
            let markdown: String = row.get(5)?;
            Ok(NoteSummary {
                reference_key: row.get(0)?,
                scope: row.get(1)?,
                book_id: row.get(2)?,
                chapter: row.get(3)?,
                verse: row.get(4)?,
                preview: markdown_preview(&markdown),
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn count(&self) -> Result<i64, NoteError> {
        self.connection
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn all(&self) -> Result<Vec<Note>, NoteError> {
        let mut statement = self.connection.prepare(
            "
            SELECT reference_key, scope, book_id, chapter, verse, markdown,
                   created_at, updated_at
            FROM notes
            ORDER BY book_id, COALESCE(chapter, 0),
                     CASE scope WHEN 'book' THEN 0 WHEN 'chapter' THEN 1 ELSE 2 END,
                     COALESCE(verse, 0)
            ",
        )?;
        let notes = statement
            .query_map([], note_from_row)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(NoteError::from)?;
        Ok(notes)
    }

    pub fn replace_all(
        &mut self,
        notes: &[(NoteReference, String, String)],
    ) -> Result<(), NoteError> {
        let transaction = self.connection.transaction()?;
        transaction.execute("DELETE FROM notes", [])?;
        for (reference, markdown, updated_at) in notes {
            let (scope, book_id, chapter, verse) = reference.columns();
            transaction.execute(
                "
                INSERT INTO notes (
                    reference_key, scope, book_id, chapter, verse, markdown,
                    created_at, updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
                ",
                params![
                    reference.key(),
                    scope,
                    book_id,
                    chapter,
                    verse,
                    markdown,
                    updated_at
                ],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }
}

fn note_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        reference_key: row.get(0)?,
        scope: row.get(1)?,
        book_id: row.get(2)?,
        chapter: row.get(3)?,
        verse: row.get(4)?,
        markdown: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn markdown_preview(markdown: &str) -> String {
    let plain = markdown
        .chars()
        .filter(|character| !"#*_>`[]()".contains(*character))
        .collect::<String>();
    plain.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn migrate(connection: &mut Connection) -> Result<(), NoteError> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1');
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )?;
    let version: String = transaction.query_row(
        "SELECT value FROM metadata WHERE key = 'schema_version'",
        [],
        |row| row.get(0),
    )?;
    if version != "1" && version != "2" && version != "3" {
        return Err(NoteError::UnsupportedVersion(version));
    }
    transaction.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS notes (
            reference_key TEXT PRIMARY KEY,
            scope TEXT NOT NULL CHECK (scope IN ('book', 'chapter', 'verse')),
            book_id INTEGER NOT NULL CHECK (book_id BETWEEN 0 AND 65),
            chapter INTEGER CHECK (chapter IS NULL OR chapter > 0),
            verse INTEGER CHECK (verse IS NULL OR verse > 0),
            markdown TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK (
                (scope = 'book' AND chapter IS NULL AND verse IS NULL) OR
                (scope = 'chapter' AND chapter IS NOT NULL AND verse IS NULL) OR
                (scope = 'verse' AND chapter IS NOT NULL AND verse IS NOT NULL)
            )
        );
        CREATE INDEX IF NOT EXISTS notes_by_book_chapter_verse
        ON notes (book_id, chapter, verse);
        CREATE TABLE IF NOT EXISTS note_tombstones (
            reference_key TEXT PRIMARY KEY,
            deleted_at TEXT NOT NULL
        );
        UPDATE metadata SET value = '3' WHERE key = 'schema_version';
        ",
    )?;
    transaction.commit()?;
    Ok(())
}
