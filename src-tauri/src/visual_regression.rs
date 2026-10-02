//! Visual regression tests for the Typst PDF pipeline - DESIGN_GUIDELINES.md
//! §7 requires "네이티브 구현과 회귀 테스트" (a native implementation shipped
//! together with regression tests) for platform-dependent output like PDF.
//! Rather than re-decoding the PDF itself, this rasterizes the compiled
//! `PagedDocument` straight to PNG via `typst-render` (the same crate the
//! Typst CLI's own `--format png` uses) and diffs against a checked-in
//! reference image with a small per-pixel tolerance for anti-aliasing/font
//! hinting drift.
//!
//! Regenerate fixtures after an intentional rendering change:
//! `UPDATE_SNAPSHOTS=1 cargo test visual_regression`
#![cfg(test)]

use crate::publication_request::{PageSize, PublishTemplate, TypstAsset};
use crate::safe_document::{
    SafeBlock, SafeDocument, SafeDocumentMetadata, SafeInline, SafeListItem, SafeSourceLocation,
};
use crate::typst_font::FontRole;
use crate::typst_writer::{write_document, Cover, WriteOptions};
use std::collections::HashSet;
use std::path::PathBuf;
use typst_as_lib::typst_kit_options::TypstKitFontOptions;
use typst_as_lib::TypstEngine;
use typst_layout::PagedDocument;
use typst_library::layout::Abs;
use typst_library::visualize::Color;
use typst_render::RenderOptions;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/visual")
}

fn loc() -> SafeSourceLocation {
    SafeSourceLocation { line: Some(1) }
}

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

/// Mirrors the three built-in publication contracts. These are deliberately
/// independent visual fixtures: a successful Typst compile alone cannot
/// detect a Literary or Reference layout accidentally becoming Book Serif.
fn template_for_style(style: crate::typst_writer::PublicationStyle) -> PublishTemplate {
    match style {
        crate::typst_writer::PublicationStyle::BookSerif => PublishTemplate {
            id: "book-serif".into(),
            name: "Book Serif".into(),
            description: String::new(),
            body_font: FontRole::Serif,
            heading_font: FontRole::Serif,
            base_font_size_pt: 10.5,
            line_height: 1.7,
            letter_spacing_em: Some(0.0),
            word_spacing_em: Some(0.01),
            paragraph_spacing_em: Some(0.0),
            first_line_indent_em: Some(1.25),
            heading_numbering: true,
            body_justification: true,
            chapter_starts_on_new_page: true,
            accent_color: None,
        },
        crate::typst_writer::PublicationStyle::Literary => PublishTemplate {
            id: "literary".into(),
            name: "Literary".into(),
            description: String::new(),
            body_font: FontRole::Serif,
            heading_font: FontRole::Serif,
            base_font_size_pt: 11.0,
            line_height: 1.8,
            letter_spacing_em: Some(0.005),
            word_spacing_em: Some(0.01),
            paragraph_spacing_em: Some(0.0),
            first_line_indent_em: Some(1.4),
            heading_numbering: false,
            body_justification: true,
            chapter_starts_on_new_page: true,
            accent_color: None,
        },
        crate::typst_writer::PublicationStyle::Reference => PublishTemplate {
            id: "reference".into(),
            name: "Reference".into(),
            description: String::new(),
            body_font: FontRole::Sans,
            heading_font: FontRole::Sans,
            base_font_size_pt: 10.0,
            line_height: 1.6,
            letter_spacing_em: Some(0.0),
            word_spacing_em: Some(0.0),
            paragraph_spacing_em: Some(0.8),
            first_line_indent_em: Some(0.0),
            heading_numbering: true,
            body_justification: false,
            chapter_starts_on_new_page: false,
            accent_color: None,
        },
    }
}

fn page_size() -> PageSize {
    PageSize {
        id: crate::publication_request::PageSizeId::A5,
        name: "A5".into(),
        dimensions: String::new(),
        width_px: 560,
        description: String::new(),
        print_size: "148mm 210mm".into(),
        print_margin: String::new(),
    }
}

// Empty so the fixtures stay focused on body content, not cover-page
// styling (which typst_writer.rs's own unit tests already cover directly).
fn cover() -> Cover<'static> {
    Cover {
        title: "",
        subtitle: "",
        author: "",
        publisher: "",
        front_image_path: "",
        back_image_path: "",
    }
}

