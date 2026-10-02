import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  CheckCircle2,
  CodeXml,
  FileCode,
  FileText,
  Info,
  Maximize2,
  Palette,
  Printer,
} from 'lucide-react';
import { AsciidocRenderResult } from '../../services/asciidocService';
import { BookMetadata } from '../../services/bookProjectService';
import { PreflightReport } from '../../services/preflightService';
import { resolutionForPreflightIssue, resolutionLabel } from '../../services/preflightNavigationService';
import { ColorMode } from '../../services/themeService';
import { BookDetailsDialog } from './BookDetailsDialog';
import { PageSizeId } from '../../services/pageSizeService';
import { PageSizeSelect } from './PageSizeSelect';
import { PublicationStyleId, type PublicationStyleOption } from '../../services/publicationStyleService';
import type { PdfExportPhase } from '../../services/pdfExporter';
import { usePdfExport } from '../../hooks/usePdfExport';
import { usePublishExports } from '../../hooks/usePublishExports';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PublishDialogProps {
  renderResult: AsciidocRenderResult;
  currentPath: string | null;
  currentPublicationStyle: PublicationStyleId;
  publicationStyles: readonly PublicationStyleOption[];
  publicationStyle: PublicationStyleOption;
  onPublicationStyleChange: (styleId: PublicationStyleId) => void;
  currentPageSize: PageSizeId;
  onPageSizeChange: (pageSizeId: PageSizeId) => void;
  colorMode: ColorMode;
  bookMetadata: BookMetadata;
  preflight: PreflightReport;
  canSaveBookDetails: boolean;
  onSaveBookMetadata: (metadata: BookMetadata) => Promise<void>;
  onResolvePreflightIssue: (issue: PreflightReport['issues'][number]) => void;
  /** Jumps the main editor to a source line - reused from the outline/
   * preflight "jump to editor" mechanism (App.tsx's focusEditorLine) so a
   * located PDF compile failure (e.g. nesting-depth-exceeded) can point the
   * user straight at the offending line. */
  onJumpToLine: (lineNumber: number) => void;
}

const PDF_PHASE_LABEL: Record<PdfExportPhase, string> = {
  'loading-assets': 'Loading assets…',
  compiling: 'Compiling…',
  saving: 'Saving…',
};

function pdfButtonLabel(phase: PdfExportPhase | null): string {
  return phase ? PDF_PHASE_LABEL[phase] : 'Publish PDF';
}

// Two distinct preflight warnings can each independently block pdfReady
// while leaving `ready` true (remote-image, pdf-images-need-open-folder -
// see preflightService.ts) - the tooltip must reflect whichever one is
// actually the cause, not assume it's always the remote-image case.
const PDF_READY_BLOCKING_ISSUE_IDS = new Set(['remote-image', 'pdf-images-need-open-folder']);

function pdfButtonTitle(preflight: PreflightReport): string | undefined {
  if (preflight.pdfReady || !preflight.ready) return undefined;
  return preflight.issues.find((issue) => PDF_READY_BLOCKING_ISSUE_IDS.has(issue.id))?.detail;
}

/** The status/cancel row shown below the export buttons while a PDF export
 * is in flight - pulled out to its own component (rather than inline `&&`/
 * ternary branches in PublishDialog's own JSX) to keep that branching out of
 * the parent component's cyclomatic complexity. */
const PdfExportStatus: React.FC<{ phase: PdfExportPhase | null; onCancel: () => void }> = ({ phase, onCancel }) => {
  if (phase === 'loading-assets') {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Loading assets - compilation hasn&apos;t started yet.</span>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }
  if (phase === 'compiling' || phase === 'saving') {
    return (
      <p className="rounded-lg border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
        {phase === 'compiling' ? 'Compiling has started and can no longer be cancelled.' : 'Writing the PDF to disk…'}
      </p>
    );
  }
  return null;
};

