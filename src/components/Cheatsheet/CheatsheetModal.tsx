import React from 'react';
import { Copy } from 'lucide-react';
import { getCheatsheetSections } from './cheatsheetContent';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CheatsheetModalProps {
  onClose: () => void;
}

/** A static AsciiDoc syntax reference, opened from AppHeader's "Help" button. */
export const CheatsheetModal: React.FC<CheatsheetModalProps> = ({ onClose }) => {
  const sections = getCheatsheetSections();

  const handleCopy = (syntax: string) => {
    navigator.clipboard?.writeText(syntax).catch(() => {});
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[86vh] w-[min(760px,92vw)] max-w-none">
        <DialogHeader>
          <DialogTitle>AsciiDoc Syntax Cheatsheet</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] grid-cols-1 gap-5 overflow-y-auto p-5 pt-0 sm:grid-cols-2">
          {sections.map((section) => (
            <div key={section.title}>
              <h4 className="mb-2 text-xs font-bold tracking-wide text-[var(--color-brand)] uppercase">
                {section.title}
              </h4>
              {section.items.map((item) => (
                <div key={item.syntax} className="mb-2.5">
                  <div className="flex items-start gap-1.5">
                    <pre className="flex-1 min-w-0 whitespace-pre-wrap break-words rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
                      {item.syntax}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 size-6 shrink-0 text-muted-foreground hover:text-[var(--color-brand)]"
                      onClick={() => handleCopy(item.syntax)}
                      title="Copy"
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
