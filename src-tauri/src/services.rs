use std::path::Path;
use std::sync::Mutex;

use thiserror::Error;

use crate::corpus::{Chapter, Corpus, CorpusError, Manifest, SearchResult};
use crate::settings::{Settings, SettingsError};

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error(transparent)]
    Corpus(#[from] CorpusError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error("application database lock was poisoned")]
    LockPoisoned,
}

pub struct AppServices {
    corpus: Mutex<Corpus>,
    settings: Mutex<Settings>,
}

impl AppServices {
    pub fn open(corpus_path: &Path, user_path: &Path) -> Result<Self, ServiceError> {
        Ok(Self {
            corpus: Mutex::new(Corpus::open(corpus_path)?),
            settings: Mutex::new(Settings::open(user_path)?),
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
}

#[cfg(test)]
mod tests {
    use std::fs;

    use bible_db_builder::build_database;
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::AppServices;

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
    }
}
