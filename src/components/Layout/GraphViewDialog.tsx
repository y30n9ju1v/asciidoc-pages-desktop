import { useMemo, useState } from 'react';
import { BookOpen, CircleAlert, GitFork, Search } from 'lucide-react';
import { GraphCanvas } from '../Graph/GraphCanvas';
import {
  buildGraphModel,
  filterGraphModel,
  graphFolders,
  graphTags,
  type GraphDocumentType,
  type GraphFilters,
  type GraphScope,
} from '../../services/graphViewService';
import type { BookProject } from '../../services/bookProjectService';
import type { VaultNote } from '../../services/vaultService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GraphViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string | null;
  notes: VaultNote[];
  project: BookProject | null;
  currentPath: string | null;
  onOpenDocument: (path: string) => void;
}

const INITIAL_FILTERS: GraphFilters = {
  scope: 'vault',
  documentType: 'all',
  folder: 'all',
  tag: 'all',
  query: '',
  showIsolated: false,
  showBroken: true,
};

interface FilterSelectProps {
  label: string;
  value: string;
  values: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, values, onChange }: FilterSelectProps) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full text-foreground" size="sm" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        <i className="mr-1 inline-block size-2 rounded-full bg-teal-700" />
        Note
      </span>
      <span>
        <i className="mr-1 inline-block size-2 rounded-full bg-violet-600" />
        Book chapter
      </span>
      <span>
        <i className="mr-1 inline-block size-2 rounded-full bg-red-600" />
        Broken link
      </span>
      <span>Drag to pan · Scroll to zoom · Use the document list to open a note</span>
    </div>
  );
}

function GraphNodeList({
  notes,
  currentPath,
  onOpenDocument,
}: {
  notes: ReturnType<typeof filterGraphModel>['nodes'];
  currentPath: string | null;
  onOpenDocument: (path: string) => void;
}) {
  const documents = notes.filter((node) => node.path);
  if (documents.length === 0) return null;
  return (
    <div className="grid gap-1 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Open a visible document</p>
      <div
        className="flex max-h-32 flex-wrap content-start gap-1.5 overflow-y-auto pr-1"
        aria-label="Visible documents"
      >
        {documents.map((node) => (
          <Button
            key={node.id}
            type="button"
            size="sm"
            variant={node.path === currentPath ? 'secondary' : 'outline'}
            className="h-7 max-w-48 truncate px-2 text-xs"
            onClick={() => node.path && onOpenDocument(node.path)}
          >
            {node.title}
          </Button>
        ))}
      </div>
    </div>
  );
}

function hasBookChapters(project: BookProject | null): boolean {
  return Boolean(project?.chapters.length);
}

function activeFiltersFor(filters: GraphFilters, hasBookScope: boolean): GraphFilters {
  return hasBookScope || filters.scope !== 'book' ? filters : { ...filters, scope: 'vault' };
}

function graphScopeValues(documentCount: number, chapterCount: number): { value: string; label: string }[] {
  const values = [{ value: 'vault', label: `Vault (${documentCount})` }];
  if (chapterCount > 0) values.push({ value: 'book', label: `Book Project (${chapterCount})` });
  return values;
}

/** A queryable graph for navigating relationships already present in the
 * vault. The dialog owns presentation state only; graph parsing, filtering,
 * limits, and layout remain pure services that can be tested independently. */
export function GraphViewDialog({
  open,
  onOpenChange,
  vaultRoot,
  notes,
  project,
  currentPath,
  onOpenDocument,
}: GraphViewDialogProps) {
  const [filters, setFilters] = useState<GraphFilters>(INITIAL_FILTERS);
  const graph = useMemo(
    () => buildGraphModel(notes, project?.chapters, vaultRoot),
    [notes, project?.chapters, vaultRoot],
  );
  const hasBookScope = hasBookChapters(project);
  const activeFilters = useMemo(() => activeFiltersFor(filters, hasBookScope), [filters, hasBookScope]);
  const folders = useMemo(() => graphFolders(graph), [graph]);
  const tags = useMemo(() => graphTags(graph), [graph]);
  const filtered = useMemo(() => filterGraphModel(graph, activeFilters), [activeFilters, graph]);

  const update = <Key extends keyof GraphFilters>(key: Key, value: GraphFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const openDocument = (path: string) => {
    onOpenDocument(path);
    onOpenChange(false);
  };

  const scopeValues = graphScopeValues(graph.documentCount, project?.chapters.length ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1100px,calc(100%-2rem))] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="size-4 text-primary" /> Graph view
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Explore links across the Vault or the selected Book Project. Missing targets are shown separately from notes
            outside the current scope.
          </p>
        </DialogHeader>
        {!vaultRoot ? (
          <div className="p-5 text-sm text-muted-foreground">Open a folder to build a graph from its notes.</div>
        ) : (
          <div className="grid min-h-0 gap-3 overflow-y-auto p-5 pt-1">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                label="Scope"
                value={activeFilters.scope}
                values={scopeValues}
                onChange={(value) => update('scope', value as GraphScope)}
              />
              <FilterSelect
                label="Document type"
                value={filters.documentType}
                values={[
                  { value: 'all', label: 'All documents' },
                  { value: 'chapter', label: 'Book chapters' },
                  { value: 'note', label: 'Notes' },
                ]}
                onChange={(value) => update('documentType', value as GraphDocumentType)}
              />
              <FilterSelect
                label="Folder"
                value={filters.folder}
                values={[
                  { value: 'all', label: 'All folders' },
                  ...folders.map((folder) => ({ value: folder, label: folder })),
                ]}
                onChange={(value) => update('folder', value)}
              />
              <FilterSelect
                label="Tag"
                value={filters.tag}
                values={[{ value: 'all', label: 'All tags' }, ...tags.map((tag) => ({ value: tag, label: `#${tag}` }))]}
                onChange={(value) => update('tag', value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <label className="flex h-8 min-w-0 items-center gap-2 rounded-md border bg-background px-2 text-xs text-muted-foreground">
                <Search className="size-3.5 shrink-0" />
                <input
                  value={filters.query}
                  onChange={(event) => update('query', event.target.value)}
                  placeholder="Search title, folder, or tag..."
                  className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={filters.showIsolated}
                  onChange={(event) => update('showIsolated', event.target.checked)}
                />{' '}
                Show isolated
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={filters.showBroken}
                  onChange={(event) => update('showBroken', event.target.checked)}
                />{' '}
                Show broken links
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {filtered.nodes.length} visible nodes · {filtered.edges.length} links · {filtered.isolatedCount}{' '}
                isolated · {graph.brokenLinkCount} missing targets
              </p>
              {filtered.hiddenByLimit > 0 && (
                <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-200">
                  <CircleAlert className="size-3.5" /> {filtered.hiddenByLimit} matching notes are hidden; refine the
                  filters.
                </p>
              )}
            </div>
            <div className="h-[min(52vh,520px)] min-h-72 overflow-hidden rounded-md border">
              {filtered.nodes.length > 0 ? (
                <GraphCanvas graph={filtered} currentPath={currentPath} onOpenDocument={openDocument} />
              ) : (
                <div className="grid h-full place-items-center gap-2 px-5 text-center text-sm text-muted-foreground">
                  <BookOpen className="size-5" /> No linked notes match these filters. Enable isolated notes or broaden
                  the filters.
                </div>
              )}
            </div>
            <GraphLegend />
            <GraphNodeList notes={filtered.nodes} currentPath={currentPath} onOpenDocument={openDocument} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
