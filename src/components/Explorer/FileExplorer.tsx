import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  FolderTree,
  Hash,
  Link2,
  ListTree,
  Pencil,
  Trash2,
} from 'lucide-react';
import { FileTreeEntry, withPreservedExtension } from '../../services/fileTreeService';
import { useDirectoryEntries } from '../../hooks/useDirectoryEntries';
import { ExplorerTreeActions, useExplorerTreeActions } from '../../hooks/useExplorerTreeActions';
import { DocumentOutline } from './DocumentOutline';
import { BacklinksPanel } from './BacklinksPanel';
import { TagsPanel } from './TagsPanel';
import { OutlineItem } from '../../services/outlineService';
import { ChapterStatusMap } from '../../services/chapterStatusService';
import { Backlink } from '../../services/backlinkService';
import { TagCount } from '../../services/tagService';
import { VaultNote } from '../../services/vaultService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const TREE_ENTRY_MIME = 'application/x-asciidoc-studio-tree-entry';

interface FileExplorerProps {
  beforeMutation?: () => void;
  currentPath: string | null;
  onOpenFile: (path: string) => void;
  outlineItems?: OutlineItem[];
  onSelectHeading?: (item: OutlineItem) => void;
  chapterStatuses?: ChapterStatusMap;
  onCycleChapterStatus?: (item: OutlineItem) => void;
  // The file tree's root is the same "vault" wikilinks/backlinks resolve
  // against (see useVault.ts) - lifted up to App.tsx (rather than this
  // component managing its own independent root, as it used to) so
  // choosing a folder here is the one action that both browses it and
  // makes it the vault, the same way opening a folder in Obsidian does both.
  vaultRoot: string | null;
  onChooseVaultFolder: () => void;
  backlinks?: Backlink[];
  tags?: TagCount[];
  onFindNotesByTag?: (tag: string) => VaultNote[];
  // Keeps the open document (useDocument.ts) pointed at the right path -
  // and discarded if it's the one just deleted - when a rename/move/delete
  // happens to it from in here rather than from the editor itself.
  onEntryRenamed?: (oldPath: string, newPath: string) => void;
  onEntryDeleted?: (path: string) => void;
  // Any create/rename/delete/move changes what's on disk under the vault,
  // which wikilink resolution and backlinks (useVault.ts) need to know
  // about - called after every successful mutation below.
  onVaultMutated?: () => void;
}

