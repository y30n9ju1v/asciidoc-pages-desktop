import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_SIZE_LIST, type PageSizeId } from '../../services/pageSizeService';

/** One controlled selector for editing and publishing; neither owns a draft page size. */
export function PageSizeSelect({
  value,
  onChange,
  compact = false,
}: {
  value: PageSizeId;
  onChange: (value: PageSizeId) => void;
  compact?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as PageSizeId)}>
      <SelectTrigger
        aria-label="Page size"
        size={compact ? 'sm' : 'default'}
        className={compact ? 'w-24 border-transparent bg-transparent px-2 shadow-none hover:bg-muted' : 'w-full'}
        title="Page size · shared by PDF preview and export"
      >
        <SelectValue>{compact ? value : undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_LIST.map((size) => (
          <SelectItem key={size.id} value={size.id}>
            {size.name} · {size.dimensions}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
