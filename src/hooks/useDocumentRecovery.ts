import { Dispatch, MutableRefObject, useEffect } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { clearRecoverySnapshot, readRecoverySnapshot, writeRecoverySnapshot } from '../services/recoveryService';
import { DocumentAction } from '../services/documentState';

const AUTOSAVE_INTERVAL_MS = 15000;

interface DocumentRefs {
  content: MutableRefObject<string>;
  currentPath: MutableRefObject<string | null>;
  isDirty: MutableRefObject<boolean>;
}

interface UseDocumentRecoveryOptions {
  initialContent: string;
  documentRefs: DocumentRefs;
  dispatch: Dispatch<DocumentAction>;
  revision: MutableRefObject<number>;
}

function useRecoveryPrompt({ initialContent, dispatch, revision }: UseDocumentRecoveryOptions): void {
  useEffect(() => {
    let cancelled = false;
    const initialRevision = revision.current;
    const isCurrent = () => !cancelled && revision.current === initialRevision;

    void readRecoverySnapshot().then((snapshot) => {
      if (!isCurrent() || !snapshot?.content || snapshot.content === initialContent) return;

      // Waiting lets the macOS window finish presenting before its native dialog opens.
      setTimeout(() => {
        if (!isCurrent()) return;
        void ask('Unsaved work from a previous session was found. Restore it?', {
          title: 'Recover Document',
          kind: 'info',
        })
          .then(async (restore) => {
            if (!isCurrent()) return;
            if (!restore) {
              await clearRecoverySnapshot();
              return;
            }
            dispatch({ type: 'recover', content: snapshot.content, path: snapshot.path });
            revision.current += 1;
          })
          .catch((error) => console.error('Failed to prompt for recovery:', error));
      }, 500);
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, initialContent, revision]);
}

function useRecoveryAutosave({ content, currentPath, isDirty }: DocumentRefs): void {
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty.current) {
        void writeRecoverySnapshot(content.current, currentPath.current);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [content, currentPath, isDirty]);
}

/** Owns crash-recovery side effects; document editing itself remains in useDocument. */
export function useDocumentRecovery(options: UseDocumentRecoveryOptions): void {
  useRecoveryPrompt(options);
  useRecoveryAutosave(options.documentRefs);
}
