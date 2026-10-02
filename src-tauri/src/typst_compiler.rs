//! The Tauri commands that turn a `PdfPublicationRequest` into either a
//! compiled PDF (`compile_typst_pdf`) or the raw Typst source text
//! (`generate_typst_source`) - this is the only place a real Typst compile
//! happens, and the only place Typst source is ever generated. The request
//! both commands receive carries plain data (SafeDocument JSON + asset file
//! references), never Typst source text itself, per the trust-boundary
//! design in publication_request.rs/typst_writer.rs.
use crate::path_safety::resolve_within_root;
use crate::publication_request::{page_geometry, PdfPublicationRequest, PublishError, TypstAsset};
use chrono::{Datelike, Utc};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::Manager;
use typst::foundations::Datetime;
use typst_as_lib::typst_kit_options::TypstKitFontOptions;
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards, Timestamp};

/// Mirrors pdfPublicationRequest.ts's own `MAX_ASSET_COUNT`. Re-checked here
/// rather than trusted from the frontend - the same "never trust,
/// re-validate at the boundary that matters" policy this codebase already
/// applies to SafeAssetRef (see isSafeAssetRef).
pub const MAX_ASSET_COUNT: usize = 500;
/// Total bytes actually read from disk across all assets - enforced here,
/// not on the wire, since assets no longer travel as bytes over IPC at all
/// (see TypstAsset's own doc comment).
pub const MAX_TOTAL_ASSET_BYTES: usize = 200 * 1024 * 1024;
/// A compiled PDF larger than this is refused rather than written - a
/// pathological document (thousands of embedded images) shouldn't be able
/// to fill the disk silently.
pub const MAX_PDF_OUTPUT_BYTES: usize = 500 * 1024 * 1024;
/// The raw request JSON itself, before any asset bytes are involved (those
/// travel as file references now, not JSON) - genuinely large legitimate
/// documents are still far under this; it exists to bound parse/scan cost
/// for a hostile or malformed payload.
pub const MAX_REQUEST_JSON_BYTES: usize = 10 * 1024 * 1024;
/// Structural `{`/`[` nesting depth allowed in the request JSON, checked
/// *before* attempting to deserialize it at all - see
/// `json_nesting_depth_exceeds`. Generous headroom above any legitimate
/// depth (SafeDocument's own content is capped at 32 logical levels, each
/// costing a handful of JSON structural levels; PdfPublicationRequest's own
/// wrapping fields add a small constant), but far below where a native
/// stack overflow during deserialization becomes a real risk.
pub const MAX_JSON_STRUCTURAL_DEPTH: usize = 500;
/// Stack size for the dedicated thread that deserializes the request and
/// runs the Typst compile - defense in depth on top of the depth pre-scan
/// above, not the primary guard against deep nesting.
const COMPILER_THREAD_STACK_BYTES: usize = 32 * 1024 * 1024;
/// Ceiling on total bytes held in the app cache's `publish/` scratch
/// directory at once - a defense-in-depth bound against unbounded
/// accumulation (e.g. many exports whose frontend-side cleanup never runs
/// because the app was force-quit mid-export - see
/// `cleanup_stale_temp_pdfs`, which handles the common case of that at the
/// next launch; this catches the same session repeatedly hitting it without
/// ever restarting). A handful of `MAX_PDF_OUTPUT_BYTES`-sized files' worth
/// of headroom, not a tight budget.
const MAX_PUBLISH_CACHE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

// Regular + Bold only (not the full weight range each family ships) to keep
// the embedded font payload bounded - see THIRD_PARTY_NOTICES.md for
// exactly which files these are, their license, and where they came from.
// Family names ("Noto Serif KR"/"Noto Sans KR") are confirmed via `fc-scan`
// against these exact files, not assumed from the filename - the
// region-specific KR subset uses different internal names than the
// pan-CJK "Noto Serif/Sans CJK KR" fonts.
// pub(crate) so visual_regression.rs's own TypstEngine (built independently
// so it can render straight to a Pixmap instead of a PDF) can embed the
// exact same fonts rather than a second, duplicate set of include_bytes!.
pub(crate) static NOTO_SERIF_KR_REGULAR: &[u8] =
    include_bytes!("../assets/fonts/NotoSerifKR-Regular.otf");
pub(crate) static NOTO_SERIF_KR_BOLD: &[u8] =
    include_bytes!("../assets/fonts/NotoSerifKR-Bold.otf");
pub(crate) static NOTO_SANS_KR_REGULAR: &[u8] =
    include_bytes!("../assets/fonts/NotoSansKR-Regular.otf");
pub(crate) static NOTO_SANS_KR_BOLD: &[u8] = include_bytes!("../assets/fonts/NotoSansKR-Bold.otf");

/// `true` only if `json` contains a run of `{`/`[` nesting deeper than
/// `max_depth`, scanned byte-by-byte (skipping over string contents,
/// respecting `\"` escapes so a quote inside a string never mistakenly
/// closes it) without building any parsed representation - the point is to
/// bound worst-case stack usage *before* handing the payload to
/// `serde_json`'s own recursive-descent parser, not to validate that it's
/// well-formed JSON at all (a malformed payload just fails to deserialize
/// afterwards, same as always).
fn json_nesting_depth_exceeds(json: &str, max_depth: usize) -> bool {
    let mut depth: usize = 0;
    let mut in_string = false;
    let mut escaped = false;
    for byte in json.bytes() {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
            continue;
        }
        match byte {
            b'"' => in_string = true,
            b'{' | b'[' => {
                depth += 1;
                if depth > max_depth {
                    return true;
                }
            }
            b'}' | b']' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    false
}

fn parse_request(request_json: &str) -> Result<PdfPublicationRequest, PublishError> {
    if request_json.len() > MAX_REQUEST_JSON_BYTES {
        return Err(PublishError::new(
            "request-too-large",
            format!(
                "Publication request exceeds the {}MB limit.",
                MAX_REQUEST_JSON_BYTES / (1024 * 1024)
            ),
        ));
    }
    if json_nesting_depth_exceeds(request_json, MAX_JSON_STRUCTURAL_DEPTH) {
        return Err(PublishError::new(
            "request-too-deeply-nested",
            "Publication request is too deeply nested to process safely.",
        ));
    }
    let request: PdfPublicationRequest = serde_json::from_str(request_json).map_err(|err| {
        PublishError::new(
            "invalid-request",
            format!("Invalid publication request: {err}"),
        )
    })?;
    // v1 remains readable while in-flight previews and cached requests age
    // out, but no unknown wire shape may cross the WebView → native boundary.
    if !is_supported_safe_document_version(request.document.version) {
        return Err(PublishError::new(
            "unsupported-safe-document-version",
            format!(
                "SafeDocument version {} is not supported by this app.",
                request.document.version
            ),
        ));
    }
    Ok(request)
}

fn is_supported_safe_document_version(version: u32) -> bool {
    matches!(version, 1..=4)
}

/// A `document_root` the WebView claims is only trusted as a boundary root
/// if it's a path the user has actually granted this app filesystem access
/// to through a genuine native file/folder dialog interaction - not merely
/// because the request JSON says so. `document_root` travels over IPC
/// exactly like every other `PdfPublicationRequest` field, so trusting it
/// on its own would let a compromised renderer set `documentRoot: "/"` and
/// have `resolve_within_root` happily confirm any `resolved_path` is
/// "nested inside" it - that containment check only proves nesting
/// *relative to* document_root, it has no opinion on whether document_root
/// itself is legitimate. This matters specifically because `load_asset_bytes`
/// reads with plain `std::fs::read`, which bypasses the Tauri fs plugin's
/// own scope enforcement entirely (that enforcement only gates the fs
/// plugin's own JS-invocable commands, not native Rust code) - so nothing
/// else in this pipeline stands between an attacker-chosen document_root
/// and reading any file the OS process can reach.
///
/// Tauri's fs plugin already maintains exactly the right independent source
/// of truth for this: a runtime `Scope` populated by the native-picker
/// commands in `fs_scope_commands.rs`. Those commands grant only the path
/// returned by the OS dialog; no command accepts an arbitrary WebView path
/// for scope registration. Piggybacking on that scope here - rather than
/// inventing separate Rust-side session
/// state to track "the currently open document" (this app has none today) -
/// ties this check to the same boundary already governing every other file
/// the WebView can touch through the fs plugin.
///
/// Known limitation: a document opened via the single-file picker (not a
/// vault folder) only grants scope for that one file, not its containing
/// directory (see `documentFileAdapter.ts`'s `chooseDocumentToOpen`/
/// `chooseDocumentSavePath`, deliberately file-scoped, not folder-scoped),
/// so a standalone document (never part of an opened vault) with local
/// image assets will fail this check and refuse to publish with images.
/// This mirrors an existing constraint already implicit in how this app's
/// inline image preview resolves local images through the same scope
/// mechanism, not a new regression introduced here.
fn is_trusted_document_root<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    document_root: &str,
) -> bool {
    use tauri_plugin_fs::FsExt;
    app.fs_scope().is_allowed(document_root)
}

