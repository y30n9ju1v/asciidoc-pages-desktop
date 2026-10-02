import type { AsciidocRenderResult } from './asciidocService';
import type { BookMetadata } from './bookProjectService';
import type { SafeDocument } from './safeDocument';
import { collectAssetReferences } from './pdfPublicationRequest';
import { findUnresolvedCitationKeys } from './bibliographyService';
import { findBrokenCrossReferences } from './crossReferenceService';
import { isWithinRoot } from './pathSafety';
import { inspectDocumentIntegrity } from './documentIntegrityService';
import { inspectPublicationQuality } from './publicationQualityService';
import { inspectPrintPreflight } from './printPreflightService';
import { DEFAULT_PAGE_SIZE_ID, type PageSizeId } from './pageSizeService';
import { getPublicationStyle, type PublicationStyleOption } from './publicationStyleService';
import type { VaultNote } from './vaultService';

export type PreflightSeverity = 'error' | 'warning' | 'info';

export interface PreflightIssue {
  id: string;
  severity: PreflightSeverity;
  title: string;
  detail: string;
  line?: number | null;
}

export interface PreflightReport {
  issues: PreflightIssue[];
  errorCount: number;
  warningCount: number;
  ready: boolean;
  /**
   * Stricter than `ready` - also false whenever the document has a remote
   * image. HTML/EPUB only warn about remote images (`remote-image`, a
   * warning, doesn't affect `ready`), but PDF export compiles against an
   * offline-only, in-memory Typst World with no network access
   * (pdfPublicationRequest.ts's loadPublicationAssets never fetches a
   * remote SafeAssetRef) - so a remote image there isn't just non-ideal,
   * it's silently dropped from the PDF. Blocking publish until it's
   * resolved is more honest than a warning the user can miss.
   */
  pdfReady: boolean;
}

export interface PreflightInput {
  renderResult: AsciidocRenderResult;
  currentPath: string | null;
  /** Null when no vault folder is open this session. PDF export needs this
   * specifically - see `hasUnscopedLocalImages` below. */
  vaultRoot: string | null;
  metadata: BookMetadata;
  images: RenderedImage[];
  /** Raw source and already-indexed Vault notes allow deterministic link and
   * include checks without widening filesystem permissions. */
  content?: string;
  notes?: VaultNote[];
  /** Current closed publication choices, used only for advisory print-proof checks. */
  pageSizeId?: PageSizeId;
  publicationStyle?: PublicationStyleOption;
}

export interface RenderedImage {
  src: string;
  alt: string | null;
}

function issue(
  severity: PreflightSeverity,
  id: string,
  title: string,
  detail: string,
  line?: number | null,
): PreflightIssue {
  return { severity, id, title, detail, line };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function inspectRenderedImages(images: RenderedImage[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  for (const { src, alt } of images) {
    if (src.startsWith('file:')) {
      issues.push(
        issue(
          'error',
          'local-file-url',
          'Local file URL is blocked',
          'Replace file: image references with project assets.',
        ),
      );
    }
    if (/^https?:/i.test(src)) {
      issues.push(
        issue(
          'warning',
          'remote-image',
          'Remote image',
          'Bundle this image locally so the published book remains available offline.',
        ),
      );
    }
    if (alt === null) {
      issues.push(
        issue(
          'warning',
          'missing-alt-text',
          'Image needs alternative text',
          'Add alt text, or mark decorative images with an empty alt attribute.',
        ),
      );
    }
  }

  return issues;
}

function inspectSafeDocument(safeDocument: SafeDocument | undefined): PreflightIssue[] {
  if (!safeDocument) return [];

  return safeDocument.diagnostics.map((diagnostic) =>
    issue(
      diagnostic.severity,
      `safe-document-${diagnostic.code}`,
      'Safe document check',
      diagnostic.location.line ? `${diagnostic.message} (line ${diagnostic.location.line})` : diagnostic.message,
      diagnostic.location.line,
    ),
  );
}

function dedupeIssues(issues: PreflightIssue[]): PreflightIssue[] {
  return issues.filter((current, index) => issues.findIndex((candidate) => candidate.id === current.id) === index);
}

/**
 * `true` only when the document references a document-relative image but
 * its own path is outside the currently open vault. A native folder pick
 * grants recursive runtime scope only for that vault; opening a single file
 * grants only that file, and opening some other vault grants nothing for the
 * current document's folder. Mermaid diagrams are staged in the app cache
 * and therefore do not need document-folder scope.
 */
function hasUnscopedLocalImages(
  safeDocument: SafeDocument | undefined,
  currentPath: string | null,
  vaultRoot: string | null,
): boolean {
  const hasLocalImages = safeDocument
    ? collectAssetReferences(safeDocument).some((ref) => ref.kind === 'document-relative')
    : false;
  return hasLocalImages && (!currentPath || !vaultRoot || !isWithinRoot(currentPath, vaultRoot));
}

function inspectManuscriptState(renderResult: AsciidocRenderResult, currentPath: string | null): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  if (!currentPath) {
    issues.push(
      issue(
        'error',
        'unsaved-manuscript',
        'Save the manuscript first',
        'Publishing assets and links need a document folder.',
      ),
    );
  }
  if (isBlank(renderResult.html) || renderResult.meta.title === 'Error') {
    issues.push(
      issue(
        'error',
        'render-failed',
        'Manuscript could not be rendered',
        'Resolve the AsciiDoc error before publishing.',
      ),
    );
  }
  return issues;
}

function inspectBookMetadata(metadata: BookMetadata): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  if (isBlank(metadata.title) || metadata.title === 'Untitled Book') {
    issues.push(issue('error', 'missing-title', 'Book title is required', 'Set a title in Book details.'));
  }
  if (isBlank(metadata.author)) {
    issues.push(issue('warning', 'missing-author', 'Author is missing', 'Add an author before delivering the book.'));
  }
  if (isBlank(metadata.identifier)) {
    issues.push(
      issue(
        'info',
        'missing-identifier',
        'No ISBN or publisher identifier',
        'An identifier is recommended for store delivery and cataloging.',
      ),
    );
  }
  if (isBlank(metadata.description)) {
    issues.push(
      issue(
        'info',
        'missing-description',
        'Book description is missing',
        'A description is useful for bookstore metadata and release packages.',
      ),
    );
  }
  return issues;
}

