use std::path::Path;

use rusqlite::{params, Connection};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("user settings database failed: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("invalid application state: {0}")]
    InvalidJson(#[from] serde_json::Error),
}

pub struct Settings {
    connection: Connection,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SettingsRecord {
    pub payload: String,
    pub updated_at: String,
}

impl Settings {
    pub fn open(path: &Path) -> Result<Self, SettingsError> {
        let connection = Connection::open(path)?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO metadata (key, value)
            VALUES ('schema_version', '1');
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            ",
        )?;
        Ok(Self { connection })
    }

    pub fn load(&self) -> Result<Option<String>, SettingsError> {
        let mut statement = self
            .connection
            .prepare("SELECT payload FROM settings WHERE id = 1")?;
        let mut rows = statement.query([])?;
        Ok(match rows.next()? {
            Some(row) => Some(row.get(0)?),
            None => None,
        })
    }

    pub fn save(&mut self, payload: &str) -> Result<(), SettingsError> {
        serde_json::from_str::<serde_json::Value>(payload)?;
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "
            INSERT INTO settings (id, payload, updated_at)
            VALUES (1, ?1, datetime('now'))
            ON CONFLICT(id) DO UPDATE
            SET payload = excluded.payload,
                updated_at = excluded.updated_at
            ",
            params![payload],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn record(&self) -> Result<Option<SettingsRecord>, SettingsError> {
        let mut statement = self
            .connection
            .prepare("SELECT payload, updated_at FROM settings WHERE id = 1")?;
        let mut rows = statement.query([])?;
        Ok(match rows.next()? {
            Some(row) => Some(SettingsRecord {
                payload: row.get(0)?,
                updated_at: row.get(1)?,
            }),
            None => None,
        })
    }

    pub fn replace(&mut self, payload: &str, updated_at: &str) -> Result<(), SettingsError> {
        serde_json::from_str::<serde_json::Value>(payload)?;
        self.connection.execute(
            "
            INSERT INTO settings (id, payload, updated_at) VALUES (1, ?1, ?2)
            ON CONFLICT(id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            ",
            params![payload, updated_at],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::Settings;

    #[test]
    fn creates_and_round_trips_saved_ui_state() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("user.db");
        let mut settings = Settings::open(&path).unwrap();

        assert_eq!(settings.load().unwrap(), None);
        settings
            .save(r#"{"fontSize":16,"panels":[{"book":0,"chapter":1}]}"#)
            .unwrap();
        assert_eq!(
            settings.load().unwrap().as_deref(),
            Some(r#"{"fontSize":16,"panels":[{"book":0,"chapter":1}]}"#)
        );
    }

    #[test]
    fn exports_and_replaces_timestamped_state_for_sync() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("user.db");
        let mut settings = Settings::open(&path).unwrap();
        settings.save(r#"{"fontSize":14}"#).unwrap();

        let exported = settings.record().unwrap().unwrap();
        assert_eq!(exported.payload, r#"{"fontSize":14}"#);
        assert!(!exported.updated_at.is_empty());

        settings
            .replace(r#"{"fontSize":18}"#, "2026-08-01T02:00:00Z")
            .unwrap();
        let replaced = settings.record().unwrap().unwrap();
        assert_eq!(replaced.payload, r#"{"fontSize":18}"#);
        assert_eq!(replaced.updated_at, "2026-08-01T02:00:00Z");
    }
}
