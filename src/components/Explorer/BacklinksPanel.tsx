import React from 'react';
import { Link2 } from 'lucide-react';
import { Backlink } from '../../services/backlinkService';

interface BacklinksPanelProps {
  backlinks: Backlink[];
  onOpenBacklink: (path: string) => void;
  hasVault: boolean;
}

/** Obsidian's backlinks panel: every other note in the vault that links to
 * the currently open one via [[wikilink]] - see backlinkService.ts. */
export const BacklinksPanel: React.FC<BacklinksPanelProps> = ({ backlinks, onOpenBacklink, hasVault }) => {
  if (!hasVault) {
    return <div className="explorer-empty">Open a folder to see backlinks from other notes.</div>;
  }
  if (backlinks.length === 0) {
    return <div className="explorer-empty">No other notes link here yet.</div>;
  }

  return (
    <div className="backlinks-list">
      {backlinks.map((backlink) => (
        <button
          key={backlink.path}
          type="button"
          className="backlink-item"
          onClick={() => onOpenBacklink(backlink.path)}
          aria-label={`Open backlink: ${backlink.title}`}
        >
          <div className="backlink-item-title">
            <Link2 size={13} className="backlink-item-icon" />
            <span>{backlink.title}</span>
          </div>
          {backlink.snippet && <p className="backlink-item-snippet">{backlink.snippet}</p>}
        </button>
      ))}
    </div>
  );
};
