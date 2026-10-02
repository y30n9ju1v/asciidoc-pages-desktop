# Reliability regression checks

These checks supplement, rather than replace, signed macOS release testing.

## 1. Save and recovery failures

`src/hooks/useDocument.test.tsx` exercises the real hook with controlled filesystem/picker boundaries:

- Permission denial, disk-full errors and external modification conflicts preserve dirty edits, the current path and recovery data; retry uses the original comparison baseline.
- Cancelling the picker or failing the history backup prevents a manuscript write.
- Edits made during a save remain dirty, and simultaneous saves are serialized.

`src/services/recoveryService.test.ts` rejects malformed snapshots and checks failure handling without touching manuscript files. `src/hooks/useDocumentRecovery.test.tsx` prevents a delayed recovery answer from replacing newer work or deleting its recovery data.

The native `document_store` tests use real temporary files for conflict detection, scope rejection, and denied temporary-file creation. The permission test requires an unprivileged Unix user. Disk-full hook tests inject an error; they do **not** simulate an actual full volume, abrupt process termination or power loss.

## 2. Asynchronous document and folder changes

- An older open request cannot replace a newer open request or typing performed while reading.
- Completing a save does not change a subsequently opened document.
- `src/hooks/useBookProject.test.tsx` switches folders during a save and checks both the new project's visible state and its next-save comparison baseline.
- Existing queue, preview and book-layout tests continue covering latest-result selection and per-folder drafts.

## 3. Sample book → SafeDocument → native PDF

```sh
cd desktop-app
npm test -- --run
npm run test:publication
```

The second command requires the Rust build toolchain and Poppler's `pdftotext` on PATH. Missing prerequisites fail explicitly. It reads the current `sample-book/main.adoc`, uses the production recursive include resolver, normalizer and publication request builder, then passes the actual JSON contract to a Rust test bridge. All three built-in styles compile at A4 through the production asset loader, Typst writer and PDF compiler.

Assertions cover source assets/cover availability, diagnostics, cross-reference integrity, source labels, diagram asset references and extracted PDF text for chapters, author, footnotes, endnotes and bibliography. Test JSON/PDF/source artifacts are isolated in a fresh temporary directory and removed afterwards. The ordinary test suite runs the fast preparation check; native compilation is opt-in, not silently treated as a passing ordinary test.

Boundaries replaced for this test:

- Node reads files instead of the Tauri filesystem bridge.
- Mock Tauri scope stands in for the native folder picker.
- Mermaid diagrams use explicit SVG test doubles. Real Mermaid layout, clipping, page aesthetics and signed sandbox behavior still require browser/installed-app checks. Text extraction does not prove visual quality or PDF/A compliance.

The native bridge is ignored in ordinary `cargo test`; run it through `test:publication`, which supplies fresh request data. Existing native visual-regression tests remain separate.
