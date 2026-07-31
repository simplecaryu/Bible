use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::archive::{ImportInspection, ImportPolicy};
use crate::corpus::{Chapter, LexiconEntry, Manifest, OriginalVerse, SearchResult};
use crate::notes::{Note, NoteReference, NoteSummary};
use crate::services::AppServices;

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
