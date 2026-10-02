import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { VaultNote } from '../../services/vaultService';
import { NoteSearchResult, searchFallbackMatches, searchVaultNotes } from '../../services/searchService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

interface QuickOpenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string | null;
  notes: VaultNote[];
  onOpenFile: (path: string) => void;
}

/** A focused, keyboard-first note switcher for the currently open vault. */
const SEARCH_DEBOUNCE_MS = 150;

export const QuickOpenDialog: React.FC<QuickOpenDialogProps> = ({
  open,
  onOpenChange,
  vaultRoot,
  notes,
  onOpenFile,
}) => {
  const [query, setQuery] = useState('');
  const [searchResponse, setSearchResponse] = useState<{ query: string; notes: NoteSearchResult[] } | null>(null);
  const normalizedQuery = query.trim();
  const fallbackMatches = useMemo(() => searchFallbackMatches(notes, normalizedQuery), [notes, normalizedQuery]);
  const matchingNotes = useMemo(() => {
    if (!normalizedQuery) return notes.slice(0, 12).map((note) => ({ ...note, snippet: '' }));
    return searchResponse?.query === normalizedQuery ? searchResponse.notes : fallbackMatches;
  }, [fallbackMatches, normalizedQuery, notes, searchResponse]);

  useEffect(() => {
    if (!open || !vaultRoot || !normalizedQuery) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchVaultNotes(vaultRoot, normalizedQuery)
        .then((results) => {
          if (!cancelled) setSearchResponse({ query: normalizedQuery, notes: results });
        })
        .catch((error) => {
          console.error('Full-text search failed:', error);
          if (!cancelled) setSearchResponse({ query: normalizedQuery, notes: fallbackMatches });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fallbackMatches, normalizedQuery, open, vaultRoot]);

  const choose = (path: string) => {
    onOpenFile(path);
    onOpenChange(false);
    setQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(620px,calc(100%-2rem))] max-w-none" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Quick open</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search notes…"
            aria-label="Search notes"
          />
          <CommandList>
            {notes.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                Open a workspace to search its notes.
              </div>
            ) : (
              <>
                <CommandEmpty>No matching notes.</CommandEmpty>
                <CommandGroup>
                  {matchingNotes.map((note) => (
                    <CommandItem key={note.path} value={note.path} onSelect={() => choose(note.path)}>
                      <span className="grid size-7 place-items-center rounded-md border bg-background text-muted-foreground">
                        <FileText className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{note.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{note.path}</span>
                        {note.snippet && (
                          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {note.snippet}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
        <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>Searches title, filename, and content</span>
          <span>↵ Open</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
