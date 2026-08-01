use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("personal data sync I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid personal data snapshot: {0}")]
    Json(#[from] serde_json::Error),
    #[error("personal data snapshot checksum does not match")]
    Checksum,
    #[error("unsupported personal data snapshot version: {0}")]
    UnsupportedVersion(u32),
    #[error("personal data sync database failed: {0}")]
    Database(#[from] rusqlite::Error),
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfiguration {
    pub folder: Option<String>,
    pub device_id: String,
}

pub struct SyncConfigurationStore {
    connection: Connection,
}

impl SyncConfigurationStore {
    pub fn open(path: &Path) -> Result<Self, SyncError> {
        let connection = Connection::open(path)?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS local_sync_configuration (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                folder TEXT,
                device_id TEXT NOT NULL
            );
            ",
        )?;
        let exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_sync_configuration WHERE id = 1)",
            [],
            |row| row.get(0),
        )?;
        if !exists {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            connection.execute(
                "INSERT INTO local_sync_configuration (id, folder, device_id) VALUES (1, NULL, ?1)",
                [format!("device-{nanos:x}")],
            )?;
        }
        Ok(Self { connection })
    }

    pub fn load(&self) -> Result<SyncConfiguration, SyncError> {
        self.connection
            .query_row(
                "SELECT folder, device_id FROM local_sync_configuration WHERE id = 1",
                [],
                |row| {
                    Ok(SyncConfiguration {
                        folder: row.get(0)?,
                        device_id: row.get(1)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn set_folder(&mut self, folder: Option<&str>) -> Result<(), SyncError> {
        self.connection.execute(
            "UPDATE local_sync_configuration SET folder = ?1 WHERE id = 1",
            params![folder],
        )?;
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    pub payload: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncNote {
    pub reference_key: String,
    pub markdown: Option<String>,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalDataSnapshot {
    pub format_version: u32,
    pub snapshot_id: String,
    pub base_snapshot_id: Option<String>,
    pub device_id: String,
    pub created_at: String,
    pub settings: Option<SyncSettings>,
    pub notes: Vec<SyncNote>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncConflict {
    pub reference_key: String,
    pub local: SyncNote,
    pub remote: SyncNote,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MergeResult {
    pub settings: Option<SyncSettings>,
    pub notes: Vec<SyncNote>,
    pub conflicts: Vec<SyncConflict>,
}

impl PersonalDataSnapshot {
    pub fn new(
        snapshot_id: impl Into<String>,
        base_snapshot_id: Option<String>,
        device_id: impl Into<String>,
        created_at: impl Into<String>,
        settings: Option<SyncSettings>,
        notes: Vec<SyncNote>,
    ) -> Self {
        Self {
            format_version: FORMAT_VERSION,
            snapshot_id: snapshot_id.into(),
            base_snapshot_id,
            device_id: device_id.into(),
            created_at: created_at.into(),
            settings,
            notes,
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotEnvelope {
    format_version: u32,
    payload: PersonalDataSnapshot,
    checksum: String,
}

fn checksum(payload: &PersonalDataSnapshot) -> Result<String, SyncError> {
    let bytes = serde_json::to_vec(payload)?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn encode_snapshot(snapshot: &PersonalDataSnapshot) -> Result<String, SyncError> {
    let envelope = SnapshotEnvelope {
        format_version: snapshot.format_version,
        payload: snapshot.clone(),
        checksum: checksum(snapshot)?,
    };
    serde_json::to_string_pretty(&envelope).map_err(Into::into)
}

pub fn decode_snapshot(contents: &str) -> Result<PersonalDataSnapshot, SyncError> {
    let envelope: SnapshotEnvelope = serde_json::from_str(contents)?;
    if envelope.format_version != FORMAT_VERSION {
        return Err(SyncError::UnsupportedVersion(envelope.format_version));
    }
    if envelope.payload.format_version != FORMAT_VERSION {
        return Err(SyncError::UnsupportedVersion(
            envelope.payload.format_version,
        ));
    }
    if checksum(&envelope.payload)? != envelope.checksum {
        return Err(SyncError::Checksum);
    }
    Ok(envelope.payload)
}

pub fn read_snapshot(path: &Path) -> Result<PersonalDataSnapshot, SyncError> {
    decode_snapshot(&fs::read_to_string(path)?)
}

pub fn write_snapshot_atomic(
    path: &Path,
    snapshot: &PersonalDataSnapshot,
) -> Result<(), SyncError> {
    let encoded = encode_snapshot(snapshot)?;
    let temporary = path.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| {
        let mut file = File::create(&temporary)?;
        file.write_all(encoded.as_bytes())?;
        file.sync_all()?;
        let verified = read_snapshot(&temporary)?;
        if verified != *snapshot {
            return Err(SyncError::Checksum);
        }
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn merge_snapshots(
    base: &PersonalDataSnapshot,
    local: &PersonalDataSnapshot,
    remote: &PersonalDataSnapshot,
) -> MergeResult {
    let maps = [&base.notes, &local.notes, &remote.notes].map(|notes| {
        notes
            .iter()
            .map(|note| (note.reference_key.as_str(), note))
            .collect::<BTreeMap<_, _>>()
    });
    let keys = maps
        .iter()
        .flat_map(|map| map.keys().copied())
        .collect::<BTreeSet<_>>();
    let mut notes = Vec::new();
    let mut conflicts = Vec::new();
    for key in keys {
        let base_note = maps[0].get(key).copied();
        let local_note = maps[1].get(key).copied();
        let remote_note = maps[2].get(key).copied();
        let chosen = if local_note == remote_note {
            local_note
        } else if local_note == base_note {
            remote_note
        } else if remote_note == base_note {
            local_note
        } else {
            if let (Some(local), Some(remote)) = (local_note, remote_note) {
                conflicts.push(SyncConflict {
                    reference_key: key.to_string(),
                    local: local.clone(),
                    remote: remote.clone(),
                });
            }
            local_note
        };
        if let Some(chosen) = chosen {
            notes.push(chosen.clone());
        }
    }

    let settings = if local.settings == remote.settings {
        local.settings.clone()
    } else if local.settings == base.settings {
        remote.settings.clone()
    } else if remote.settings == base.settings {
        local.settings.clone()
    } else {
        [local.settings.clone(), remote.settings.clone()]
            .into_iter()
            .flatten()
            .max_by(|a, b| a.updated_at.cmp(&b.updated_at))
    };
    MergeResult {
        settings,
        notes,
        conflicts,
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    fn sample_snapshot() -> PersonalDataSnapshot {
        PersonalDataSnapshot::new(
            "snapshot-a",
            None,
            "device-a",
            "2026-08-01T00:00:00Z",
            Some(SyncSettings {
                payload: r#"{"fontSize":14}"#.to_string(),
                updated_at: "2026-08-01T00:00:00Z".to_string(),
            }),
            vec![SyncNote {
                reference_key: "verse:0:1:1".to_string(),
                markdown: Some("note".to_string()),
                updated_at: "2026-08-01T00:00:00Z".to_string(),
            }],
        )
    }

    #[test]
    fn snapshot_round_trips_with_checksum() {
        let encoded = encode_snapshot(&sample_snapshot()).unwrap();
        let decoded = decode_snapshot(&encoded).unwrap();

        assert_eq!(decoded, sample_snapshot());
    }

    #[test]
    fn snapshot_rejects_tampered_payload_and_future_version() {
        let encoded = encode_snapshot(&sample_snapshot()).unwrap();
        let tampered = encoded.replace("\"markdown\": \"note\"", "\"markdown\": \"changed\"");
        assert!(matches!(
            decode_snapshot(&tampered),
            Err(SyncError::Checksum)
        ));

        let future = encoded.replace("\"formatVersion\": 1", "\"formatVersion\": 99");
        assert!(matches!(
            decode_snapshot(&future),
            Err(SyncError::UnsupportedVersion(99))
        ));
    }

    #[test]
    fn atomic_write_replaces_only_with_a_valid_snapshot() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("personal-data.bible-sync");
        write_snapshot_atomic(&path, &sample_snapshot()).unwrap();

        let saved = read_snapshot(&path).unwrap();
        assert_eq!(saved.snapshot_id, "snapshot-a");
        assert_eq!(directory.path().read_dir().unwrap().count(), 1);
    }

    #[test]
    fn three_way_merge_combines_independent_note_changes() {
        let mut base = sample_snapshot();
        let mut local = base.clone();
        let mut remote = base.clone();
        local.notes.push(SyncNote {
            reference_key: "verse:0:1:2".to_string(),
            markdown: Some("local".to_string()),
            updated_at: "2026-08-01T01:00:00Z".to_string(),
        });
        remote.notes.push(SyncNote {
            reference_key: "verse:0:1:3".to_string(),
            markdown: Some("remote".to_string()),
            updated_at: "2026-08-01T02:00:00Z".to_string(),
        });
        base.notes
            .sort_by(|a, b| a.reference_key.cmp(&b.reference_key));

        let merged = merge_snapshots(&base, &local, &remote);

        assert!(merged.conflicts.is_empty());
        assert_eq!(merged.notes.len(), 3);
        assert!(merged
            .notes
            .iter()
            .any(|note| note.markdown.as_deref() == Some("local")));
        assert!(merged
            .notes
            .iter()
            .any(|note| note.markdown.as_deref() == Some("remote")));
    }

    #[test]
    fn three_way_merge_preserves_both_sides_of_edit_and_delete_conflicts() {
        let base = sample_snapshot();
        let mut local = base.clone();
        local.notes[0].markdown = None;
        local.notes[0].updated_at = "2026-08-01T01:00:00Z".to_string();
        let mut remote = base.clone();
        remote.notes[0].markdown = Some("remote edit".to_string());
        remote.notes[0].updated_at = "2026-08-01T02:00:00Z".to_string();

        let merged = merge_snapshots(&base, &local, &remote);

        assert_eq!(merged.conflicts.len(), 1);
        assert_eq!(merged.conflicts[0].local.markdown, None);
        assert_eq!(
            merged.conflicts[0].remote.markdown.as_deref(),
            Some("remote edit")
        );
        assert_eq!(merged.notes[0].markdown, None);
    }

    #[test]
    fn sync_configuration_stays_in_the_local_user_database() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("user.db");
        let mut configuration = SyncConfigurationStore::open(&path).unwrap();

        let initial = configuration.load().unwrap();
        assert!(initial.folder.is_none());
        assert!(!initial.device_id.is_empty());

        configuration
            .set_folder(Some("/SynologyDrive/private/Bible"))
            .unwrap();
        drop(configuration);

        let reopened = SyncConfigurationStore::open(&path).unwrap().load().unwrap();
        assert_eq!(
            reopened.folder.as_deref(),
            Some("/SynologyDrive/private/Bible")
        );
        assert_eq!(reopened.device_id, initial.device_id);
    }
}
