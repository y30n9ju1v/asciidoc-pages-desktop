import { lazy, Suspense, useMemo, type ReactNode, type RefObject } from 'react';
import { GitFork, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { calculateWritingStats } from '../../services/writingStatsService';
import { FileExplorer } from '../Explorer/FileExplorer';
import { PaneResizer } from './PaneResizer';
import { MIN_EXPLORER_WIDTH, MAX_EXPLORER_WIDTH } from '../../hooks/useWorkspaceLayout';
import type { OutlineItem } from '../../services/outlineService';
import type { ChapterStatusMap } from '../../services/chapterStatusService';
import type { Backlink } from '../../services/backlinkService';
import type { TagCount } from '../../services/tagService';
import type { ColorMode } from '../../services/themeService';
import type { VaultNote } from '../../services/vaultService';
import type { TypstPdfPreviewState } from '../../hooks/useTypstPdfPreview';

const AsciidocEditor = lazy(async () => ({
  default: (await import('../Editor/AsciidocEditor')).AsciidocEditor,
}));
const TypstPdfPreview = lazy(async () => ({
  default: (await import('../Preview/TypstPdfPreview')).TypstPdfPreview,
}));

interface WorkspaceProps {
  showPreview: boolean;
  bookOutline: ReactNode;
  onShowGraph: () => void;
  onShowWritingTools: () => void;
  resizeSidebarByKeyboard: (delta: number) => void;
  resizeEditorByKeyboard: (delta: number) => void;
  beforeMutation: () => void;
  onExtractSelection: (text: string) => Promise<string>;
  workspaceRef: RefObject<HTMLElement | null>;
  sidebarWidth: number;
  editorPercent: number;
  isExplorerCollapsed: boolean;
  startSidebarResize: (event: React.PointerEvent<HTMLElement>) => void;
  startEditorResize: (event: React.PointerEvent<HTMLElement>) => void;
  toggleExplorer: () => void;
  currentPath: string | null;
  content: string;
  onContentChange: (content: string) => void;
  vimMode: boolean;
  editorFontSize: number;
  colorMode: ColorMode;
  targetLineNumber: number | null;
  onOpenFile: (path: string) => void;
  outlineItems: OutlineItem[];
  onSelectHeading: (item: OutlineItem) => void;
  chapterStatuses: ChapterStatusMap;
  onCycleChapterStatus: (item: OutlineItem) => void;
  vaultRoot: string | null;
  onChooseVaultFolder: () => void;
  backlinks: Backlink[];
  tags: TagCount[];
  onFindNotesByTag: (tag: string) => VaultNote[];
  onEntryRenamed: (oldPath: string, newPath: string) => void;
  onEntryDeleted: (path: string) => void;
  onVaultMutated: () => void;
  typstPreview: TypstPdfPreviewState;
  onJumpToLine: (line: number) => void;
}

/** The three-pane writing workspace and its independently collapsible Explorer. */
export function Workspace({
  showPreview,
  bookOutline,
  onShowGraph,
  onShowWritingTools,
  resizeSidebarByKeyboard,
  resizeEditorByKeyboard,
  beforeMutation,
  onExtractSelection,
  workspaceRef,
  sidebarWidth,
  editorPercent,
  isExplorerCollapsed,
  startSidebarResize,
  startEditorResize,
  toggleExplorer,
  currentPath,
  content,
  onContentChange,
  vimMode,
  editorFontSize,
  colorMode,
  targetLineNumber,
  onOpenFile,
  outlineItems,
  onSelectHeading,
  chapterStatuses,
  onCycleChapterStatus,
  vaultRoot,
  onChooseVaultFolder,
  backlinks,
  tags,
  onFindNotesByTag,
  onEntryRenamed,
  onEntryDeleted,
  onVaultMutated,
  typstPreview,
  onJumpToLine,
}: WorkspaceProps) {
  const explorerToggleLabel = isExplorerCollapsed ? 'Show Explorer' : 'Hide Explorer';
  const writingStats = useMemo(() => calculateWritingStats(content), [content]);

  return (
    <main className="app-workspace" ref={workspaceRef}>
      <section
        className="pane pane-explorer flex flex-col"
        style={{
          display: isExplorerCollapsed ? 'none' : undefined,
          flex: `0 0 ${sidebarWidth}px`,
          width: `${sidebarWidth}px`,
        }}
      >
        {bookOutline}
        {vaultRoot && (
          <button
            type="button"
            onClick={onShowGraph}
            className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            <GitFork className="size-4" /> Graph view
          </button>
        )}
        <div className="min-h-0 flex-1">
          <FileExplorer
            beforeMutation={beforeMutation}
            currentPath={currentPath}
            onOpenFile={onOpenFile}
            outlineItems={outlineItems}
            onSelectHeading={onSelectHeading}
            chapterStatuses={chapterStatuses}
            onCycleChapterStatus={onCycleChapterStatus}
            vaultRoot={vaultRoot}
            onChooseVaultFolder={onChooseVaultFolder}
            backlinks={backlinks}
            tags={tags}
            onFindNotesByTag={onFindNotesByTag}
            onEntryRenamed={onEntryRenamed}
            onEntryDeleted={onEntryDeleted}
            onVaultMutated={onVaultMutated}
          />
        </div>
      </section>

      {!isExplorerCollapsed && (
        <PaneResizer
          label="Explorer width"
          minimum={MIN_EXPLORER_WIDTH}
          maximum={MAX_EXPLORER_WIDTH}
          unit="px"
          value={sidebarWidth}
          onResize={resizeSidebarByKeyboard}
          onPointerDown={startSidebarResize}
        />
      )}
      <button
        type="button"
        className={`explorer-toggle ${isExplorerCollapsed ? 'is-collapsed' : ''}`}
        style={isExplorerCollapsed ? undefined : { left: `${sidebarWidth + 7}px` }}
        onClick={toggleExplorer}
        aria-label={explorerToggleLabel}
        aria-expanded={!isExplorerCollapsed}
        title={explorerToggleLabel}
      >
        {isExplorerCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </button>

      <section className="pane pane-editor flex flex-col" style={{ flex: `1 1 ${editorPercent}%` }}>
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="pane-loading">Loading editor…</div>}>
            <AsciidocEditor
              onExtractSelection={onExtractSelection}
              value={content}
              onChange={(value) => onContentChange(value || '')}
              vimMode={vimMode}
              colorMode={colorMode}
              fontSize={editorFontSize}
              targetLineNumber={targetLineNumber}
            />
          </Suspense>
        </div>
        <button
          type="button"
          onClick={onShowWritingTools}
          title="Writing statistics and focus timer"
          className="shrink-0 border-t px-3 py-1 text-right text-xs text-muted-foreground hover:bg-muted"
        >
          {writingStats.words.toLocaleString()} words · {writingStats.readingMinutes} min read
        </button>
      </section>

      {showPreview && (
        <PaneResizer
          label="Editor width"
          value={editorPercent}
          onResize={resizeEditorByKeyboard}
          onPointerDown={startEditorResize}
        />
      )}

      {showPreview && (
        <section className="pane pane-preview" style={{ flex: `1 1 ${100 - editorPercent}%` }}>
          <Suspense fallback={<div className="pane-loading">Loading preview…</div>}>
            <TypstPdfPreview {...typstPreview} onJumpToLine={onJumpToLine} onOpenFolder={onChooseVaultFolder} />
          </Suspense>
        </section>
      )}
    </main>
  );
}
