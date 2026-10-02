import { useState } from 'react';
import { safeGetItem, safeSetItem } from '../services/localStorageSafe';

export type WorkspaceMode = 'write' | 'proof';
const KEY = 'asciidoc-studio:workspace-mode';

export function useWorkspaceMode() {
  const [mode, setMode] = useState<WorkspaceMode>(() => (safeGetItem(KEY) === 'proof' ? 'proof' : 'write'));
  const [typesettingOpen, setTypesettingOpen] = useState(false);
  return {
    mode,
    typesettingOpen: mode === 'proof' && typesettingOpen,
    changeMode: (next: WorkspaceMode) => {
      setMode(next);
      safeSetItem(KEY, next);
    },
    toggleTypesetting: () => {
      if (mode === 'write') {
        setMode('proof');
        safeSetItem(KEY, 'proof');
        setTypesettingOpen(true);
      } else setTypesettingOpen((open) => !open);
    },
  };
}
