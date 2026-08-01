use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::archive::{ImportInspection, ImportPolicy};
use crate::corpus::{
    Chapter, LexiconEntry, Manifest, OriginalVerse, SearchResult, StrongOccurrencePage,
};
use crate::notes::{Note, NoteReference, NoteSummary};
use crate::services::AppServices;
use crate::sync::{ConflictResolution, SyncConfiguration, SyncOutcome};

const MAX_NOTE_BYTES: usize = 1_000_000;

#[tauri::command]
pub fn get_manifest(state: State<'_, AppServices>) -> Result<Manifest, String> {
    state.manifest().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_chapter(
    state: State<'_, AppServices>,
    book_id: i64,
    chapter: i64,
    translations: Vec<String>,
) -> Result<Chapter, String> {
    state
        .chapter(book_id, chapter, &translations)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search(
    state: State<'_, AppServices>,
    query: String,
    translations: Vec<String>,
) -> Result<SearchResult, String> {
    state
        .search(&query, &translations)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn has_original_language(
    state: State<'_, AppServices>,
    book_id: i64,
    chapter: i64,
    verse: i64,
) -> Result<bool, String> {
    state
        .has_original_language(book_id, chapter, verse)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_original_verse(
    state: State<'_, AppServices>,
    book_id: i64,
    chapter: i64,
    verse: i64,
) -> Result<Option<OriginalVerse>, String> {
    state
        .original_verse(book_id, chapter, verse)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_original_chapter(
    state: State<'_, AppServices>,
    book_id: i64,
    chapter: i64,
) -> Result<Vec<OriginalVerse>, String> {
    state
        .original_chapter(book_id, chapter)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_lexicon_entry(
    state: State<'_, AppServices>,
    strong: String,
    morphology: String,
    language: String,
) -> Result<Option<LexiconEntry>, String> {
    if strong.len() > 24 || morphology.len() > 64 {
        return Err("invalid original-language identifier".to_string());
    }
    if !matches!(language.as_str(), "hebrew" | "aramaic" | "greek") {
        return Err("invalid original-language value".to_string());
    }
    state
        .lexicon_entry(&strong, &morphology, &language)
        .map_err(|error| error.to_string())
}

fn validate_strong_occurrence_request(
    strong: &str,
    book_id: Option<i64>,
    morphology: Option<&str>,
    translation_ids: &[String],
    offset: usize,
    limit: usize,
) -> Result<(), String> {
    let mut characters = strong.chars();
    let valid_prefix = matches!(characters.next(), Some('H' | 'G'));
    let remainder = characters.collect::<String>();
    let digit_count = remainder.chars().take_while(char::is_ascii_digit).count();
    let valid_suffix = remainder
        .chars()
        .skip(digit_count)
        .all(|character| character.is_ascii_uppercase());
    if !valid_prefix || !(1..=6).contains(&digit_count) || !valid_suffix || strong.len() > 24 {
        return Err("invalid Strong identifier".to_string());
    }
    if book_id.is_some_and(|book| !(0..66).contains(&book)) {
        return Err("invalid Bible book".to_string());
    }
    if morphology.is_some_and(|value| value.len() > 64) {
        return Err("invalid morphology identifier".to_string());
    }
    if translation_ids.len() > 32
        || translation_ids.iter().any(|id| {
            id.is_empty()
                || id.len() > 24
                || !id.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
                })
        })
    {
        return Err("invalid translation identifier".to_string());
    }
    if offset > 1_000_000 || !(1..=50).contains(&limit) {
        return Err("invalid occurrence page".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_strong_occurrences(
    state: State<'_, AppServices>,
    strong: String,
    book_id: Option<i64>,
    morphology: Option<String>,
    translation_ids: Vec<String>,
    offset: usize,
    limit: usize,
) -> Result<StrongOccurrencePage, String> {
    validate_strong_occurrence_request(
        &strong,
        book_id,
        morphology.as_deref(),
        &translation_ids,
        offset,
        limit,
    )?;
    state
        .strong_occurrences(
            &strong,
            book_id,
            morphology.as_deref(),
            &translation_ids,
            offset,
            limit,
        )
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod occurrence_tests {
    use super::validate_strong_occurrence_request;

    #[test]
    fn validates_strong_occurrence_request_bounds() {
        assert!(validate_strong_occurrence_request(
            "G3056A",
            Some(42),
            None,
            &["NIV".to_string()],
            0,
            50,
        )
        .is_ok());
        assert!(validate_strong_occurrence_request(
            "word",
            Some(42),
            None,
            &["NIV".to_string()],
            0,
            50,
        )
        .is_err());
        assert!(validate_strong_occurrence_request(
            "G3056",
            Some(-1),
            None,
            &["NIV".to_string()],
            0,
            51,
        )
        .is_err());
    }
}

#[tauri::command]
pub fn load_state(state: State<'_, AppServices>) -> Result<Option<String>, String> {
    state.load_state().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_state(state: State<'_, AppServices>, payload: String) -> Result<(), String> {
    state
        .save_state(&payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_note(
    state: State<'_, AppServices>,
    reference_key: String,
) -> Result<Option<Note>, String> {
    let reference = NoteReference::parse(&reference_key).map_err(|error| error.to_string())?;
    state
        .load_note(&reference)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_note(
    state: State<'_, AppServices>,
    reference_key: String,
    markdown: String,
) -> Result<(), String> {
    if markdown.len() > MAX_NOTE_BYTES {
        return Err("note is larger than 1 MB".to_string());
    }
    let reference = NoteReference::parse(&reference_key).map_err(|error| error.to_string())?;
    state
        .save_note(&reference, &markdown)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppServices>, reference_key: String) -> Result<(), String> {
    let reference = NoteReference::parse(&reference_key).map_err(|error| error.to_string())?;
    state
        .delete_note(&reference)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_descendant_notes(
    state: State<'_, AppServices>,
    reference_key: String,
) -> Result<Vec<NoteSummary>, String> {
    let reference = NoteReference::parse(&reference_key).map_err(|error| error.to_string())?;
    state
        .descendant_notes(&reference)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn choose_notes_export_path(app: AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .add_filter("Bible notes archive", &["zip"])
        .set_file_name("bible-notes.zip")
        .blocking_save_file()
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[tauri::command]
pub async fn choose_notes_import_path(app: AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .add_filter("Bible notes archive", &["zip"])
        .blocking_pick_file()
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[tauri::command]
pub fn export_notes(state: State<'_, AppServices>, path: String) -> Result<(), String> {
    state
        .export_notes(Path::new(&path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inspect_notes_archive(
    state: State<'_, AppServices>,
    path: String,
) -> Result<ImportInspection, String> {
    state
        .inspect_notes_archive(Path::new(&path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_note_import(
    state: State<'_, AppServices>,
    path: String,
    policy: ImportPolicy,
) -> Result<usize, String> {
    state
        .apply_note_import(Path::new(&path), policy)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn choose_personal_data_sync_folder(app: AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[tauri::command]
pub fn get_personal_data_sync_configuration(
    state: State<'_, AppServices>,
) -> Result<SyncConfiguration, String> {
    state
        .sync_configuration()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn configure_personal_data_sync(
    state: State<'_, AppServices>,
    path: Option<String>,
) -> Result<(), String> {
    state
        .configure_sync_folder(path.as_deref().map(Path::new))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn sync_personal_data(state: State<'_, AppServices>) -> Result<SyncOutcome, String> {
    state
        .sync_personal_data()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resolve_personal_data_conflicts(
    state: State<'_, AppServices>,
    resolutions: Vec<ConflictResolution>,
) -> Result<SyncOutcome, String> {
    state
        .resolve_sync_conflicts(&resolutions)
        .map_err(|error| error.to_string())
}
