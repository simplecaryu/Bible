use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use zip::write::SimpleFileOptions;

use crate::notes::NoteReference;

const ARCHIVE_VERSION: u32 = 1;
const MAX_FILES: usize = 100_000;
const MAX_NOTE_BYTES: u64 = 1_000_000;
const MAX_ARCHIVE_BYTES: u64 = 100_000_000;

#[derive(Debug, Error)]
pub enum ArchiveError {
    #[error("notes archive I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid ZIP archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("invalid notes manifest: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Invalid(String),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableNote {
    pub reference_key: String,
    pub markdown: String,
    pub updated_at: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportPolicy {
    KeepCurrent,
    ReplaceImported,
    AddNonConflicting,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInspection {
    pub imported: Vec<PortableNote>,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct Manifest {
    version: u32,
    notes: Vec<ManifestNote>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestNote {
    reference_key: String,
    path: String,
    updated_at: String,
    sha256: String,
}

pub fn write_archive(path: &Path, notes: &[PortableNote]) -> Result<(), ArchiveError> {
    let temporary_path = path.with_extension(format!(
        "{}.{}.tmp",
        path.extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("zip"),
        std::process::id()
    ));
    let temporary = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary_path)?;
    let result = write_archive_file(temporary, notes);
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    fs::rename(temporary_path, path)?;
    Ok(())
}

fn write_archive_file(file: File, notes: &[PortableNote]) -> Result<(), ArchiveError> {
    let mut archive = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut manifest_notes = Vec::with_capacity(notes.len());
    let mut seen = BTreeSet::new();
    for note in notes {
        let reference = NoteReference::parse(&note.reference_key)
            .map_err(|error| ArchiveError::Invalid(error.to_string()))?;
        if !seen.insert(note.reference_key.clone()) {
            return Err(ArchiveError::Invalid(format!(
                "duplicate note reference: {}",
                note.reference_key
            )));
        }
        let entry_path = note_path(&reference);
        let body = note_file(note);
        archive.start_file(&entry_path, options)?;
        archive.write_all(body.as_bytes())?;
        manifest_notes.push(ManifestNote {
            reference_key: note.reference_key.clone(),
            path: entry_path,
            updated_at: note.updated_at.clone(),
            sha256: checksum(body.as_bytes()),
        });
    }
    let manifest = serde_json::to_vec_pretty(&Manifest {
        version: ARCHIVE_VERSION,
        notes: manifest_notes,
    })?;
    archive.start_file("manifest.json", options)?;
    archive.write_all(&manifest)?;
    archive.finish()?;
    Ok(())
}

pub fn inspect_archive(
    path: &Path,
    current: &[PortableNote],
) -> Result<ImportInspection, ArchiveError> {
    let file = File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    if archive.len() > MAX_FILES {
        return Err(ArchiveError::Invalid(
            "notes archive has too many files".into(),
        ));
    }
    let mut expanded_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        validate_archive_path(entry.name())?;
        if entry.size() > MAX_NOTE_BYTES && entry.name() != "manifest.json" {
            return Err(ArchiveError::Invalid(format!(
                "archive entry is too large: {}",
                entry.name()
            )));
        }
        expanded_size = expanded_size.saturating_add(entry.size());
        if expanded_size > MAX_ARCHIVE_BYTES {
            return Err(ArchiveError::Invalid(
                "expanded notes archive is larger than 100 MB".into(),
            ));
        }
    }
    let manifest: Manifest = {
        let mut entry = archive.by_name("manifest.json")?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        serde_json::from_slice(&bytes)?
    };
    if manifest.version != ARCHIVE_VERSION {
        return Err(ArchiveError::Invalid(format!(
            "unsupported notes archive version: {}",
            manifest.version
        )));
    }
    let mut imported = Vec::with_capacity(manifest.notes.len());
    let mut references = BTreeSet::new();
    let mut paths = BTreeSet::new();
    for item in manifest.notes {
        if !references.insert(item.reference_key.clone()) {
            return Err(ArchiveError::Invalid(format!(
                "duplicate note reference: {}",
                item.reference_key
            )));
        }
        if !paths.insert(item.path.clone()) {
            return Err(ArchiveError::Invalid(format!(
                "duplicate archive entry: {}",
                item.path
            )));
        }
        validate_archive_path(&item.path)?;
        let reference = NoteReference::parse(&item.reference_key)
            .map_err(|error| ArchiveError::Invalid(error.to_string()))?;
        if note_path(&reference) != item.path {
            return Err(ArchiveError::Invalid(format!(
                "note path does not match its reference: {}",
                item.reference_key
            )));
        }
        let mut entry = archive.by_name(&item.path)?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        if checksum(&bytes) != item.sha256 {
            return Err(ArchiveError::Invalid(format!(
                "checksum mismatch for {}",
                item.path
            )));
        }
        let text = String::from_utf8(bytes)
            .map_err(|_| ArchiveError::Invalid(format!("note is not UTF-8: {}", item.path)))?;
        imported.push(parse_note_file(
            &text,
            &item.reference_key,
            &item.updated_at,
        )?);
    }
    let current_by_key = current
        .iter()
        .map(|note| (note.reference_key.as_str(), note))
        .collect::<BTreeMap<_, _>>();
    let conflicts = imported
        .iter()
        .filter(|note| {
            current_by_key
                .get(note.reference_key.as_str())
                .is_some_and(|current| current.markdown != note.markdown)
        })
        .map(|note| note.reference_key.clone())
        .collect();
    Ok(ImportInspection {
        imported,
        conflicts,
    })
}

pub fn apply_import(
    current: &[PortableNote],
    imported: &[PortableNote],
    policy: ImportPolicy,
) -> Vec<PortableNote> {
    let mut merged = current
        .iter()
        .cloned()
        .map(|note| (note.reference_key.clone(), note))
        .collect::<BTreeMap<_, _>>();
    for note in imported {
        match policy {
            ImportPolicy::ReplaceImported => {
                merged.insert(note.reference_key.clone(), note.clone());
            }
            ImportPolicy::KeepCurrent | ImportPolicy::AddNonConflicting => {
                merged
                    .entry(note.reference_key.clone())
                    .or_insert_with(|| note.clone());
            }
        }
    }
    merged.into_values().collect()
}

fn note_path(reference: &NoteReference) -> String {
    match reference {
        NoteReference::Book { book_id } => format!("books/{:02}/book.md", book_id + 1),
        NoteReference::Chapter { book_id, chapter } => {
            format!("books/{:02}/chapters/{chapter:03}/chapter.md", book_id + 1)
        }
        NoteReference::Verse {
            book_id,
            chapter,
            verse,
        } => format!(
            "books/{:02}/chapters/{chapter:03}/verses/{verse:03}.md",
            book_id + 1
        ),
    }
}

fn note_file(note: &PortableNote) -> String {
    format!(
        "---\nreference: {}\nupdated_at: {}\n---\n{}",
        note.reference_key, note.updated_at, note.markdown
    )
}

fn parse_note_file(
    text: &str,
    expected_reference: &str,
    expected_updated_at: &str,
) -> Result<PortableNote, ArchiveError> {
    let remainder = text
        .strip_prefix("---\n")
        .ok_or_else(|| ArchiveError::Invalid("note frontmatter is missing".into()))?;
    let (frontmatter, markdown) = remainder
        .split_once("\n---\n")
        .ok_or_else(|| ArchiveError::Invalid("note frontmatter is incomplete".into()))?;
    let mut reference = None;
    let mut updated_at = None;
    for line in frontmatter.lines() {
        if let Some(value) = line.strip_prefix("reference: ") {
            reference = Some(value);
        } else if let Some(value) = line.strip_prefix("updated_at: ") {
            updated_at = Some(value);
        }
    }
    if reference != Some(expected_reference) || updated_at != Some(expected_updated_at) {
        return Err(ArchiveError::Invalid(
            "note frontmatter does not match the manifest".into(),
        ));
    }
    Ok(PortableNote {
        reference_key: expected_reference.to_string(),
        markdown: markdown.to_string(),
        updated_at: expected_updated_at.to_string(),
    })
}

fn validate_archive_path(value: &str) -> Result<(), ArchiveError> {
    if value.contains('\\')
        || Path::new(value)
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(ArchiveError::Invalid(format!(
            "unsafe archive path: {value}"
        )));
    }
    Ok(())
}

fn checksum(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
