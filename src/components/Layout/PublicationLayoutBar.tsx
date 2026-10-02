import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSizeSelect } from './PageSizeSelect';
import { type PageSizeId } from '../../services/pageSizeService';
import type { PublicationStyleId, PublicationStyleOption } from '../../services/publicationStyleService';

interface PublicationLayoutBarProps {
  styleId: PublicationStyleId;
  styles: readonly PublicationStyleOption[];
  onStyleChange: (id: PublicationStyleId) => void;
  pageSize: PageSizeId;
  onPageSizeChange: (id: PageSizeId) => void;
  onManageStyles?: () => void;
}

/** A quiet, shared layout strip; file actions remain in the main toolbar. */
export function PublicationLayoutBar({
  styleId,
  styles,
  onStyleChange,
  pageSize,
  onPageSizeChange,
  onManageStyles,
}: PublicationLayoutBarProps) {
  return (
    <div aria-label="Publication layout" className="flex shrink-0 items-center gap-5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Style</span>
        <Select
          value={styleId}
          onValueChange={(id) => {
            if (id === '__manage_styles') onManageStyles?.();
            else onStyleChange(id as PublicationStyleId);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Publication style"
            className="w-36 border-transparent bg-muted/50 px-2 shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {styles.map((style) => (
              <SelectItem key={style.id} value={style.id}>
                {style.name}
              </SelectItem>
            ))}
            {onManageStyles && (
              <SelectItem value="__manage_styles" className="mt-1 border-t">
                Manage styles…
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Paper</span>
        <PageSizeSelect value={pageSize} onChange={onPageSizeChange} compact />
      </div>
    </div>
  );
}
