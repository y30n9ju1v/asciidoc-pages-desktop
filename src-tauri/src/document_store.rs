//! Scoped, serialized document writes. Never truncate the original in place.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use tauri_plugin_fs::FsExt;

static WRITES: Mutex<()> = Mutex::new(());
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn current_text(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn replace_document(path: &Path, content: &str, expected: Option<&str>) -> Result<(), String> {
    let _guard = WRITES.lock().map_err(|e| e.to_string())?;
    if current_text(path)?.as_deref() != expected {
        return Err(
            "This file changed on disk. Open it again or save your work to another file.".into(),
        );
    }
    let parent = path.parent().ok_or("Missing parent directory")?;
    let temporary = parent.join(format!(
        ".asciidoc-save-{}-{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        if let Ok(metadata) = fs::metadata(path) {
            file.set_permissions(metadata.permissions())?;
        }
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        if current_text(path)
            .map_err(std::io::Error::other)?
            .as_deref()
            != expected
        {
            return Err(std::io::Error::other(
                "File changed while saving. Your edits remain unsaved.",
            ));
        }
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|e| e.to_string())
}

fn canonical_destination(path: &Path) -> Result<PathBuf, String> {
    if fs::symlink_metadata(path).is_ok() {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let parent = path
        .parent()
        .ok_or("Missing parent directory")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    Ok(parent.join(path.file_name().ok_or("Missing file name")?))
}

#[tauri::command]
pub async fn save_document_atomic<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    content: String,
    expected: Option<String>,
) -> Result<(), String> {
    let destination = canonical_destination(Path::new(&path))?;
    if !app.fs_scope().is_allowed(&path) || !app.fs_scope().is_allowed(&destination) {
        return Err("Document is outside the selected filesystem scope.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        replace_document(&destination, &content, expected.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn denied_temporary_file_creation_preserves_original_and_allows_retry() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!(
            "document-denied-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        let path = root.join("note.adoc");
        fs::write(&path, "original").unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o500)).unwrap();
        let result = replace_document(&path, "edited", Some("original"));
        // Restore permissions before assertions so even a failed test is recoverable.
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(
            result.is_err(),
            "run this permission test as an unprivileged user"
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        replace_document(&path, "edited", Some("original")).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "edited");
        fs::remove_file(path).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn requires_runtime_scope_before_writing() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "document-scope-{}-{}.adoc",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let canonical = canonical_destination(&path).unwrap();
        let result = tauri::async_runtime::block_on(save_document_atomic(
            app.handle().clone(),
            path.to_string_lossy().into_owned(),
            "private".into(),
            None,
        ));
        assert!(result.unwrap_err().contains("scope"));
        assert!(!path.exists());
        app.fs_scope().allow_file(&path).unwrap();
        app.fs_scope().allow_file(&canonical).unwrap();
        tauri::async_runtime::block_on(save_document_atomic(
            app.handle().clone(),
            path.to_string_lossy().into_owned(),
            "private".into(),
            None,
        ))
        .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "private");
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn preserves_external_changes_and_rejects_creation_collisions() {
        let root = std::env::temp_dir().join(format!(
            "document-store-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).unwrap();
        let path = root.join("note.adoc");
        replace_document(&path, "original", None).unwrap();
        assert!(replace_document(&path, "collision", None).is_err());
        fs::write(&path, "external").unwrap();
        assert!(replace_document(&path, "my edits", Some("original")).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external");
        replace_document(&path, "merged", Some("external")).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "merged");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_file(&path).unwrap();
        fs::remove_dir(&root).unwrap();
    }
}
