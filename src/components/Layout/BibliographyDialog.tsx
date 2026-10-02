import { useState } from 'react';
import { ArrowDown, ArrowUp, FileUp, Plus, Quote, Save, Trash2 } from 'lucide-react';
import {
  addBibliographyEntry,
  moveBibliographyEntry,
  removeBibliographyEntry,
  updateBibliographyEntry,
  type BibliographyEntry,
} from '../../services/bibliographyService';
import { addImportedBibliographyEntries } from '../../services/bibtexService';
import { importBibtexFromPicker } from '../../services/bibliographyImportAdapter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BibliographyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: BibliographyEntry[];
  canPersist: boolean;
  onSave: (entries: BibliographyEntry[]) => Promise<void>;
}

const inputClassName =
  'h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30';

// A persistent label above each field, not a placeholder that disappears
// once you type - a placeholder-as-label is fine for a single, self-evident
// action field (the "new citation key" box below has a visible "Add" button
// right next to it), but not for a repeatable multi-field row: scroll past
// a filled-in entry and there's nothing left to say which value is the
// author versus the publisher. Matches BookDetailsDialog.tsx's own
// <label>text <input/></label> convention, just at a more compact scale
// since this repeats per entry rather than appearing once.
const fieldLabelClassName = 'grid gap-1 text-[10px] font-medium text-muted-foreground';

interface EntryRowProps {
  entry: BibliographyEntry;
  index: number;
  total: number;
  onChange: (entry: BibliographyEntry) => void;
  onRemove: () => void;
  onMove: (offset: -1 | 1) => void;
}

/** One bibliography row - split out from BibliographyDialog itself to keep
 * that component's own render function under the cyclomatic-complexity
 * limit ESLint enforces (DESIGN_GUIDELINES.md §4), same reason
 * BookDetailsDialog's fields stay a flat list of plain <label>s rather than
 * a single giant JSX block. */
function EntryRow({ entry, index, total, onChange, onRemove, onMove }: EntryRowProps) {
  const update = (field: Exclude<keyof BibliographyEntry, 'key'>, value: string) => {
    onChange({ ...entry, [field]: value });
  };

  return (
    <div className="grid gap-2 rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-semibold text-foreground" title={entry.key}>
          cite:[{entry.key}]
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Move up"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Move down"
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={onRemove} aria-label="Remove">
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={fieldLabelClassName}>
          Author
          <input
            className={inputClassName}
            value={entry.author}
            onChange={(event) => update('author', event.target.value)}
          />
        </label>
        <label className={fieldLabelClassName}>
          Year
          <input
            className={inputClassName}
            value={entry.year}
            onChange={(event) => update('year', event.target.value)}
          />
        </label>
        <label className={`${fieldLabelClassName} sm:col-span-2`}>
          Title
          <input
            className={inputClassName}
            value={entry.title}
            onChange={(event) => update('title', event.target.value)}
          />
        </label>
        <label className={fieldLabelClassName}>
          Publisher
          <input
            className={inputClassName}
            value={entry.publisher}
            onChange={(event) => update('publisher', event.target.value)}
          />
        </label>
        <label className={fieldLabelClassName}>
          URL
          <input className={inputClassName} value={entry.url} onChange={(event) => update('url', event.target.value)} />
        </label>
      </div>
    </div>
  );
}

/** Manages the citable sources `cite:[key]` markers in the manuscript
 * resolve against - stored on Book Project metadata (see BookMetadata.
 * bibliography), not the source .adoc file, same "publish metadata lives in
 * .asciidoc-studio/, the manuscript itself stays untouched" policy as every
 * other Book Project field. */
export function BibliographyDialog({ open, onOpenChange, entries, canPersist, onSave }: BibliographyDialogProps) {
  const [draft, setDraft] = useState<BibliographyEntry[]>(entries);
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const addEntry = () => {
    const key = newKey.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      setImportMessage(null);
      setError('Citation key can only contain letters, numbers, "-" and "_" - the same key you write as cite:[key].');
      return;
    }
    setError(null);
    setImportMessage(null);
    setDraft((current) => addBibliographyEntry(current, key));
    setNewKey('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setImportMessage(null);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const importBibtex = async () => {
    setImporting(true);
    setError(null);
    setImportMessage(null);
    try {
      const result = await importBibtexFromPicker();
      if (!result) return;
      const before = draft.length;
      const next = addImportedBibliographyEntries(draft, result.entries);
      setDraft(next);
      const added = next.length - before;
      setImportMessage(
        `${added} BibTeX entr${added === 1 ? 'y' : 'ies'} imported${result.skippedCount ? `; ${result.skippedCount} invalid or duplicate entr${result.skippedCount === 1 ? 'y was' : 'ies were'} skipped` : ''}. Save bibliography to keep changes.`,
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,calc(100%-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Quote className="size-4 text-primary" /> Bibliography
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Cite a source anywhere in the manuscript with <code className="font-mono">cite:[key]</code>; it renders as a
            numbered reference with an auto-generated References section in HTML, EPUB, and PDF. Importing BibTeX adds
            only citation keys not already in this book.
          </p>
        </DialogHeader>
        <div className="grid max-h-[min(640px,calc(100vh-10rem))] gap-3 overflow-y-auto p-5 pt-1">
          {!canPersist && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
              Open a book folder to save the bibliography with the project.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              className={inputClassName}
              placeholder="New citation key, e.g. smith2020"
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addEntry();
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={addEntry}>
              <Plus className="size-3.5" /> Add
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void importBibtex()}
              disabled={!canPersist || importing}
            >
              <FileUp className="size-3.5" /> {importing ? 'Importing…' : 'Import BibTeX'}
            </Button>
          </div>
          {draft.length === 0 && (
            <p className="text-xs text-muted-foreground">No entries yet - add a citation key above to start.</p>
          )}
          <div className="grid gap-2">
            {draft.map((entry, index) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                index={index}
                total={draft.length}
                onChange={(updated) => setDraft((current) => updateBibliographyEntry(current, updated))}
                onRemove={() => setDraft((current) => removeBibliographyEntry(current, entry.key))}
                onMove={(offset) => setDraft((current) => moveBibliographyEntry(current, entry.key, offset))}
              />
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {importMessage && <p className="text-xs text-muted-foreground">{importMessage}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={!canPersist || saving}>
              <Save className="size-3.5" /> {saving ? 'Saving…' : 'Save bibliography'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
