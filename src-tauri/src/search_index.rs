use std::collections::{HashMap, HashSet};
use std::time::Duration;

use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_QUERY_LENGTH: usize = 200;
const MAX_RESULTS: i64 = 50;
// Each command opens its own connection to the same on-disk database, so a
// sync_search_index write and a search_notes read can land on SQLite at the
// same moment. WAL mode already lets reads proceed without blocking, but the
// default busy_timeout is 0 - a write that collides with another write (e.g.
// two syncs racing) would fail immediately with SQLITE_BUSY instead of
// waiting the near-instant amount of time these single-process, on-disk
// transactions actually take.
const BUSY_TIMEOUT: Duration = Duration::from_millis(2000);

#[derive(Debug, Deserialize)]
pub struct SearchIndexNote {
    path: String,
    name: String,
    title: String,
    content: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    path: String,
    name: String,
    title: String,
    snippet: String,
}

type IndexedContent = (String, String, String);

/// Keeps the local index limited to the vault currently open in the app. The
/// index is derived data, so retaining full-text copies of previously opened
/// vaults would provide no user-visible benefit and would unnecessarily keep
/// their contents in the application data directory.
fn remove_inactive_vaults(transaction: &Transaction<'_>, vault_root: &str) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM note_search WHERE vault_root <> ?",
            [vault_root],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM indexed_notes WHERE vault_root <> ?",
            [vault_root],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn clear_indexed_content(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            PRAGMA secure_delete = ON;
            DELETE FROM note_search;
            DELETE FROM indexed_notes;
            PRAGMA wal_checkpoint(TRUNCATE);
            ",
        )
        .map_err(|error| error.to_string())
}

fn initialize_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS indexed_notes (
              vault_root TEXT NOT NULL,
              path TEXT NOT NULL,
              name TEXT NOT NULL,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              PRIMARY KEY (vault_root, path)
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS note_search USING fts5(
              vault_root UNINDEXED,
              path UNINDEXED,
              title,
              name,
              content,
              tokenize = 'trigram case_sensitive 0'
            );
            CREATE INDEX IF NOT EXISTS indexed_notes_vault_root ON indexed_notes(vault_root);
            ",
        )
        .map_err(|error| format!("Could not initialize the search index: {error}"))
}

fn database(app: &AppHandle) -> Result<Connection, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not find the app data directory: {error}"))?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the search index directory: {error}"))?;

    let connection = Connection::open(directory.join("search-index.sqlite3"))
        .map_err(|error| format!("Could not open the search index: {error}"))?;
    connection
        .busy_timeout(BUSY_TIMEOUT)
        .map_err(|error| format!("Could not configure the search index: {error}"))?;
    initialize_database(&connection)?;
    Ok(connection)
}

/// Clears the disposable index during a normal app shutdown. A forced process
/// termination cannot run cleanup, but the next successful vault sync still
/// removes any index that belongs to a different vault.
pub fn clear_search_index_on_exit(app: &AppHandle) {
    let Ok(directory) = app.path().app_data_dir() else {
        return;
    };
    let path = directory.join("search-index.sqlite3");
    if !path.is_file() {
        return;
    }
    if let Ok(connection) = Connection::open(path) {
        let _ = clear_indexed_content(&connection);
    }
}

fn indexed_notes(
    connection: &Connection,
    vault_root: &str,
) -> Result<HashMap<String, IndexedContent>, String> {
    let mut statement = connection
        .prepare("SELECT path, name, title, content FROM indexed_notes WHERE vault_root = ?")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([vault_root], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get(1)?, row.get(2)?, row.get(3)?),
            ))
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<HashMap<_, _>, _>>()
        .map_err(|error| error.to_string())
}

fn is_unchanged(note: &SearchIndexNote, existing: &HashMap<String, IndexedContent>) -> bool {
    existing
        .get(&note.path)
        .is_some_and(|(name, title, content)| {
            name == &note.name && title == &note.title && content == &note.content
        })
}

