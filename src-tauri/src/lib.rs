pub mod archive;
pub mod corpus;
pub mod notes;
pub mod services;
pub mod settings;
pub mod sync;

#[cfg(all(target_os = "linux", any(feature = "desktop", test)))]
fn configure_linux_webkit_environment(mut set_variable: impl FnMut(&str, &str)) {
    set_variable("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    #[test]
    fn disables_webkit_dmabuf_renderer_on_linux() {
        let mut settings = Vec::new();

        super::configure_linux_webkit_environment(|name, value| {
            settings.push((name.to_owned(), value.to_owned()));
        });

        assert_eq!(
            settings,
            [("WEBKIT_DISABLE_DMABUF_RENDERER".to_owned(), "1".to_owned())]
        );
    }
}

#[cfg(feature = "desktop")]
mod commands;

#[cfg(feature = "desktop")]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_environment(|name, value| std::env::set_var(name, value));

    use std::fs;

    use tauri::path::BaseDirectory;
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let corpus_path = app.path().resolve("bible.db", BaseDirectory::Resource)?;
            let user_directory = app.path().app_data_dir()?;
            fs::create_dir_all(&user_directory)?;
            let services =
                services::AppServices::open(&corpus_path, &user_directory.join("user.db"))?;
            app.manage(services);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_manifest,
            commands::get_chapter,
            commands::search,
            commands::has_original_language,
            commands::get_original_verse,
            commands::get_original_chapter,
            commands::get_lexicon_entry,
            commands::get_strong_occurrences,
            commands::load_state,
            commands::save_state,
            commands::get_note,
            commands::save_note,
            commands::delete_note,
            commands::get_descendant_notes,
            commands::choose_notes_export_path,
            commands::choose_notes_import_path,
            commands::export_notes,
            commands::inspect_notes_archive,
            commands::apply_note_import,
            commands::choose_personal_data_sync_folder,
            commands::get_personal_data_sync_configuration,
            commands::configure_personal_data_sync,
            commands::sync_personal_data,
            commands::resolve_personal_data_conflicts
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bible desktop application");
}
