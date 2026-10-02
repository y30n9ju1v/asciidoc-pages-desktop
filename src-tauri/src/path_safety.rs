//! Boundary check used by `typst_compiler.rs` to independently re-derive
//! (never just trust) that an asset path the WebView sent stays within an
//! allowed root before Rust ever opens the file.
//!
//! This is NOT a plain port of `desktop-app/src/services/pathSafety.ts`'s
//! `resolveWithinRoot` (a pure, filesystem-free string normalization) - a
//! lexical-only check cannot catch a symlink sitting inside the allowed
//! root that points outside it: the string `"<root>/link.png"` passes a
//! lexical nested-path test even though following the symlink reads a file
//! anywhere on disk `std::fs::read` can reach. TS's own copy stays
//! lexical-only because TS never reads file bytes itself any more (assets
//! travel as boundary-checked path *references*, not bytes - see
//! `TypstAsset`'s doc comment in publication_request.rs); this Rust copy is
//! the one that actually opens the file, so it resolves every symlink
//! component via `std::fs::canonicalize` before comparing.
use std::path::PathBuf;

/// `Some(canonical_path)` only if `candidate` exists on disk and its fully
/// symlink-resolved real location is equal to or nested inside `root`'s own
/// fully symlink-resolved real location. `None` otherwise - including when
/// either path doesn't exist. Requiring existence is not a meaningful
/// behavior change for this function's one real caller
/// (`typst_compiler.rs::load_asset_bytes`, which reads the returned path
/// immediately afterward and needs it to exist anyway).
///
/// Residual risk: this narrows, but does not fully eliminate, a TOCTOU
/// (time-of-check-to-time-of-use) race - a symlink could in principle be
/// swapped between this call returning and the caller's subsequent
/// `std::fs::read`. Fully closing that would need directory-fd-relative
/// `openat` calls with `O_NOFOLLOW` at every path component, which this
/// desktop app (a single-user process reading its own user's files, not a
/// server adjudicating between mutually distrusting principals) does not
/// implement. Re-resolving immediately before use, as the one real caller
/// does, keeps the race window to the minimum practical for the threat this
/// app actually faces.
pub fn resolve_within_root(candidate: &str, root: &str) -> Option<PathBuf> {
    let canonical_root = std::fs::canonicalize(root).ok()?;
    let canonical_candidate = std::fs::canonicalize(candidate).ok()?;
    if canonical_candidate == canonical_root || canonical_candidate.starts_with(&canonical_root) {
        Some(canonical_candidate)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A fresh, real temp directory for this test - `resolve_within_root`
    /// now requires real filesystem entries (canonicalize needs a path that
    /// exists), so these tests build actual files/symlinks rather than
    /// asserting against hypothetical string paths.
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "asciidoc-studio-path-safety-tests-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn accepts_a_path_nested_inside_the_root() {
        let root = temp_dir("nested-root");
        let nested_dir = root.join("images");
        fs::create_dir_all(&nested_dir).expect("create nested dir");
        let file = nested_dir.join("cover.png");
        fs::write(&file, b"x").expect("write file");

        let resolved = resolve_within_root(file.to_str().unwrap(), root.to_str().unwrap());
        assert_eq!(resolved, Some(file.canonicalize().unwrap()));
    }

    #[test]
    fn accepts_the_root_itself() {
        let root = temp_dir("root-itself");
        let resolved = resolve_within_root(root.to_str().unwrap(), root.to_str().unwrap());
        assert_eq!(resolved, Some(root.canonicalize().unwrap()));
    }

    #[test]
    fn rejects_a_path_outside_the_root_even_with_a_shared_prefix() {
        let root = temp_dir("book");
        // "<root>-evil" starts with the same string as "<root>" but is not
        // nested inside it - a naive string-prefix check would wrongly
        // accept this.
        let mut evil_name = root.clone().into_os_string();
        evil_name.push("-evil");
        let evil_root = PathBuf::from(evil_name);
        fs::create_dir_all(&evil_root).expect("create evil dir");
        let file = evil_root.join("x");
        fs::write(&file, b"x").expect("write file");

        assert_eq!(
            resolve_within_root(file.to_str().unwrap(), root.to_str().unwrap()),
            None
        );
        let _ = fs::remove_dir_all(&evil_root);
    }

    #[test]
    fn rejects_traversal_that_escapes_the_root() {
        let base = temp_dir("traversal-base");
        let root = base.join("book");
        fs::create_dir_all(&root).expect("create root dir");
        let outside = base.join("etc");
        fs::create_dir_all(&outside).expect("create outside dir");
        let secret = outside.join("passwd");
        fs::write(&secret, b"secret").expect("write secret file");

        let traversal = format!("{}/../etc/passwd", root.to_str().unwrap());
        assert_eq!(
            resolve_within_root(&traversal, root.to_str().unwrap()),
            None
        );
    }

    #[test]
    fn rejects_a_candidate_that_does_not_exist() {
        let root = temp_dir("missing-candidate-root");
        let missing = root.join("does-not-exist.png");
        assert_eq!(
            resolve_within_root(missing.to_str().unwrap(), root.to_str().unwrap()),
            None
        );
    }

    // Regression: a pure string/lexical check (the previous implementation)
    // sees "<root>/cover.png" as nested inside "<root>" regardless of what
    // that path actually points to on disk - it would wrongly accept a
    // symlink placed inside the allowed root that resolves to a file
    // anywhere else the process can read.
    #[test]
    #[cfg(unix)]
    fn rejects_a_symlink_inside_the_root_that_points_outside_it() {
        let root = temp_dir("symlink-escape-root");
        let outside = temp_dir("symlink-escape-outside");
        let secret = outside.join("secret.png");
        fs::write(&secret, b"secret").expect("write secret file");

        let link = root.join("cover.png");
        std::os::unix::fs::symlink(&secret, &link).expect("create symlink");

        assert_eq!(
            resolve_within_root(link.to_str().unwrap(), root.to_str().unwrap()),
            None
        );
    }

    #[test]
    #[cfg(unix)]
    fn accepts_a_symlink_inside_the_root_that_points_to_another_file_inside_the_root() {
        let root = temp_dir("symlink-internal-root");
        let real_file = root.join("real.png");
        fs::write(&real_file, b"real").expect("write real file");
        let link = root.join("alias.png");
        std::os::unix::fs::symlink(&real_file, &link).expect("create symlink");

        let resolved = resolve_within_root(link.to_str().unwrap(), root.to_str().unwrap());
        assert_eq!(resolved, Some(real_file.canonicalize().unwrap()));
    }
}
