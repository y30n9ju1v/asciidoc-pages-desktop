import { useState } from 'react';
import { BookMarked, Save } from 'lucide-react';
import { BookMetadata } from '../../services/bookProjectService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface BookDetailsDialogProps {
  onOpenChange: (open: boolean) => void;
  metadata: BookMetadata;
  canPersist: boolean;
  onSave: (metadata: BookMetadata) => Promise<void>;
}

const inputClassName =
  'h-9 w-full rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30';

function subjectsText(subjects: string[]): string {
  return subjects.join(', ');
}

function parseSubjects(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((subject) => subject.trim())
        .filter(Boolean),
    ),
  );
}

/** Edits store-facing data without changing the source AsciiDoc manuscript. */
export function BookDetailsDialog({ onOpenChange, metadata, canPersist, onSave }: BookDetailsDialogProps) {
  const [draft, setDraft] = useState<BookMetadata>(metadata);
  // Kept as raw text rather than re-deriving from draft.subjects on every
  // keystroke: parsing (trim/split/dedupe) immediately after each keystroke
  // would eat the comma the user just typed - the array round-trips back
  // through subjectsText() with no trailing ", " to show, so "Tech, " snaps
  // back to "Tech" before they can type a second subject at all.
  const [subjectsDraft, setSubjectsDraft] = useState<string>(() => subjectsText(metadata.subjects));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: Exclude<keyof BookMetadata, 'subjects'>, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, subjects: parseSubjects(subjectsDraft) });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(680px,calc(100%-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="size-4 text-primary" /> Book details
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Stored in this vault&apos;s private project file; your AsciiDoc source stays unchanged.
          </p>
        </DialogHeader>
        <div className="grid max-h-[min(640px,calc(100vh-10rem))] gap-4 overflow-y-auto p-5 pt-1">
          {!canPersist && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
              Open a book folder to save these details with the project.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">
              Title{' '}
              <input
                className={inputClassName}
                value={draft.title}
                onChange={(event) => update('title', event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Subtitle{' '}
              <input
                className={inputClassName}
                value={draft.subtitle}
                onChange={(event) => update('subtitle', event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Author{' '}
              <input
                className={inputClassName}
                value={draft.author}
                onChange={(event) => update('author', event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Language{' '}
              <input
                className={inputClassName}
                value={draft.language}
                onChange={(event) => update('language', event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              ISBN or identifier
              <input
                className={inputClassName}
                value={draft.identifier}
                onChange={(event) => update('identifier', event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Publisher{' '}
              <input
                className={inputClassName}
                value={draft.publisher}
                onChange={(event) => update('publisher', event.target.value)}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-xs font-medium">
            Description
            <textarea
              className="min-h-20 w-full resize-y rounded-md border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">
              Rights
              <input
                className={inputClassName}
                value={draft.rights}
                onChange={(event) => update('rights', event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Subjects <span className="font-normal text-muted-foreground">(comma separated)</span>
              <input
                className={inputClassName}
                value={subjectsDraft}
                onChange={(event) => setSubjectsDraft(event.target.value)}
              />
            </label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={!canPersist || saving}>
              <Save className="size-3.5" /> {saving ? 'Saving…' : 'Save book details'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
