use crate::diagnostic_record::DiagnosticRecord;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

const LOG_FILE_NAME: &str = "diagnostics.log";
const PREVIOUS_LOG_FILE_NAME: &str = "diagnostics.previous.log";
const MAX_LOG_BYTES: u64 = 1024 * 1024;

pub struct DiagnosticLogStore {
    directory: PathBuf,
}

impl DiagnosticLogStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn ensure_directory(&self) -> io::Result<()> {
        fs::create_dir_all(&self.directory)
    }

    pub fn append(&self, record: &DiagnosticRecord) -> io::Result<()> {
        self.ensure_directory()?;

        let log_file = self.directory.join(LOG_FILE_NAME);
        rotate_log_if_needed(&log_file)?;
        let serialized = serde_json::to_string(record).map_err(io::Error::other)?;

        OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)
            .and_then(|mut file| writeln!(file, "{serialized}"))
    }

    /// Reads the current log for a user-requested export without exposing the
    /// app container path to the WebView.
    pub fn read_for_export(&self) -> io::Result<Vec<u8>> {
        self.ensure_directory()?;
        let log_file = self.directory.join(LOG_FILE_NAME);
        match fs::read(log_file) {
            Ok(contents) => Ok(contents),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                Ok(b"No diagnostic records were written.\n".to_vec())
            }
            Err(error) => Err(error),
        }
    }
}

fn rotate_log_if_needed(log_file: &Path) -> io::Result<()> {
    let metadata = match fs::metadata(log_file) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };

    if metadata.len() < MAX_LOG_BYTES {
        return Ok(());
    }

    let previous_log = log_file.with_file_name(PREVIOUS_LOG_FILE_NAME);
    if previous_log.exists() {
        fs::remove_file(&previous_log)?;
    }
    fs::rename(log_file, previous_log)
}

#[cfg(test)]
mod tests {
    use super::{DiagnosticLogStore, LOG_FILE_NAME, MAX_LOG_BYTES, PREVIOUS_LOG_FILE_NAME};
    use crate::diagnostic_record::DiagnosticRecord;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    static TEST_DIRECTORY_COUNTER: AtomicUsize = AtomicUsize::new(0);

    struct TemporaryDirectory(PathBuf);

    impl TemporaryDirectory {
        fn create() -> Self {
            let suffix = TEST_DIRECTORY_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "asciidoc-studio-diagnostic-test-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }
    }

    impl Drop for TemporaryDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn appends_a_json_line_for_each_record() {
        let directory = TemporaryDirectory::create();
        let store = DiagnosticLogStore::new(directory.0.clone());

        store
            .append(&DiagnosticRecord::app_event(
                "app-launch",
                "Application launched",
            ))
            .expect("diagnostic record should be written");

        let contents =
            fs::read_to_string(directory.0.join(LOG_FILE_NAME)).expect("log should be readable");
        let record: serde_json::Value =
            serde_json::from_str(contents.trim()).expect("log should contain JSON");
        assert_eq!(record["source"], "app-launch");
        assert_eq!(record["message"], "Application launched");
    }

    #[test]
    fn rotates_an_oversized_log_before_appending() {
        let directory = TemporaryDirectory::create();
        let log_file = directory.0.join(LOG_FILE_NAME);
        fs::write(&log_file, vec![b'x'; MAX_LOG_BYTES as usize])
            .expect("oversized log should be created");
        let store = DiagnosticLogStore::new(directory.0.clone());

        store
            .append(&DiagnosticRecord::app_event(
                "app-exit",
                "Application exited normally",
            ))
            .expect("diagnostic record should be written after rotation");

        assert_eq!(
            fs::metadata(directory.0.join(PREVIOUS_LOG_FILE_NAME))
                .expect("previous log should exist")
                .len(),
            MAX_LOG_BYTES
        );
        let current_log = fs::read_to_string(log_file).expect("new log should be readable");
        assert!(current_log.contains("app-exit"));
    }

    #[test]
    fn exports_a_helpful_message_when_no_log_has_been_written() {
        let directory = TemporaryDirectory::create();
        let store = DiagnosticLogStore::new(directory.0.clone());

        let contents = store
            .read_for_export()
            .expect("empty log export should succeed");

        assert_eq!(contents, b"No diagnostic records were written.\n");
    }
}
