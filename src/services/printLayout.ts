import { PageSizeId, getPageSize } from './pageSizeService';

// Split out of htmlExporter.ts so the print-only @page/cover-page CSS has a single
// home rather than being inlined into the standalone-HTML builder.
export function buildPageRuleCss(pageSizeId: PageSizeId): string {
  const pageOption = getPageSize(pageSizeId);
  return `
@page {
  size: ${pageOption.printSize};
  margin: ${pageOption.printMargin};

  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 8.5pt;
    color: #888888;
  }
}

.cover-page {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
  page-break-after: always;
  break-after: page;
}
.cover-page.back-cover-page {
  page-break-before: always;
  break-before: page;
}
.cover-page img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}`;
}

export function buildCoverPageHtml(dataUri: string | null, className: string): string {
  if (!dataUri) return '';
  return `<div class="cover-page ${className}"><img src="${dataUri}" alt="${className}"></div>`;
}
