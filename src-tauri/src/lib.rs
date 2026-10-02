mod diagnostic_log_store;
mod diagnostic_record;
mod diagnostic_runtime;
mod document_store;
mod fs_scope_commands;
mod path_safety;
#[path = "../../packages/asciidoc-typst/rust/src/publication.rs"]
mod publication;
mod publication_request;
#[path = "../../packages/asciidoc-typst/rust/src/safe_document.rs"]
mod safe_document;
mod search_index;
mod typst_compiler;
#[path = "../../packages/asciidoc-typst/rust/src/typst_font.rs"]
mod typst_font;
#[path = "../../packages/asciidoc-typst/rust/src/typst_writer.rs"]
mod typst_writer;
#[cfg(test)]
mod visual_regression;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            document_store::save_document_atomic,
            search_index::sync_search_index,
            search_index::search_notes,
            fs_scope_commands::choose_document_to_open,
            fs_scope_commands::choose_document_save_path,
            fs_scope_commands::choose_vault_folder,
            fs_scope_commands::choose_export_file,
            fs_scope_commands::choose_export_directory,
            diagnostic_runtime::record_client_diagnostic,
            diagnostic_runtime::save_diagnostic_log,
            // Manual-QA-only tool for verifying, in a real running app, that
            // Tauri's fs plugin runtime Scope reflects only dialog-granted
            // paths - see its own doc comment. Never registered in a
            // release build.
            #[cfg(debug_assertions)]
            diagnostic_runtime::diagnostic_check_fs_scope,
            typst_compiler::compile_typst_pdf,
            typst_compiler::generate_typst_source
        ])
        .setup(|app| {
            diagnostic_runtime::install_panic_hook(app.handle().clone());
            diagnostic_runtime::record_launch(app.handle());
            typst_compiler::cleanup_stale_temp_pdfs(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            diagnostic_runtime::record_clean_exit(app_handle);
            search_index::clear_search_index_on_exit(app_handle);
        }
    });
}
