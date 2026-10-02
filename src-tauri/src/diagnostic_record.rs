use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_FIELD_LENGTH: usize = 4_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDiagnostic {
    pub source: String,
    pub message: String,
    pub stack: Option<String>,
    pub component_stack: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRecord {
    timestamp_unix_ms: u128,
    app_version: &'static str,
    source: String,
    message: String,
    stack: Option<String>,
    context: Option<String>,
}

impl DiagnosticRecord {
    pub fn app_event(source: &str, message: &str) -> Self {
        Self::new(source, message, None, None)
    }

    pub fn client_error(diagnostic: ClientDiagnostic) -> Self {
        Self::new(
            &diagnostic.source,
            &diagnostic.message,
            diagnostic.stack.as_deref(),
            diagnostic.component_stack.as_deref(),
        )
    }

    pub fn rust_panic(message: &str, location: Option<&str>, backtrace: &str) -> Self {
        Self::new("rust-panic", message, location, Some(backtrace))
    }

    fn new(source: &str, message: &str, stack: Option<&str>, context: Option<&str>) -> Self {
        Self {
            timestamp_unix_ms: timestamp_unix_ms(),
            app_version: env!("CARGO_PKG_VERSION"),
            source: truncate(source),
            message: truncate(message),
            stack: stack.map(truncate),
            context: context.map(truncate),
        }
    }
}

fn timestamp_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

fn truncate(value: &str) -> String {
    value.chars().take(MAX_FIELD_LENGTH).collect()
}

#[cfg(test)]
mod tests {
    use super::truncate;

    #[test]
    fn truncates_unicode_without_splitting_characters() {
        assert_eq!(truncate(&"가".repeat(4_001)).chars().count(), 4_000);
    }
}