fn load_asset_bytes<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    asset: &TypstAsset,
    document_root: Option<&str>,
    cache_dir: &Path,
) -> Result<Vec<u8>, PublishError> {
    let cache_dir_str = cache_dir.to_string_lossy();
    let within_document = document_root
        .filter(|root| is_trusted_document_root(app, root))
        .and_then(|root| resolve_within_root(&asset.resolved_path, root));
    let within_cache = resolve_within_root(&asset.resolved_path, &cache_dir_str);
    let verified_path = within_document.or(within_cache).ok_or_else(|| {
        PublishError::new(
            "asset-outside-allowed-root",
            format!(
                "Refusing to read image \"{}\": outside the document folder or app cache directory.",
                asset.path
            ),
        )
    })?;
    std::fs::read(&verified_path).map_err(|err| {
        PublishError::new(
            "asset-read-failed",
            format!("Failed to read image \"{}\": {err}", asset.path),
        )
    })
}

fn load_assets<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    assets: &[TypstAsset],
    document_root: Option<&str>,
    cache_dir: &Path,
) -> Result<Vec<(String, Vec<u8>)>, PublishError> {
    if assets.len() > MAX_ASSET_COUNT {
        return Err(PublishError::new(
            "too-many-assets",
            format!("Too many images/diagrams to publish as PDF (limit {MAX_ASSET_COUNT})."),
        ));
    }
    let mut loaded = Vec::with_capacity(assets.len());
    let mut total_bytes: usize = 0;
    for asset in assets {
        let bytes = load_asset_bytes(app, asset, document_root, cache_dir)?;
        total_bytes += bytes.len();
        if total_bytes > MAX_TOTAL_ASSET_BYTES {
            return Err(PublishError::new(
                "assets-too-large",
                format!(
                    "Publication assets exceed the {}MB limit.",
                    MAX_TOTAL_ASSET_BYTES / (1024 * 1024)
                ),
            ));
        }
        loaded.push((asset.path.clone(), bytes));
    }
    Ok(loaded)
}

fn build_engine(
    source: String,
    assets: &[(String, Vec<u8>)],
) -> TypstEngine<typst_as_lib::TypstTemplateMainFile> {
    TypstEngine::builder()
        .main_file(source)
        // No system font scanning (include_system_fonts(false)) - fonts come
        // only from typst-kit's bundled defaults (Libertinus Serif, New
        // Computer Modern, DejaVu Sans Mono) plus the Noto KR fonts below.
        // Keeping this deterministic and offline, rather than depending on
        // whatever happens to be installed on a given machine, is the whole
        // point of shipping a native compiler instead of a system pipeline.
        .search_fonts_with(
            TypstKitFontOptions::new()
                .include_system_fonts(false)
                .include_embedded_fonts(true),
        )
        .fonts([
            NOTO_SERIF_KR_REGULAR,
            NOTO_SERIF_KR_BOLD,
            NOTO_SANS_KR_REGULAR,
            NOTO_SANS_KR_BOLD,
        ])
        .with_static_file_resolver(
            assets
                .iter()
                .map(|(path, bytes)| (path.as_str(), bytes.as_slice())),
        )
        .build()
}

/// PDF/A conformance requires a document date, verified by actually running
/// a PDF/A compile and reading Typst's own diagnostic ("missing document
/// date" / hint: "set the date of the document") - `#set document(date:
/// auto)` alone (typst_writer.rs) isn't sufficient, since `auto` resolves
/// through `PdfOptions.timestamp`, not the World's `today()`, for the
/// PDF's embedded metadata specifically.
fn utc_now_as_typst_datetime() -> Option<Datetime> {
    let now = Utc::now();
    Datetime::from_ymd(now.year(), now.month() as u8, now.day() as u8)
}

fn pdf_options_for(pdf_a: bool) -> Result<PdfOptions, PublishError> {
    if !pdf_a {
        return Ok(PdfOptions::default());
    }
    let standards = PdfStandards::new(&[PdfStandard::A_2b])
        .map_err(|err| PublishError::new("pdf-a-standard-invalid", format!("{err:?}")))?;
    let timestamp = utc_now_as_typst_datetime().map(Timestamp::new_utc);
    Ok(PdfOptions {
        standards,
        timestamp,
        ..Default::default()
    })
}

/// Builds the Typst source `request.document` compiles to, given the
/// specific set of asset paths that should actually be embedded. Shared
/// between `compile_pdf_sync` (whose `asset_paths` comes from
/// `load_assets` - only assets it actually read bytes for should be
/// embedded) and `generate_typst_source_sync` (which does no file I/O at
/// all - see its own doc comment for why that's fine there).
fn write_typst_source(
    request: &PdfPublicationRequest,
    asset_paths: &HashSet<String>,
) -> Result<String, PublishError> {
    let geometry = page_geometry(&request.page_size);
    let style = crate::typst_writer::PublicationStyle::from_template_id(&request.template.id);
    let options = crate::typst_writer::WriteOptions {
        style,
        body_font: request.template.body_font,
        heading_font: request.template.heading_font,
        base_font_size_pt: bounded_value(
            request.template.base_font_size_pt,
            8.0,
            18.0,
            default_base_font_size(style),
        ),
        line_height: bounded_value(
            request.template.line_height,
            1.1,
            2.2,
            default_line_height(style),
        ),
        letter_spacing_em: bounded_layout_value(
            request.template.letter_spacing_em,
            -0.05,
            0.15,
            0.0,
        ),
        word_spacing_em: bounded_layout_value(request.template.word_spacing_em, -0.1, 0.3, 0.0),
        paragraph_spacing_em: bounded_layout_value(
            request.template.paragraph_spacing_em,
            0.0,
            2.0,
            0.0,
        ),
        first_line_indent_em: bounded_layout_value(
            request.template.first_line_indent_em,
            0.0,
            2.5,
            default_first_line_indent(style),
        ),
        heading_numbering: request.template.heading_numbering,
        body_justification: request.template.body_justification,
        chapter_starts_on_new_page: request.template.chapter_starts_on_new_page,
        accent_color: validated_accent(request.template.accent_color.as_deref()),
        page_width: geometry.width,
        page_height: geometry.height,
        margin_top: geometry.margin_top,
        margin_right: geometry.margin_right,
        margin_bottom: geometry.margin_bottom,
        margin_left: geometry.margin_left,
        toc_depth: request.publication.toc_depth,
        figure_caption: &request.publication.figure_caption,
        table_caption: &request.publication.table_caption,
        example_caption: &request.publication.example_caption,
    };
    let cover = crate::typst_writer::Cover {
        title: &request.cover.title,
        subtitle: &request.cover.subtitle,
        author: &request.cover.author,
        publisher: &request.cover.publisher,
        front_image_path: &request.cover.front_image_path,
        back_image_path: &request.cover.back_image_path,
    };
    crate::typst_writer::write_document(
        &request.document,
        &options,
        asset_paths,
        &cover,
        &request.bibliography,
    )
    .map_err(|depth_exceeded| {
        PublishError::with_line(
            "nesting-depth-exceeded",
            "Document nesting exceeds the supported depth (32).",
            depth_exceeded.line,
        )
    })
}

/// Numeric presentation values are still untrusted IPC input even though
/// their TypeScript editor bounds sliders. Reject NaN, infinity, and values
/// outside the documented interval before they become Typst source.
fn bounded_layout_value(value: Option<f64>, minimum: f64, maximum: f64, fallback: f64) -> f64 {
    value
        .filter(|candidate| candidate.is_finite() && *candidate >= minimum && *candidate <= maximum)
        .unwrap_or(fallback)
}

fn bounded_value(value: f64, minimum: f64, maximum: f64, fallback: f64) -> f64 {
    if value.is_finite() && value >= minimum && value <= maximum {
        value
    } else {
        fallback
    }
}

fn default_base_font_size(style: crate::typst_writer::PublicationStyle) -> f64 {
    match style {
        crate::typst_writer::PublicationStyle::Reference => 10.0,
        crate::typst_writer::PublicationStyle::BookSerif => 10.5,
        crate::typst_writer::PublicationStyle::Literary => 11.0,
    }
}

fn default_line_height(style: crate::typst_writer::PublicationStyle) -> f64 {
    match style {
        crate::typst_writer::PublicationStyle::BookSerif => 1.7,
        crate::typst_writer::PublicationStyle::Literary => 1.8,
        crate::typst_writer::PublicationStyle::Reference => 1.6,
    }
}

fn default_first_line_indent(style: crate::typst_writer::PublicationStyle) -> f64 {
    match style {
        crate::typst_writer::PublicationStyle::BookSerif => 1.25,
        crate::typst_writer::PublicationStyle::Literary => 1.4,
        crate::typst_writer::PublicationStyle::Reference => 0.0,
    }
}

/// Returns only the tightly constrained color spelling accepted by Typst's
/// rgb("RRGGBB") form. The web layer validates too, but IPC is an untrusted
/// boundary and this prevents custom template JSON from becoming Typst code.
fn validated_accent(value: Option<&str>) -> Option<&str> {
    let color = value?;
    (color.len() == 7
        && color.starts_with('#')
        && color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit))
    .then_some(color)
}

fn measure_preview_stage<T>(stage: &'static str, task: impl FnOnce() -> T) -> T {
    #[cfg(debug_assertions)]
    let started = std::time::Instant::now();
    let result = task();
    #[cfg(debug_assertions)]
    eprintln!(
        "[preview-performance] {stage}: {} ms",
        started.elapsed().as_millis()
    );
    #[cfg(not(debug_assertions))]
    let _ = stage;
    result
}

