import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { resolveIncludes } from './includeResolver';
import { renderAsciidoc } from './asciidocService';
import { rewriteWikilinksForRender } from './wikilinkService';
import {
  collectAssetReferences,
  collectDiagramCodes,
  diagramAssetPath,
  loadPublicationAssets,
} from './pdfPublicationRequest';
import { coverAssetReferences } from './typstPublishing';
import { buildTypstPreviewRequest } from './typstPreviewRequest';
import { createBookMetadata } from './bookProjectService';
import { getPublicationStyle } from './publicationStyleService';
import { findBrokenCrossReferences } from './crossReferenceService';

// Only the Tauri filesystem boundary is replaced; include resolution is production code.
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: async (path: string) => readFile(path, 'utf8') }));
const run = promisify(execFile);
async function sample() {
  const path = await realpath(resolve('sample-book/main.adoc'));
  const expanded = await resolveIncludes(await readFile(path, 'utf8'), path);
  expect(expanded).not.toMatch(/\[Include (?:Blocked|File Not Found):/);
  const result = await renderAsciidoc(rewriteWikilinksForRender(expanded, []));
  expect(result.renderError).toBeUndefined();
  expect(result.safeDocument?.diagnostics).toEqual([]);
  expect(findBrokenCrossReferences(result.safeDocument)).toEqual([]);
  return { path, result };
}

it('builds a publication request from real recursive sample includes and existing image files', async () => {
  const { path, result } = await sample();
  const assets = loadPublicationAssets(
    [...collectAssetReferences(result.safeDocument!), ...coverAssetReferences(result.meta)],
    path,
  );
  for (const asset of assets) expect((await readFile(asset.resolvedPath)).length).toBeGreaterThan(0);
  expect(assets.some((asset) => asset.path === 'images/back-cover.png')).toBe(true);
  const request = buildTypstPreviewRequest({
    renderResult: result,
    docPath: path,
    templateId: getPublicationStyle('book-serif'),
    pageSizeId: 'A4',
    bookMetadata: createBookMetadata(result.meta),
    assets,
  });
  expect(JSON.parse(JSON.stringify(request)).document.version).toBe(4);
  expect(collectDiagramCodes(request.document).length).toBeGreaterThan(0);
});

it.skipIf(process.env.RUN_NATIVE_PUBLICATION !== '1')(
  'compiles current sample-book JSON through Rust and checks extracted PDF content in all three styles',
  async () => {
    // Requires Rust and Poppler's pdftotext; absence fails rather than silently skipping.
    await run('pdftotext', ['-v']);
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'sample-publication-')));
    try {
      const { path, result } = await sample();
      const assets = loadPublicationAssets(
        [...collectAssetReferences(result.safeDocument!), ...coverAssetReferences(result.meta)],
        path,
      );
      // Deliberate SVG test doubles: tests the asset/Typst boundary, NOT Mermaid browser layout.
      for (const [index, code] of collectDiagramCodes(result.safeDocument!).entries()) {
        const resolvedPath = join(temporary, `diagram-${index}.svg`);
        await writeFile(
          resolvedPath,
          '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="#ccc"/></svg>',
        );
        assets.push({ path: diagramAssetPath(code), resolvedPath, mediaType: 'image/svg+xml' });
      }
      const metadata = createBookMetadata(result.meta);
      metadata.bibliography = [
        {
          key: 'knuth1984',
          author: 'Donald Knuth',
          title: 'The TeXbook',
          year: '1984',
          publisher: 'Addison-Wesley',
          url: '',
        },
      ];
      for (const style of ['book-serif', 'literary', 'reference']) {
        const request = buildTypstPreviewRequest({
          renderResult: result,
          docPath: path,
          templateId: getPublicationStyle(style),
          pageSizeId: 'A4',
          bookMetadata: metadata,
          assets,
        });
        const requestPath = join(temporary, `${style}.json`);
        await writeFile(requestPath, JSON.stringify(request));
        await run('cargo', ['test', '--lib', 'sample_book_from_frontend_compiles', '--', '--ignored', '--nocapture'], {
          cwd: resolve('src-tauri'),
          env: { ...process.env, SAMPLE_PUBLICATION_REQUEST: requestPath },
          maxBuffer: 10 * 1024 * 1024,
          timeout: 600000,
        });
        const { stdout } = await run('pdftotext', ['-layout', join(temporary, `${style}.pdf`), '-']);
        const text = stdout.replace(/\s+/g, ' ');
        for (const required of [
          'AsciiDoc Studio Team',
          'Chapter 4: PDF Publication Verification',
          'Chapter 5: Publication Semantics',
          'Stuart Rackham',
          'This endnote is collected',
          'The TeXbook',
        ])
          expect(text).toContain(required);
        expect(text).not.toContain('Unresolved citation');
        const source = await readFile(join(temporary, `${style}.typ`), 'utf8');
        for (const anchor of ['tbl-matrix', 'fig-sample-cover', 'lst-publisher']) expect(source).toContain(anchor);
        for (const code of collectDiagramCodes(request.document)) expect(source).toContain(diagramAssetPath(code));
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
  660000,
);
