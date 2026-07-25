pub mod corpus;
pub mod services;
pub mod settings;

#[cfg(feature = "desktop")]
mod commands;

#[cfg(feature = "desktop")]
pub fn run() {
    use std::fs;

    use tauri::path::BaseDirectory;
    use tauri::Manager;

    tauri::Builder::default()
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
            commands::load_state,
            commands::save_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Bible desktop application");
}
