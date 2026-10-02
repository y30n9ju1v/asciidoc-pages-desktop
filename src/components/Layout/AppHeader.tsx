import React, { useEffect, useState } from 'react';
import {
  FilePlus2,
  FileStack,
  FileText,
  FolderOpen,
  Minus,
  Moon,
  Settings2,
  Search,
  Sparkles,
  SlidersHorizontal,
  Sun,
  Terminal,
  Plus,
} from 'lucide-react';
import { AsciidocRenderResult } from '../../services/asciidocService';
import { BookMetadata } from '../../services/bookProjectService';
import { PreflightReport } from '../../services/preflightService';
import { ColorMode } from '../../services/themeService';
import { PageSizeId } from '../../services/pageSizeService';
import { PublicationStyleId, type PublicationStyleOption } from '../../services/publicationStyleService';
import type { PublicationTypography } from '../../services/publicationTypographyService';
import { CheatsheetModal } from '../Cheatsheet/CheatsheetModal';
import { PublishDialog } from './PublishDialog';
import { QuickOpenDialog } from './QuickOpenDialog';
import { PublicationTypographyToolbar } from './PublicationTypographyToolbar';
import { PublicationLayoutBar } from './PublicationLayoutBar';
import { VaultNote } from '../../services/vaultService';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DocumentSaveControl } from './DocumentSaveControl';
import { DocumentActionsMenu } from './DocumentActionsMenu';
import { documentSaveStatus } from '../../services/documentSaveStatus';
import { MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from '../../services/editorPreferences';
import type { WorkspaceMode } from '../../hooks/useWorkspaceMode';

interface AppHeaderProps {
  publicationTarget: string;
  publicationSaving: boolean;
  previewStatus: string;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  defaultTypography: PublicationTypography;
  fileName: string;
  currentPath: string | null;
  isDirty: boolean;
  onNew: () => void;
  onOpen: () => void;
  vaultRoot: string | null;
  notes: VaultNote[];
  onQuickOpen: (path: string) => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onImportMarkdown: () => void;
  renderResult: AsciidocRenderResult;
  currentPublicationStyle: PublicationStyleId;
  publicationStyles: readonly PublicationStyleOption[];
  publicationStyle: PublicationStyleOption;
  onPublicationStyleChange: (styleId: PublicationStyleId) => void;
  currentPageSize: PageSizeId;
  onPageSizeChange: (pageSizeId: PageSizeId) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  vimMode: boolean;
  onVimModeChange: (enabled: boolean) => void;
  editorFontSize: number;
  onEditorFontSizeChange: (size: number) => void;
  bookMetadata: BookMetadata;
  preflight: PreflightReport;
  canSaveBookDetails: boolean;
  onSaveBookMetadata: (metadata: BookMetadata) => Promise<void>;
  onResolvePreflightIssue: (issue: PreflightReport['issues'][number]) => void;
  onJumpToLine: (lineNumber: number) => void;
  onNewBook: () => void;
  onShowBibliography: () => void;
  onShowNoteTemplates: () => void;
  onShowHistory: () => void;
  onShowRenderingTemplates: () => void;
  publicationTypographyOpen: boolean;
  publicationTypography: PublicationTypography;
  hasPublicationTypographyOverride: boolean;
  hasUnsavedPublicationTypography: boolean;
  canSavePublicationTypography: boolean;
  onPublicationTypographyChange: (typography: PublicationTypography) => void;
  onSavePublicationTypography: () => void;
  onResetPublicationTypography: () => void;
  onTogglePublicationTypography: () => void;
}

interface EditorTextSizeControlProps {
  fontSize: number;
  onChange: (fontSize: number) => void;
}

/** Header placement keeps the writing surface clear of floating controls. */
function EditorTextSizeControl({ fontSize, onChange }: EditorTextSizeControlProps) {
  return (
    <div
      className="hidden items-center rounded-md border bg-background p-0.5 shadow-sm sm:flex"
      aria-label="Editor text size"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="Decrease editor text size"
            className="size-7 text-muted-foreground"
            disabled={fontSize <= MIN_EDITOR_FONT_SIZE}
            onClick={() => onChange(fontSize - 1)}
            size="icon"
            variant="ghost"
          >
            <Minus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Smaller editor text</TooltipContent>
      </Tooltip>
      <span className="min-w-9 select-none text-center text-xs tabular-nums text-muted-foreground">{fontSize}px</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="Increase editor text size"
            className="size-7 text-muted-foreground"
            disabled={fontSize >= MAX_EDITOR_FONT_SIZE}
            onClick={() => onChange(fontSize + 1)}
            size="icon"
            variant="ghost"
          >
            <Plus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Larger editor text</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** The persistent app chrome: daily file actions stay visible; publishing is contextual. */
export const AppHeader: React.FC<AppHeaderProps> = ({
  publicationTarget,
  publicationSaving,
  previewStatus,
  workspaceMode,
  onWorkspaceModeChange,
  defaultTypography,
  fileName,
  currentPath,
  isDirty,
  onNew,
  onOpen,
  vaultRoot,
  notes,
  onQuickOpen,
  onSave,
  onSaveCopy,
  onImportMarkdown,
  renderResult,
  currentPublicationStyle,
  publicationStyles,
  publicationStyle,
  onPublicationStyleChange,
  currentPageSize,
  onPageSizeChange,
  colorMode,
  onColorModeChange,
  vimMode,
  onVimModeChange,
  editorFontSize,
  onEditorFontSizeChange,
  bookMetadata,
  preflight,
  canSaveBookDetails,
  onSaveBookMetadata,
  onResolvePreflightIssue,
  onJumpToLine,
  onNewBook,
  onShowBibliography,
  onShowNoteTemplates,
  onShowHistory,
  onShowRenderingTemplates,
  publicationTypographyOpen,
  publicationTypography,
  hasPublicationTypographyOverride,
  hasUnsavedPublicationTypography,
  canSavePublicationTypography,
  onPublicationTypographyChange,
  onSavePublicationTypography,
  onResetPublicationTypography,
  onTogglePublicationTypography,
}) => {
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;

      const action = event.key.toLowerCase();
      if (action === 's') {
        event.preventDefault();
        onSave();
      }
      if (action === 'o') {
        event.preventDefault();
        onOpen();
      }
      if (action === 'n') {
        event.preventDefault();
        onNew();
      }
      if (action === 'p') {
        event.preventDefault();
        setShowQuickOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [onNew, onOpen, onSave]);

  return (
    <header className="app-header flex flex-shrink-0 flex-col border-b bg-card">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </span>
            <span className="hidden xl:inline">AsciiDoc Studio</span>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex min-w-0 items-center gap-1.5 text-sm" aria-label={`Current document: ${fileName}`}>
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{fileName}</span>
            {isDirty ? (
              <span className="shrink-0 text-xs font-medium text-[var(--color-brand)]" aria-label="Unsaved changes">
                Edited
              </span>
            ) : (
              <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
                {documentSaveStatus(currentPath, isDirty)}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <div role="group" aria-label="Workspace mode" className="mr-2 flex rounded-md border p-0.5">
            {(['write', 'proof'] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={workspaceMode === mode ? 'secondary' : 'ghost'}
                aria-pressed={workspaceMode === mode}
                onClick={() => onWorkspaceModeChange(mode)}
              >
                {mode === 'write' ? 'Write' : 'Preview'}
              </Button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden lg:inline-flex h-8 gap-1.5 px-2 text-muted-foreground"
              >
                <FilePlus2 className="size-3.5" />
                <span className="hidden md:inline">New</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onNew}>
                <FilePlus2 /> New document
              </DropdownMenuItem>
              {vaultRoot && (
                <DropdownMenuItem onSelect={onShowNoteTemplates}>
                  <FileStack /> From template…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpen}
                className="hidden lg:inline-flex h-8 gap-1.5 px-2 text-muted-foreground"
              >
                <FolderOpen className="size-3.5" />
                <span className="hidden md:inline">Open</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open file (⌘O)</TooltipContent>
          </Tooltip>
          <DocumentSaveControl dirty={isDirty} onSave={onSave} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowQuickOpen(true)}
                className="h-8 gap-1.5 px-2 text-muted-foreground"
              >
                <Search className="size-3.5" />
                <span className="hidden lg:inline">Search</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Quick open (⌘P)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-5" />
          <EditorTextSizeControl fontSize={editorFontSize} onChange={onEditorFontSizeChange} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Editor settings"
                title="Editor settings"
              >
                <Settings2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onColorModeChange(colorMode === 'dark' ? 'light' : 'dark')}>
                {colorMode === 'dark' ? <Sun /> : <Moon />} Switch to {colorMode === 'dark' ? 'light' : 'dark'} mode
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onVimModeChange(!vimMode)}>
                <Terminal /> {vimMode ? 'Disable Vim mode' : 'Enable Vim mode'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DocumentActionsMenu
            vaultRoot={vaultRoot}
            currentPath={currentPath}
            onNew={onNew}
            onOpen={onOpen}
            onShowNoteTemplates={onShowNoteTemplates}
            onImportMarkdown={onImportMarkdown}
            onSaveCopy={onSaveCopy}
            onShowHistory={onShowHistory}
            onNewBook={onNewBook}
            onShowBibliography={onShowBibliography}
            onShowHelp={() => setShowCheatsheet(true)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 max-w-48 gap-1.5 px-2"
            aria-label="Page layout settings"
            aria-expanded={publicationTypographyOpen}
            aria-controls="page-layout-panel"
            onClick={onTogglePublicationTypography}
            title={`${publicationStyle.name} · ${currentPageSize}`}
          >
            <SlidersHorizontal className="size-3.5 shrink-0" />
            <span className="hidden truncate md:inline">{publicationStyle.name} ·</span> {currentPageSize}
            <span hidden={!hasUnsavedPublicationTypography} aria-label="Layout not saved" className="text-primary">
              •
            </span>
          </Button>
          <PublishDialog
            renderResult={renderResult}
            currentPath={currentPath}
            currentPublicationStyle={currentPublicationStyle}
            publicationStyles={publicationStyles}
            publicationStyle={publicationStyle}
            onPublicationStyleChange={onPublicationStyleChange}
            currentPageSize={currentPageSize}
            onPageSizeChange={onPageSizeChange}
            colorMode={colorMode}
            bookMetadata={bookMetadata}
            preflight={preflight}
            canSaveBookDetails={canSaveBookDetails}
            onSaveBookMetadata={onSaveBookMetadata}
            onResolvePreflightIssue={onResolvePreflightIssue}
            onJumpToLine={onJumpToLine}
          />
        </div>
      </div>

      {publicationTypographyOpen ? (
        <PublicationTypographyToolbar
          previewStatus={previewStatus}
          saving={publicationSaving}
          defaults={defaultTypography}
          styleName={publicationTarget}
          typography={publicationTypography}
          hasOverride={hasPublicationTypographyOverride}
          hasUnsavedChanges={hasUnsavedPublicationTypography}
          canSave={canSavePublicationTypography}
          onChange={onPublicationTypographyChange}
          onSave={onSavePublicationTypography}
          onReset={onResetPublicationTypography}
          onClose={onTogglePublicationTypography}
        >
          <PublicationLayoutBar
            onManageStyles={onShowRenderingTemplates}
            styleId={currentPublicationStyle}
            styles={publicationStyles}
            onStyleChange={onPublicationStyleChange}
            pageSize={currentPageSize}
            onPageSizeChange={onPageSizeChange}
          />
        </PublicationTypographyToolbar>
      ) : null}

      {showCheatsheet && <CheatsheetModal onClose={() => setShowCheatsheet(false)} />}
      <QuickOpenDialog
        open={showQuickOpen}
        onOpenChange={setShowQuickOpen}
        vaultRoot={vaultRoot}
        notes={notes}
        onOpenFile={onQuickOpen}
      />
    </header>
  );
};