function printIssueCountOf(preflight: PreflightReport): number {
  return preflight.issues.filter((issue) => issue.id.startsWith('print-')).length;
}

function printProofStatusText(issueCount: number): string {
  if (issueCount === 0) return 'No print-proof risks detected';
  return `${issueCount} print-proof check${issueCount === 1 ? '' : 's'}`;
}

interface PreflightIssueRowProps {
  issue: PreflightReport['issues'][number];
  onResolve: (issue: PreflightReport['issues'][number]) => void;
}

/** Keeps item-specific status presentation out of the publish dialog's
 * orchestration component, which otherwise exceeds the UI complexity limit. */
const PreflightIssueRow: React.FC<PreflightIssueRowProps> = ({ issue, onResolve }) => {
  const Icon = issue.severity === 'error' ? AlertTriangle : Info;
  const printPrefix = issue.id.startsWith('print-') ? 'Print proof · ' : '';
  return (
    <li className="flex flex-col gap-2 text-xs leading-5 text-muted-foreground sm:flex-row">
      <Icon
        className={`mt-0.5 hidden size-3.5 shrink-0 sm:block ${issue.severity === 'error' ? 'text-destructive' : 'text-amber-500'}`}
      />
      <span className="min-w-0 flex-1">
        <strong className="font-medium text-foreground">
          {printPrefix}
          {issue.title}.
        </strong>{' '}
        {issue.detail}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 self-start px-2 text-xs sm:shrink-0"
        onClick={() => onResolve(issue)}
      >
        {resolutionLabel(resolutionForPreflightIssue(issue))}
      </Button>
    </li>
  );
};

/** Page size and export live here; the shared publication style is also
 * selectable from AppHeader because it changes preview and every export. */
