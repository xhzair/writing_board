mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_project,
            commands::load_manifest,
            commands::save_manifest,
            commands::read_chapter,
            commands::write_chapter,
            commands::add_chapter,
            commands::delete_chapter,
            commands::reorder_chapters,
            commands::update_chapter,
            commands::compile_project,
            commands::read_pdf,
            commands::get_tectonic_path,
            commands::set_tectonic_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