// Obsidian's left ribbon is a narrow, icon-only vertical strip - the row of
// horizontal text tabs this replaces (Files/Outline/Links, each with a
// label) read as a browser-style tab bar instead. TabsTrigger itself still
// drives the same Radix Tabs state; only the trigger's visual shape and its
// position (left rail vs. top row) changed.
const RibbonTab: React.FC<{ value: string; icon: React.ReactNode; label: string; count?: number }> = ({
  value,
  icon,
  label,
  count = 0,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <TabsTrigger
        value={value}
        // Override the horizontal tab primitive's flex growth for this icon ribbon.
        className="relative size-8 shrink-0 grow-0 flex-none rounded-md p-0 text-muted-foreground data-[state=active]:bg-[var(--item-active-bg)] data-[state=active]:text-[var(--color-brand)] data-[state=active]:shadow-none"
      >
        {icon}
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
      </TabsTrigger>
    </TooltipTrigger>
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>
);

const VaultEmptyState: React.FC<{ onChooseVaultFolder: () => void }> = ({ onChooseVaultFolder }) => (
  <div className="mx-2 mt-3 grid place-items-center rounded-xl border border-dashed bg-muted/30 px-5 py-8 text-center">
    <span className="mb-3 grid size-9 place-items-center rounded-lg bg-background shadow-xs">
      <FolderSearch className="size-4 text-[var(--color-brand)]" />
    </span>
    <h2 className="text-sm font-medium text-foreground">Open a workspace</h2>
    <p className="mt-1.5 max-w-52 text-xs leading-5 text-muted-foreground">
      Your notes remain ordinary files in a folder you choose.
    </p>
    <Button type="button" size="sm" className="mt-4" onClick={onChooseVaultFolder}>
      <FolderOpen className="size-3.5" /> Open folder
    </Button>
  </div>
);

interface ExplorerFilesPaneProps {
  vaultRoot: string | null;
  rootEntries: FileTreeEntry[];
  loadError: string | null;
  currentPath: string | null;
  onOpenFile: (path: string) => void;
  onChooseVaultFolder: () => void;
  refreshToken: number;
  justCreatedPath: string | null;
  setJustCreatedPath: (path: string | null) => void;
  actions: ExplorerTreeActions;
  onCreateNote: () => Promise<void>;
  onCreateFolder: () => Promise<void>;
  onRootDrop: (event: React.DragEvent) => void;
}

const ExplorerFilesPane: React.FC<ExplorerFilesPaneProps> = ({
  vaultRoot,
  rootEntries,
  loadError,
  currentPath,
  onOpenFile,
  onChooseVaultFolder,
  refreshToken,
  justCreatedPath,
  setJustCreatedPath,
  actions,
  onCreateNote,
  onCreateFolder,
  onRootDrop,
}) => (
  <TabsContent value="files" className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex flex-shrink-0 items-center justify-between px-3 py-2">
      <span className="min-w-0 truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {vaultRoot ? vaultRoot.split('/').filter(Boolean).pop() : 'Explorer'}
      </span>
      <div className="flex items-center gap-0.5">
        {vaultRoot && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Create new note"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => void onCreateNote()}
              >
                <FilePlus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">New note</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open folder"
              className="size-6 text-muted-foreground hover:text-foreground"
              onClick={onChooseVaultFolder}
            >
              <FolderSearch className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Open folder</TooltipContent>
        </Tooltip>
      </div>
    </div>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-1 pb-2"
          onDragOver={(event) => vaultRoot && event.preventDefault()}
          onDrop={(event) => void onRootDrop(event)}
        >
          {!vaultRoot && <VaultEmptyState onChooseVaultFolder={onChooseVaultFolder} />}
          {vaultRoot && loadError && (
            <div className="px-2 py-3 text-xs text-destructive">Could not read folder: {loadError}</div>
          )}
          {vaultRoot && rootEntries.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">Empty folder</div>
          )}
          {vaultRoot &&
            rootEntries.map((entry) => (
              <TreeItem
                key={entry.path}
                entry={entry}
                depth={0}
                currentPath={currentPath}
                onOpenFile={onOpenFile}
                refreshToken={refreshToken}
                justCreatedPath={justCreatedPath}
                setJustCreatedPath={setJustCreatedPath}
                actions={actions}
              />
            ))}
        </div>
      </ContextMenuTrigger>
      {/* onCloseAutoFocus prevented: Radix's default is to return focus to
          the trigger once the menu closes, which - without this - raced the
          rename <input> this "New Note"/"New Folder" action focuses moments
          later, stealing it right back and silently committing a no-op
          rename (input appeared then instantly vanished, confirmed via an
          actual headless-browser repro, not just reasoning about it). See
          TreeItem's own ContextMenuContent below for the same fix, needed
          there for "Rename" too. */}
      <ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
        <ContextMenuItem disabled={!vaultRoot} onSelect={() => void onCreateNote()}>
          <FilePlus /> New Note
        </ContextMenuItem>
        <ContextMenuItem disabled={!vaultRoot} onSelect={() => void onCreateFolder()}>
          <FolderPlus /> New Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  </TabsContent>
);

export const FileExplorer: React.FC<FileExplorerProps> = ({
  beforeMutation,
  currentPath,
  onOpenFile,
  outlineItems = [],
  onSelectHeading = () => {},
  chapterStatuses = {},
  onCycleChapterStatus = () => {},
  vaultRoot,
  onChooseVaultFolder,
  backlinks = [],
  tags = [],
  onFindNotesByTag = () => [],
  onEntryRenamed,
  onEntryDeleted,
  onVaultMutated,
}) => {
  // Bumped after any create/rename/delete/move so every currently-expanded
  // TreeItem (and this root list) re-fetches its own listing - see each
  // TreeItem's own refreshToken-keyed effect below. One counter shared by
  // the whole tree is much simpler than threading a "reload the list I'm
  // in" callback through every level by hand, at the cost of every
  // expanded folder re-fetching on every mutation rather than just the
  // directly affected one(s) - a personal vault's scale makes that a very
  // cheap tradeoff.
  const [refreshToken, setRefreshToken] = useState(0);
  useEffect(() => {
    const refresh = () => setRefreshToken((value) => value + 1);
    window.addEventListener('vault-files-changed', refresh);
    return () => window.removeEventListener('vault-files-changed', refresh);
  }, []);
  const bumpRefresh = () => setRefreshToken((n) => n + 1);
  // The path of a note/folder just created via the context menu, so the
  // matching TreeItem (once it reappears after bumpRefresh) mounts straight
  // into rename mode - Obsidian creates "Untitled.md" with no naming
  // prompt and expects you to immediately type a real name over it.
  const [justCreatedPath, setJustCreatedPath] = useState<string | null>(null);
  const { entries: rootEntries, error: rootLoadError } = useDirectoryEntries(
    vaultRoot,
    refreshToken,
    Boolean(vaultRoot),
  );
  const actions = useExplorerTreeActions({
    beforeMutation,
    vaultRoot,
    bumpRefresh,
    setJustCreatedPath,
    onEntryRenamed,
    onEntryDeleted,
    onVaultMutated,
  });
  const createNoteAtRoot = async () => {
    if (vaultRoot) await actions.createEntry(vaultRoot, rootEntries, 'note');
  };
  const createFolderAtRoot = async () => {
    if (vaultRoot) await actions.createEntry(vaultRoot, rootEntries, 'folder');
  };
  const handleRootDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const sourcePath = event.dataTransfer.getData(TREE_ENTRY_MIME);
    if (vaultRoot && sourcePath) void actions.moveEntry(sourcePath, vaultRoot);
  };

  return (
    <Tabs defaultValue="files" orientation="vertical" className="h-full flex-row gap-0">
      {/* The ribbon - Obsidian's narrow left-edge icon strip, one click per
          view rather than the old top row of labeled tabs. */}
      <TabsList className="h-full w-10 flex-shrink-0 flex-col items-center justify-start gap-1 rounded-none border-r bg-transparent p-1.5">
        <RibbonTab key="files" value="files" icon={<FolderTree className="size-4" />} label="Files" />
        <RibbonTab
          key="outline"
          value="outline"
          icon={<ListTree className="size-4" />}
          label="Outline"
          count={outlineItems.length}
        />
        <RibbonTab
          key="backlinks"
          value="backlinks"
          icon={<Link2 className="size-4" />}
          label="Backlinks"
          count={backlinks.length}
        />
        <RibbonTab key="tags" value="tags" icon={<Hash className="size-4" />} label="Tags" count={tags.length} />
      </TabsList>

      <div className="flex min-w-0 flex-1 flex-col">
        <ExplorerFilesPane
          vaultRoot={vaultRoot}
          rootEntries={rootEntries}
          loadError={rootLoadError}
          currentPath={currentPath}
          onOpenFile={onOpenFile}
          onChooseVaultFolder={onChooseVaultFolder}
          refreshToken={refreshToken}
          justCreatedPath={justCreatedPath}
          setJustCreatedPath={setJustCreatedPath}
          actions={actions}
          onCreateNote={createNoteAtRoot}
          onCreateFolder={createFolderAtRoot}
          onRootDrop={handleRootDrop}
        />

        <TabsContent value="outline" className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
          <DocumentOutline
            items={outlineItems}
            onSelectHeading={onSelectHeading}
            statuses={chapterStatuses}
            onCycleStatus={onCycleChapterStatus}
          />
        </TabsContent>

        <TabsContent value="backlinks" className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
          <BacklinksPanel backlinks={backlinks} onOpenBacklink={onOpenFile} hasVault={!!vaultRoot} />
        </TabsContent>

        <TabsContent value="tags" className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
          <TagsPanel
            tags={tags}
            hasVault={!!vaultRoot}
            notesForSelectedTag={onFindNotesByTag}
            onOpenNote={onOpenFile}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
};

interface TreeItemProps {
  entry: FileTreeEntry;
  depth: number;
  currentPath: string | null;
  onOpenFile: (path: string) => void;
  refreshToken: number;
  justCreatedPath: string | null;
  setJustCreatedPath: (path: string | null) => void;
  actions: ExplorerTreeActions;
}

// Muted rather than colored (the old text-primary) - Obsidian's own tree
// is nearly monochrome, with color reserved for the one thing that
// actually needs to stand out (the active file's row, see TreeItem below).
// A loud icon on every single row just competes with that instead of
// helping anyone find the open file faster.
const EntryIcon: React.FC<{ isDirectory: boolean; expanded: boolean }> = ({ isDirectory, expanded }) => {
  if (!isDirectory) return <File className="size-3.5 shrink-0 text-muted-foreground" />;
  const FolderIcon = expanded ? FolderOpen : Folder;
  return <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />;
};

const ExpandChevron: React.FC<{ isDirectory: boolean; expanded: boolean }> = ({ isDirectory, expanded }) => {
  if (!isDirectory) return null;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return <Chevron className="size-3.5 text-muted-foreground" />;
};

interface TreeItemMenuProps {
  entry: FileTreeEntry;
  depth: number;
  currentPath: string | null;
  expanded: boolean;
  renaming: boolean;
  renameValue: string;
  isDragOver: boolean;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onOpen: () => void;
  onRenameValueChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onDelete: () => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
}

const TreeItemMenu: React.FC<TreeItemMenuProps> = ({
  entry,
  depth,
  currentPath,
  expanded,
  renaming,
  renameValue,
  isDragOver,
  renameInputRef,
  onOpen,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onDelete,
  onCreateNote,
  onCreateFolder,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
}) => {
  const isActive = !entry.isDirectory && entry.path === currentPath;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm text-muted-foreground select-none hover:bg-accent',
            isActive &&
              'bg-[var(--item-active-bg)] font-medium text-[var(--color-brand)] hover:bg-[var(--item-active-bg)]',
            isDragOver && 'bg-accent ring-1 ring-inset ring-primary',
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={onOpen}
          title={entry.path}
          draggable={!renaming}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <span className="flex w-3.5 shrink-0 items-center">
            <ExpandChevron isDirectory={entry.isDirectory} expanded={expanded} />
          </span>
          <EntryIcon isDirectory={entry.isDirectory} expanded={expanded} />
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(event) => onRenameValueChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onCommitRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              onBlur={onCommitRename}
              className="min-w-0 flex-1 rounded border border-primary bg-background px-1 text-sm text-foreground outline-none"
            />
          ) : (
            <span className="truncate">{entry.name}</span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
        {entry.isDirectory && (
          <>
            <ContextMenuItem onSelect={onCreateNote}>
              <FilePlus /> New Note
            </ContextMenuItem>
            <ContextMenuItem onSelect={onCreateFolder}>
              <FolderPlus /> New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={onStartRename}>
          <Pencil /> Rename
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

interface TreeItemChildrenProps {
  depth: number;
  children: FileTreeEntry[];
  loading: boolean;
  error: string | null;
  currentPath: string | null;
  onOpenFile: (path: string) => void;
  refreshToken: number;
  justCreatedPath: string | null;
  setJustCreatedPath: (path: string | null) => void;
  actions: ExplorerTreeActions;
}

const TreeItemChildren: React.FC<TreeItemChildrenProps> = ({
  depth,
  children,
  loading,
  error,
  currentPath,
  onOpenFile,
  refreshToken,
  justCreatedPath,
  setJustCreatedPath,
  actions,
}) => (
  <div>
    {loading && children.length === 0 && (
      <div className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
        Loading…
      </div>
    )}
    {error && (
      <div className="py-1 text-xs text-destructive" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
        Could not read folder: {error}
      </div>
    )}
    {children.map((child) => (
      <TreeItem
        key={child.path}
        entry={child}
        depth={depth + 1}
        currentPath={currentPath}
        onOpenFile={onOpenFile}
        refreshToken={refreshToken}
        justCreatedPath={justCreatedPath}
        setJustCreatedPath={setJustCreatedPath}
        actions={actions}
      />
    ))}
  </div>
);

const TreeItem: React.FC<TreeItemProps> = ({
  entry,
  depth,
  currentPath,
  onOpenFile,
  refreshToken,
  justCreatedPath,
  setJustCreatedPath,
  actions,
}) => {
  const [expanded, setExpanded] = useState(false);
  const {
    entries: children,
    loading,
    error,
  } = useDirectoryEntries(entry.path, refreshToken, entry.isDirectory && expanded);
  const [isDragOver, setIsDragOver] = useState(false);
  // Seeded once at mount from the parent's justCreatedPath - a freshly
  // created entry mounts as a brand-new TreeItem (its path is a new React
  // key), so this only ever fires for the entry that was actually just
  // created, never for an older item re-rendering for an unrelated reason.
  const [renaming, setRenaming] = useState(() => entry.path === justCreatedPath);
  const [renameValue, setRenameValue] = useState(entry.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const handleClick = () => {
    if (!entry.isDirectory) {
      onOpenFile(entry.path);
      return;
    }
    setExpanded((prev) => !prev);
  };

  const startRename = () => {
    setRenameValue(entry.name);
    setRenaming(true);
  };

  const commitRename = async () => {
    const trimmed = withPreservedExtension(renameValue.trim(), entry.name, entry.isDirectory);
    if (!trimmed || trimmed === entry.name) {
      setRenaming(false);
      return;
    }
    try {
      const newPath = await actions.renameEntry(entry.path, trimmed);
      if (newPath) setRenaming(false);
      else setRenameValue(entry.name);
    } catch {
      setRenameValue(entry.name);
    } finally {
      if (justCreatedPath === entry.path) setJustCreatedPath(null);
    }
  };

  const cancelRename = () => {
    setRenaming(false);
    setRenameValue(entry.name);
    if (justCreatedPath === entry.path) setJustCreatedPath(null);
  };

  const handleDelete = async () => {
    await actions.deleteEntry(entry);
  };

  const handleCreateNoteInside = async () => {
    const newPath = await actions.createEntry(entry.path, children, 'note');
    if (newPath) setExpanded(true);
  };

  const handleCreateFolderInside = async () => {
    const newPath = await actions.createEntry(entry.path, children, 'folder');
    if (newPath) setExpanded(true);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(TREE_ENTRY_MIME, entry.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!entry.isDirectory) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!entry.isDirectory) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const sourcePath = e.dataTransfer.getData(TREE_ENTRY_MIME);
    if (!sourcePath || sourcePath === entry.path) return;
    // Refuse to move a folder into its own descendant - that would orphan
    // it (and rename() would just fail anyway, but this avoids the round trip).
    if (entry.path.startsWith(`${sourcePath}/`)) return;
    const newPath = await actions.moveEntry(sourcePath, entry.path);
    if (newPath) setExpanded(true);
  };

  return (
    <div>
      <TreeItemMenu
        entry={entry}
        depth={depth}
        currentPath={currentPath}
        expanded={expanded}
        renaming={renaming}
        renameValue={renameValue}
        isDragOver={isDragOver}
        renameInputRef={renameInputRef}
        onOpen={handleClick}
        onRenameValueChange={setRenameValue}
        onCommitRename={() => void commitRename()}
        onCancelRename={cancelRename}
        onStartRename={startRename}
        onDelete={() => void handleDelete()}
        onCreateNote={() => void handleCreateNoteInside()}
        onCreateFolder={() => void handleCreateFolderInside()}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={() => entry.isDirectory && setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => void handleDrop(event)}
      />
      {entry.isDirectory && expanded ? (
        <TreeItemChildren
          depth={depth}
          children={children}
          loading={loading}
          error={error}
          currentPath={currentPath}
          onOpenFile={onOpenFile}
          refreshToken={refreshToken}
          justCreatedPath={justCreatedPath}
          setJustCreatedPath={setJustCreatedPath}
          actions={actions}
        />
      ) : null}
    </div>
  );
};
