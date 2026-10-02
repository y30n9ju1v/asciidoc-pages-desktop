import { useState } from 'react';
import { FileStack, Plus, Save, Trash2 } from 'lucide-react';
import { useNoteTemplates } from '../../hooks/useNoteTemplates';
import type { NoteTemplate } from '../../services/noteTemplateService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface NoteTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string | null;
  currentContent: string;
  onNoteCreated: (path: string) => void;
}

const inputClassName =
  'h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30';

/**
 * Templates are plain .adoc files under this vault's own
 * .asciidoc-studio/templates/ folder (see noteTemplateService.ts) - not a
 * separate database, matching this app's file-based-first philosophy
 * (DESIGN_GUIDELINES.md §1). Creating a note from one always happens at the
 * vault root, a deliberate scope limitation rather than a full folder
 * picker - the same simplicity tradeoff bookTemplateService.ts's own
 * createStarterBook already makes.
 *
 * A thin view over useNoteTemplates.ts, which owns the actual I/O - this
 * component only turns user actions into hook calls and renders the result.
 */
export function NoteTemplateDialog({
  open,
  onOpenChange,
  vaultRoot,
  currentContent,
  onNoteCreated,
}: NoteTemplateDialogProps) {
  const { templates, error, busy, createFrom, saveCurrentAsTemplate, deleteTemplate } = useNoteTemplates(
    vaultRoot,
    open,
  );
  const [newName, setNewName] = useState('');

  const handleCreateFrom = async (template: NoteTemplate) => {
    const path = await createFrom(template);
    if (path) {
      onNoteCreated(path);
      onOpenChange(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await saveCurrentAsTemplate(name, currentContent)) setNewName('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,calc(100%-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileStack className="size-4 text-primary" /> Note templates
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Plain .adoc files in this vault&apos;s templates folder. Use{' '}
            <code className="font-mono">{'{{title}}'}</code> and <code className="font-mono">{'{{date}}'}</code> as
            placeholders.
          </p>
        </DialogHeader>
        <div className="grid max-h-[min(500px,calc(100vh-10rem))] gap-3 overflow-y-auto p-5 pt-1">
          {!vaultRoot && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
              Open a folder to use templates.
            </p>
          )}
          {vaultRoot && (
            <>
              <div className="flex gap-2">
                <input
                  className={inputClassName}
                  placeholder="Save current document as template..."
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void handleSaveAsTemplate()}
                  disabled={busy || !newName.trim()}
                >
                  <Save className="size-3.5" /> Save
                </Button>
              </div>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">No saved templates yet - save one above.</p>
              )}
              <div className="grid gap-2">
                {templates.map((template) => (
                  <div key={template.name} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium disabled:opacity-50"
                      onClick={() => void handleCreateFrom(template)}
                      disabled={busy}
                    >
                      <Plus className="mr-1.5 inline size-3.5 text-muted-foreground" />
                      {template.name}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={() => void deleteTemplate(template.name)}
                      disabled={busy}
                      aria-label={`Delete ${template.name}`}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
