import { useState } from 'react';
import { BookPlus, Sparkles } from 'lucide-react';
import { BOOK_TEMPLATE_OPTIONS, type BookTemplateId } from '../../services/bookTemplateService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NewBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { templateId: BookTemplateId; title: string; author: string; language: string }) => Promise<void>;
}

const inputClassName =
  'h-9 w-full rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30';

/** Collects book intent; the template service owns all generated manuscript content. */
export function NewBookDialog({ open, onOpenChange, onCreate }: NewBookDialogProps) {
  const [templateId, setTemplateId] = useState<BookTemplateId>('nonfiction');
  const [title, setTitle] = useState('Untitled Book');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState('en');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBook = async () => {
    if (!title.trim()) {
      setError('Give the book a title before creating it.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await onCreate({ templateId, title: title.trim(), author: author.trim(), language: language.trim() || 'en' });
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,calc(100%-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookPlus className="size-4 text-primary" /> New book
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Creates an editable AsciiDoc manuscript in this selected Vault. Existing files are never overwritten.
          </p>
        </DialogHeader>
        <div className="grid gap-4 p-5 pt-1">
          <label className="grid gap-1.5 text-xs font-medium">
            Starter template
            <Select value={templateId} onValueChange={(value) => setTemplateId(value as BookTemplateId)}>
              <SelectTrigger className="w-full" aria-label="Book starter template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOK_TEMPLATE_OPTIONS.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {BOOK_TEMPLATE_OPTIONS.find((template) => template.id === templateId)?.description}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">
              Book title
              <input className={inputClassName} value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Author
              <input className={inputClassName} value={author} onChange={(event) => setAuthor(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-1.5 text-xs font-medium">
            Language
            <input className={inputClassName} value={language} onChange={(event) => setLanguage(event.target.value)} />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createBook()} disabled={creating}>
              <Sparkles className="size-3.5" /> {creating ? 'Creating…' : 'Create starter book'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
