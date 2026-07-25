use tauri::State;

use crate::corpus::{Chapter, Manifest, SearchResult};
use crate::services::AppServices;

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
pub fn load_state(state: State<'_, AppServices>) -> Result<Option<String>, String> {
    state.load_state().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_state(state: State<'_, AppServices>, payload: String) -> Result<(), String> {
    state
        .save_state(&payload)
        .map_err(|error| error.to_string())
}
