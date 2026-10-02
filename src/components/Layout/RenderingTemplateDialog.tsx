import { useState } from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import {
  getPublicationStyle,
  type BuiltInPublicationStyleId,
  type FontRole,
} from '../../services/publicationStyleService';
import type {
  CreateCustomPublicationTemplateInput,
  CustomPublicationTemplate,
} from '../../services/customPublicationTemplateService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RenderingTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultRoot: string | null;
  templates: CustomPublicationTemplate[];
  busy: boolean;
  error: string | null;
  onCreateTemplate: (input: CreateCustomPublicationTemplateInput) => Promise<CustomPublicationTemplate | null>;
  onDeleteTemplate: (id: string) => Promise<boolean>;
  onSelectTemplate: (id: string) => void;
}

const fieldClass =
  'h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30';

function baseStyleDraft(baseStyleId: BuiltInPublicationStyleId) {
  const { typst } = getPublicationStyle(baseStyleId);
  return {
    baseStyleId,
    bodyFont: typst.bodyFont,
    headingFont: typst.headingFont,
    baseFontSizePt: typst.baseFontSizePt,
    lineHeight: typst.lineHeight,
    letterSpacingEm: typst.letterSpacingEm,
    wordSpacingEm: typst.wordSpacingEm,
    paragraphSpacingEm: typst.paragraphSpacingEm,
    firstLineIndentEm: typst.firstLineIndentEm,
    headingNumbering: typst.headingNumbering,
    bodyJustification: typst.bodyJustification,
    chapterStartsOnNewPage: typst.chapterStartsOnNewPage,
  };
}

const INITIAL_DRAFT = {
  name: '',
  accentColor: '#746a5d',
  ...baseStyleDraft('book-serif'),
};

/** A deliberately constrained editor: templates travel with a vault as JSON
 * but cannot inject arbitrary CSS, JavaScript, font URLs, or Typst markup. */
export function RenderingTemplateDialog({
  open,
  onOpenChange,
  vaultRoot,
  templates,
  busy,
  error,
  onCreateTemplate,
  onDeleteTemplate,
  onSelectTemplate,
}: RenderingTemplateDialogProps) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);

  const create = async () => {
    const template = await onCreateTemplate(draft);
    if (!template) return;
    onSelectTemplate(template.id);
    setDraft(INITIAL_DRAFT);
  };

  const remove = async (id: string) => {
    await onDeleteTemplate(id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(INITIAL_DRAFT);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[86vh] w-[min(620px,calc(100%-2rem))] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="size-4 text-primary" /> Publication style editor
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Styles are stored with this vault. They control preview, HTML, EPUB, PDF, and Mermaid without allowing CSS
            or Typst code.
          </p>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 pt-1">
          {!vaultRoot ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
              Open a folder to create rendering templates.
            </p>
          ) : (
            <>
              <section
                className="grid gap-3 rounded-lg border bg-muted/20 p-3.5"
                aria-label="Create rendering template"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Plus className="size-4" /> New publication style
                </div>
                <label className="grid gap-1.5 text-xs font-medium">
                  Name
                  <input
                    className={fieldClass}
                    value={draft.name}
                    placeholder="My editorial style"
                    maxLength={80}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Base layout
                    <Select
                      value={draft.baseStyleId}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          ...baseStyleDraft(value as BuiltInPublicationStyleId),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="book-serif">Book Serif</SelectItem>
                        <SelectItem value="literary">Literary</SelectItem>
                        <SelectItem value="reference">Reference</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Accent color
                    <input
                      className={`${fieldClass} cursor-pointer p-1`}
                      type="color"
                      value={draft.accentColor}
                      onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Letter spacing · {draft.letterSpacingEm.toFixed(2)}em
                    <input
                      type="range"
                      min="-0.05"
                      max="0.15"
                      step="0.01"
                      value={draft.letterSpacingEm}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, letterSpacingEm: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Word spacing · {draft.wordSpacingEm.toFixed(2)}em
                    <input
                      type="range"
                      min="-0.1"
                      max="0.3"
                      step="0.01"
                      value={draft.wordSpacingEm}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, wordSpacingEm: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Paragraph spacing · {draft.paragraphSpacingEm.toFixed(1)}em
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={draft.paragraphSpacingEm}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, paragraphSpacingEm: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    First-line indent · {draft.firstLineIndentEm.toFixed(1)}em
                    <input
                      type="range"
                      min="0"
                      max="2.5"
                      step="0.1"
                      value={draft.firstLineIndentEm}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, firstLineIndentEm: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Body typeface
                    <Select
                      value={draft.bodyFont}
                      onValueChange={(value) => setDraft((current) => ({ ...current, bodyFont: value as FontRole }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="serif">Serif</SelectItem>
                        <SelectItem value="sans">Sans serif</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Heading typeface
                    <Select
                      value={draft.headingFont}
                      onValueChange={(value) => setDraft((current) => ({ ...current, headingFont: value as FontRole }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="serif">Serif</SelectItem>
                        <SelectItem value="sans">Sans serif</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-medium">
                    Base size · {draft.baseFontSizePt}pt
                    <input
                      type="range"
                      min="8"
                      max="18"
                      step="0.5"
                      value={draft.baseFontSizePt}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, baseFontSizePt: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium">
                    Line height · {draft.lineHeight.toFixed(1)}
                    <input
                      type="range"
                      min="1.1"
                      max="2.2"
                      step="0.1"
                      value={draft.lineHeight}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, lineHeight: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={draft.headingNumbering}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, headingNumbering: event.target.checked }))
                    }
                  />
                  Number headings in PDF
                </label>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={draft.bodyJustification}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, bodyJustification: event.target.checked }))
                    }
                  />
                  Justify body paragraphs for print
                </label>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={draft.chapterStartsOnNewPage}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, chapterStartsOnNewPage: event.target.checked }))
                    }
                  />
                  Start top-level chapters on a new page
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="justify-self-end"
                  disabled={busy || !draft.name.trim()}
                  onClick={() => void create()}
                >
                  <Plus className="size-3.5" /> Create and use
                </Button>
              </section>
              <section className="grid gap-2" aria-label="Saved publication styles">
                <p className="text-xs font-medium">Saved styles</p>
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No custom styles yet.</p>
                ) : (
                  templates.map((template) => (
                    <div key={template.id} className="flex items-center gap-3 rounded-md border p-2.5">
                      <span
                        className="size-4 shrink-0 rounded-full border"
                        style={{ backgroundColor: template.accentColor }}
                        aria-hidden
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        disabled={busy}
                        onClick={() => onSelectTemplate(template.id)}
                      >
                        <span className="block truncate text-sm font-medium">{template.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {template.baseStyleId} · {template.baseFontSizePt}pt · {template.lineHeight}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        disabled={busy}
                        aria-label={`Delete ${template.name}`}
                        onClick={() => void remove(template.id)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
