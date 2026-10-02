import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import { IME } from 'monaco-editor/base/common/ime';
// We deliberately load Monaco's minimal `editor.api` entry point rather than
// `editor.main` (which drags in every bundled language and inflates the bundle
// several-fold). That entry point ships no editor *contributions*, though, and
// monaco-vim delegates two of its commands to built-in Monaco actions: `o`/`O`
// to insertLineAfter, and `=` to formatSelection. Without these registered,
// those keys throw "command not found" and leave Vim in an inconsistent state.
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/format/browser/formatActions';
import type { VimAdapterInstance } from 'monaco-vim';
import {
  asciidocLanguageId,
  asciidocDarkThemeId,
  asciidocLightThemeId,
  ensureAsciidocHighlighting,
} from './shikiHighlighter';
import { remapHangulKeydown } from './koreanVimKeymap';
import { ColorMode } from '../../services/themeService';
import { toast } from 'sonner';

interface AsciidocEditorProps {
  onExtractSelection?: (text: string) => Promise<string>;
  value: string;
  onChange: (value: string) => void;
  vimMode: boolean;
  colorMode: ColorMode;
  fontSize: number;
  targetLineNumber?: number | null;
}

export const AsciidocEditor: React.FC<AsciidocEditorProps> = ({
  onExtractSelection,
  value,
  onChange,
  vimMode,
  colorMode,
  fontSize,
  targetLineNumber,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isUpdatingFromProp = useRef<boolean>(false);
  const vimSubModeRef = useRef<string>('normal');
  const [highlightingReady, setHighlightingReady] = useState(false);
  const extractRef = useRef(onExtractSelection);
  useEffect(() => {
    extractRef.current = onExtractSelection;
  }, [onExtractSelection]);

  const activeMonacoTheme = colorMode === 'dark' ? asciidocDarkThemeId : asciidocLightThemeId;

  useEffect(() => {
    let cancelled = false;
    ensureAsciidocHighlighting().then(() => {
      if (!cancelled) setHighlightingReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Update Monaco theme when colorMode changes
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(activeMonacoTheme);
    }
  }, [activeMonacoTheme]);

  // Updating Monaco options preserves the current model, undo stack, cursor,
  // and Vim adapter; recreating the editor for a visual preference would not.
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  // Jump to specific line number when triggered from Document Outline
  useEffect(() => {
    if (editorRef.current && targetLineNumber && targetLineNumber > 0) {
      editorRef.current.revealLineInCenter(targetLineNumber);
      editorRef.current.setPosition({ lineNumber: targetLineNumber, column: 1 });
      editorRef.current.focus();
    }
  }, [targetLineNumber]);

  // Initialize vanilla Monaco Editor directly on DOM container, once the
  // AsciiDoc TextMate grammar/theme has finished loading.
  useEffect(() => {
    if (!containerRef.current || !highlightingReady) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: value,
      language: asciidocLanguageId,
      theme: activeMonacoTheme,
      fontSize,
      fontFamily: "Fira Code, Consolas, 'Courier New', monospace",
      lineNumbers: 'on',
      wordWrap: 'on',
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      readOnly: false,
      tabSize: 2,
    });

    editorRef.current = editor;
    editor.addAction({
      id: 'extract-linked-note',
      label: 'Extract selection to linked note',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 4,
      precondition: 'editorHasSelection',
      run: async () => {
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection || !extractRef.current) return;
        const version = model.getVersionId();
        try {
          const link = await extractRef.current(model.getValueInRange(selection));
          if (model.isDisposed() || model.getVersionId() !== version) {
            toast.info('Note created. Source changed; insert its link manually.');
            return;
          }
          editor.pushUndoStop();
          editor.executeEdits('extract-note', [{ range: selection, text: link }]);
          editor.pushUndoStop();
        } catch (error) {
          toast.error(String(error));
        }
      },
    });

    // Listen to typing & content changes
    const subscription = editor.onDidChangeModelContent(() => {
      if (isUpdatingFromProp.current) return;
      const currentVal = editor.getValue();
      onChange(currentVal);
    });

    // Auto-focus editor on load
    editor.focus();

    return () => {
      subscription.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightingReady]);

  // Attach/detach monaco-vim once the editor exists and whenever the toggle changes.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !vimMode) return;
    let cancelled = false;
    let remapSub: monaco.IDisposable | null = null;
    let vimAdapter: VimAdapterInstance | null = null;

    // With a CJK input method active, pressing a key composes text through the
    // IME (compositionstart/-end on Monaco's hidden textarea) rather than going
    // through keydown, and keydown's preventDefault() does not stop that - so in
    // Normal mode the jamo would land in the document instead of running the Vim
    // command. Monaco exposes a first-class switch for exactly this: disabling
    // the IME makes it mark its hidden textarea readonly, which suppresses
    // composition outright while keydown still fires normally. So we disable the
    // IME for every mode except Insert, and restore it on the way back.
    const syncIme = (subMode: string) => {
      vimSubModeRef.current = subMode;
      if (subMode === 'insert') {
        IME.enable();
      } else {
        IME.disable();
      }
    };
    syncIme('normal');

    // Belt and braces: even with composition suppressed, a platform may still
    // report the localized character (e.g. "ㄹ") as KeyboardEvent.key. This
    // listener runs before monaco-vim's own, so the key is normalized back to
    // its QWERTY equivalent before monaco-vim resolves which command it is.
    // Vim mode is opt-in, so do not make every editor startup download its
    // command engine. The dynamic import also isolates its sizeable keymap
    // from the normal editing path in the production bundle.
    void import('monaco-vim')
      .then(({ initVimMode }) => {
        if (cancelled) return;
        remapSub = editor.onKeyDown((e) => {
          if (vimSubModeRef.current !== 'insert') {
            remapHangulKeydown(e.browserEvent);
          }
        });

        // monaco-vim is hoisted in this multi-workspace repository, so its
        // .d.ts can resolve a sibling workspace's Monaco version even though
        // Vite aliases its runtime import to this app's copy. Both versions
        // expose this stable editor surface; keep that package-resolution
        // detail out of the runtime path with a narrow boundary cast.
        vimAdapter = initVimMode(editor as unknown as Parameters<typeof initVimMode>[0], statusBarRef.current);
        vimAdapter.on('vim-mode-change', (ev: { mode: string }) => syncIme(ev.mode));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          IME.enable();
          console.error('Could not enable Vim mode:', error);
        }
      });

    return () => {
      cancelled = true;
      remapSub?.dispose();
      vimAdapter?.dispose();
      // IME.enabled is global state - never leave it off once Vim mode is
      // switched off or the editor unmounts.
      IME.enable();
    };
  }, [vimMode, highlightingReady]);

  // Synchronize external value changes (e.g. Open File, New File)
  useEffect(() => {
    if (!editorRef.current) return;
    const currentVal = editorRef.current.getValue();
    if (currentVal !== value) {
      isUpdatingFromProp.current = true;
      editorRef.current.setValue(value);
      isUpdatingFromProp.current = false;
    }
  }, [value]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {vimMode && <div ref={statusBarRef} className="vim-status-bar" />}
    </div>
  );
};
