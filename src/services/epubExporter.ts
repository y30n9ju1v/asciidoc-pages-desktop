import JSZip from 'jszip';
import { message } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { AsciidocDocMeta } from './asciidocService';
import { BookMetadata } from './bookProjectService';
import type { BibliographyEntry } from './bibliographyService';
import type { SafeBlock, SafeDocument, SafeSection } from './safeDocument';
import { renderSafeBlocksToHtml } from './safeHtmlRenderer';
import { ThemeInput, DEFAULT_THEME_ID, getTheme, publicationThemeClassNames } from './themeService';
import { PageSizeId, DEFAULT_PAGE_SIZE_ID } from './pageSizeService';
import { prerenderForStaticOutput } from './staticExportPrerender';
import { sanitizeAsciidocHtml } from './sanitizeHtml';

import { bundleChapterImages, EpubImageAsset } from './epubImages';
import { loadCoverImage, CoverImage } from './coverImage';
import { chooseExportFile } from './publicationDialogAdapter';
import asciidocThemeCss from '../styles/asciidoc-theme.css?raw';
import hljsCss from 'highlight.js/styles/atom-one-dark.css?raw';
// Same font-url caveat as htmlExporter.ts: relative url()s won't resolve inside the
// EPUB package without also bundling the woff2 files as assets, so formulas render
// with a fallback serif font rather than KaTeX's own math font.
import katexCss from 'katex/dist/katex.min.css?raw';

interface Chapter {
  id: string;
  title: string;
  bodyHtml: string;
}

interface EpubMeta {
  title: string;
  subtitle: string;
  author: string;
  lang: string;
  identifier: string;
  publisher: string;
  description: string;
  rights: string;
  subjects: string[];
}

function isSection(block: SafeBlock): block is SafeSection {
  return block.type === 'section';
}

/**
 * Each top-level SafeSection becomes its own EPUB chapter - without this,
 * e-reader navigation only ever points at a single monolithic document.
 * Rendering `[section]` (not `section.blocks`) reuses BLOCK_RENDERERS'
 * existing renderSection, so the chapter body includes the section's own
 * heading exactly like the old DOM-based `section.outerHTML` capture did.
 *
 * Any top-level content *before* the first section (a preamble, a stray
 * paragraph) becomes its own "Front Matter" chapter rather than being
 * dropped - AsciiDoc nests everything from a heading until the next
 * same-or-higher heading inside that section, so there's no such thing as
 * a stray top-level block *between* two sections to worry about losing.
 */
function splitIntoChapters(
  safeDocument: SafeDocument,
  fallbackTitle: string,
  bibliography: BibliographyEntry[],
): Chapter[] {
  const { blocks } = safeDocument;
  const firstSectionIndex = blocks.findIndex(isSection);
  if (firstSectionIndex === -1) {
    return [{ id: 'chapter1', title: fallbackTitle, bodyHtml: renderSafeBlocksToHtml(blocks, bibliography) }];
  }

  const chapters: Chapter[] = [];
  const frontMatter = blocks.slice(0, firstSectionIndex);
  if (frontMatter.length > 0) {
    chapters.push({
      id: 'frontmatter',
      title: 'Front Matter',
      bodyHtml: renderSafeBlocksToHtml(frontMatter, bibliography),
    });
  }

  const sections = blocks.slice(firstSectionIndex).filter(isSection);
  sections.forEach((section, index) => {
    chapters.push({
      id: `chapter${index + 1}`,
      title: section.title || `${fallbackTitle} - ${index + 1}`,
      bodyHtml: renderSafeBlocksToHtml([section], bibliography),
    });
  });

  return chapters;
}

const BASE_EPUB_CSS = `
body {
  margin: 4% 6%;
  line-height: 1.8;
}
img { max-width: 100%; height: auto; }
pre, code { word-break: break-all; }
`;

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

/**
 * EPUB chapter files are real XML (media-type application/xhtml+xml), but Asciidoctor's
 * HTML5 output uses unclosed void elements like <br> and <img src="...">, and our own
 * DOM round-trips while splitting chapters / rewriting image paths (innerHTML/outerHTML)
 * re-serialize as HTML too, which never self-closes them either. Reparsing as lenient
 * HTML and re-serializing with XMLSerializer is what actually produces well-formed XML -
 * it self-closes void elements and escapes text/attributes correctly.
 */