fn styled_cover() -> Cover<'static> {
    Cover {
        title: "A Publication Title",
        subtitle: "A visual regression edition",
        author: "AsciiDoc Studio",
        publisher: "Studio Press",
        front_image_path: "",
        back_image_path: "",
    }
}

/// Writes `bytes` to a fresh temp file and returns a `TypstAsset` pointing
/// at it via `resolved_path` - assets are read from disk by path now, not
/// carried as in-memory bytes (see TypstAsset's doc comment), so these test
/// fixtures need a real file too.
fn write_asset_file(path: &str, bytes: &[u8], media_type: &str) -> TypstAsset {
    static NEXT_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let unique = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!(
        "asciidoc-studio-visual-regression-{}-{}",
        std::process::id(),
        unique
    ));
    let resolved = dir.join(path);
    std::fs::create_dir_all(resolved.parent().expect("asset path has a parent"))
        .expect("create temp asset dir");
    std::fs::write(&resolved, bytes).expect("write temp asset");
    TypstAsset {
        path: path.into(),
        resolved_path: resolved.to_string_lossy().into_owned(),
        media_type: media_type.into(),
    }
}

/// A small solid-color PNG, generated at test time (not hand-crafted bytes)
/// so this file carries no binary blobs of its own - only the checked-in
/// fixture PNGs under tests/fixtures/visual/ are real binary assets.
fn synthetic_png_asset(path: &str) -> TypstAsset {
    let mut pixmap = tiny_skia::Pixmap::new(8, 8).expect("valid pixmap size");
    pixmap.fill(tiny_skia::Color::from_rgba8(90, 130, 220, 255));
    write_asset_file(path, &pixmap.encode_png().expect("encode png"), "image/png")
}

fn synthetic_svg_asset(path: &str) -> TypstAsset {
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#5a82dc"/></svg>"##;
    write_asset_file(path, svg, "image/svg+xml")
}

fn text_and_math_document() -> (SafeDocument, Vec<TypstAsset>) {
    let document = SafeDocument {
        version: 1,
        metadata: SafeDocumentMetadata {
            title: "Visual Regression".into(),
            author: "Fixture".into(),
            language: "en".into(),
        },
        diagnostics: vec![],
        blocks: vec![SafeBlock::Section {
            id: None,
            title: "Introduction".into(),
            level: 1,
            location: loc(),
            blocks: vec![
                SafeBlock::Paragraph {
                    text: "x".into(),
                    inlines: vec![
                        SafeInline::Text {
                            value: "This is ".into(),
                        },
                        SafeInline::Strong {
                            children: vec![SafeInline::Text {
                                value: "bold".into(),
                            }],
                        },
                        SafeInline::Text {
                            value: " and ".into(),
                        },
                        SafeInline::Emphasis {
                            children: vec![SafeInline::Text {
                                value: "italic".into(),
                            }],
                        },
                        SafeInline::Text {
                            value: " text.".into(),
                        },
                    ],
                    location: loc(),
                },
                SafeBlock::MathBlock {
                    id: None,
                    caption: None,
                    tex: "x^2 + y^2 = z^2".into(),
                    location: loc(),
                },
                SafeBlock::List {
                    ordered: false,
                    location: loc(),
                    items: vec![
                        SafeListItem {
                            text: "Done".into(),
                            inlines: vec![SafeInline::Text {
                                value: "Done task".into(),
                            }],
                            blocks: vec![],
                            location: loc(),
                            checked: Some(true),
                        },
                        SafeListItem {
                            text: "Todo".into(),
                            inlines: vec![SafeInline::Text {
                                value: "Todo task".into(),
                            }],
                            blocks: vec![],
                            location: loc(),
                            checked: Some(false),
                        },
                    ],
                },
            ],
        }],
    };
    (document, vec![])
}

