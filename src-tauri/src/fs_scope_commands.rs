use tauri::{command, AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_fs::FsExt;

fn grant_vault_metadata<R: Runtime>(app: &AppHandle<R>, root: &str) -> Result<(), String> {
    let metadata = std::path::Path::new(root).join(".asciidoc-studio");
    match std::fs::symlink_metadata(&metadata) {
        Ok(info) if info.file_type().is_symlink() => {
            return Err("Vault metadata must not be a symbolic link.".into());
        }
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.to_string()),
        _ => {}
    }
    // Unix recursive globs exclude dot-prefixed components. Grant only the
    // app-owned metadata directory, not every hidden directory in the Vault.
    app.fs_scope()
        .allow_directory(metadata, true)
        .map_err(|error| error.to_string())
}

fn path_from_selection(selected: FilePath) -> Result<String, String> {
    selected
        .into_path()
        .map_err(|error| error.to_string())?
        .into_os_string()
        .into_string()
        .map_err(|_| "The selected path is not valid Unicode.".to_string())
}

fn grant_file_selection<R: Runtime>(
    app: &AppHandle<R>,
    selected: Option<FilePath>,
) -> Result<Option<String>, String> {
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = path_from_selection(selected)?;
    app.fs_scope()
        .allow_file(&path)
        .map_err(|error| error.to_string())?;
    Ok(Some(path))
}

fn grant_directory_selection<R: Runtime>(
    app: &AppHandle<R>,
    selected: Option<FilePath>,
) -> Result<Option<String>, String> {
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = path_from_selection(selected)?;
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())?;
    Ok(Some(path))
}

/// Opens a native picker and grants scope only to the selected document.
#[command]
pub async fn choose_document_to_open<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    grant_file_selection(
        &app,
        app.dialog()
            .file()
            .add_filter("AsciiDoc", &["adoc", "asciidoc", "txt"])
            .blocking_pick_file(),
    )
}

/// Opens a native save picker and grants scope only to its selected document path.
#[command]
pub async fn choose_document_save_path<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    grant_file_selection(
        &app,
        app.dialog()
            .file()
            .set_file_name("document.adoc")
            .add_filter("AsciiDoc", &["adoc"])
            .blocking_save_file(),
    )
}

/// Opens a native directory picker and grants recursive scope to the selected Vault.
#[command]
pub async fn choose_vault_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let selected = grant_directory_selection(&app, app.dialog().file().blocking_pick_folder())?;
    if let Some(root) = &selected {
        grant_vault_metadata(&app, root)?;
    }
    Ok(selected)
}

/// Opens a native export save picker. Its returned path already has file scope.
#[command]
pub async fn choose_export_file<R: Runtime>(
    app: AppHandle<R>,
    default_path: String,
    filter_name: String,
    extensions: Vec<String>,
) -> Result<Option<String>, String> {
    let extension_refs = extensions.iter().map(String::as_str).collect::<Vec<_>>();
    grant_file_selection(
        &app,
        app.dialog()
            .file()
            .set_file_name(default_path)
            .add_filter(filter_name, &extension_refs)
            .blocking_save_file(),
    )
}

/// Opens a native directory picker. Its returned folder has recursive scope for a multi-file export.
#[command]
pub async fn choose_export_directory<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    grant_directory_selection(&app, app.dialog().file().blocking_pick_folder())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_grant_is_limited_to_the_selected_vault() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let root = std::env::temp_dir().join(format!("vault-scope-{}", std::process::id()));
        let book = root.join(".asciidoc-studio/book.json");
        app.fs_scope().allow_directory(&root, true).unwrap();
        #[cfg(unix)]
        assert!(!app.fs_scope().is_allowed(&book));
        grant_vault_metadata(app.handle(), root.to_str().unwrap()).unwrap();
        assert!(app.fs_scope().is_allowed(&book));
        for path in [
            "book.json",
            "history/chapter/snapshot.adoc",
            "rendering-templates/custom.json",
        ] {
            assert!(app
                .fs_scope()
                .is_allowed(root.join(".asciidoc-studio").join(path)));
        }
        assert!(app.fs_scope().is_allowed(root.join(".asciidoc-studio")));
        #[cfg(unix)]
        assert!(!app.fs_scope().is_allowed(root.join(".ssh/id_rsa")));
        assert!(!app.fs_scope().is_allowed(
            root.with_extension("other")
                .join(".asciidoc-studio/book.json")
        ));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_metadata_symlink_outside_vault() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let root = std::env::temp_dir().join(format!("vault-scope-link-{}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        let metadata = root.join(".asciidoc-studio");
        std::os::unix::fs::symlink(std::env::temp_dir(), &metadata).unwrap();
        let result = grant_vault_metadata(app.handle(), root.to_str().unwrap());
        std::fs::remove_file(metadata).unwrap();
        std::fs::remove_dir(root).unwrap();
        assert!(result.unwrap_err().contains("symbolic link"));
    }
}
