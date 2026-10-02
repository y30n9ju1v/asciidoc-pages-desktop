import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { createRequire } from 'node:module';

const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);

/**
 * A package's own root directory, from an entry file resolved through its
 * "exports" map (which usually excludes "./package.json", so that can't be
 * resolved directly). Used instead of a hard-coded relative path so this
 * keeps working whether npm nests a copy under desktop-app/node_modules or
 * hoists a single shared one to the workspace root - both are valid outcomes
 * of a clean `npm install` once every workspace's version range agrees, and
 * a hard-coded path silently breaks the moment npm picks the other layout.
 */
function packageRootOf(packageName: string): string {
  const marker = `${path.sep}node_modules${path.sep}${packageName}${path.sep}`;
  const entryPath = require.resolve(packageName);
  const markerIndex = entryPath.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error(`Could not locate ${packageName}'s package root from ${entryPath}`);
  return entryPath.slice(0, markerIndex + marker.length - 1);
}

const desktopMonacoPath = packageRootOf('monaco-editor');
const monacoVimEsmPath = path.resolve(path.dirname(require.resolve('monaco-vim/package.json')), 'dist/index.mjs');
const monacoEditorApiPath = path.join(desktopMonacoPath, 'esm/vs/editor/editor.api.js');
const monacoShiftCommandPath = path.join(desktopMonacoPath, 'esm/vs/editor/common/commands/shiftCommand.js');

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: [
      // monaco-vim is hoisted to the workspace root, where another workspace
      // uses a newer Monaco. Force every runtime Monaco import (including
      // monaco-vim's) to this app's audited, compatible copy.
      // Keep Monaco-Vim on this app's copy without intercepting Monaco's
      // documented subpath exports (for example `editor/editor.api`).
      { find: /^monaco-editor$/, replacement: desktopMonacoPath },
      // Monaco-Vim 0.4.4 still refers to two pre-0.56 private paths. Map
      // only those legacy imports to their current files; application code
      // uses Monaco's package-exported paths above.
      { find: /^monaco-editor\/esm\/vs\/editor\/editor\.api$/, replacement: monacoEditorApiPath },
      {
        find: /^monaco-editor\/esm\/vs\/editor\/common\/commands\/shiftCommand$/,
        replacement: monacoShiftCommandPath,
      },
      // monaco-vim's package.json "exports" map lists a "browser" condition
      // (its UMD bundle) before "import" (its real ESM build), and that's
      // the condition Vite's dev-server resolver picks when the package
      // isn't pre-bundled - see the optimizeDeps.exclude comment below. The
      // UMD bundle isn't statically analyzable for named exports, so
      // `import { initVimMode } from 'monaco-vim'` fails at runtime with
      // "Importing binding name 'initVimMode' is not found". Aliasing
      // straight to the ESM build sidesteps the exports-condition ambiguity
      // entirely, and as a bonus that build imports monaco-editor with real
      // `import` statements instead of the UMD build's `require()`, so it
      // never hits the dynamic-require problem either.
      { find: 'monaco-vim', replacement: monacoVimEsmPath },
      // shadcn/ui's conventional import alias (components.json, tsconfig.json
      // both point here too) - components generated/edited via `shadcn add`
      // import each other as "@/components/ui/button" etc.
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
    ],
    // The monorepo also installs Monaco for the web editor. Alias rewrites
    // source imports, while dedupe prevents Vite from retaining a second
    // runtime instance through a transitive dependency such as monaco-vim.
    dedupe: ['monaco-editor'],
  },

  worker: {
    format: 'es' as const,
  },

  optimizeDeps: {
    // monacoSetup.ts imports monaco-editor's worker file with Vite's `?worker`
    // suffix, which needs the worker plugin's handling, not esbuild's
    // dependency pre-bundling. When both try to claim it, the pre-bundler's
    // scanner silently never registers a `.vite/deps` entry for the `?worker`
    // specifier, so the browser keeps requesting a chunk that was never
    // built - a permanent "504 Outdated Optimize Dep" that a `.vite` cache
    // clear or a page reload can't fix, since the *source* of the mismatch
    // (the scan itself) reproduces identically every time. Excluding the
    // whole package (already alias-pinned to this app's own copy above) is
    // dev-server-only - production's `npm run build` does a full Rollup
    // bundle and never touches this cache.
    //
    // monaco-vim is aliased above to its ESM build, which imports
    // monaco-editor the same way - excluding it too keeps both packages out
    // of the pre-bundle pass together, consistent with the alias above.
    exclude: ['monaco-editor', 'monaco-vim'],
  },

  build: {
    // Shiki's per-language grammar/theme chunks (asciidoc's embedded-language
    // highlighting) are lazy-loaded on demand, not part of the initial bundle,
    // so their individual size isn't a startup-perf concern.
    // Monaco's minimum standalone editor core remains 2.7 MB raw / ~717 KB
    // gzip. It is already loaded only by App's lazy editor pane, while the
    // optional Vim engine is a separate on-demand chunk. Keep a realistic
    // budget that flags growth beyond this audited payload instead of warning
    // on the intentional baseline for every release build.
    chunkSizeWarningLimit: 3000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
