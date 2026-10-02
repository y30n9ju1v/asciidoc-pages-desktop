import { useEffect, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { saveDocumentSnapshot } from '../services/documentHistoryAdapter';
import { clearRecoverySnapshot } from '../services/recoveryService';
import { isOpenDocumentDeleted, remapOpenDocumentPath } from '../services/documentPathState';
import { createDocumentState, documentReducer, isDocumentDirty } from '../services/documentState';
import {
  chooseDocumentSavePath,
  chooseDocumentToOpen,
  documentExists,
  readDocumentText,
  writeDocumentText,
} from '../services/documentFileAdapter';
import { confirmDiscardChanges, showDocumentError } from '../services/documentDialogAdapter';
import { useDocumentCloseGuard } from './useDocumentCloseGuard';
import { useDocumentRecovery } from './useDocumentRecovery';

const BLANK_DOCUMENT =
  '= New Document\n:author: Author Name\n:toc:\n\n== Introduction\nWrite your AsciiDoc content here...\n';

/**
 * Single source of truth for the open document's lifecycle: content, dirty
 * tracking, new/open/save, crash-recovery autosave, and the close-window guard.
 * Both the header toolbar and the file explorer drive the document through
 * this hook instead of each re-implementing their own dirty-check/open/save logic.
 */
export function useDocument(initialContent: string, vaultRoot: string | null) {
  const [document, dispatch] = useReducer(documentReducer, initialContent, createDocumentState);
  const { content, currentPath } = document;
  const isDirty = isDocumentDirty(document);

  // Keep refs in sync so listeners registered once (autosave interval, close guard)
  // always see the latest values without needing to re-subscribe on every keystroke.
  const isDirtyRef = useRef(isDirty);
  const contentRef = useRef(content);
  const currentPathRef = useRef(currentPath);
  const savedContentRef = useRef(document.savedContent);
  const savingRef = useRef(false);
  const generationRef = useRef(0);
  const navigationRef = useRef(0);
  useEffect(() => {
    isDirtyRef.current = isDirty;
    contentRef.current = content;
    currentPathRef.current = currentPath;
    savedContentRef.current = document.savedContent;
  });

  const confirmDiscard = async (promptMessage: string): Promise<boolean> => {
    if (!isDirtyRef.current) return true;
    return confirmDiscardChanges(promptMessage);
  };

  const loadDocument = (text: string, path: string | null) => {
    navigationRef.current += 1;
    generationRef.current += 1;
    currentPathRef.current = path;
    contentRef.current = text;
    savedContentRef.current = text;
    isDirtyRef.current = false;
    dispatch({ type: 'load', content: text, path });
    void clearRecoverySnapshot().catch((err) => console.error('Failed to clear recovery snapshot:', err));
  };

  const newDocument = async () => {
    const request = ++navigationRef.current;
    const proceed = await confirmDiscard('Create a new document? Unsaved changes will be lost.');
    if (!proceed || request !== navigationRef.current) return;
    loadDocument(BLANK_DOCUMENT, null);
  };

  const openFile = async (path: string) => {
    const request = ++navigationRef.current;
    const proceed = await confirmDiscard('Opening a file will discard unsaved changes. Continue?');
    if (!proceed || request !== navigationRef.current) return;
    try {
      const text = await readDocumentText(path);
      if (request === navigationRef.current) loadDocument(text, path);
    } catch (err) {
      await showDocumentError('Open Failed', err);
    }
  };

  // Creates a brand-new note file at path (pre-filled with a `= title`
  // header) and opens it - the Obsidian "click an unresolved [[wikilink]]
  // to create that note" flow. See App.tsx's handleOpenWikilink.
  const createAndOpenNote = async (path: string, title: string) => {
    const request = ++navigationRef.current;
    const proceed = await confirmDiscard('Create a new note here? Unsaved changes will be lost.');
    if (!proceed || request !== navigationRef.current) return;

    const initial = `= ${title}\n\n`;
    try {
      await writeDocumentText(path, initial);
      if (request === navigationRef.current) loadDocument(initial, path);
    } catch (err) {
      await showDocumentError('Create Note Failed', err);
    }
  };

  const openFileDialog = async () => {
    const request = ++navigationRef.current;
    const proceed = await confirmDiscard('Opening a file will discard unsaved changes. Continue?');
    if (!proceed || request !== navigationRef.current) return;
    try {
      const selected = await chooseDocumentToOpen();
      if (selected && request === navigationRef.current) {
        const text = await readDocumentText(selected);
        if (request === navigationRef.current) loadDocument(text, selected);
      }
    } catch (err) {
      await showDocumentError('Open Failed', err);
    }
  };

  const saveDocument = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const generation = generationRef.current;
    try {
      const targetPath = currentPathRef.current ?? (await chooseDocumentSavePath());
      if (!targetPath) return;
      if (generation !== generationRef.current) return;

      const contentToSave = contentRef.current;
      const expected = currentPathRef.current ? savedContentRef.current : null;
      await savePriorVersion(vaultRoot, targetPath, contentToSave);
      await writeDocumentText(targetPath, contentToSave, expected);
      if (generation !== generationRef.current) return;
      dispatch({ type: 'save', content: contentToSave, path: targetPath });
      if (contentRef.current === contentToSave) await clearRecoverySnapshot();
      toast.success('File saved', { description: targetPath.split('/').pop() });
    } catch (err) {
      await showDocumentError('Save Failed', err);
    } finally {
      savingRef.current = false;
    }
  };

  const saveDocumentCopy = async () => {
    const generation = generationRef.current;
    try {
      const path = await chooseDocumentSavePath();
      if (!path) return;
      if (generation !== generationRef.current) return;
      const text = contentRef.current;
      await writeDocumentText(path, text);
      if (generation === generationRef.current) dispatch({ type: 'save', content: text, path });
      toast.success('Copy saved');
    } catch (error) {
      await showDocumentError('Save Copy Failed', error);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const path = currentPathRef.current;
      if (!path || isDirtyRef.current) return;
      try {
        const text = await readDocumentText(path);
        if (!cancelled && path === currentPathRef.current && !isDirtyRef.current)
          dispatch({ type: 'load', content: text, path });
      } catch {
        /* A deleted document is handled by the explicit delete flow. */
      }
    };
    const handle = () => {
      void refresh();
    };
    window.addEventListener('vault-files-changed', handle);
    window.addEventListener('focus', handle);
    return () => {
      cancelled = true;
      window.removeEventListener('vault-files-changed', handle);
      window.removeEventListener('focus', handle);
    };
  }, []);

  useDocumentRecovery({
    revision: navigationRef,
    initialContent,
    documentRefs: { content: contentRef, currentPath: currentPathRef, isDirty: isDirtyRef },
    dispatch,
  });
  useDocumentCloseGuard(isDirtyRef);

  // Keeps the open document pointed at the right file after it's renamed or
  // moved elsewhere in the file explorer (see FileExplorer.tsx) - without
  // this, saving after a rename would write to the old (now nonexistent)
  // path, silently recreating it instead of updating the file the user
  // actually renamed. A no-op if some other file is open.
  const handleExternalRename = (oldPath: string, newPath: string) => {
    const openPath = currentPathRef.current;
    const remappedPath = remapOpenDocumentPath(openPath, oldPath, newPath);
    if (remappedPath !== openPath && remappedPath) {
      currentPathRef.current = remappedPath;
      dispatch({ type: 'remap-path', path: remappedPath });
      window.dispatchEvent(new Event('vault-files-changed'));
    }
  };

  // Falls back to a blank, unsaved document if the file explorer just
  // deleted the one currently open - continuing to edit content whose file
  // no longer exists would either fail outright on the next save or
  // silently resurrect the deleted file. No confirmation prompt here: the
  // delete itself already asked (see FileExplorer.tsx's handleDelete).
  const handleExternalDelete = (path: string) => {
    const openPath = currentPathRef.current;
    if (isOpenDocumentDeleted(openPath, path)) {
      loadDocument(BLANK_DOCUMENT, null);
    }
  };

  return {
    content,
    setContent: (nextContent: string) => {
      navigationRef.current += 1;
      contentRef.current = nextContent;
      isDirtyRef.current = nextContent !== savedContentRef.current;
      dispatch({ type: 'edit', content: nextContent });
    },
    currentPath,
    isDirty,
    newDocument,
    openFile,
    createAndOpenNote,
    openFileDialog,
    saveDocument,
    saveDocumentCopy,
    handleExternalRename,
    handleExternalDelete,
  };
}

async function savePriorVersion(vaultRoot: string | null, targetPath: string, contentToSave: string): Promise<void> {
  if (!(await documentExists(targetPath))) return;
  const previousContent = await readDocumentText(targetPath);
  if (previousContent !== contentToSave) await saveDocumentSnapshot(vaultRoot, targetPath, previousContent);
}
