use std::path::Path;
use std::sync::Mutex;

use thiserror::Error;

use crate::archive::{
    apply_import, inspect_archive, write_archive, ArchiveError, ImportInspection, ImportPolicy,
    PortableNote,
};
use crate::corpus::{
    Chapter, Corpus, CorpusError, LexiconEntry, Manifest, OriginalVerse, SearchResult,
};
use crate::notes::{Note, NoteError, NoteReference, NoteStore, NoteSummary};
use crate::settings::{Settings, SettingsError};

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error(transparent)]
    Corpus(#[from] CorpusError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error(transparent)]
    Notes(#[from] NoteError),
    #[error(transparent)]
    Archive(#[from] ArchiveError),
    #[error("application database lock was poisoned")]
    LockPoisoned,
}

pub struct AppServices {
    corpus: Mutex<Corpus>,
    settings: Mutex<Settings>,
    notes: Mutex<NoteStore>,
}

impl AppServices {
    pub fn open(corpus_path: &Path, user_path: &Path) -> Result<Self, ServiceError> {
        Ok(Self {
            corpus: Mutex::new(Corpus::open(corpus_path)?),
            settings: Mutex::new(Settings::open(user_path)?),
            notes: Mutex::new(NoteStore::open(user_path)?),
        })
    }

    pub fn manifest(&self) -> Result<Manifest, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .manifest()
            .map_err(Into::into)
    }

    pub fn chapter(
        &self,
        book_id: i64,
        chapter: i64,
        translations: &[String],
    ) -> Result<Chapter, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .get_chapter(book_id, chapter, translations)
            .map_err(Into::into)
    }

    pub fn search(
        &self,
        query: &str,
        translations: &[String],
    ) -> Result<SearchResult, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .search(query, translations)
            .map_err(Into::into)
    }

    pub fn has_original_language(
        &self,
        book_id: i64,
        chapter: i64,
        verse: i64,
    ) -> Result<bool, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .has_original_language(book_id, chapter, verse)
            .map_err(Into::into)
    }

    pub fn original_verse(
        &self,
        book_id: i64,
        chapter: i64,
        verse: i64,
    ) -> Result<Option<OriginalVerse>, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .original_verse(book_id, chapter, verse)
            .map_err(Into::into)
    }

    pub fn original_chapter(
        &self,
        book_id: i64,
        chapter: i64,
    ) -> Result<Vec<OriginalVerse>, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .original_chapter(book_id, chapter)
            .map_err(Into::into)
    }

    pub fn lexicon_entry(
        &self,
        strong: &str,
        morphology: &str,
        language: &str,
    ) -> Result<Option<LexiconEntry>, ServiceError> {
        self.corpus
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .lexicon_entry(strong, morphology, language)
            .map_err(Into::into)
    }

    pub fn load_state(&self) -> Result<Option<String>, ServiceError> {
        self.settings
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .load()
            .map_err(Into::into)
    }

    pub fn save_state(&self, payload: &str) -> Result<(), ServiceError> {
        self.settings
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .save(payload)
            .map_err(Into::into)
    }

    pub fn load_note(&self, reference: &NoteReference) -> Result<Option<Note>, ServiceError> {
        self.notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .load(reference)
            .map_err(Into::into)
    }

    pub fn save_note(&self, reference: &NoteReference, markdown: &str) -> Result<(), ServiceError> {
        self.notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .save(reference, markdown)
            .map_err(Into::into)
    }

    pub fn delete_note(&self, reference: &NoteReference) -> Result<(), ServiceError> {
        self.notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .delete(reference)
            .map_err(Into::into)
    }

    pub fn descendant_notes(
        &self,
        reference: &NoteReference,
    ) -> Result<Vec<NoteSummary>, ServiceError> {
        self.notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .descendants(reference)
            .map_err(Into::into)
    }

    pub fn export_notes(&self, path: &Path) -> Result<(), ServiceError> {
        let notes = self
            .notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .all()?
            .into_iter()
            .map(|note| PortableNote {
                reference_key: note.reference_key,
                markdown: note.markdown,
                updated_at: note.updated_at,
            })
            .collect::<Vec<_>>();
        write_archive(path, &notes)?;
        Ok(())
    }

    pub fn inspect_notes_archive(&self, path: &Path) -> Result<ImportInspection, ServiceError> {
        let current = self.portable_notes()?;
        inspect_archive(path, &current).map_err(Into::into)
    }

    pub fn apply_note_import(
        &self,
        path: &Path,
        policy: ImportPolicy,
    ) -> Result<usize, ServiceError> {
        let current = self.portable_notes()?;
        let inspection = inspect_archive(path, &current)?;
        let merged = apply_import(&current, &inspection.imported, policy);
        let replacements = merged
            .into_iter()
            .map(|note| {
                Ok((
                    NoteReference::parse(&note.reference_key)?,
                    note.markdown,
                    note.updated_at,
                ))
            })
            .collect::<Result<Vec<_>, NoteError>>()?;
        self.notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .replace_all(&replacements)?;
        Ok(replacements.len())
    }

    fn portable_notes(&self) -> Result<Vec<PortableNote>, ServiceError> {
        Ok(self
            .notes
            .lock()
            .map_err(|_| ServiceError::LockPoisoned)?
            .all()?
            .into_iter()
            .map(|note| PortableNote {
                reference_key: note.reference_key,
                markdown: note.markdown,
                updated_at: note.updated_at,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use bible_db_builder::build_database;
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::AppServices;
    use crate::notes::NoteReference;

    #[test]
    fn exposes_corpus_and_state_operations_through_one_service() {
        let directory = tempdir().unwrap();
        let source_path = directory.path().join("source.db");
        let manifest_path = directory.path().join("manifest.json");
        let corpus_path = directory.path().join("bible.db");
        let user_path = directory.path().join("user.db");
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
                INSERT INTO verses VALUES ('NIV', 'Genesis', 1, 1, 'In the beginning');
                ",
            )
            .unwrap();
        drop(source);
        fs::write(
            &manifest_path,
            r#"{
                "version":1,
                "translations":[{"id":"NIV","label":"NIV","name":"New International Version"}],
                "books":[{"id":0,"en":"Genesis","ko":"창세기","slug":"01-genesis","chapters":1}]
            }"#,
        )
        .unwrap();
        build_database(&source_path, &manifest_path, &corpus_path).unwrap();

        let services = AppServices::open(&corpus_path, &user_path).unwrap();
        assert_eq!(services.manifest().unwrap().translations.len(), 1);
        services.save_state(r#"{"panels":[]}"#).unwrap();
        assert_eq!(
            services.load_state().unwrap().as_deref(),
            Some(r#"{"panels":[]}"#)
        );
        let reference = NoteReference::verse(0, 1, 1).unwrap();
        services.save_note(&reference, "Created").unwrap();
        assert_eq!(
            services.load_note(&reference).unwrap().unwrap().markdown,
            "Created"
        );
    }
}
