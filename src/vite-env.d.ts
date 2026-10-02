/// <reference types="vite/client" />

declare module '*.css?raw' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

// Monaco's IME switch lives in its internal module tree and isn't re-exported
// from the public editor.api surface, so it ships no types for this path.
// See vs/base/common/ime.ts upstream - the shape is small and stable.
declare module 'monaco-editor/base/common/ime' {
  export const IME: {
    readonly enabled: boolean;
    enable(): void;
    disable(): void;
  };
}