/** A `cite:[key]` with no matching BookMetadata.bibliography entry still
 * publishes (see safeHtmlRenderer.ts/typst_writer.rs's shared "Unresolved
 * citation" fallback) rather than being blocked - this is a warning an
 * author can act on before publishing, not a hard error, since the document
 * is still valid and renders something meaningful either way. */
function inspectCitations(
  safeDocument: SafeDocument | undefined,
  bibliography: BookMetadata['bibliography'],
): PreflightIssue[] {
  if (!safeDocument) return [];
  const unresolved = findUnresolvedCitationKeys(safeDocument.blocks, bibliography);
  return unresolved.map((key) =>
    issue(
      'warning',
      `unresolved-citation-${key}`,
      'Citation not in bibliography',
      `"cite:[${key}]" has no matching entry in the bibliography - add one, or the published reference will read "Unresolved citation".`,
    ),
  );
}

/**
 * A PDF preview may deliberately render one included chapter by itself. In
 * that case typst_writer.rs degrades references into sibling chapters to
 * plain text so the author can keep working. Publishing has a different
 * contract: a missing target would ship a broken reference, so it must block
 * every export until the manuscript's entry file resolves it.
 */
function inspectCrossReferences(safeDocument: SafeDocument | undefined): PreflightIssue[] {
  return findBrokenCrossReferences(safeDocument).map((reference) =>
    issue(
      'error',
      `broken-cross-reference-${reference.target}`,
      'Cross-reference target is missing from the publication',
      `"<<${reference.target}>>" has no matching id in this document. Publish the book's main file when the target is in another chapter; otherwise add "[#${reference.target}]" above the target block. "[[${reference.target}]]" is reserved for wikilinks in this app.`,
      reference.line ?? undefined,
    ),
  );
}

function inspectVaultAccess(
  safeDocument: SafeDocument | undefined,
  currentPath: string | null,
  vaultRoot: string | null,
): PreflightIssue[] {
  if (!hasUnscopedLocalImages(safeDocument, currentPath, vaultRoot)) return [];
  return [
    issue(
      'warning',
      'pdf-images-need-open-folder',
      'Open the folder to publish images in PDF',
      "PDF export needs filesystem access to this document's own folder to include its local images - open it as a vault (or open its containing folder) and try again.",
    ),
  ];
}

/** Checks deterministic publication requirements without reading or changing files. */
export function runPreflight({
  renderResult,
  currentPath,
  vaultRoot,
  metadata,
  images,
  content = '',
  notes = [],
  pageSizeId = DEFAULT_PAGE_SIZE_ID,
  publicationStyle = getPublicationStyle('book-serif'),
}: PreflightInput): PreflightReport {
  const needsVaultForImages = hasUnscopedLocalImages(renderResult.safeDocument, currentPath, vaultRoot);
  const issues: PreflightIssue[] = [
    ...inspectManuscriptState(renderResult, currentPath),
    ...inspectBookMetadata(metadata),
    ...inspectVaultAccess(renderResult.safeDocument, currentPath, vaultRoot),
    ...inspectCitations(renderResult.safeDocument, metadata.bibliography),
    ...inspectCrossReferences(renderResult.safeDocument),
  ];

  issues.push(
    ...inspectDocumentIntegrity(content, currentPath, vaultRoot, notes).map((finding) =>
      issue(finding.severity, finding.id, finding.title, finding.detail, finding.line),
    ),
    ...inspectPublicationQuality(renderResult.safeDocument).map((finding) =>
      issue('warning', finding.id, finding.title, finding.detail, finding.line),
    ),
    ...inspectPrintPreflight({
      document: renderResult.safeDocument,
      pageSizeId,
      publicationStyle,
    }).map((finding) => issue(finding.severity, finding.id, finding.title, finding.detail, finding.line)),
  );

  issues.push(...inspectRenderedImages(images));
  issues.push(...inspectSafeDocument(renderResult.safeDocument));
  const uniqueIssues = dedupeIssues(issues);
  const errorCount = uniqueIssues.filter((current) => current.severity === 'error').length;
  const warningCount = uniqueIssues.filter((current) => current.severity === 'warning').length;
  const hasRemoteAsset = uniqueIssues.some((current) => current.id === 'remote-image');

  return {
    issues: uniqueIssues,
    errorCount,
    warningCount,
    ready: errorCount === 0,
    pdfReady: errorCount === 0 && !hasRemoteAsset && !needsVaultForImages,
  };
}
