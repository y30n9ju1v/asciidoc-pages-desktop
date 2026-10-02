import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts (which is tailored for `tauri dev`/`tauri
// build` - fixed dev server port, src-tauri watch-ignore, monaco-vim alias) so running
// tests never depends on or risks touching that Tauri-specific setup. The one thing
// duplicated (not imported) from there is the "@" -> src alias: any component test that
// transitively imports a shadcn/ui component (which all use "@/lib/utils") needs it
// resolvable here too, same target, so it's kept in sync by hand rather than sharing
// config with the Tauri-specific file above.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'packages/asciidoc-typst/typescript/src/**/*.test.ts'],
  },
});