fn compile_pdf_sync<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: PdfPublicationRequest,
    cache_dir: &Path,
) -> Result<Vec<u8>, PublishError> {
    let loaded_assets = measure_preview_stage("native-assets", || {
        load_assets(
            app,
            &request.assets,
            request.document_root.as_deref(),
            cache_dir,
        )
    })?;

    let asset_paths: HashSet<String> = loaded_assets.iter().map(|(path, _)| path.clone()).collect();
    let source = measure_preview_stage("typst-source", || {
        write_typst_source(&request, &asset_paths)
    })?;

    let engine = measure_preview_stage("engine-and-fonts", || build_engine(source, &loaded_assets));
    let doc: PagedDocument = measure_preview_stage("typst-layout", || engine.compile())
        .output
        .map_err(|err| {
            PublishError::new(
                "typst-compile-failed",
                format!("Typst compilation failed: {err}"),
            )
        })?;

    let pdf_options = pdf_options_for(request.pdf_a)?;
    let pdf_bytes = measure_preview_stage("pdf-encode", || typst_pdf::pdf(&doc, &pdf_options))
        .map_err(|err| {
            PublishError::new("pdf-export-failed", format!("PDF export failed: {err:?}"))
        })?;

    if pdf_bytes.len() > MAX_PDF_OUTPUT_BYTES {
        return Err(PublishError::new(
            "pdf-too-large",
            format!(
                "Compiled PDF exceeds the {}MB limit.",
                MAX_PDF_OUTPUT_BYTES / (1024 * 1024)
            ),
        ));
    }
    Ok(pdf_bytes)
}

/// Parses the request and compiles it on a dedicated OS thread with a large
/// stack (not just `spawn_blocking`, which runs on Tokio's shared blocking
/// pool with a default-sized stack) - the depth pre-scan in `parse_request`
/// is the real structural bound, this is defense in depth underneath it.
fn compile_on_dedicated_thread<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request_json: String,
    cache_dir: PathBuf,
) -> Result<Vec<u8>, PublishError> {
    std::thread::Builder::new()
        .stack_size(COMPILER_THREAD_STACK_BYTES)
        .spawn(move || {
            let request = parse_request(&request_json)?;
            compile_pdf_sync(&app, request, &cache_dir)
        })
        .expect("failed to spawn PDF compiler thread")
        .join()
        .unwrap_or_else(|_| {
            Err(PublishError::new(
                "compiler-thread-panicked",
                "The PDF compiler crashed unexpectedly.",
            ))
        })
}

/// A filename unique enough for a scratch file this process alone writes
/// and immediately consumes - not a security boundary (the directory it
/// lives in is Rust's own app cache dir, never WebView-reachable by an
/// arbitrary path), just collision avoidance between concurrent publishes.
/// A monotonic counter plus a timestamp is enough for that; no need for a
/// `uuid` dependency.
fn unique_temp_pdf_path(cache_dir: &Path) -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    cache_dir
        .join("publish")
        .join(format!("{}-{nanos}-{counter}.pdf", std::process::id()))
}

/// Writes `pdf_bytes` to a fresh temp file under the app cache directory and
/// returns its path. This *is* a direct `std::fs::write` in a custom Rust
/// command - deliberately different from the destination the user actually
/// chose (a `save()` dialog result the WebView hands back), which must
/// never be written by Rust directly (that would bypass the fs plugin's
/// per-path capability/scope enforcement entirely, the exact design
/// violation ruled out earlier for this pipeline). The app cache directory
/// is not that: it's a path Rust itself resolves via
/// `app.path().app_cache_dir()`, never influenced by WebView input, so
/// writing to it carries none of that risk - capabilities exist to bound
/// what the WebView can reach through IPC, not to bound what already-native
/// Rust code can do with its own process-owned scratch space.
/// Sums the size of every regular file directly under `dir` - used both to
/// enforce `MAX_PUBLISH_CACHE_BYTES` and, indirectly, by
/// `cleanup_stale_temp_pdfs`. A missing directory (nothing published yet
/// this run) reads as zero bytes used, not an error.
fn directory_bytes_used(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok())
        .filter(|meta| meta.is_file())
        .map(|meta| meta.len())
        .sum()
}

/// `true` once `bytes_already_used` plus `additional_bytes` would exceed
/// `cap` - pulled out as plain arithmetic (parameterized on `cap` rather
/// than reading `MAX_PUBLISH_CACHE_BYTES` directly) so both this rule and
/// the concurrency behavior around it can be unit tested with small numbers,
/// rather than only via an end-to-end test that would need to actually
/// write gigabytes of filler data to disk to exercise the real constant.
fn exceeds_cache_cap(bytes_already_used: u64, additional_bytes: usize, cap: u64) -> bool {
    bytes_already_used + additional_bytes as u64 > cap
}

/// Serializes the whole "check current usage, then write" sequence in
/// `write_pdf_to_temp_file_with_cap` - without this, two concurrent
/// publishes could both read the same pre-write `directory_bytes_used`
/// total, both pass the cap check, and both write, letting the real total
/// exceed the cap. A process-wide lock around the whole check-then-write
/// critical section closes that race directly, which is simpler than a
/// separate in-memory reservation counter (and can't drift from the real
/// on-disk total the way a counter tracked independently of actual file
/// removals could).
static PUBLISH_CACHE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn write_pdf_to_temp_file(cache_dir: &Path, pdf_bytes: &[u8]) -> Result<String, PublishError> {
    write_pdf_to_temp_file_with_cap(cache_dir, pdf_bytes, MAX_PUBLISH_CACHE_BYTES)
}

fn write_pdf_to_temp_file_with_cap(
    cache_dir: &Path,
    pdf_bytes: &[u8],
    cap: u64,
) -> Result<String, PublishError> {
    let temp_path = unique_temp_pdf_path(cache_dir);
    let publish_dir = temp_path
        .parent()
        .expect("unique_temp_pdf_path always nests under a publish/ directory");
    std::fs::create_dir_all(publish_dir).map_err(|err| {
        PublishError::new(
            "pdf-temp-write-failed",
            format!("Failed to prepare a temp file for the compiled PDF: {err}"),
        )
    })?;

    // Held across both the cap check and the write itself - see the lock's
    // own doc comment. Poison recovery (`unwrap_or_else`) rather than
    // propagating a poisoned-lock panic: a panic in some *other* concurrent
    // publish while holding this lock shouldn't permanently wedge every
    // future publish attempt for the rest of the app's lifetime.
    let _guard = PUBLISH_CACHE_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    if exceeds_cache_cap(directory_bytes_used(publish_dir), pdf_bytes.len(), cap) {
        return Err(PublishError::new(
            "publish-cache-full",
            format!(
                "Too many pending PDF exports are queued (cache limit {}MB) - finish or retry a previous export before publishing another.",
                cap / (1024 * 1024)
            ),
        ));
    }
    std::fs::write(&temp_path, pdf_bytes).map_err(|err| {
        PublishError::new(
            "pdf-temp-write-failed",
            format!("Failed to write the compiled PDF to a temp file: {err}"),
        )
    })?;
    Ok(temp_path.to_string_lossy().into_owned())
}

/// Removes every leftover file in the app cache's `publish/` scratch
/// directory - called once at startup (see `lib.rs`'s `.setup()` hook).
/// Every file there is single-use and scoped to exactly one export attempt
/// (`pdfExporter.ts`'s `publishCompiledPdf` always removes it, on both the
/// success and failure paths); the only way one survives to the next
/// launch is the app being force-quit or crashing mid-export, since a
/// running app never revisits an old export. Best-effort: a directory that
/// doesn't exist yet, or a file that can't be removed for some reason
/// (permissions, already gone), is silently skipped rather than failing
/// startup over stale scratch data.
pub fn cleanup_stale_temp_pdfs<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Ok(cache_dir) = app.path().app_cache_dir() else {
        return;
    };
    let publish_dir = cache_dir.join("publish");
    let Ok(entries) = std::fs::read_dir(&publish_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let _ = std::fs::remove_file(entry.path());
    }
}

/// Compiles a publication request into a PDF and returns the path to a temp
/// file holding it, under the app's own cache directory - not the PDF bytes
/// themselves. A `tauri::ipc::Response` (raw bytes over IPC) was the first
/// design here, but still meant copying a document that can be hundreds of
/// MB from Rust into the WebView's JS heap as an `ArrayBuffer`/`Uint8Array`
/// and back out through the fs plugin to reach disk - two or three copies
/// of the full payload for something that only ever needed to end up as
/// bytes on disk. Returning a path instead means the caller
/// (`pdfExporter.ts`) never touches the PDF bytes at all: it copies straight
/// from this temp file to the user's chosen destination via the
/// capability-scoped `@tauri-apps/plugin-fs` `copyFile`, an OS-level file
/// copy that Rust never routes through the WebView's memory. This command
/// still never writes to the user's actual chosen destination itself - see
/// `write_pdf_to_temp_file`'s own doc comment for why that boundary still
/// holds.
#[tauri::command]
pub async fn compile_typst_pdf(
    app: tauri::AppHandle,
    request_json: String,
) -> Result<String, PublishError> {
    let cache_dir = app.path().app_cache_dir().map_err(|err| {
        PublishError::new(
            "cache-dir-unavailable",
            format!("Could not resolve the app cache directory: {err}"),
        )
    })?;
    let compile_cache_dir = cache_dir.clone();
    let compile_app = app.clone();
    let pdf_bytes = tauri::async_runtime::spawn_blocking(move || {
        compile_on_dedicated_thread(compile_app, request_json, compile_cache_dir)
    })
    .await
    .map_err(|err| {
        PublishError::new(
            "compiler-task-failed",
            format!("PDF compilation task failed: {err}"),
        )
    })??;
    let temp_path = write_pdf_to_temp_file(&cache_dir, &pdf_bytes)?;
    grant_preview_asset_scope(&app, &temp_path);
    Ok(temp_path)
}