export const PublishDialog: React.FC<PublishDialogProps> = ({
  renderResult,
  currentPath,
  currentPublicationStyle,
  publicationStyles,
  publicationStyle,
  onPublicationStyleChange,
  currentPageSize,
  onPageSizeChange,
  colorMode,
  bookMetadata,
  preflight,
  canSaveBookDetails,
  onSaveBookMetadata,
  onResolvePreflightIssue,
  onJumpToLine,
}) => {
  const [open, setOpen] = useState(false);
  const [bookDetailsOpen, setBookDetailsOpen] = useState(false);
  const [pdfA, setPdfA] = useState(false);
  const pendingEditorIssue = useRef<PreflightReport['issues'][number] | null>(null);

  const { exportHtml, exportEpub, exportTypst } = usePublishExports({
    renderResult,
    currentPath,
    publicationStyle,
    pageSizeId: currentPageSize,
    bookMetadata,
  });

  const { pdfPhase, exportPdf, cancelPdfExport } = usePdfExport(
    renderResult,
    currentPath,
    publicationStyle,
    currentPageSize,
    pdfA,
    bookMetadata,
    onJumpToLine,
    () => setOpen(false),
  );

  const IssueIcon = preflight.ready ? CheckCircle2 : AlertTriangle;
  const printIssueCount = printIssueCountOf(preflight);

  const resolveIssue = (issue: PreflightReport['issues'][number]) => {
    if (resolutionForPreflightIssue(issue) === 'editor') {
      pendingEditorIssue.current = issue;
      setOpen(false);
      return;
    }
    if (resolutionForPreflightIssue(issue) === 'book-details') setBookDetailsOpen(true);
    onResolvePreflightIssue(issue);
  };

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)} className="h-8 gap-1.5 px-3">
        <BookOpen className="size-3.5" />
        Publish
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[86vh] w-[min(720px,calc(100%-2rem))] max-w-none flex-col"
          onCloseAutoFocus={(event) => {
            const issue = pendingEditorIssue.current;
            if (!issue) return;
            event.preventDefault();
            pendingEditorIssue.current = null;
            onResolvePreflightIssue(issue);
          }}
        >
          <DialogHeader>
            <DialogTitle>Publish document</DialogTitle>
            <p className="text-xs leading-5 text-muted-foreground">
              Publication style and page size apply consistently to preview, HTML, EPUB, and PDF.
            </p>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 pt-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Palette className="size-3.5" /> Publication style
                </span>
                <Select
                  value={currentPublicationStyle}
                  onValueChange={(value) => onPublicationStyleChange(value as PublicationStyleId)}
                >
                  <SelectTrigger aria-label="Publication style" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {publicationStyles.map((style) => (
                      <SelectItem key={style.id} value={style.id}>
                        {style.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Maximize2 className="size-3.5" /> Page size
                </span>
                <PageSizeSelect value={currentPageSize} onChange={onPageSizeChange} />
              </label>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3.5 text-xs leading-5 text-muted-foreground">
              {colorMode === 'dark' ? 'Dark' : 'Light'} workspace mode does not change the selected publication style.
            </div>

            <section className="rounded-lg border" aria-label="Publication and print preflight">
              <div className="flex flex-col gap-2 border-b px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <IssueIcon className={`size-3.5 ${preflight.ready ? 'text-emerald-500' : 'text-destructive'}`} />
                  Preflight{' '}
                  {preflight.ready
                    ? 'ready'
                    : `${preflight.errorCount} blocking issue${preflight.errorCount === 1 ? '' : 's'}`}
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Printer className="size-3.5" />
                  {printProofStatusText(printIssueCount)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setBookDetailsOpen(true)}
                >
                  <BookMarked className="size-3.5" /> Book details
                </Button>
              </div>
              {preflight.issues.length > 0 ? (
                <ul className="grid gap-2 p-3.5">
                  {preflight.issues.map((issue, index) => (
                    <PreflightIssueRow key={`${issue.id}:${index}`} issue={issue} onResolve={resolveIssue} />
                  ))}
                </ul>
              ) : (
                <p className="px-3.5 py-3 text-xs text-muted-foreground">No publication issues found.</p>
              )}
            </section>
          </div>
          <div className="grid shrink-0 gap-2 border-t p-5 pt-3.5">
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" className="h-10 min-w-0 justify-start" onClick={exportHtml}>
                <CodeXml className="size-4" /> Export HTML
              </Button>
              <Button
                type="button"
                className="h-10 min-w-0 justify-start"
                onClick={exportEpub}
                disabled={!preflight.ready}
              >
                <FileText className="size-4" /> Publish EPUB
              </Button>
              <Button
                type="button"
                className="h-10 min-w-0 justify-start"
                onClick={exportPdf}
                disabled={!preflight.pdfReady || pdfPhase !== null}
                title={pdfButtonTitle(preflight)}
              >
                <FileText className="size-4" /> {pdfButtonLabel(pdfPhase)}
              </Button>
            </div>
            <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Advanced outputs</summary>
              <div className="mt-2 grid gap-2">
                <p className="leading-5">
                  Export the generated Typst project only when you plan to compile or customize it with your own Typst
                  toolchain.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start"
                  onClick={exportTypst}
                  disabled={!preflight.pdfReady}
                  title={pdfButtonTitle(preflight)}
                >
                  <FileCode className="size-3.5" /> Export Typst source
                </Button>
              </div>
            </details>
            <PdfExportStatus phase={pdfPhase} onCancel={cancelPdfExport} />
            <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={pdfA}
                onChange={(event) => setPdfA(event.target.checked)}
                className="mt-0.5 size-3.5 shrink-0"
              />
              Export PDF as PDF/A (archival, long-term preservation)
            </label>
          </div>
        </DialogContent>
      </Dialog>
      {bookDetailsOpen && (
        <BookDetailsDialog
          onOpenChange={setBookDetailsOpen}
          metadata={bookMetadata}
          canPersist={canSaveBookDetails}
          onSave={onSaveBookMetadata}
        />
      )}
    </>
  );
};
