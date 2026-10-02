import React, { useState } from 'react';
import { ArrowLeft, Hash } from 'lucide-react';
import { TagCount } from '../../services/tagService';
import { VaultNote } from '../../services/vaultService';

interface TagsPanelProps {
  tags: TagCount[];
  hasVault: boolean;
  /** Recomputed by the caller for whichever tag is currently selected - see
   * App.tsx/FileExplorer.tsx, mirroring how backlinks is already computed
   * outside this component rather than duplicating vault-wide logic here. */
  notesForSelectedTag: (tag: string) => VaultNote[];
  onOpenNote: (path: string) => void;
}

/** Obsidian's tags pane: every #tag used anywhere in the vault, and which
 * notes use a selected one - see tagService.ts. */
export const TagsPanel: React.FC<TagsPanelProps> = ({ tags, hasVault, notesForSelectedTag, onOpenNote }) => {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  if (!hasVault) {
    return <div className="explorer-empty">Open a folder to see tags across your notes.</div>;
  }
  if (tags.length === 0) {
    return <div className="explorer-empty">No tags yet - write #a-tag anywhere in a note.</div>;
  }

  if (selectedTag) {
    const notes = notesForSelectedTag(selectedTag);
    return (
      <div className="tags-list">
        <button type="button" className="tag-back-button" onClick={() => setSelectedTag(null)}>
          <ArrowLeft size={13} /> All tags
        </button>
        <div className="tag-selected-header">
          <Hash size={13} /> {selectedTag}
        </div>
        {notes.map((note) => (
          <button
            key={note.path}
            type="button"
            className="backlink-item"
            onClick={() => onOpenNote(note.path)}
            aria-label={`Open note: ${note.title}`}
          >
            <div className="backlink-item-title">
              <span>{note.title}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="tags-list">
      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          className="tag-item"
          onClick={() => setSelectedTag(tag)}
          aria-label={`Show notes tagged ${tag}`}
        >
          <span className="tag-item-name">
            <Hash size={13} className="backlink-item-icon" /> {tag}
          </span>
          <span className="tag-item-count">{count}</span>
        </button>
      ))}
    </div>
  );
};