function toXhtmlFragment(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root')!;
  const serializer = new XMLSerializer();
  return Array.from(root.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('');
}

function buildChapterXhtml(chapter: Chapter, lang: string, themeId: ThemeInput, pageSizeId: PageSizeId): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="${publicationThemeClassNames(themeId)} page-size-${pageSizeId} asciidoc-preview-container">
  ${toXhtmlFragment(chapter.bodyHtml)}
</body>
</html>`;
}

/**
 * Standalone page for a front/back cover image - deliberately not styled with
 * style.css (no theme padding/max-width), just centered full-bleed-ish, since
 * e-reader viewport/rendering support varies too much to rely on more elaborate
 * CSS (`100vh`, `object-fit`) working consistently across readers.
 */
function buildCoverXhtml(imageFilename: string, lang: string, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; text-align: center; background: #000; }
    img { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
  <img src="images/${imageFilename}" alt="${escapeXml(title)}"/>
</body>
</html>`;
}

function buildTocXhtml(chapters: Chapter[], lang: string): string {
  const tocEntries = chapters
    .map((chapter) => `      <li><a href="${chapter.id}.xhtml">${escapeXml(chapter.title)}</a></li>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>Table of Contents</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${tocEntries}
    </ol>
  </nav>
</body>
</html>`;
}

function buildContentOpf(
  meta: EpubMeta,
  chapters: Chapter[],
  assets: EpubImageAsset[],
  frontCover: CoverImage | null,
  backCover: CoverImage | null,
): string {
  const manifestItems = chapters
    .map((chapter) => `    <item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n');
  const spineItems = chapters.map((chapter) => `    <itemref idref="${chapter.id}"/>`).join('\n');
  const imageManifestItems = assets
    .map(
      (asset, index) => `    <item id="img${index}" href="images/${asset.filename}" media-type="${asset.mediaType}"/>`,
    )
    .join('\n');

  // `properties="cover-image"` is the EPUB3 way readers identify the cover; the
  // `<meta name="cover">` line is the older EPUB2 convention some readers still
  // look for. Front cover goes first in reading order, back cover last.
  const coverMeta = frontCover ? '\n    <meta name="cover" content="front-cover-image"/>' : '';
  const frontCoverManifest = frontCover
    ? `\n    <item id="front-cover-image" href="images/${frontCover.filename}" media-type="${frontCover.mediaType}" properties="cover-image"/>\n    <item id="front-cover-page" href="front-cover.xhtml" media-type="application/xhtml+xml"/>`
    : '';
  const backCoverManifest = backCover
    ? `\n    <item id="back-cover-image" href="images/${backCover.filename}" media-type="${backCover.mediaType}"/>\n    <item id="back-cover-page" href="back-cover.xhtml" media-type="application/xhtml+xml"/>`
    : '';
  const frontCoverSpine = frontCover ? '    <itemref idref="front-cover-page"/>\n' : '';
  const backCoverSpine = backCover ? '\n    <itemref idref="back-cover-page"/>' : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${escapeXml(meta.identifier)}</dc:identifier>
    <dc:title id="title">${escapeXml(meta.title)}</dc:title>${
      meta.subtitle
        ? `
    <meta refines="#title" property="title-type">main</meta>
    <dc:title id="subtitle">${escapeXml(meta.subtitle)}</dc:title>
    <meta refines="#subtitle" property="title-type">subtitle</meta>`
        : ''
    }
    <dc:creator>${escapeXml(meta.author)}</dc:creator>
    <dc:language>${escapeXml(meta.lang)}</dc:language>${
      meta.publisher
        ? `
    <dc:publisher>${escapeXml(meta.publisher)}</dc:publisher>`
        : ''
    }${
      meta.description
        ? `
    <dc:description>${escapeXml(meta.description)}</dc:description>`
        : ''
    }${
      meta.rights
        ? `
    <dc:rights>${escapeXml(meta.rights)}</dc:rights>`
        : ''
    }${meta.subjects
      .map(
        (subject) => `
    <dc:subject>${escapeXml(subject)}</dc:subject>`,
      )
      .join('')}
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>${coverMeta}
  </metadata>
  <manifest>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
    <item id="style" href="style.css" media-type="text/css"/>
${imageManifestItems}${frontCoverManifest}${backCoverManifest}
  </manifest>
  <spine>
${frontCoverSpine}${spineItems}${backCoverSpine}
  </spine>
</package>`;
}

function buildEpubArchive(
  meta: EpubMeta,
  chapters: Chapter[],
  assets: EpubImageAsset[],
  themeId: ThemeInput,
  pageSizeId: PageSizeId,
  themeCss: string,
  frontCover: CoverImage | null,
  backCover: CoverImage | null,
): JSZip {
  const zip = new JSZip();

  // mimetype must be the first entry and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file('container.xml', CONTAINER_XML);

  const oebps = zip.folder('OEBPS')!;
  oebps.file(
    'style.css',
    `${BASE_EPUB_CSS}\n/* AsciiDoc Base Styles */\n${asciidocThemeCss}\n/* Syntax Highlighting */\n${hljsCss}\n/* Math (KaTeX) */\n${katexCss}\n/* Selected Theme Styles */\n${themeCss}`,
  );

  chapters.forEach((chapter) =>
    oebps.file(`${chapter.id}.xhtml`, buildChapterXhtml(chapter, meta.lang, themeId, pageSizeId)),
  );
  oebps.file('toc.xhtml', buildTocXhtml(chapters, meta.lang));
  oebps.file('content.opf', buildContentOpf(meta, chapters, assets, frontCover, backCover));

  if (frontCover)
    oebps.file('front-cover.xhtml', buildCoverXhtml(frontCover.filename, meta.lang, `${meta.title} - Cover`));
  if (backCover)
    oebps.file('back-cover.xhtml', buildCoverXhtml(backCover.filename, meta.lang, `${meta.title} - Back Cover`));

  if (assets.length > 0 || frontCover || backCover) {
    const imagesFolder = oebps.folder('images')!;
    assets.forEach((asset) => imagesFolder.file(asset.filename, asset.data));
    if (frontCover) imagesFolder.file(frontCover.filename, frontCover.data);
    if (backCover) imagesFolder.file(backCover.filename, backCover.data);
  }

  return zip;
}

function newEpubUuid(): string {
  return 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : '12345678-1234-1234-1234-123456789abc');
}

function preferredValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function createEpubMeta(docMeta: AsciidocDocMeta, bookMetadata?: BookMetadata): EpubMeta {
  const metadata = bookMetadata ?? {
    title: '',
    subtitle: '',
    author: '',
    language: '',
    identifier: '',
    publisher: '',
    description: '',
    rights: '',
    subjects: [],
  };
  return {
    title: preferredValue(metadata.title, preferredValue(docMeta.title, 'Untitled Document')),
    subtitle: metadata.subtitle,
    author: preferredValue(metadata.author, preferredValue(docMeta.author, 'Anonymous')),
    lang: preferredValue(metadata.language, preferredValue(docMeta.lang, 'en')),
    identifier: preferredValue(metadata.identifier, newEpubUuid()),
    publisher: metadata.publisher,
    description: metadata.description,
    rights: metadata.rights,
    subjects: metadata.subjects,
  };
}

export const exportToEpub = async (
  safeDocument: SafeDocument,
  docMeta: AsciidocDocMeta,
  docPath: string | null,
  themeId: ThemeInput = DEFAULT_THEME_ID,
  pageSizeId: PageSizeId = DEFAULT_PAGE_SIZE_ID,
  bookMetadata?: BookMetadata,
): Promise<boolean> => {
  try {
    const activeTheme = getTheme(themeId);
    const meta = createEpubMeta(docMeta, bookMetadata);
    // Each chapter is prerendered (highlight.js + Mermaid-to-SVG) on its own,
    // rather than once for the whole document before splitting - splitting
    // now happens structurally from SafeDocument.blocks, before any HTML
    // exists, so there's no single combined string left to prerender as one
    // unit. Applying it once per chapter's own subset is equivalent, since
    // that step operates independently on whatever DOM content it's given.
    //
    // sanitizeAsciidocHtml runs *after* prerender, not just on SafeDocument's
    // own output: SafeDocument only guarantees the markup it directly emits
    // is safe, but Mermaid is a third-party library producing SVG from
    // document-controlled diagram source. Its `securityLevel: 'strict'`
    // config is real protection but lives in a different module than this
    // one; sanitizing again here is a second, independent layer scoped to
    // exactly what ships inside the EPUB, which - unlike the live preview -
    // will be opened by e-reader software this app has no control over.
    const [rawChapters, frontCover, backCover] = await Promise.all([
      Promise.all(
        splitIntoChapters(safeDocument, meta.title, bookMetadata?.bibliography ?? []).map(async (chapter) => ({
          ...chapter,
          bodyHtml: sanitizeAsciidocHtml(await prerenderForStaticOutput(chapter.bodyHtml, themeId)),
        })),
      ),
      loadCoverImage(docMeta.attributes['front-cover-image'], docPath),
      loadCoverImage(docMeta.attributes['back-cover-image'], docPath),
    ]);
    const { chapters, assets } = await bundleChapterImages(rawChapters, docPath);
    const zip = buildEpubArchive(meta, chapters, assets, themeId, pageSizeId, activeTheme.css, frontCover, backCover);

    const content = await zip.generateAsync({ type: 'uint8array' });

    const defaultName = `${meta.title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.epub`;
    const filePath = await chooseExportFile({
      defaultPath: defaultName,
      filterName: 'EPUB Publication',
      extensions: ['epub'],
    });
    if (!filePath) return false;

    await writeFile(filePath, content);
    toast.success('EPUB published', { description: filePath.split('/').pop() });
    return true;
  } catch (error) {
    console.error('Failed to export EPUB:', error);
    await message('Error exporting EPUB: ' + String(error), { title: 'Export Failed', kind: 'error' });
    return false;
  }
};

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}