fn table_image_and_diagram_document() -> (SafeDocument, Vec<TypstAsset>) {
    let image_asset = synthetic_png_asset("cover.png");
    let diagram_code = "graph TD\n  A --> B";
    let diagram_asset = synthetic_svg_asset(&crate::typst_writer::diagram_asset_path(diagram_code));
    let document = SafeDocument {
        version: 1,
        metadata: SafeDocumentMetadata {
            title: "Visual Regression Table".into(),
            author: "Fixture".into(),
            language: "en".into(),
        },
        diagnostics: vec![],
        blocks: vec![
            SafeBlock::Table {
                id: None,
                caption: None,
                rows: vec![
                    vec!["Name".into(), "Value".into()],
                    vec!["Alpha".into(), "1".into()],
                    vec!["Beta".into(), "2".into()],
                ],
                has_header: true,
                location: loc(),
            },
            SafeBlock::Image {
                id: None,
                asset: crate::safe_document::SafeAssetRef::DocumentRelative {
                    relative_path: "cover.png".into(),
                },
                alt: "Cover".into(),
                caption: None,
                location: loc(),
            },
            SafeBlock::Diagram {
                id: None,
                caption: None,
                engine: "mermaid".into(),
                code: diagram_code.into(),
                location: loc(),
            },
        ],
    };
    (document, vec![image_asset, diagram_asset])
}

fn korean_english_and_math_document() -> (SafeDocument, Vec<TypstAsset>) {
    let document = SafeDocument {
        version: 1,
        metadata: SafeDocumentMetadata {
            title: "한글 조판 테스트".into(),
            author: "Fixture".into(),
            language: "ko".into(),
        },
        diagnostics: vec![],
        blocks: vec![SafeBlock::Section {
            id: None,
            title: "소개 Introduction".into(),
            level: 1,
            location: loc(),
            blocks: vec![
                SafeBlock::Paragraph {
                    text: "x".into(),
                    inlines: vec![
                        SafeInline::Text {
                            value: "안녕하세요. This paragraph mixes ".into(),
                        },
                        SafeInline::Strong {
                            children: vec![SafeInline::Text {
                                value: "한글 굵게(bold)".into(),
                            }],
                        },
                        SafeInline::Text {
                            value: "와 English in one line, followed by a formula: ".into(),
                        },
                    ],
                    location: loc(),
                },
                SafeBlock::MathBlock {
                    id: None,
                    caption: None,
                    tex: "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}".into(),
                    location: loc(),
                },
                SafeBlock::List {
                    ordered: false,
                    location: loc(),
                    items: vec![SafeListItem {
                        text: "항목".into(),
                        inlines: vec![SafeInline::Text {
                            value: "한글 목록 항목 (Korean list item)".into(),
                        }],
                        blocks: vec![],
                        location: loc(),
                        checked: None,
                    }],
                },
            ],
        }],
    };
    (document, vec![])
}

fn render_to_png(
    document: SafeDocument,
    assets: Vec<TypstAsset>,
    template: PublishTemplate,
    style: crate::typst_writer::PublicationStyle,
    cover: Cover<'static>,
) -> Vec<u8> {
    let asset_paths: HashSet<String> = assets.iter().map(|a| a.path.clone()).collect();
    let geometry = crate::publication_request::page_geometry(&page_size());
    let options = WriteOptions {
        style,
        body_font: template.body_font,
        heading_font: template.heading_font,
        base_font_size_pt: template.base_font_size_pt,
        line_height: template.line_height,
        letter_spacing_em: template.letter_spacing_em.unwrap_or(0.0),
        word_spacing_em: template.word_spacing_em.unwrap_or(0.0),
        paragraph_spacing_em: template.paragraph_spacing_em.unwrap_or(0.0),
        first_line_indent_em: template.first_line_indent_em.unwrap_or(0.0),
        heading_numbering: template.heading_numbering,
        body_justification: template.body_justification,
        chapter_starts_on_new_page: template.chapter_starts_on_new_page,
        accent_color: None,
        page_width: geometry.width,
        page_height: geometry.height,
        margin_top: geometry.margin_top,
        margin_right: geometry.margin_right,
        margin_bottom: geometry.margin_bottom,
        margin_left: geometry.margin_left,
        toc_depth: 3,
        figure_caption: "Figure",
        table_caption: "Table",
        example_caption: "Example",
    };
    let source = write_document(&document, &options, &asset_paths, &cover, &[])
        .expect("visual regression fixture must stay within the nesting depth limit");
    let asset_bytes: Vec<(String, Vec<u8>)> = assets
        .iter()
        .map(|a| {
            (
                a.path.clone(),
                std::fs::read(&a.resolved_path).expect("read temp asset file"),
            )
        })
        .collect();

    let engine = TypstEngine::builder()
        .main_file(source)
        .search_fonts_with(
            TypstKitFontOptions::new()
                .include_system_fonts(false)
                .include_embedded_fonts(true),
        )
        .fonts([
            crate::typst_compiler::NOTO_SERIF_KR_REGULAR,
            crate::typst_compiler::NOTO_SERIF_KR_BOLD,
            crate::typst_compiler::NOTO_SANS_KR_REGULAR,
            crate::typst_compiler::NOTO_SANS_KR_BOLD,
        ])
        .with_static_file_resolver(
            asset_bytes
                .iter()
                .map(|(path, bytes)| (path.as_str(), bytes.as_slice())),
        )
        .build();

    let doc: PagedDocument = engine
        .compile()
        .output
        .expect("visual regression fixture must compile");
    let pixmap = typst_render::render_merged(
        &doc,
        &RenderOptions::default(),
        Abs::pt(4.0),
        Some(Color::WHITE),
    );
    pixmap.encode_png().expect("encode png")
}

