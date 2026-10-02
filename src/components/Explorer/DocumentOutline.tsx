import React from 'react';
import { Bookmark, Hash, Layers, Circle, Clock, CheckCircle2 } from 'lucide-react';
import { OutlineItem } from '../../services/outlineService';
import { ChapterStatus, ChapterStatusMap } from '../../services/chapterStatusService';

interface DocumentOutlineProps {
  items: OutlineItem[];
  onSelectHeading: (item: OutlineItem) => void;
  statuses: ChapterStatusMap;
  onCycleStatus: (item: OutlineItem) => void;
}

const STATUS_CONFIG: Record<ChapterStatus, { Icon: typeof Circle; label: string; className: string }> = {
  draft: { Icon: Circle, label: 'Draft', className: 'status-draft' },
  review: { Icon: Clock, label: 'In Review', className: 'status-review' },
  done: { Icon: CheckCircle2, label: 'Done', className: 'status-done' },
};

function selectOnKeyboard(event: React.KeyboardEvent, onSelect: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect();
}

const StatusBadge: React.FC<{ status: ChapterStatus | undefined; onClick: (e: React.MouseEvent) => void }> = ({
  status,
  onClick,
}) => {
  const config = status ? STATUS_CONFIG[status] : null;
  const Icon = config?.Icon ?? Circle;

  return (
    <button
      type="button"
      className={`outline-item-status${config ? ` ${config.className}` : ' status-unset'}`}
      onClick={onClick}
      title={config ? `Status: ${config.label} (click to change)` : 'Set chapter status'}
      aria-label={config ? `Chapter status: ${config.label}. Change status` : 'Set chapter status'}
    >
      <Icon size={13} />
    </button>
  );
};

export const DocumentOutline: React.FC<DocumentOutlineProps> = ({
  items,
  onSelectHeading,
  statuses,
  onCycleStatus,
}) => {
  if (items.length === 0) {
    return <div className="explorer-empty">No headings found in document</div>;
  }

  return (
    <div className="outline-tree">
      {items.map((item) => {
        const indentPadding = Math.max(0, item.level - 1) * 12 + 8;
        const IconComponent = item.level === 1 ? Bookmark : item.level === 2 ? Layers : Hash;

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className={`outline-item level-${item.level}`}
            style={{ paddingLeft: `${indentPadding}px` }}
            onClick={() => onSelectHeading(item)}
            onKeyDown={(event) => selectOnKeyboard(event, () => onSelectHeading(item))}
            title={`Line ${item.lineNumber}: ${item.title} (${item.wordCount.toLocaleString()} words)`}
            aria-label={`Go to ${item.title}, line ${item.lineNumber}`}
          >
            <IconComponent size={13} className="outline-item-icon" />
            <span className="outline-item-label">{item.title}</span>
            <StatusBadge
              status={statuses[item.title]}
              onClick={(e) => {
                e.stopPropagation();
                onCycleStatus(item);
              }}
            />
            <span className="outline-item-words">{item.wordCount.toLocaleString()}w</span>
            <span className="outline-item-line">L{item.lineNumber}</span>
          </div>
        );
      })}
    </div>
  );
};
