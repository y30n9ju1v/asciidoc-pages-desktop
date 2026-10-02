//! Rust mirror of `desktop-app/src/services/pdfPublicationRequest.ts`'s
//! `PdfPublicationRequest`/`TypstAsset`, plus the `PublishTemplateOption`/
//! `PageSizeOption` shapes it carries (publishTemplateService.ts,
//! pageSizeService.ts). Field names use `rename_all = "camelCase"` to match
//! the TS JSON shape exactly, same convention as safe_document.rs.
use crate::safe_document::SafeDocument;
use crate::typst_font::FontRole;
use serde::{Deserialize, Serialize};

pub use crate::publication::BibliographyEntry;

/// The `compile_typst_pdf` command's error type - structured rather than a
/// plain `String` (the convention every other command in this crate uses)
/// specifically so a depth-exceeded or other located failure can carry a
/// source `line` the frontend can jump the editor to, without the caller
/// having to regex-parse a formatted message for it.
#[derive(Debug, Clone, Serialize)]
pub struct PublishError {
    pub code: String,
    pub message: String,
    pub line: Option<u32>,
}

impl PublishError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            line: None,
        }
    }

    pub fn with_line(code: &str, message: impl Into<String>, line: Option<u32>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            line,
        }
    }
}

impl std::fmt::Display for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for PublishError {}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishTemplate {
    #[allow(dead_code)]
    pub id: String,
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub description: String,
    pub body_font: FontRole,
    pub heading_font: FontRole,
    pub base_font_size_pt: f64,
    pub line_height: f64,
    /// Optional only for requests produced by older app versions. The native
    /// writer bounds every value before emitting a Typst length literal.
    #[serde(default)]
    pub letter_spacing_em: Option<f64>,
    #[serde(default)]
    pub word_spacing_em: Option<f64>,
    #[serde(default)]
    pub paragraph_spacing_em: Option<f64>,
    #[serde(default)]
    pub first_line_indent_em: Option<f64>,
    pub heading_numbering: bool,
    #[serde(default)]
    pub body_justification: bool,
    #[serde(default)]
    pub chapter_starts_on_new_page: bool,
    /// Optional user-template accent. The writer validates this as a strict
    /// #rrggbb value before it can become any Typst source.
    #[serde(default)]
    pub accent_color: Option<String>,
}

/// Mirrors pageSizeService.ts's `PageSizeId` - a closed set, not a free
/// string. Anything else fails to deserialize before page_geometry() is
/// ever reached, which matters because the WebView's own `printSize`/
/// `printMargin` strings (below) are never trusted for layout:
/// page_geometry() looks dimensions and margins up from a Rust-side table
/// keyed by this enum instead.
#[derive(Debug, Clone, Copy, Deserialize)]
pub enum PageSizeId {
    B5,
    A4,
    A5,
    Letter,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSize {
    pub id: PageSizeId,
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub dimensions: String,
    #[allow(dead_code)]
    pub width_px: u32,
    #[allow(dead_code)]
    pub description: String,
    /// Never trusted for layout (see page_geometry()) - kept only for
    /// wire-shape parity with pageSizeService.ts's PageSizeOption. This
    /// string used to be interpolated directly into `#set page(width:,
    /// height:)` with no quoting at all (Typst length literals are bare
    /// syntax, not string literals), so a manually constructed or buggy
    /// PdfPublicationRequest could inject arbitrary Typst source through it.
    #[allow(dead_code)]
    pub print_size: String,
    /// Never trusted for layout either, for the exact same reason as
    /// `print_size` above - margins go through page_geometry()'s own
    /// Rust-side allow-list, not this string.
    #[allow(dead_code)]
    pub print_margin: String,
}

/// Title-page content and optional, already-boundary-checked cover images.
/// Image paths are still checked against the bundled asset set by the writer;
/// this request never grants a filesystem path on its own.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCover {
    pub title: String,
    pub subtitle: String,
    pub author: String,
    pub publisher: String,
    #[serde(default)]
    pub front_image_path: String,
    #[serde(default)]
    pub back_image_path: String,
}

fn default_toc_depth() -> u8 {
    3
}

/// Closed presentation values derived from selected AsciiDoc header
/// attributes. Strings are escaped in typst_writer.rs; depth is bounded again
/// at the native boundary before becoming a Typst expression.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPublicationOptions {
    #[serde(default = "default_toc_depth")]
    pub toc_depth: u8,
    #[serde(default = "default_figure_caption")]
    pub figure_caption: String,
    #[serde(default = "default_table_caption")]
    pub table_caption: String,
    #[serde(default = "default_example_caption")]
    pub example_caption: String,
}

fn default_figure_caption() -> String {
    "Figure".into()
}
fn default_table_caption() -> String {
    "Table".into()
}
fn default_example_caption() -> String {
    "Example".into()
}

impl Default for PdfPublicationOptions {
    fn default() -> Self {
        Self {
            toc_depth: default_toc_depth(),
            figure_caption: default_figure_caption(),
            table_caption: default_table_caption(),
            example_caption: default_example_caption(),
        }
    }
}

/// No `bytes` field - asset content used to travel as a `Vec<u8>` inside the
/// same JSON payload as the rest of the request (serde's default `Vec<u8>`
/// encoding is a JSON array of numbers, 3-5x the raw size, with no way to
/// bound it before the whole request is already in memory). `resolved_path`
/// is an absolute path TS already boundary-checked - but never trusted as
/// such: `typst_compiler.rs` re-derives and re-checks it against
/// `PdfPublicationRequest.document_root` (or the app's own cache dir for
/// Mermaid-rendered SVGs) before ever opening it, the same
/// never-trust-a-downstream-claim policy as `isSafeAssetRef`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstAsset {
    pub path: String,
    pub resolved_path: String,
    /// Not yet read - Typst infers image format from file content, not this
    /// field. Kept for wire-shape parity with pdfPublicationRequest.ts and
    /// as a natural place to validate an allowed MIME allow-list if asset
    /// type restrictions are added later.
    #[allow(dead_code)]
    pub media_type: String,
}