fn pixel_diff_ratio(actual: &[u8], expected: &[u8]) -> f64 {
    let pixels = actual.len() / 4;
    let mut differing = 0usize;
    for i in 0..pixels {
        let idx = i * 4;
        let delta: i32 = (0..4)
            .map(|c| (actual[idx + c] as i32 - expected[idx + c] as i32).abs())
            .sum();
        // Small per-channel tolerance absorbs anti-aliasing/font-hinting
        // drift between machines without masking a real rendering change.
        if delta > 24 {
            differing += 1;
        }
    }
    differing as f64 / pixels.max(1) as f64
}

fn assert_matches_fixture(name: &str, actual_png: &[u8]) {
    let dir = fixtures_dir();
    let path = dir.join(format!("{name}.png"));

    if std::env::var_os("UPDATE_SNAPSHOTS").is_some() {
        std::fs::create_dir_all(&dir).expect("create fixtures dir");
        std::fs::write(&path, actual_png).expect("write fixture");
        return;
    }

    let expected_bytes = std::fs::read(&path).unwrap_or_else(|_| {
        panic!("missing visual regression fixture {path:?} - run `UPDATE_SNAPSHOTS=1 cargo test visual_regression` to create it")
    });
    let expected =
        tiny_skia::Pixmap::decode_png(&expected_bytes).expect("decode expected fixture png");
    let actual = tiny_skia::Pixmap::decode_png(actual_png).expect("decode actual png");

    assert_eq!(
        actual.width(),
        expected.width(),
        "fixture {name}: width changed"
    );
    assert_eq!(
        actual.height(),
        expected.height(),
        "fixture {name}: height changed"
    );

    let ratio = pixel_diff_ratio(actual.data(), expected.data());
    assert!(
        ratio < 0.02,
        "fixture {name}: {:.2}% of pixels differ from the reference (limit 2%) - if this is an intentional \
         rendering change, rerun with UPDATE_SNAPSHOTS=1",
        ratio * 100.0
    );
}

#[test]
fn text_math_and_checklist_matches_reference() {
    let (document, assets) = text_and_math_document();
    let png = render_to_png(
        document,
        assets,
        template(),
        crate::typst_writer::PublicationStyle::BookSerif,
        cover(),
    );
    assert_matches_fixture("text_and_math", &png);
}

#[test]
fn table_image_and_diagram_matches_reference() {
    let (document, assets) = table_image_and_diagram_document();
    let png = render_to_png(
        document,
        assets,
        template(),
        crate::typst_writer::PublicationStyle::BookSerif,
        cover(),
    );
    assert_matches_fixture("table_image_and_diagram", &png);
}

#[test]
fn korean_english_and_math_matches_reference() {
    let (document, assets) = korean_english_and_math_document();
    let png = render_to_png(
        document,
        assets,
        template(),
        crate::typst_writer::PublicationStyle::BookSerif,
        cover(),
    );
    assert_matches_fixture("korean_english_and_math", &png);
}

#[test]
fn every_native_publication_style_matches_reference() {
    for (name, style) in [
        (
            "book_serif",
            crate::typst_writer::PublicationStyle::BookSerif,
        ),
        ("literary", crate::typst_writer::PublicationStyle::Literary),
        (
            "reference",
            crate::typst_writer::PublicationStyle::Reference,
        ),
    ] {
        let (document, assets) = text_and_math_document();
        let png = render_to_png(
            document,
            assets,
            template_for_style(style),
            style,
            styled_cover(),
        );
        assert_matches_fixture(&format!("publication_style_{name}"), &png);
    }
}
