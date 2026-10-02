use crate::{
    diagnostic_log_store::DiagnosticLogStore,
    diagnostic_record::{ClientDiagnostic, DiagnosticRecord},
};
use std::{panic::PanicHookInfo, path::PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};

pub fn record_launch(app: &AppHandle) {
    persist(
        app,
        DiagnosticRecord::app_event("app-launch", "Application launched"),
    );
}

pub fn record_clean_exit(app: &AppHandle) {
    persist(
        app,
        DiagnosticRecord::app_event("app-exit", "Application exited normally"),
    );
}

pub fn install_panic_hook(app: AppHandle) {
    let previous_hook = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |panic_info| {
        let record = DiagnosticRecord::rust_panic(
            &panic_message(panic_info),
            panic_location(panic_info).as_deref(),
            &std::backtrace::Backtrace::force_capture().to_string(),
        );
        persist(&app, record);
        previous_hook(panic_info);
    }));
}

#[tauri::command]
pub fn record_client_diagnostic(app: AppHandle, diagnostic: ClientDiagnostic) {
    persist(&app, DiagnosticRecord::client_error(diagnostic));
}

/// Debug-only manual-QA tool: reports whether Tauri's fs plugin runtime
/// `Scope` currently allows `path` - i.e. whether a native picker command in
/// `fs_scope_commands.rs` selected it during this session. The Rust command,
/// rather than the WebView, grants the returned dialog path. This is exactly the boundary
/// `typst_compiler.rs`'s `is_trusted_document_root` relies on to decide
/// whether a WebView-claimed `document_root` is legitimate - reading the fs
/// plugin's own source shows bare fs permissions (no static `allow` scope)
/// grant nothing on their own, but that can only be verified empirically in
/// a real running app, not from source alone. Not registered in release
/// builds (see `lib.rs`'s `generate_handler!`) - this is a developer-facing
/// verification tool, not a shipped feature. Run the app with
/// `npm run tauri dev`, open the WebView devtools console, and call:
/// `window.__TAURI__.core.invoke('diagnostic_check_fs_scope', { path: '/some/path' })`
/// It should report `false` for any path you have not yet picked via a real
/// Open/Save dialog this session, and `true` immediately after you do.
// Generic over Runtime (not just the concrete Wry `AppHandle` the command
// wrapper below uses) so the test module can exercise it against
// `tauri::test`'s `MockRuntime` app - the same pattern typst_compiler.rs
// uses for `is_trusted_document_root`. Gated the same as the command it
// backs, plus `test`, so a plain release build of the library target alone
// (neither the command nor the test module present) doesn't flag this as
// dead code.
#[cfg(any(debug_assertions, test))]
fn fs_scope_allows<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: &str) -> bool {
    use tauri_plugin_fs::FsExt;
    app.fs_scope().is_allowed(path)
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn diagnostic_check_fs_scope(app: AppHandle, path: String) -> bool {
    fs_scope_allows(&app, &path)
}

fn selected_path(selected: FilePath) -> Result<(PathBuf, String), String> {
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let display_path = path
        .clone()
        .into_os_string()
        .into_string()
        .map_err(|_| "The selected path is not valid Unicode.".to_string())?;
    Ok((path, display_path))
}

/// Saves a customer-shareable diagnostic copy through a native Save panel.
///
/// Invoking Finder through `/usr/bin/open` would require launching a process
/// outside the bundle, which is incompatible with the Mac App Sandbox. The
/// selected destination instead receives the normal user-selected file scope.
#[tauri::command]
pub async fn save_diagnostic_log(app: AppHandle) -> Result<Option<String>, String> {
    let store = log_store(&app)?;
    let contents = store
        .read_for_export()
        .map_err(|error| format!("Could not read diagnostic log: {error}"))?;
    let selected = app
        .dialog()
        .file()
        .set_file_name("AsciiDoc Studio Diagnostics.log")
        .add_filter("Log File", &["log", "txt"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let (destination, display_path) = selected_path(selected)?;
    std::fs::write(destination, contents)
        .map_err(|error| format!("Could not save diagnostic log: {error}"))?;
    Ok(Some(display_path))
}

fn persist(app: &AppHandle, record: DiagnosticRecord) {
    if let Ok(store) = log_store(app) {
        let _ = store.append(&record);
    }
}

fn log_store(app: &AppHandle) -> Result<DiagnosticLogStore, String> {
    diagnostic_log_directory(app).map(DiagnosticLogStore::new)
}

fn diagnostic_log_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_log_dir()
        .map_err(|error| format!("Could not resolve diagnostic log directory: {error}"))
}

fn panic_message(panic_info: &PanicHookInfo<'_>) -> String {
    if let Some(message) = panic_info.payload().downcast_ref::<&str>() {
        return (*message).to_owned();
    }

    if let Some(message) = panic_info.payload().downcast_ref::<String>() {
        return message.clone();
    }

    "Rust panic with a non-text payload".to_owned()
}

fn panic_location(panic_info: &PanicHookInfo<'_>) -> Option<String> {
    panic_info
        .location()
        .map(|location| format!("{}:{}", location.file(), location.line()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_check_fs_scope_reflects_only_paths_granted_to_the_runtime_scope() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("build mock tauri app");
        let allowed = std::env::temp_dir().join("asciidoc-studio-diagnostic-fs-scope-test");
        std::fs::create_dir_all(&allowed).expect("create allowed dir");

        assert!(!fs_scope_allows(app.handle(), &allowed.to_string_lossy()));

        {
            use tauri_plugin_fs::FsExt;
            app.fs_scope()
                .allow_directory(&allowed, true)
                .expect("allow directory in mock fs scope");
        }

        assert!(fs_scope_allows(app.handle(), &allowed.to_string_lossy()));
    }
}