/// Everything `compile_typst_pdf` needs, and nothing more - `document` is
/// the plain `SafeDocument` JSON, unmodified. There is deliberately no
/// Typst source string on the wire: typst_writer.rs is the only place that
/// generates Typst markup, so the WebView can never hand the native
/// compiler a string it could make executable.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPublicationRequest {
    pub document: SafeDocument,
    pub template: PublishTemplate,
    pub page_size: PageSize,
    pub cover: PdfCover,
    #[serde(default)]
    pub publication: PdfPublicationOptions,
    pub assets: Vec<TypstAsset>,
    /// Every citable source the document's `cite:[key]` markers may resolve
    /// against - see BibliographyEntry. A cited key absent from this list
    /// still gets a numbered marker (numbering only needs the document's own
    /// citation keys), just with an "unresolved" line in the generated
    /// References section instead of the real entry.
    pub bibliography: Vec<BibliographyEntry>,
    pub pdf_a: bool,
    /// The open document's own folder (`null` for an unsaved document, in
    /// which case `assets` must be empty - Preflight already blocks PDF
    /// publish for an unsaved document via the `unsaved-manuscript` error).
    /// Used to re-validate each asset's `resolved_path` boundary - see
    /// `TypstAsset`.
    pub document_root: Option<String>,
}

/// Typst length literals for one page size's dimensions and margins - all
/// `'static str`, since every value comes from the allow-list table below,
/// never from wire data.
#[derive(Debug, Clone, Copy)]
pub struct PageGeometry {
    pub width: &'static str,
    pub height: &'static str,
    pub margin_top: &'static str,
    pub margin_right: &'static str,
    pub margin_bottom: &'static str,
    pub margin_left: &'static str,
}

/// Rust-side allow-list of actual Typst length literals per page size,
/// mirroring pageSizeService.ts's own `printSize`/`printMargin` values
/// exactly (same top/right/bottom/left numbers, just owned here instead of
/// trusted from the wire). This is the sole source of truth for PDF page
/// geometry - `PageSize.print_size`/`print_margin` (the WebView's own copy
/// of the same values) are never read here, closing the same class of
/// Typst-source-injection risk `print_size` itself was fixed for.
fn page_geometry_for(id: PageSizeId) -> PageGeometry {
    match id {
        PageSizeId::B5 => PageGeometry {
            width: "182mm",
            height: "257mm",
            margin_top: "15mm",
            margin_right: "15mm",
            margin_bottom: "18mm",
            margin_left: "15mm",
        },
        PageSizeId::A4 => PageGeometry {
            width: "210mm",
            height: "297mm",
            margin_top: "18mm",
            margin_right: "18mm",
            margin_bottom: "22mm",
            margin_left: "18mm",
        },
        PageSizeId::A5 => PageGeometry {
            width: "148mm",
            height: "210mm",
            margin_top: "12mm",
            margin_right: "12mm",
            margin_bottom: "15mm",
            margin_left: "12mm",
        },
        PageSizeId::Letter => PageGeometry {
            width: "8.5in",
            height: "11in",
            margin_top: "0.75in",
            margin_right: "0.75in",
            margin_bottom: "0.9in",
            margin_left: "0.75in",
        },
    }
}

pub fn page_geometry(page_size: &PageSize) -> PageGeometry {
    page_geometry_for(page_size.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page_size(id: PageSizeId, hostile_print_size: &str, hostile_print_margin: &str) -> PageSize {
        PageSize {
            id,
            name: String::new(),
            dimensions: String::new(),
            width_px: 0,
            description: String::new(),
            print_size: hostile_print_size.into(),
            print_margin: hostile_print_margin.into(),
        }
    }

    #[test]
    fn returns_the_allow_listed_geometry_for_each_page_size_id() {
        let b5 = page_geometry(&page_size(PageSizeId::B5, "", ""));
        assert_eq!((b5.width, b5.height), ("182mm", "257mm"));
        assert_eq!(
            (
                b5.margin_top,
                b5.margin_right,
                b5.margin_bottom,
                b5.margin_left
            ),
            ("15mm", "15mm", "18mm", "15mm")
        );

        let a4 = page_geometry(&page_size(PageSizeId::A4, "", ""));
        assert_eq!((a4.width, a4.height), ("210mm", "297mm"));

        let a5 = page_geometry(&page_size(PageSizeId::A5, "", ""));
        assert_eq!((a5.width, a5.height), ("148mm", "210mm"));

        let letter = page_geometry(&page_size(PageSizeId::Letter, "", ""));
        assert_eq!((letter.width, letter.height), ("8.5in", "11in"));
    }

    // Regression: print_size/print_margin used to be trusted verbatim - see
    // the doc comments on PageSize.print_size/print_margin for the
    // injection this closes.
    #[test]
    fn ignores_print_size_and_print_margin_entirely_regardless_of_their_content() {
        let hostile = page_size(PageSizeId::A4, "1mm) #panic() //", "1mm) #panic() //");
        let geometry = page_geometry(&hostile);
        assert_eq!((geometry.width, geometry.height), ("210mm", "297mm"));
        assert_eq!(geometry.margin_top, "18mm");
    }
}