/// The in-app PDF preview (TypstPdfPreview.tsx) loads `compile_typst_pdf`'s
/// returned temp file through the `asset://` protocol via `convertFileSrc`,
/// which is gated by its own runtime Scope - entirely separate from the fs
/// plugin's Scope that fs_scope_commands.rs grants. Without this, the
/// iframe's request is silently rejected (see tauri's protocol::asset::get,
/// which checks `scope.is_allowed`) and the preview never renders, even
/// though the PDF compiled successfully and the file exists on disk.
/// Best-effort: a failed grant should not fail a compile that already
/// succeeded - the export flow (pdfExporter.ts) never touches this scope at
/// all, so it isn't affected either way. Generic over `Runtime` so this can
/// be exercised directly against `tauri::test`'s `MockRuntime`, the same way
/// `is_trusted_document_root` is - `compile_typst_pdf` itself, as a
/// `#[tauri::command]`, is hardcoded to the concrete Wry runtime and can't
/// be called with a mock app.
fn grant_preview_asset_scope<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: &str) {
    if let Err(err) = app.asset_protocol_scope().allow_file(path) {
        eprintln!("Could not grant asset-protocol scope for the PDF preview: {err}");
    }
}

fn generate_typst_source_sync(request_json: &str) -> Result<String, PublishError> {
    let request = parse_request(request_json)?;
    // No file I/O here at all, unlike compile_pdf_sync: Typst *source* text
    // only ever contains relative path *references*
    // (`#image("images/cover.png", ...)`), never embedded bytes, so
    // generating it doesn't need to open any file - there's no
    // trust-boundary reason to re-validate document_root/resolved_path in
    // this command. The frontend is the one that actually copies each
    // referenced asset alongside the exported .typ file
    // (typstExporter.ts), through its own capability-scoped fs plugin
    // calls - the same boundary Tauri already enforces for every other
    // file this app writes.
    let asset_paths: HashSet<String> = request
        .assets
        .iter()
        .map(|asset| asset.path.clone())
        .collect();
    write_typst_source(&request, &asset_paths)
}

/// Parses the request and generates Typst source on a dedicated large-stack
/// thread - the same defense-in-depth reasoning as
/// `compile_on_dedicated_thread`, even though this path does no file I/O:
/// the JSON deserialization step itself is still worth isolating from the
/// IPC-dispatch thread's default stack.
fn generate_source_on_dedicated_thread(request_json: String) -> Result<String, PublishError> {
    std::thread::Builder::new()
        .stack_size(COMPILER_THREAD_STACK_BYTES)
        .spawn(move || generate_typst_source_sync(&request_json))
        .expect("failed to spawn Typst source generator thread")
        .join()
        .unwrap_or_else(|_| {
            Err(PublishError::new(
                "generator-thread-panicked",
                "The Typst source generator crashed unexpectedly.",
            ))
        })
}

