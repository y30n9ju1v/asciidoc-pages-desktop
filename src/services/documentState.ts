/**
 * Functional core for an editor document. Filesystem and dialog operations
 * live in useDocument; this module only describes valid in-memory state
 * transitions, which makes dirty tracking independently testable.
 */
export interface DocumentState {
  content: string;
  savedContent: string;
  currentPath: string | null;
}

export type DocumentAction =
  | { type: 'edit'; content: string }
  | { type: 'load'; content: string; path: string | null }
  | { type: 'save'; content: string; path: string }
  | { type: 'recover'; content: string; path: string | null }
  | { type: 'remap-path'; path: string };

export function createDocumentState(content: string, path: string | null = null): DocumentState {
  return { content, savedContent: content, currentPath: path };
}

export function isDocumentDirty(state: DocumentState): boolean {
  return state.content !== state.savedContent;
}

export function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case 'edit':
      return { ...state, content: action.content };
    case 'load':
      return createDocumentState(action.content, action.path);
    case 'save':
      // Persist the snapshot that was actually written. If the user typed
      // while I/O was in flight, newer state remains dirty rather than being
      // incorrectly marked as saved.
      return { ...state, currentPath: action.path, savedContent: action.content };
    case 'recover':
      return { ...state, content: action.content, currentPath: action.path };
    case 'remap-path':
      return { ...state, currentPath: action.path };
  }
}
