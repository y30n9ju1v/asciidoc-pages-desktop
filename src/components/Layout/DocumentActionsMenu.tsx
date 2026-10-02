import { FilePlus2, FileStack, FolderOpen, HelpCircle, History, MoreHorizontal, Quote, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DocumentActionsMenuProps {
  vaultRoot: string | null;
  currentPath: string | null;
  onNew: () => void;
  onOpen: () => void;
  onShowNoteTemplates: () => void;
  onImportMarkdown: () => void;
  onSaveCopy: () => void;
  onShowHistory: () => void;
  onNewBook: () => void;
  onShowBibliography: () => void;
  onShowHelp: () => void;
}
export function DocumentActionsMenu({
  vaultRoot,
  currentPath,
  onNew,
  onOpen,
  onShowNoteTemplates,
  onImportMarkdown,
  onSaveCopy,
  onShowHistory,
  onNewBook,
  onShowBibliography,
  onShowHelp,
}: DocumentActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          aria-label="More tools"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Document</div>
        <DropdownMenuItem className="lg:hidden" onSelect={onNew}>
          <FilePlus2 /> New document
        </DropdownMenuItem>
        <DropdownMenuItem className="lg:hidden" onSelect={onOpen}>
          <FolderOpen /> Open document
        </DropdownMenuItem>
        {vaultRoot && (
          <DropdownMenuItem className="lg:hidden" onSelect={onShowNoteTemplates}>
            <FileStack /> New note from template
          </DropdownMenuItem>
        )}
        {vaultRoot && (
          <DropdownMenuItem onSelect={onImportMarkdown}>
            <FolderOpen className="size-4" /> Import Markdown folder…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onSaveCopy}>
          <Save className="size-4" /> Save a copy…
        </DropdownMenuItem>
        {vaultRoot && currentPath && (
          <DropdownMenuItem onSelect={onShowHistory}>
            <History /> Version history
          </DropdownMenuItem>
        )}
        {vaultRoot && (
          <>
            <Separator className="my-1" />
            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Book &amp; publishing</div>
            <DropdownMenuItem onSelect={onNewBook}>
              <FilePlus2 /> New book…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShowBibliography}>
              <Quote /> Bibliography
            </DropdownMenuItem>
          </>
        )}
        <Separator className="my-1" />
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Help</div>
        <DropdownMenuItem onSelect={onShowHelp}>
          <HelpCircle /> AsciiDoc syntax cheatsheet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
