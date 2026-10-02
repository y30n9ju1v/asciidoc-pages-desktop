import { writeTextFile } from '@tauri-apps/plugin-fs';
import { message } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import baseCss from '../styles/asciidoc-theme.css?raw';
// Raw import means the font url()s inside stay relative and won't resolve from
// a saved HTML file. Formulas still lay out correctly with a fallback serif font.
import katexCss from 'katex/dist/katex.min.css?raw';
import hljsCss from 'highlight.js/styles/atom-one-dark.css?raw';
import { PageSizeId, DEFAULT_PAGE_SIZE_ID } from './pageSizeService';
import { ThemeInput, getTheme, publicationThemeClassNames, DEFAULT_THEME_ID } from './themeService';
import { AsciidocRenderResult } from './asciidocService';
import { prerenderForStaticOutput } from './staticExportPrerender';
import { loadCoverImage, coverImageToDataUri } from './coverImage';
import { buildPageRuleCss, buildCoverPageHtml } from './printLayout';
import { chooseExportFile } from './publicationDialogAdapter';
import { escapeHtml } from './htmlEscape';

function buildStandaloneHtml(
  bodyHtml: string,
  renderResult: AsciidocRenderResult,
  themeId: ThemeInput,
  pageSizeId: PageSizeId,
  frontCoverDataUri: string | null,
  backCoverDataUri: string | null,
): string {
  const theme = getTheme(themeId);
  const title = renderResult.meta.title || 'Untitled Document';
  return `<!doctype html>
<html lang="${escapeHtml(renderResult.meta.lang || 'en')}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:" />
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; background: #131417; }
${baseCss}
${katexCss}
${hljsCss}
${theme.css}
${buildPageRuleCss(pageSizeId)}
</style>
</head>
<body>
${buildCoverPageHtml(frontCoverDataUri, 'front-cover-page')}
<div class="asciidoc-preview-container ${publicationThemeClassNames(themeId)} page-size-${pageSizeId}">
${bodyHtml}
</div>
${buildCoverPageHtml(backCoverDataUri, 'back-cover-page')}
</body>
</html>`;
}

function exportFileName(title: string): string {
  return `${(title || 'document').replace(/[\\/:*?"<>|]/g, '_')}.html`;
}

/** Writes a self-contained, offline-safe HTML document to a user-selected path. */
export async function exportToHtml(
  renderResult: AsciidocRenderResult,
  currentPath: string | null,
  themeId: ThemeInput = DEFAULT_THEME_ID,
  pageSizeId: PageSizeId = DEFAULT_PAGE_SIZE_ID,
): Promise<void> {
  try {
    const destination = await chooseExportFile({
      defaultPath: exportFileName(renderResult.meta.title),
      filterName: 'HTML Document',
      extensions: ['html'],
    });
    if (!destination) return;

    const [bodyHtml, frontCover, backCover] = await Promise.all([
      prerenderForStaticOutput(renderResult.html, themeId),
      loadCoverImage(renderResult.meta.attributes['front-cover-image'], currentPath),
      loadCoverImage(renderResult.meta.attributes['back-cover-image'], currentPath),
    ]);
    const html = buildStandaloneHtml(
      bodyHtml,
      renderResult,
      themeId,
      pageSizeId,
      frontCover && coverImageToDataUri(frontCover),
      backCover && coverImageToDataUri(backCover),
    );

    await writeTextFile(destination, html);
    toast.success('HTML exported', { description: destination.split('/').pop() });
  } catch (err) {
    console.error('HTML export failed:', err);
    await message(`HTML을 내보내지 못했습니다.\n\n${String(err)}`, { title: 'HTML 내보내기', kind: 'error' });
  }
}
