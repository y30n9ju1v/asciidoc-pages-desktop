import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: () => Worker;
    };
  }
}

// Monaco needs its web worker environment configured before any editor is
// created, or it silently degrades to slower main-thread-only behavior.
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};