fn replace_indexed_note(
    transaction: &Transaction<'_>,
    vault_root: &str,
    note: &SearchIndexNote,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM note_search WHERE vault_root = ? AND path = ?",
            params![vault_root, note.path],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO note_search (vault_root, path, title, name, content) VALUES (?, ?, ?, ?, ?)",
            params![vault_root, note.path, note.title, note.name, note.content],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO indexed_notes (vault_root, path, name, title, content) VALUES (?, ?, ?, ?, ?) \
             ON CONFLICT(vault_root, path) DO UPDATE SET name = excluded.name, title = excluded.title, content = excluded.content",
            params![vault_root, note.path, note.name, note.title, note.content],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn remove_indexed_note(
    transaction: &Transaction<'_>,
    vault_root: &str,
    path: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM note_search WHERE vault_root = ? AND path = ?",
            params![vault_root, path],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM indexed_notes WHERE vault_root = ? AND path = ?",
            params![vault_root, path],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn update_changed_notes(
    transaction: &Transaction<'_>,
    vault_root: &str,
    notes: &[SearchIndexNote],
    existing: &HashMap<String, IndexedContent>,
) -> Result<(), String> {
    for note in notes {
        if !is_unchanged(note, existing) {
            replace_indexed_note(transaction, vault_root, note)?;
        }
    }
    Ok(())
}

fn remove_missing_notes(
    transaction: &Transaction<'_>,
    vault_root: &str,
    received_paths: &HashSet<&str>,
    existing: &HashMap<String, IndexedContent>,
) -> Result<(), String> {
    for path in existing
        .keys()
        .filter(|path| !received_paths.contains(path.as_str()))
    {
        remove_indexed_note(transaction, vault_root, path)?;
    }
    Ok(())
}

/// Updates only notes whose title, name, or body changed. The source files remain
/// authoritative; this local database is disposable derived search data.
#[tauri::command]
pub fn sync_search_index(
    app: AppHandle,
    vault_root: String,
    notes: Vec<SearchIndexNote>,
    paths: Option<Vec<String>>,
) -> Result<(), String> {
    let mut connection = database(&app)?;
    let existing = indexed_notes(&connection, &vault_root)?;
    let received_paths: HashSet<&str> = match &paths {
        Some(paths) => paths.iter().map(String::as_str).collect(),
        None => notes.iter().map(|note| note.path.as_str()).collect(),
    };
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    remove_inactive_vaults(&transaction, &vault_root)?;
    update_changed_notes(&transaction, &vault_root, &notes, &existing)?;
    remove_missing_notes(&transaction, &vault_root, &received_paths, &existing)?;

    transaction.commit().map_err(|error| error.to_string())
}

fn fts_query(query: &str) -> Option<String> {
    let terms = query.split_whitespace().collect::<Vec<_>>();
    if terms.is_empty() || terms.iter().any(|term| term.chars().count() < 3) {
        return None;
    }
    let quoted_terms = terms
        .iter()
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>();
    Some(quoted_terms.join(" AND "))
}

fn fallback_snippet(content: &str, query: &str) -> String {
    let position = content.find(query).unwrap_or(0);
    let start = content[..position]
        .char_indices()
        .rev()
        .nth(70)
        .map_or(0, |(index, _)| index);
    let end = content[position..]
        .char_indices()
        .nth(180)
        .map_or(content.len(), |(index, _)| position + index);
    let prefix = if start > 0 { "… " } else { "" };
    let suffix = if end < content.len() { " …" } else { "" };
    format!("{prefix}{}{suffix}", content[start..end].replace('\n', " "))
}

fn fallback_search(
    connection: &Connection,
    vault_root: &str,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    let mut statement = connection
        .prepare(
            "SELECT path, name, title, content FROM indexed_notes
             WHERE vault_root = ? AND (instr(lower(title), lower(?)) > 0 OR instr(lower(name), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0)
             ORDER BY title COLLATE NOCASE, path COLLATE NOCASE LIMIT ?",
        )
        .map_err(|error| error.to_string())?;
    let results = statement
        .query_map(
            params![vault_root, query, query, query, MAX_RESULTS],
            |row| {
                let content: String = row.get(3)?;
                Ok(SearchResult {
                    path: row.get(0)?,
                    name: row.get(1)?,
                    title: row.get(2)?,
                    snippet: fallback_snippet(&content, query),
                })
            },
        )
        .map_err(|error| error.to_string())?;
    results
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_notes(
    app: AppHandle,
    vault_root: String,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let normalized = query.trim();
    if normalized.is_empty() || normalized.chars().count() > MAX_QUERY_LENGTH {
        return Ok(Vec::new());
    }

    let connection = database(&app)?;
    let Some(query) = fts_query(normalized) else {
        return fallback_search(&connection, &vault_root, normalized);
    };
    let mut statement = connection
        .prepare(
            "SELECT path, name, title, snippet(note_search, 4, '', '', ' … ', 20)
             FROM note_search WHERE note_search MATCH ? AND vault_root = ?
             ORDER BY bm25(note_search, 0.0, 0.0, 8.0, 5.0, 1.0) LIMIT ?",
        )
        .map_err(|error| error.to_string())?;
    let results = statement
        .query_map(params![query, vault_root, MAX_RESULTS], |row| {
            Ok(SearchResult {
                path: row.get(0)?,
                name: row.get(1)?,
                title: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    results
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{clear_indexed_content, fts_query, initialize_database, remove_inactive_vaults};
    use rusqlite::{params, Connection};

    #[test]
    fn creates_literal_and_query_terms() {
        assert_eq!(
            fts_query("search note"),
            Some("\"search\" AND \"note\"".into())
        );
    }

    #[test]
    fn leaves_short_queries_for_the_substring_fallback() {
        assert_eq!(fts_query("검색"), None);
    }

    #[test]
    fn indexes_substrings_with_the_trigram_tokenizer() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO note_search (vault_root, path, title, name, content) VALUES (?, ?, ?, ?, ?)",
                params!["/vault", "/vault/search.adoc", "Search", "search", "문서 검색을 빠르게 만듭니다."],
            )
            .unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM note_search WHERE note_search MATCH ?",
                [fts_query("검색을").unwrap()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn removes_full_text_copies_of_previously_opened_vaults() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        for vault_root in ["/previous", "/current"] {
            connection
                .execute(
                    "INSERT INTO indexed_notes (vault_root, path, name, title, content) VALUES (?, ?, ?, ?, ?)",
                    params![vault_root, format!("{vault_root}/note.adoc"), "note", "Note", "Private content"],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO note_search (vault_root, path, title, name, content) VALUES (?, ?, ?, ?, ?)",
                    params![vault_root, format!("{vault_root}/note.adoc"), "Note", "note", "Private content"],
                )
                .unwrap();
        }

        let transaction = connection.transaction().unwrap();
        remove_inactive_vaults(&transaction, "/current").unwrap();
        transaction.commit().unwrap();

        let retained: i64 = connection
            .query_row("SELECT count(*) FROM indexed_notes", [], |row| row.get(0))
            .unwrap();
        let indexed: i64 = connection
            .query_row("SELECT count(*) FROM note_search", [], |row| row.get(0))
            .unwrap();
        assert_eq!((retained, indexed), (1, 1));
    }

    #[test]
    fn clears_all_content_when_the_app_exits() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO indexed_notes (vault_root, path, name, title, content) VALUES (?, ?, ?, ?, ?)",
                params!["/vault", "/vault/private.adoc", "private", "Private", "Sensitive text"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO note_search (vault_root, path, title, name, content) VALUES (?, ?, ?, ?, ?)",
                params!["/vault", "/vault/private.adoc", "Private", "private", "Sensitive text"],
            )
            .unwrap();

        clear_indexed_content(&connection).unwrap();

        let count: i64 = connection
            .query_row("SELECT count(*) FROM indexed_notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
