import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const minimumVersion = [3, 4, 13];

function parsedVersion(source) {
  const match = source.match(/DOMPurify (\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error('Could not determine the DOMPurify source version.');
  return match.slice(1).map(Number);
}

function isAtLeast(version, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

const domPurifyEntry = require.resolve('dompurify');
const safeSourcePath = join(dirname(domPurifyEntry), 'purify.es.mjs');
// Monaco 0.56 restricts its package export map and no longer exposes
// `monaco-editor/package.json`. Resolve the public entrypoint instead, then
// walk from `min/vs/index.js` to the package root. This keeps the script
// compatible with both the public npm package API and the newer layout.
const monacoEntry = require.resolve('monaco-editor');
const monacoRootPath = resolve(dirname(monacoEntry), '..', '..');
const monacoTargetPath = join(monacoRootPath, 'esm/vs/base/browser/dompurify/dompurify.js');
const safeSource = await readFile(safeSourcePath, 'utf8');

if (!isAtLeast(parsedVersion(safeSource), minimumVersion)) {
  throw new Error(`DOMPurify ${minimumVersion.join('.')} or later is required for Monaco's bundled sanitizer.`);
}

await copyFile(safeSourcePath, monacoTargetPath);

// Monaco 0.53's npm archive omits source maps for these generated files even
// though their sourceMappingURL comments point to them. Vite reads that
// comment before plugin transforms run and emits a warning on every test run.
// Remove only the broken third-party references; this never affects our own
// application source maps.
async function removeBrokenSourceMapReference(path) {
  const source = await readFile(path, 'utf8');
  await writeFile(path, source.replace(/\n\/\/# sourceMappingURL=[^\n]+\s*$/, ''));
}

await Promise.all([
  removeBrokenSourceMapReference(monacoTargetPath),
  removeBrokenSourceMapReference(join(monacoRootPath, 'esm/vs/base/common/marked/marked.js')),
]);
