import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Saving is a primary document action, not an unlabeled utility icon. */
export function DocumentSaveControl({ dirty, onSave }: { dirty: boolean; onSave: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSave}
          className="h-8 gap-1.5 px-2 text-muted-foreground"
          aria-label="Save document"
          data-edited={dirty}
        >
          <Save className="size-3.5" /> Save
        </Button>
      </TooltipTrigger>
      <TooltipContent>Save document (⌘S)</TooltipContent>
    </Tooltip>
  );
}
