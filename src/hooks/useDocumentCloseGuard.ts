import { MutableRefObject, useEffect } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

const UNSAVED_CHANGES_TITLE = 'Unsaved Changes';

/** Registers the native close-window guard once and always reads current dirty state. */
export function useDocumentCloseGuard(isDirty: MutableRefObject<boolean>): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!isDirty.current) return;
        const confirmed = await ask('You have unsaved changes. Are you sure you want to quit?', {
          title: UNSAVED_CHANGES_TITLE,
          kind: 'warning',
        });
        if (!confirmed) event.preventDefault();
      })
      .then((listener) => {
        unlisten = listener;
      });
    return () => unlisten?.();
  }, [isDirty]);
}