/// Generates the Typst source `SafeDocument` would compile to, without
/// compiling it to a PDF - lets the frontend offer a standalone Typst
/// project export (a `.typ` file plus copies of referenced local
/// images/diagrams) for users who want to inspect, tweak, or compile it
/// themselves with their own Typst toolchain. See
/// `generate_typst_source_sync`'s own doc comment for why this command does
/// no filesystem I/O of its own.
#[tauri::command]
pub async fn generate_typst_source(request_json: String) -> Result<String, PublishError> {
    tauri::async_runtime::spawn_blocking(move || generate_source_on_dedicated_thread(request_json))
        .await
        .map_err(|err| {
            PublishError::new(
                "generator-task-failed",
                format!("Typst source generation task failed: {err}"),
            )
        })?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publication_request::{PageSize, PageSizeId, PdfCover, PublishTemplate};
    use crate::safe_document::{
        FormalKind, ReferenceForm, SafeBlock, SafeCodeCallout, SafeDocument, SafeDocumentMetadata,
        SafeInline, SafeSourceLocation, SafeTableCell,
    };
    use crate::typst_font::FontRole;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn template() -> PublishTemplate {
        PublishTemplate {
            id: "manuscript".into(),
            name: "Manuscript".into(),
            description: String::new(),
            body_font: FontRole::Serif,
            heading_font: FontRole::Serif,
            base_font_size_pt: 11.0,
            line_height: 1.5,
            letter_spacing_em: Some(0.0),
            word_spacing_em: Some(0.0),
            paragraph_spacing_em: Some(1.25),
            first_line_indent_em: Some(0.0),
            heading_numbering: true,
            body_justification: true,
            chapter_starts_on_new_page: true,
            accent_color: None,
        }
    }

    fn page_size() -> PageSize {
        PageSize {
            id: PageSizeId::B5,
            name: "B5".into(),
            dimensions: String::new(),
            width_px: 688,
            description: String::new(),
            print_size: "182mm 257mm".into(),
            print_margin: String::new(),
        }
    }

    fn cover() -> PdfCover {
        PdfCover {
            title: "Test".into(),
            subtitle: String::new(),
            author: "Author".into(),
            publisher: String::new(),
            front_image_path: String::new(),
            back_image_path: String::new(),
        }
    }

    fn minimal_document() -> SafeDocument {
        SafeDocument {
            version: 1,
            metadata: SafeDocumentMetadata {
                title: "Test".into(),
                author: "Author".into(),
                language: "en".into(),
            },
            blocks: vec![SafeBlock::Paragraph {
                text: "Hello".into(),
                inlines: vec![SafeInline::Text {
                    value: "Hello world".into(),
                }],
                location: SafeSourceLocation { line: Some(1) },
            }],
            diagnostics: vec![],
        }
    }

    fn request(
        document: SafeDocument,
        assets: Vec<TypstAsset>,
        pdf_a: bool,
    ) -> PdfPublicationRequest {
        PdfPublicationRequest {
            document,
            template: template(),
            page_size: page_size(),
            cover: cover(),
            publication: Default::default(),
            assets,
            bibliography: vec![],
            pdf_a,
            document_root: None,
        }
    }

    fn test_cache_dir() -> PathBuf {
        std::env::temp_dir().join("asciidoc-studio-typst-compiler-tests-cache")
    }

    static TEST_FILE_COUNTER: AtomicU32 = AtomicU32::new(0);

    /// Writes `bytes` to a fresh temp file under a document-root temp
    /// directory and returns `(document_root, TypstAsset)` pointing at it -
    /// tests now need real files on disk, since assets are read by Rust
    /// from `resolved_path` rather than carried as bytes on the wire.
    fn write_temp_asset(path: &str, bytes: &[u8], media_type: &str) -> (String, TypstAsset) {
        let id = TEST_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("asciidoc-studio-typst-compiler-tests-{id}"));
        std::fs::create_dir_all(&root).expect("create temp document root");
        let resolved = root.join(path);
        std::fs::write(&resolved, bytes).expect("write temp asset");
        (
            root.to_string_lossy().into_owned(),
            TypstAsset {
                path: path.into(),
                resolved_path: resolved.to_string_lossy().into_owned(),
                media_type: media_type.into(),
            },
        )
    }

    /// A mock Tauri app (`tauri::test`'s `MockRuntime`, not a real window)
    /// with the fs plugin registered and its runtime `Scope` pre-populated
    /// with `allowed_roots` - stands in for "the user picked these paths via
    /// a real native dialog" (see `is_trusted_document_root`'s doc comment)
    /// without needing an actual OS dialog interaction in a test.
    fn mock_app_with_scope(allowed_roots: &[&str]) -> tauri::App<tauri::test::MockRuntime> {
        use tauri_plugin_fs::FsExt;
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("build mock tauri app");
        let scope = app.fs_scope();
        for root in allowed_roots {
            scope
                .allow_directory(root, true)
                .expect("allow directory in mock fs scope");
        }
        app
    }

    /// Compiles with a mock app whose fs scope trusts `request.document_root`
    /// (if any) - i.e. "this document was legitimately opened via a real
    /// dialog pick", the assumption every *other* test in this module makes
    /// implicitly. `refuses_to_publish_when_the_document_root_was_never_granted_fs_scope`
    /// is the one test that deliberately does NOT take this path, to prove
    /// is_trusted_document_root's own rejection behavior.
    fn compile(request: PdfPublicationRequest) -> Result<Vec<u8>, PublishError> {
        let trusted_roots: Vec<&str> = request.document_root.as_deref().into_iter().collect();
        let app = mock_app_with_scope(&trusted_roots);
        compile_pdf_sync(app.handle(), request, &test_cache_dir())
    }

    /// Opt-in bridge: Vitest supplies freshly normalized sample-book JSON.
    /// The mock scope replaces only the native folder picker, not the compiler.
    #[test]
    #[ignore = "run npm run test:publication from desktop-app"]
    fn sample_book_from_frontend_compiles() {
        let path =
            PathBuf::from(std::env::var("SAMPLE_PUBLICATION_REQUEST").expect("request path"));
        let json = std::fs::read_to_string(&path).expect("read frontend request");
        let request = parse_request(&json).expect("deserialize frontend contract");
        let roots: Vec<&str> = request.document_root.as_deref().into_iter().collect();
        let app = mock_app_with_scope(&roots);
        let assets = request
            .assets
            .iter()
            .map(|asset| asset.path.clone())
            .collect();
        let source = write_typst_source(&request, &assets).expect("generate Typst");
        std::fs::write(path.with_extension("typ"), source).expect("write test source");
        let bytes = compile_on_dedicated_thread(
            app.handle().clone(),
            json,
            path.parent().unwrap().to_path_buf(),
        )
        .expect("compile sample book");
        assert!(bytes.starts_with(b"%PDF-"));
        std::fs::write(path.with_extension("pdf"), bytes).expect("write test PDF");
    }

    /// Previewing one `include::`d chapter on its own is routine in a
    /// multi-file book, and its cross-references into sibling chapters have
    /// no anchor in that document. Typst fails the whole compile on an
    /// unresolved label, so those references degrade to plain text (see
    /// typst_writer.rs's internal_link_label) rather than leaving the author
    /// with no preview at all - this is desktop-app/sample-book's own
    /// 04-publication-verification.adoc, opened standalone.
    #[test]
    fn compiles_a_standalone_chapter_whose_cross_references_target_another_file() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::Paragraph {
                text: "The automatic reference must still render.".into(),
                inlines: vec![
                    SafeInline::Link {
                        target: "#lst-publisher".into(),
                        children: vec![SafeInline::Text {
                            value: "lst-publisher".into(),
                        }],
                        has_explicit_label: false,
                        reference_form: crate::safe_document::ReferenceForm::Normal,
                        is_wikilink: false,
                        is_unresolved_wikilink: false,
                    },
                    SafeInline::Link {
                        target: "#eq-sum-identity".into(),
                        children: vec![SafeInline::Text {
                            value: "the triangular-number identity".into(),
                        }],
                        has_explicit_label: true,
                        reference_form: crate::safe_document::ReferenceForm::Normal,
                        is_wikilink: false,
                        is_unresolved_wikilink: false,
                    },
                ],
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        let pdf = compile(request(document, vec![], false))
            .expect("a chapter referencing a sibling file should still preview");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    /// Regression: a table/image `id` was accepted by SafeBlock's own
    /// deserialization and even validated by typst_writer.rs's `block_id`,
    /// but `write_block`'s Table/Image arms silently discarded it (`..`)
    /// instead of ever emitting a Typst `<label>` for it - so a
    /// `#tbl-id`/`#fig-id` cross-reference elsewhere in the document (always
    /// syntactically valid, since `internal_link_label` only checks the
    /// target's shape, not whether a matching label was actually written)
    /// compiled into a `#link(label("..."))` pointing at a label that Typst
    /// itself would then refuse to compile: "label does not exist in the
    /// document". This is exactly what desktop-app/sample-book/01-introduction.adoc's
    /// `<<tbl-matrix>>`/`<<fig-sample-cover>>` cross-references hit.
    #[test]
    fn compiles_cross_references_to_a_table_and_an_image() {
        let (root, asset) = write_temp_asset("cover.png", &tiny_png_bytes(), "image/png");
        let document = SafeDocument {
            blocks: vec![
                SafeBlock::Paragraph {
                    text: "See refs".into(),
                    inlines: vec![
                        SafeInline::Link {
                            target: "#tbl-matrix".into(),
                            children: vec![SafeInline::Text {
                                value: "the matrix table".into(),
                            }],
                            has_explicit_label: true,
                            reference_form: crate::safe_document::ReferenceForm::Normal,
                            is_wikilink: false,
                            is_unresolved_wikilink: false,
                        },
                        SafeInline::Link {
                            target: "#fig-cover".into(),
                            children: vec![SafeInline::Text {
                                value: "the cover image".into(),
                            }],
                            has_explicit_label: true,
                            reference_form: crate::safe_document::ReferenceForm::Normal,
                            is_wikilink: false,
                            is_unresolved_wikilink: false,
                        },
                    ],
                    location: SafeSourceLocation { line: Some(1) },
                },
                SafeBlock::Table {
                    id: Some("tbl-matrix".into()),
                    caption: None,
                    rows: vec![vec!["Category".into(), "Feature".into()]],
                    has_header: true,
                    location: SafeSourceLocation { line: Some(3) },
                },
                SafeBlock::Image {
                    id: Some("fig-cover".into()),
                    asset: crate::safe_document::SafeAssetRef::DocumentRelative {
                        relative_path: "cover.png".into(),
                    },
                    alt: "Cover".into(),
                    caption: Some("Sample cover".into()),
                    location: SafeSourceLocation { line: Some(5) },
                },
            ],
            ..minimal_document()
        };
        let mut publication = request(document, vec![asset], false);
        publication.document_root = Some(root);
        let pdf =
            compile(publication).expect("cross-references to a table and an image should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_a_minimal_document_to_pdf_bytes() {
        let pdf =
            compile(request(minimal_document(), vec![], false)).expect("compile should succeed");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn bounds_untrusted_typography_measurements_before_writing_typst() {
        assert_eq!(bounded_layout_value(Some(0.02), -0.05, 0.15, 0.0), 0.02);
        assert_eq!(bounded_layout_value(Some(10.0), -0.05, 0.15, 0.0), 0.0);
        assert_eq!(bounded_layout_value(Some(f64::NAN), -0.05, 0.15, 0.0), 0.0);
        assert_eq!(bounded_value(11.0, 8.0, 18.0, 10.0), 11.0);
        assert_eq!(bounded_value(99.0, 8.0, 18.0, 10.0), 10.0);
        assert_eq!(bounded_value(f64::NAN, 1.1, 2.2, 1.4), 1.4);
    }

    #[test]
    fn compiles_a_back_cover_without_body_page_chrome() {
        let (root, asset) = write_temp_asset("back-cover.png", &tiny_png_bytes(), "image/png");
        let mut publication = request(minimal_document(), vec![asset], false);
        publication.cover.back_image_path = "back-cover.png".into();
        publication.document_root = Some(root);

        let pdf =
            compile(publication).expect("a back cover should compile after disabling page chrome");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_document_endnotes_to_pdf_bytes() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::Paragraph {
                text: "Main text with a deferred note.".into(),
                inlines: vec![
                    SafeInline::Text {
                        value: "Main text with a ".into(),
                    },
                    SafeInline::Endnote {
                        children: vec![SafeInline::Text {
                            value: "Deferred publishing note.".into(),
                        }],
                    },
                ],
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };

        let pdf = compile(request(document, vec![], false)).expect("endnotes should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_closed_publication_semantics_without_typst_source_from_the_webview() {
        let document = SafeDocument {
            blocks: vec![
                SafeBlock::Paragraph {
                    text: "See page.".into(),
                    inlines: vec![SafeInline::Link {
                        target: "#thm-boundary".into(),
                        children: vec![SafeInline::Text {
                            value: "p. theorem".into(),
                        }],
                        has_explicit_label: true,
                        reference_form: ReferenceForm::Page,
                        is_wikilink: false,
                        is_unresolved_wikilink: false,
                    }],
                    location: SafeSourceLocation { line: Some(1) },
                },
                SafeBlock::Formal {
                    id: Some("thm-boundary".into()),
                    kind: FormalKind::Theorem,
                    title: Some("Safe boundary".into()),
                    location: SafeSourceLocation { line: Some(2) },
                    blocks: vec![SafeBlock::Paragraph {
                        text: "Only data crosses the boundary.".into(),
                        inlines: vec![SafeInline::Text {
                            value: "Only data crosses the boundary.".into(),
                        }],
                        location: SafeSourceLocation { line: Some(3) },
                    }],
                },
                SafeBlock::Columns {
                    count: 2,
                    location: SafeSourceLocation { line: Some(4) },
                    blocks: vec![SafeBlock::Paragraph {
                        text: "A short editorial aside.".into(),
                        inlines: vec![SafeInline::Text {
                            value: "A short editorial aside.".into(),
                        }],
                        location: SafeSourceLocation { line: Some(5) },
                    }],
                },
            ],
            ..minimal_document()
        };

        let pdf = compile(request(document, vec![], false))
            .expect("closed publication semantics should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_a_source_code_block_to_pdf_bytes() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::Code {
                id: None,
                caption: None,
                language: Some("typescript".into()),
                code: "const answer: number = 42;".into(),
                callouts: vec![],
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        let pdf = compile(request(document, vec![], false)).expect("code block should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_numbered_equations_and_code_callout_legends() {
        let document = SafeDocument {
            version: 2,
            blocks: vec![
                SafeBlock::Paragraph {
                    text: "See equation and listing.".into(),
                    inlines: vec![
                        SafeInline::Link {
                            target: "#eq-total".into(),
                            children: vec![SafeInline::Text {
                                value: "eq-total".into(),
                            }],
                            has_explicit_label: false,
                            reference_form: crate::safe_document::ReferenceForm::Normal,
                            is_wikilink: false,
                            is_unresolved_wikilink: false,
                        },
                        SafeInline::Text {
                            value: " and ".into(),
                        },
                        SafeInline::Link {
                            target: "#lst-publish".into(),
                            children: vec![SafeInline::Text {
                                value: "lst-publish".into(),
                            }],
                            has_explicit_label: false,
                            reference_form: crate::safe_document::ReferenceForm::Normal,
                            is_wikilink: false,
                            is_unresolved_wikilink: false,
                        },
                    ],
                    location: SafeSourceLocation { line: Some(1) },
                },
                SafeBlock::MathBlock {
                    id: Some("eq-total".into()),
                    caption: Some("Total".into()),
                    tex: "a + b = c".into(),
                    location: SafeSourceLocation { line: Some(3) },
                },
                SafeBlock::Code {
                    id: Some("lst-publish".into()),
                    caption: Some("Publisher".into()),
                    language: Some("typescript".into()),
                    code: "publish(); // <1>".into(),
                    callouts: vec![SafeCodeCallout {
                        number: 1,
                        text: "Starts publishing.".into(),
                        inlines: vec![SafeInline::Text {
                            value: "Starts publishing.".into(),
                        }],
                    }],
                    location: SafeSourceLocation { line: Some(8) },
                },
            ],
            ..minimal_document()
        };
        let pdf =
            compile(request(document, vec![], false)).expect("publication labels should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_styled_table_and_admonition_blocks() {
        let document = SafeDocument {
            blocks: vec![
                SafeBlock::Table {
                    id: None,
                    caption: None,
                    rows: vec![
                        vec!["Format".into(), "Use".into()],
                        vec!["PDF".into(), "Print".into()],
                    ],
                    has_header: true,
                    location: SafeSourceLocation { line: Some(1) },
                },
                SafeBlock::Admonition {
                    kind: crate::safe_document::AdmonitionKind::Tip,
                    text: "x".into(),
                    inlines: vec![SafeInline::Text {
                        value: "Keep source files focused.".into(),
                    }],
                    location: SafeSourceLocation { line: Some(4) },
                },
            ],
            ..minimal_document()
        };
        let pdf = compile(request(document, vec![], false)).expect("styled blocks should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_rich_table_cell_inlines_to_pdf_bytes() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::Table {
                id: None,
                caption: None,
                has_header: true,
                location: SafeSourceLocation { line: Some(1) },
                rows: vec![
                    vec![SafeTableCell {
                        text: "Capability".into(),
                        inlines: vec![SafeInline::Strong {
                            children: vec![SafeInline::Text {
                                value: "Capability".into(),
                            }],
                        }],
                    }],
                    vec![SafeTableCell {
                        text: "See source".into(),
                        inlines: vec![
                            SafeInline::Link {
                                target: "https://typst.app".into(),
                                children: vec![SafeInline::Text {
                                    value: "Typst".into(),
                                }],
                                has_explicit_label: true,
                                reference_form: ReferenceForm::Normal,
                                is_wikilink: false,
                                is_unresolved_wikilink: false,
                            },
                            SafeInline::Citation {
                                key: "typst".into(),
                            },
                        ],
                    }],
                ],
            }],
            ..minimal_document()
        };

        let pdf =
            compile(request(document, vec![], false)).expect("rich table cells should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_every_native_publication_style() {
        for style_id in ["book-serif", "literary", "reference"] {
            let mut publication = request(minimal_document(), vec![], false);
            publication.template.id = style_id.into();
            // Exercise the non-zero path as well as the normal 100% word
            // space. A regression here previously made all English words
            // run together even though the generated Typst source parsed.
            publication.template.word_spacing_em = Some(0.01);
            let pdf = compile(publication).expect("native publication style should compile");
            assert!(pdf.starts_with(b"%PDF-"), "{style_id}");
        }
    }

    // Regression: the in-app PDF preview loads compile_typst_pdf's returned
    // temp file through the asset:// protocol (TypstPdfPreview.tsx), which
    // Tauri checks against a *separate* runtime Scope from the fs plugin's -
    // granting the fs plugin's Scope (as every other test's mock_app_with_scope
    // does) never touches it. Before compile_typst_pdf also granted the
    // asset-protocol Scope, the preview PDF compiled successfully but the
    // iframe's request for it was silently rejected and nothing rendered.
    #[test]
    fn grants_asset_protocol_scope_for_the_compiled_preview_pdf() {
        let app = mock_app_with_scope(&[]);
        let temp_path = "/tmp/asciidoc-studio-preview-test.pdf";

        assert!(
            !app.asset_protocol_scope().is_allowed(temp_path),
            "test setup: the path must not already be allowed"
        );

        grant_preview_asset_scope(app.handle(), temp_path);

        assert!(
            app.asset_protocol_scope().is_allowed(temp_path),
            "the compiled PDF's temp path must be allowed by the asset-protocol scope, or the preview iframe can never load it"
        );
    }

    #[test]
    fn generates_typst_source_without_compiling_a_pdf() {
        let source =
            write_typst_source(&request(minimal_document(), vec![], false), &HashSet::new())
                .expect("generate source");
        assert!(source.contains("#set document(title: \"Test\", author: \"Author\", date: auto)"));
        assert!(source.contains("Hello world"));
    }

    // Regression: write_typst_source (and generate_typst_source_sync, which
    // just derives asset_paths from request.assets and calls it) must never
    // need to read any file from disk - an asset whose resolved_path points
    // nowhere real (unlike the PDF compile path, which would fail trying to
    // read it) must still produce a source that references the asset by its
    // own `path`, since Typst source only ever contains path *references*,
    // not embedded bytes.
    #[test]
    fn references_an_asset_by_path_without_reading_it_from_disk() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::Image {
                id: None,
                asset: crate::safe_document::SafeAssetRef::DocumentRelative {
                    relative_path: "cover.png".into(),
                },
                alt: "Cover".into(),
                caption: None,
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        let asset = TypstAsset {
            path: "cover.png".into(),
            resolved_path: "/this/path/does/not/exist/cover.png".into(),
            media_type: "image/png".into(),
        };
        let req = request(document, vec![asset], false);
        // Mirrors generate_typst_source_sync's own asset_paths derivation:
        // straight from request.assets, no disk read.
        let asset_paths: HashSet<String> = req.assets.iter().map(|a| a.path.clone()).collect();
        let source = write_typst_source(&req, &asset_paths).expect("generate source");
        assert!(source.contains("image(\"cover.png\""));
    }

    #[test]
    fn write_typst_source_reports_a_structured_error_with_a_line_number_when_nesting_exceeds_the_depth_limit(
    ) {
        let mut blocks = vec![SafeBlock::Paragraph {
            text: "x".into(),
            inlines: vec![SafeInline::Text { value: "x".into() }],
            location: SafeSourceLocation { line: Some(42) },
        }];
        for level in (0..40).rev() {
            blocks = vec![SafeBlock::Container {
                kind: crate::safe_document::ContainerKind::Open,
                title: None,
                location: SafeSourceLocation { line: Some(level) },
                blocks,
            }];
        }
        let document = SafeDocument {
            blocks,
            ..minimal_document()
        };
        let err =
            write_typst_source(&request(document, vec![], false), &HashSet::new()).unwrap_err();
        assert_eq!(err.code, "nesting-depth-exceeded");
        assert_eq!(err.line, Some(33));
    }

    #[test]
    fn writes_pdf_bytes_to_a_fresh_temp_file_under_the_cache_dir() {
        let pdf =
            compile(request(minimal_document(), vec![], false)).expect("compile should succeed");
        let cache_dir = test_cache_dir();
        let path_string = write_pdf_to_temp_file(&cache_dir, &pdf).expect("write temp file");
        let path = PathBuf::from(&path_string);
        assert!(path.starts_with(&cache_dir));
        assert_eq!(std::fs::read(&path).expect("read back temp file"), pdf);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn generates_distinct_temp_paths_for_successive_calls() {
        let cache_dir = test_cache_dir();
        let a = unique_temp_pdf_path(&cache_dir);
        let b = unique_temp_pdf_path(&cache_dir);
        assert_ne!(a, b);
    }

    #[test]
    fn exceeds_cache_cap_accounts_for_bytes_already_used_and_the_new_file() {
        assert!(!exceeds_cache_cap(0, 1024, MAX_PUBLISH_CACHE_BYTES));
        assert!(!exceeds_cache_cap(
            MAX_PUBLISH_CACHE_BYTES - 1024,
            1024,
            MAX_PUBLISH_CACHE_BYTES
        ));
        assert!(exceeds_cache_cap(
            MAX_PUBLISH_CACHE_BYTES - 1024,
            1025,
            MAX_PUBLISH_CACHE_BYTES
        ));
        assert!(exceeds_cache_cap(
            MAX_PUBLISH_CACHE_BYTES,
            1,
            MAX_PUBLISH_CACHE_BYTES
        ));
    }

    // Regression: two concurrent publishes could each read the same
    // pre-write directory_bytes_used total, both pass the cap check, and
    // both write - letting the real total exceed the cap. Uses a tiny
    // artificial cap (not the real 2GB MAX_PUBLISH_CACHE_BYTES) so this
    // stays fast: 10 threads race to write 30-byte files against a cap that
    // only ever has room for 2 of them, repeated across several directories
    // to make a pre-existing race more likely to show up if the lock were
    // ever removed.
    #[test]
    fn write_pdf_to_temp_file_with_cap_never_lets_concurrent_writers_exceed_the_cap() {
        const TINY_CAP: u64 = 65;
        const WRITER_COUNT: usize = 10;
        const FILE_BYTES: usize = 30;

        for round in 0..5 {
            let cache_dir = std::env::temp_dir().join(format!(
                "asciidoc-studio-typst-compiler-tests-cache-race-{}-{round}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&cache_dir);

            let successes: usize = std::thread::scope(|scope| {
                let handles: Vec<_> = (0..WRITER_COUNT)
                    .map(|_| {
                        let cache_dir = &cache_dir;
                        scope.spawn(move || {
                            write_pdf_to_temp_file_with_cap(cache_dir, &[0u8; FILE_BYTES], TINY_CAP)
                                .is_ok()
                        })
                    })
                    .collect();
                handles
                    .into_iter()
                    .map(|handle| handle.join().expect("writer thread panicked"))
                    .filter(|succeeded| *succeeded)
                    .count()
            });

            // TINY_CAP (65) fits exactly 2 files of FILE_BYTES (30) each
            // (60 <= 65) but never 3 (90 > 65) - without the lock, a race
            // could let more than 2 of the 10 concurrent writers succeed.
            assert_eq!(
                successes, 2,
                "round {round}: expected exactly 2 writers to fit under the cap, got {successes}"
            );
            let _ = std::fs::remove_dir_all(&cache_dir);
        }
    }

    #[test]
    fn directory_bytes_used_sums_regular_files_in_the_directory() {
        let dir = std::env::temp_dir().join(format!(
            "asciidoc-studio-typst-compiler-tests-dir-bytes-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create dir");
        std::fs::write(dir.join("a.pdf"), vec![0u8; 100]).expect("write a");
        std::fs::write(dir.join("b.pdf"), vec![0u8; 250]).expect("write b");
        assert_eq!(directory_bytes_used(&dir), 350);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn directory_bytes_used_is_zero_for_a_missing_directory() {
        let missing = std::env::temp_dir().join(format!(
            "asciidoc-studio-typst-compiler-tests-missing-dir-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&missing);
        assert_eq!(directory_bytes_used(&missing), 0);
    }

    // Regression: a temp PDF left behind by a force-quit or crash used to
    // sit in the app cache forever - nothing ever revisited or cleaned it
    // up, so repeated crashes across sessions could accumulate unbounded
    // disk usage (up to MAX_PDF_OUTPUT_BYTES each). This must run at every
    // startup (see lib.rs's `.setup()` hook) and clear anything left over.
    #[test]
    fn cleanup_stale_temp_pdfs_removes_leftover_files_from_a_previous_crashed_session() {
        let app = mock_app_with_scope(&[]);
        let cache_dir = app.path().app_cache_dir().expect("resolve app cache dir");
        let publish_dir = cache_dir.join("publish");
        std::fs::create_dir_all(&publish_dir).expect("create publish dir");
        let leftover = publish_dir.join("leftover-from-a-crash.pdf");
        std::fs::write(&leftover, b"stale pdf bytes").expect("write leftover file");

        cleanup_stale_temp_pdfs(app.handle());

        assert!(!leftover.exists());
    }

    #[test]
    fn cleanup_stale_temp_pdfs_is_a_no_op_when_nothing_was_ever_published() {
        let app = mock_app_with_scope(&[]);
        // Must not panic even though publish/ was never created.
        cleanup_stale_temp_pdfs(app.handle());
    }

    // Regression: PageSize.print_size used to be interpolated directly into
    // `#set page(width: ..., height: ...)` with no validation at all (a
    // Typst length literal isn't a quoted string, so there was nothing to
    // even escape) - a WebView caller (manual construction, a compromised
    // renderer, a future bug) could inject arbitrary Typst source through
    // it. page_geometry() now ignores it entirely and looks dimensions up
    // from a Rust-side table keyed by the closed PageSizeId enum instead;
    // this asserts a hostile print_size payload has zero effect on output.
    #[test]
    fn ignores_a_hostile_print_size_string_and_uses_the_allow_listed_dimensions_instead() {
        let mut hostile_page_size = page_size();
        hostile_page_size.print_size = "1mm) #panic() //".into();
        let pdf = compile(PdfPublicationRequest {
            document: minimal_document(),
            template: template(),
            page_size: hostile_page_size,
            cover: cover(),
            publication: Default::default(),
            assets: vec![],
            bibliography: vec![],
            pdf_a: false,
            document_root: None,
        })
        .expect("compile should succeed - the hostile print_size must never reach Typst source");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_math_through_mitex_into_the_pdf() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::MathBlock {
                id: None,
                caption: None,
                tex: "x^2 + y^2".into(),
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        let pdf = compile(request(document, vec![], false)).expect("compile should succeed");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_an_attributed_quote_to_pdf_bytes() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::Quote {
                text: "A safe quote.".into(),
                inlines: vec![SafeInline::Text {
                    value: "A safe quote.".into(),
                }],
                attribution: Some("Ada Lovelace".into()),
                citation: Some("Notes".into()),
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };

        let pdf =
            compile(request(document, vec![], false)).expect("attributed quote should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_latex_square_roots_into_the_pdf() {
        let document = SafeDocument {
            blocks: vec![SafeBlock::MathBlock {
                id: None,
                caption: None,
                tex: r#"\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"#.into(),
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };

        let pdf =
            compile(request(document, vec![], false)).expect("square-root math should compile");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    #[test]
    fn compiles_with_pdf_a_standard_requested() {
        let pdf =
            compile(request(minimal_document(), vec![], true)).expect("compile should succeed");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    /// A minimal valid 1x1 PNG (not arbitrary bytes) - Typst decodes and
    /// validates real image content, so a placeholder byte string like
    /// `[1, 2, 3, 4]` fails with a decode error rather than exercising the
    /// asset-loading path this test actually targets.
    fn tiny_png_bytes() -> Vec<u8> {
        let mut pixmap = tiny_skia::Pixmap::new(1, 1).expect("valid pixmap size");
        pixmap.fill(tiny_skia::Color::from_rgba8(90, 130, 220, 255));
        pixmap.encode_png().expect("encode png")
    }

    #[test]
    fn reads_a_document_relative_asset_file_from_disk() {
        let (root, asset) = write_temp_asset("cover.png", &tiny_png_bytes(), "image/png");
        let document = SafeDocument {
            blocks: vec![SafeBlock::Image {
                id: None,
                asset: crate::safe_document::SafeAssetRef::DocumentRelative {
                    relative_path: "cover.png".into(),
                },
                alt: "Cover".into(),
                caption: None,
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        let pdf = compile(PdfPublicationRequest {
            document,
            template: template(),
            page_size: page_size(),
            cover: cover(),
            publication: Default::default(),
            assets: vec![asset],
            bibliography: vec![],
            pdf_a: false,
            document_root: Some(root),
        })
        .expect("compile should succeed");
        assert!(pdf.starts_with(b"%PDF-"));
    }

    // Regression: document_root is WebView input like everything else in
    // the request - a compromised renderer could claim document_root: "/"
    // (or any other path it was never actually granted) and have
    // resolve_within_root happily confirm a resolved_path is "nested inside"
    // it. This asset's resolved_path IS genuinely nested under document_root
    // (write_temp_asset builds a real, legitimately-structured file) - the
    // only thing wrong here is that document_root was never granted fs
    // scope via a real dialog pick, which is exactly what
    // is_trusted_document_root must catch on its own, independent of the
    // containment check.
    #[test]
    fn refuses_to_publish_when_the_document_root_was_never_granted_fs_scope() {
        let (root, asset) = write_temp_asset("cover.png", &tiny_png_bytes(), "image/png");
        let document = SafeDocument {
            blocks: vec![SafeBlock::Image {
                id: None,
                asset: crate::safe_document::SafeAssetRef::DocumentRelative {
                    relative_path: "cover.png".into(),
                },
                alt: "Cover".into(),
                caption: None,
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        // No allowed_roots at all - unlike the compile() helper, this mock
        // app's fs scope never learns about `root`.
        let app = mock_app_with_scope(&[]);
        let result = compile_pdf_sync(
            app.handle(),
            PdfPublicationRequest {
                document,
                template: template(),
                page_size: page_size(),
                cover: cover(),
                publication: Default::default(),
                assets: vec![asset],
                bibliography: vec![],
                pdf_a: false,
                document_root: Some(root),
            },
            &test_cache_dir(),
        );
        assert_eq!(result.unwrap_err().code, "asset-outside-allowed-root");
    }

    // Regression: an asset whose resolved_path claims to be inside
    // document_root but, once independently re-normalized here, actually
    // escapes it (or belongs to a document_root the caller didn't declare)
    // must be refused - Rust never trusts the WebView's own resolution.
    #[test]
    fn refuses_an_asset_whose_resolved_path_is_outside_both_allowed_roots() {
        let asset = TypstAsset {
            path: "escape.png".into(),
            resolved_path: "/etc/passwd".into(),
            media_type: "image/png".into(),
        };
        let result = compile(PdfPublicationRequest {
            document: minimal_document(),
            template: template(),
            page_size: page_size(),
            cover: cover(),
            publication: Default::default(),
            assets: vec![asset],
            bibliography: vec![],
            pdf_a: false,
            document_root: Some("/Users/foo/book".into()),
        });
        assert_eq!(result.unwrap_err().code, "asset-outside-allowed-root");
    }

    // Regression: a symlink placed inside the document root but pointing at
    // a file outside it must not be readable through this pipeline - a
    // pure lexical/string check on `resolved_path` (the previous
    // path_safety.rs implementation) would see "<document_root>/leak.png"
    // as nested inside document_root and wrongly accept it, even though
    // following the symlink reads a file anywhere on disk. This exercises
    // the real end-to-end asset-loading path, not just path_safety.rs in
    // isolation.
    #[test]
    #[cfg(unix)]
    fn refuses_to_read_through_a_symlink_that_escapes_the_document_root() {
        let id = TEST_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root =
            std::env::temp_dir().join(format!("asciidoc-studio-typst-compiler-tests-symlink-{id}"));
        std::fs::create_dir_all(&root).expect("create temp document root");
        let outside =
            std::env::temp_dir().join(format!("asciidoc-studio-typst-compiler-tests-outside-{id}"));
        std::fs::create_dir_all(&outside).expect("create outside dir");
        let secret = outside.join("secret.png");
        std::fs::write(&secret, tiny_png_bytes()).expect("write secret file");
        let link = root.join("cover.png");
        // A leftover symlink from a previous run of this same test binary
        // (the temp dir name is only unique per-process, not per-run) would
        // otherwise make `symlink()` fail with AlreadyExists.
        let _ = std::fs::remove_file(&link);
        std::os::unix::fs::symlink(&secret, &link).expect("create symlink");

        let document = SafeDocument {
            blocks: vec![SafeBlock::Image {
                id: None,
                asset: crate::safe_document::SafeAssetRef::DocumentRelative {
                    relative_path: "cover.png".into(),
                },
                alt: "Cover".into(),
                caption: None,
                location: SafeSourceLocation { line: Some(1) },
            }],
            ..minimal_document()
        };
        let asset = TypstAsset {
            path: "cover.png".into(),
            resolved_path: link.to_string_lossy().into_owned(),
            media_type: "image/png".into(),
        };
        let result = compile(PdfPublicationRequest {
            document,
            template: template(),
            page_size: page_size(),
            cover: cover(),
            publication: Default::default(),
            assets: vec![asset],
            bibliography: vec![],
            pdf_a: false,
            document_root: Some(root.to_string_lossy().into_owned()),
        });
        assert_eq!(result.unwrap_err().code, "asset-outside-allowed-root");
    }

    #[test]
    fn rejects_a_request_with_too_many_assets_before_compiling() {
        let assets = (0..=MAX_ASSET_COUNT)
            .map(|i| TypstAsset {
                path: format!("img-{i}.png"),
                resolved_path: format!("/nonexistent/img-{i}.png"),
                media_type: "image/png".into(),
            })
            .collect();
        let result = compile(request(minimal_document(), assets, false));
        assert_eq!(result.unwrap_err().code, "too-many-assets");
    }

    #[test]
    fn rejects_a_request_exceeding_the_total_asset_byte_limit() {
        let (root, asset) = write_temp_asset(
            "huge.png",
            &vec![0u8; MAX_TOTAL_ASSET_BYTES + 1],
            "image/png",
        );
        let result = compile(PdfPublicationRequest {
            document: minimal_document(),
            template: template(),
            page_size: page_size(),
            cover: cover(),
            publication: Default::default(),
            assets: vec![asset],
            bibliography: vec![],
            pdf_a: false,
            document_root: Some(root),
        });
        assert_eq!(result.unwrap_err().code, "assets-too-large");
    }

    #[test]
    fn reports_a_structured_error_with_a_line_number_when_nesting_exceeds_the_depth_limit() {
        // SafeDocument's own MAX_NESTING_DEPTH (safeDocument.ts, 32) is
        // enforced on the TS side before a request is ever sent - this
        // constructs a Rust-only SafeDocument that bypasses it entirely (40
        // levels, past 32), to check what happens if that guard were ever
        // bypassed by a bug, a future adapter, or a hand-built request.
        // Policy: fail with the *offending* block's own line (the block
        // being descended into at the moment the limit is crossed), not
        // silently truncate the document (DESIGN_GUIDELINES.md §7). Each
        // wrapping container gets a distinct line number (its nesting
        // level) so this test can pin exactly which block's location gets
        // reported, rather than accepting whatever line falls out.
        let mut blocks = vec![SafeBlock::Paragraph {
            text: "x".into(),
            inlines: vec![SafeInline::Text { value: "x".into() }],
            location: SafeSourceLocation { line: Some(999) },
        }];
        for level in (0..40).rev() {
            blocks = vec![SafeBlock::Container {
                kind: crate::safe_document::ContainerKind::Open,
                title: None,
                location: SafeSourceLocation { line: Some(level) },
                blocks,
            }];
        }
        // Container at nesting level 0 is outermost (document.blocks[0]),
        // level 39 is innermost (directly wrapping the paragraph).
        // write_blocks checks `depth > MAX_NESTING_DEPTH (32)` on entry, so
        // it fails while about to descend into the level-33 container - its
        // own location.line is the one reported.
        let document = SafeDocument {
            blocks,
            ..minimal_document()
        };
        let result = compile(request(document, vec![], false));
        let err = result.unwrap_err();
        assert_eq!(err.code, "nesting-depth-exceeded");
        assert_eq!(err.line, Some(33));
    }

    #[test]
    fn json_depth_prescan_accepts_shallow_json() {
        assert!(!json_nesting_depth_exceeds(
            r#"{"a": [1, 2, {"b": 3}]}"#,
            10
        ));
    }

    #[test]
    fn json_depth_prescan_rejects_deeply_nested_json() {
        let deep = "[".repeat(1000) + &"]".repeat(1000);
        assert!(json_nesting_depth_exceeds(&deep, 500));
    }

    #[test]
    fn json_depth_prescan_ignores_brackets_inside_string_content() {
        // A string full of unmatched brackets must never be mistaken for
        // real structural nesting.
        let json = format!(r#"{{"text": "{}"}}"#, "[".repeat(1000));
        assert!(!json_nesting_depth_exceeds(&json, 10));
    }

    #[test]
    fn parse_request_rejects_an_oversized_payload_before_parsing() {
        let huge = "x".repeat(MAX_REQUEST_JSON_BYTES + 1);
        let result = parse_request(&huge);
        assert_eq!(result.unwrap_err().code, "request-too-large");
    }

    #[test]
    fn accepts_the_current_and_legacy_safe_document_versions() {
        assert!(is_supported_safe_document_version(1));
        assert!(is_supported_safe_document_version(2));
        assert!(is_supported_safe_document_version(3));
        assert!(is_supported_safe_document_version(4));
        assert!(!is_supported_safe_document_version(0));
        assert!(!is_supported_safe_document_version(5));
    }

    /// Not part of the normal `cargo test` run (`#[ignore]`) - a manual
    /// verification helper that writes a real Korean+English+math PDF/A-2b
    /// file to disk so `scripts/verify-pdfa.sh` (veraPDF) can be run against
    /// actual output, per DESIGN_GUIDELINES.md §7's "네이티브 구현과 회귀
    /// 테스트" requirement - unit tests and pixel diffs alone don't prove
    /// real PDF/A conformance (font embedding, XMP metadata, color spaces).
    ///
    /// Run with: `cargo test -- --ignored write_sample_korean_pdf_a`
    /// then: `../scripts/verify-pdfa.sh /tmp/asciidoc-studio-sample-pdfa.pdf`
    #[test]
    #[ignore]
    fn write_sample_korean_pdf_a() {
        let document = SafeDocument {
            version: 1,
            metadata: SafeDocumentMetadata {
                title: "한글 PDF/A 검증 샘플".into(),
                author: "AsciiDoc Studio".into(),
                language: "ko".into(),
            },
            blocks: vec![SafeBlock::Paragraph {
                text: "x".into(),
                inlines: vec![SafeInline::Text {
                    value:
                        "이것은 한글, English, and math($x^2$)를 포함한 PDF/A 검증용 샘플입니다."
                            .into(),
                }],
                location: SafeSourceLocation { line: Some(1) },
            }],
            diagnostics: vec![],
        };
        let pdf = compile(request(document, vec![], true)).expect("compile should succeed");
        std::fs::write("/tmp/asciidoc-studio-sample-pdfa.pdf", &pdf).expect("write sample pdf");
        eprintln!(
            "wrote {} bytes to /tmp/asciidoc-studio-sample-pdfa.pdf",
            pdf.len()
        );
    }
}
