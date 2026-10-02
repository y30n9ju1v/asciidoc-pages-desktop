import { useMemo, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { AppHeader } from './components/Layout/AppHeader';
import { BookOutlinePanel } from './components/Layout/BookOutlinePanel';
import { NewBookDialog } from './components/Layout/NewBookDialog';
import { BibliographyDialog } from './components/Layout/BibliographyDialog';
import { NoteTemplateDialog } from './components/Layout/NoteTemplateDialog';
import { RenderingTemplateDialog } from './components/Layout/RenderingTemplateDialog';
import { DocumentHistoryDialog } from './components/Layout/DocumentHistoryDialog';
import { WritingToolsDialog } from './components/Layout/WritingToolsDialog';
import { GraphViewDialog } from './components/Layout/GraphViewDialog';
import { Workspace } from './components/Layout/Workspace';
import { useDocument } from './hooks/useDocument';
import { useAppPreferences } from './hooks/useAppPreferences';
import { usePreview } from './hooks/usePreview';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import { useWorkspaceMode } from './hooks/useWorkspaceMode';
import { useBookPublicationLayout } from './hooks/useBookPublicationLayout';
import { previewStatusText, hasPublicationChanges } from './services/publicationStatus';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { parseOutline, OutlineItem } from './services/outlineService';
import { useVault } from './hooks/useVault';
import { useBookProject } from './hooks/useBookProject';
import { useChapterStatuses } from './hooks/useChapterStatuses';
import { useDocumentHistory } from './hooks/useDocumentHistory';
import { useWorkspaceCommands } from './hooks/useWorkspaceCommands';
import { findBacklinks } from './services/backlinkService';
import { findNotesByTag, listAllTags } from './services/tagService';
import { bibliographyOf, mergeBookMetadata } from './services/bookProjectService';
import type { BookProject } from './services/bookProjectService';
import { selectedBookNotes } from './services/bookProjectWorkspaceService';
import { runPreflight } from './services/preflightService';
import { lineForPreflightIssue, resolutionForPreflightIssue } from './services/preflightNavigationService';
import { collectRenderedImages } from './services/renderedImageAdapter';
import { calculateWritingStats } from './services/writingStatsService';
import { useBookProjectActions } from './hooks/useBookProjectActions';
import { useTypstPdfPreview } from './hooks/useTypstPdfPreview';
import { useCustomPublicationTemplates } from './hooks/useCustomPublicationTemplates';
import { useProjectPublicationTypography } from './hooks/useProjectPublicationTypography';
import { getPublicationStyle } from './services/publicationStyleService';
import {
  publicationStyleWithCurrentTypography,
  typographyFromPublicationStyle,
} from './services/publicationTypographyService';

function notifyLayoutSaved(styleName: string): void {
  toast.success('Publication layout saved', {
    description: `${styleName}, paper size and typography are saved with this book.`,
  });
}

const initialAsciiDocSample = `= Mastering AsciiDoc Publishing
:author: Antigravity Author
:email: author@example.com
:revdate: ${new Date().toISOString().split('T')[0]}
:toc: left
:icons: font
:source-highlighter: highlight.js

== Welcome to AsciiDoc Studio

This desktop publishing application allows you to edit **AsciiDoc** documents using Monaco Editor with live preview, and publish self-contained **HTML** or **EPUB3** documents seamlessly!

== Key Features

* **Monaco Editor Integration**: Full syntax highlighting for AsciiDoc.
* **Asciidoctor.js Engine**: Real-time HTML rendering.
* **HTML Export**: Self-contained, offline-safe HTML with print-ready styling.
* **EPUB3 Packaging**: Pure JavaScript EPUB generator with metadata support.

== Code Example

[source,typescript]
----
function generateEpub(title: string, author: string): void {
  console.log(\`Publishing \${title} by \${author}...\`);
}
----

== Mathematics

Inline mathematics is rendered with KaTeX, for example stem:[E = mc^2] and the quadratic formula stem:[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}].

.A simple integral
[stem]
++++
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
++++

== Footnotes and Endnotes

This sentence has a page footnote footnote:[Footnotes stay close to the passage they explain. In the PDF edition, Typst places it at the bottom of the relevant page.] so you can verify its marker and layout in every output.

For notes that belong at the end of a chapter or book, use an endnote:[A master AsciiDoc file can include focused chapter files and publish them as one manuscript. Run Preflight before publishing to catch broken links, missing include files, and incomplete book metadata.] instead. This keeps the main prose uninterrupted while preserving a stable, clickable reference in HTML, EPUB, and PDF.

== Admonition Blocks

NOTE: You can export your documents directly to standalone HTML or EPUB files via the top menu toolbar!

TIP: Use standard AsciiDoc section headings (\`== Section\`) to organize your book chapters.

== Structured Table

[cols="1,2,1", options="header"]
|===
| Format | Description | Target
| HTML5 | Self-contained Web Document | Web Browsers / Print
| EPUB3 | E-Book Specification | E-Readers (Kindle, Kobo, Books)
|===

== Mermaid Diagrams

[source,mermaid]
----
sequenceDiagram
    autonumber
    User->>MonacoEditor: Type AsciiDoc Content
    MonacoEditor->>Asciidoctor: Parse & Render Off-Thread
    Asciidoctor->>LivePreview: Deliver HTML Fragment
    LivePreview->>Mermaid.js: Render Inline SVG Diagram
----

== Multi-file Book Demo

To test how AsciiDoc composes a book from linked files, open a Vault and choose *Book* → *New book* → *Linked book demo*.
The generated \`main.adoc\` includes three chapters, and those chapters cross-reference one another. Open \`main.adoc\` to preview and publish them as one document.
`;

export function App() {
  const { vaultRoot, notes, chooseVaultFolder, refreshVault } = useVault();
  const {
    content,
    setContent,
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
  } = useDocument(initialAsciiDocSample, vaultRoot);
  const { project: savedBookProject, saveProject } = useBookProject(vaultRoot);
  // Not the derived bookMetadata below - bookMetadata depends on
  // renderResult.meta (it falls back to the manuscript's own doc
  // attributes), and renderResult is usePreview's own output, so going
  // through bookMetadata here would be circular.
  const bibliography = bibliographyOf(savedBookProject);
  const renderResult = usePreview(content, currentPath, notes, bibliography);
  const {
    currentPublicationStyle: appStyle,
    currentPageSize: appPageSize,
    colorMode,
    vimMode,
    editorFontSize,
    changePublicationStyle: changeAppStyle,
    changePageSize: changeAppPageSize,
    changeColorMode,
    changeVimMode,
    changeEditorFontSize,
  } = useAppPreferences();
  const bookLayout = useBookPublicationLayout(
    vaultRoot,
    savedBookProject,
    { styleId: appStyle, pageSizeId: appPageSize },
    (layout) => {
      changeAppStyle(layout.styleId);
      changeAppPageSize(layout.pageSizeId);
    },
    saveProject,
  );
  const currentPublicationStyle = bookLayout.layout.styleId;
  const currentPageSize = bookLayout.layout.pageSizeId;
  const changePublicationStyle = (styleId: typeof currentPublicationStyle) =>
    bookLayout.change({ ...bookLayout.layout, styleId });
  const changePageSize = (pageSizeId: typeof currentPageSize) =>
    bookLayout.change({ ...bookLayout.layout, pageSizeId });
  const [targetLineNumber, setTargetLineNumber] = useState<number | null>(null);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [bibliographyOpen, setBibliographyOpen] = useState(false);
  const [noteTemplatesOpen, setNoteTemplatesOpen] = useState(false);
  const [renderingTemplatesOpen, setRenderingTemplatesOpen] = useState(false);
  const workspaceMode = useWorkspaceMode();
  const [writingToolsOpen, setWritingToolsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const {
    sidebarWidth,
    editorPercent,
    isExplorerCollapsed,
    workspaceRef,
    startSidebarResize,
    startEditorResize,
    resizeSidebarByKeyboard,
    resizeEditorByKeyboard,
    toggleExplorer,
  } = useWorkspaceLayout();

  const outlineItems = useMemo(() => parseOutline(content), [content]);
  const { chapterStatuses, cycleStatus } = useChapterStatuses(currentPath);
  const {
    snapshots,
    error: historyError,
    refreshSnapshots,
    restoreSnapshot,
    readSnapshot,
  } = useDocumentHistory(vaultRoot, currentPath);
  const { saveAndRefreshVault } = useWorkspaceCommands({
    vaultRoot,
    notes,
    saveDocument,
    refreshVault,
    openFile,
    createAndOpenNote,
  });
  const customPublicationTemplates = useCustomPublicationTemplates(vaultRoot);
  const basePublicationStyle = useMemo(
    () =>
      customPublicationTemplates.styles.find((style) => style.id === currentPublicationStyle) ??
      getPublicationStyle(currentPublicationStyle),
    [currentPublicationStyle, customPublicationTemplates.styles],
  );
  const projectTypography = useProjectPublicationTypography({
    scopeKey: bookLayout.scopeKey,
    styleId: currentPublicationStyle,
    style: basePublicationStyle,
    savedProject: savedBookProject,
    manuscriptMetadata: renderResult.meta,
    saveProject: bookLayout.persist,
  });
  const publicationStyle = useMemo(
    () => publicationStyleWithCurrentTypography(basePublicationStyle, projectTypography.override),
    [basePublicationStyle, projectTypography.override],
  );

  const selectPublicationStyle = (styleId: typeof currentPublicationStyle) => {
    changePublicationStyle(styleId);
  };

  const backlinks = useMemo(() => (currentPath ? findBacklinks(currentPath, notes) : []), [currentPath, notes]);
  const allTags = useMemo(() => listAllTags(notes), [notes]);
  const bookMetadata = useMemo(
    () => mergeBookMetadata(savedBookProject?.metadata ?? null, renderResult.meta),
    [renderResult.meta, savedBookProject],
  );
  const typstPreview = useTypstPdfPreview(
    renderResult,
    currentPath,
    publicationStyle,
    currentPageSize,
    bookMetadata,
    vaultRoot,
    workspaceMode.mode === 'proof',
  );
  const bookNotes = useMemo(
    () => selectedBookNotes(savedBookProject?.chapters ?? [], notes),
    [notes, savedBookProject?.chapters],
  );
  const bookWritingStats = useMemo(
    () => calculateWritingStats(bookNotes.map((note) => note.content).join('\n')),
    [bookNotes],
  );
  const renderedImages = useMemo(() => collectRenderedImages(renderResult.html), [renderResult.html]);
  const { saveBookMetadata, saveBibliography, saveBookTarget, openNoteCreatedFromTemplate, createStarterBook } =
    useBookProjectActions({
      vaultRoot,
      savedProject: savedBookProject,
      manuscriptMetadata: renderResult.meta,
      bookMetadata,
      saveProject,
      refreshVault,
      openFile,
    });
  // Same 250ms debounce usePreview.ts already applies before re-rendering -
  // every other preflight check here is keyed off renderResult, which is
  // already debounced the same way, so depending on raw content directly
  // would be the odd one out: it would re-run inspectDocumentIntegrity's
  // regex scans over the full manuscript on every keystroke instead of every
  // debounce tick, undermining the exact typing-responsiveness guarantee the
  // debounce exists for.
  const debouncedContent = useDebouncedValue(content, 250);
  const preflight = useMemo(
    () =>
      runPreflight({
        renderResult,
        currentPath,
        vaultRoot,
        metadata: bookMetadata,
        images: renderedImages,
        content: debouncedContent,
        notes,
        pageSizeId: currentPageSize,
        publicationStyle,
      }),
    [
      bookMetadata,
      currentPath,
      vaultRoot,
      notes,
      renderResult,
      renderedImages,
      debouncedContent,
      currentPageSize,
      publicationStyle,
    ],
  );

  const saveBookProject = async (project: BookProject) => {
    await saveProject(project);
  };

  const assembleBook = async (project: BookProject) => {
    if (!vaultRoot) throw new Error('Open a Vault first.');
    if (isDirty) throw new Error('Save the open document before assembling the book.');
    const { assembleBookFromFiles } = await import('./services/bookManuscriptAdapter');
    await saveProject(project);
    const path = await assembleBookFromFiles(project, vaultRoot);
    await refreshVault();
    await openFile(path);
    toast.success('Book assembled in chapter order', {
      description: 'Review the snapshot, then use Publish. Reassemble after changing source notes.',
    });
  };

  const extractSelection = async (text: string): Promise<string> => {
    if (!vaultRoot || !currentPath) throw new Error('Open a Vault and save the source note first.');
    const { extractLinkedNote } = await import('./services/noteExtractionAdapter');
    const link = await extractLinkedNote(vaultRoot, currentPath, text);
    await refreshVault();
    return link;
  };

  const importMarkdown = async () => {
    try {
      if (!vaultRoot) throw new Error('Open a destination Vault first.');
      if (isDirty) throw new Error('Save the current document before importing.');
      const { importMarkdownFolder } = await import('./services/markdownImportAdapter');
      const report = await importMarkdownFolder(vaultRoot);
      if (!report) return;
      await refreshVault();
      await openFile(report);
      toast.success('Import complete', { description: 'Review the import report before publishing.' });
    } catch (error) {
      toast.error('Import failed', { description: String(error) });
    }
  };

  const handleSelectHeading = (item: OutlineItem) => {
    focusEditorLine(item.lineNumber);
  };

  const focusEditorLine = (lineNumber: number) => {
    setTargetLineNumber(null);
    setTimeout(() => {
      setTargetLineNumber(lineNumber);
    }, 0);
  };

  const handleResolvePreflightIssue = (issue: (typeof preflight.issues)[number]) => {
    const resolution = resolutionForPreflightIssue(issue);
    if (resolution === 'save') {
      void saveWorkspace();
      return;
    }
    if (resolution === 'open-folder') {
      void chooseVaultFolder();
      return;
    }
    if (resolution === 'editor') focusEditorLine(lineForPreflightIssue(content, issue));
  };

  const restoreDocumentSnapshot = async (snapshot: (typeof snapshots)[number]) => {
    setContent(await restoreSnapshot(snapshot));
  };

  const saveWorkspace = async () => {
    await saveAndRefreshVault();
    await refreshSnapshots();
  };

  return (
    <div className="app-container" data-color-mode={colorMode}>
      <Toaster closeButton position="bottom-right" theme={colorMode} />
      <AppHeader
        publicationTarget={bookLayout.target}
        publicationSaving={projectTypography.saving}
        previewStatus={previewStatusText(workspaceMode.mode === 'proof', typstPreview, content !== debouncedContent)}
        workspaceMode={workspaceMode.mode}
        onWorkspaceModeChange={workspaceMode.changeMode}
        defaultTypography={typographyFromPublicationStyle(basePublicationStyle)}
        fileName={currentPath ? currentPath.split('/').pop()! : 'Untitled.adoc'}
        currentPath={currentPath}
        isDirty={isDirty}
        onNew={newDocument}
        onOpen={openFileDialog}
        vaultRoot={vaultRoot}
        notes={notes}
        onQuickOpen={openFile}
        onSave={saveWorkspace}
        onSaveCopy={saveDocumentCopy}
        onImportMarkdown={() => void importMarkdown()}
        renderResult={renderResult}
        currentPublicationStyle={currentPublicationStyle}
        publicationStyles={customPublicationTemplates.styles}
        publicationStyle={publicationStyle}
        onPublicationStyleChange={selectPublicationStyle}
        currentPageSize={currentPageSize}
        onPageSizeChange={changePageSize}
        colorMode={colorMode}
        bookMetadata={bookMetadata}
        preflight={preflight}
        canSaveBookDetails={vaultRoot !== null}
        onSaveBookMetadata={saveBookMetadata}
        onResolvePreflightIssue={handleResolvePreflightIssue}
        onJumpToLine={focusEditorLine}
        onNewBook={() => setNewBookOpen(true)}
        onShowBibliography={() => setBibliographyOpen(true)}
        onShowNoteTemplates={() => setNoteTemplatesOpen(true)}
        onShowRenderingTemplates={() => setRenderingTemplatesOpen(true)}
        publicationTypographyOpen={workspaceMode.typesettingOpen}
        publicationTypography={projectTypography.typography}
        hasPublicationTypographyOverride={projectTypography.override !== null}
        hasUnsavedPublicationTypography={hasPublicationChanges(bookLayout.dirty, projectTypography.hasUnsavedChanges)}
        canSavePublicationTypography={vaultRoot !== null}
        onPublicationTypographyChange={projectTypography.change}
        onSavePublicationTypography={() =>
          void projectTypography
            .save()
            .then(() => notifyLayoutSaved(publicationStyle.name))
            .catch(() =>
              toast.error('Could not save page layout', { description: 'Your proofing changes remain available.' }),
            )
        }
        onResetPublicationTypography={projectTypography.reset}
        onTogglePublicationTypography={workspaceMode.toggleTypesetting}
        onShowHistory={() => setHistoryOpen(true)}
        onColorModeChange={changeColorMode}
        vimMode={vimMode}
        onVimModeChange={changeVimMode}
        editorFontSize={editorFontSize}
        onEditorFontSizeChange={changeEditorFontSize}
      />

      <Workspace
        onShowWritingTools={() => setWritingToolsOpen(true)}
        onShowGraph={() => setGraphOpen(true)}
        showPreview={workspaceMode.mode === 'proof'}
        bookOutline={
          <BookOutlinePanel
            vaultRoot={vaultRoot}
            project={savedBookProject}
            notes={notes}
            onSave={saveBookProject}
            onAssemble={assembleBook}
            onOpenFile={(path) => void openFile(path)}
          />
        }
        resizeSidebarByKeyboard={resizeSidebarByKeyboard}
        resizeEditorByKeyboard={resizeEditorByKeyboard}
        beforeMutation={() => {
          if (isDirty) throw new Error('Save or discard the open document before moving, renaming, or deleting files.');
        }}
        onExtractSelection={extractSelection}
        workspaceRef={workspaceRef}
        sidebarWidth={sidebarWidth}
        editorPercent={editorPercent}
        isExplorerCollapsed={isExplorerCollapsed}
        startSidebarResize={startSidebarResize}
        startEditorResize={startEditorResize}
        toggleExplorer={toggleExplorer}
        currentPath={currentPath}
        content={content}
        onContentChange={setContent}
        vimMode={vimMode}
        editorFontSize={editorFontSize}
        colorMode={colorMode}
        targetLineNumber={targetLineNumber}
        onOpenFile={openFile}
        outlineItems={outlineItems}
        onSelectHeading={handleSelectHeading}
        chapterStatuses={chapterStatuses}
        onCycleChapterStatus={cycleStatus}
        vaultRoot={vaultRoot}
        onChooseVaultFolder={chooseVaultFolder}
        backlinks={backlinks}
        tags={allTags}
        onFindNotesByTag={(tag) => findNotesByTag(tag, notes)}
        onEntryRenamed={handleExternalRename}
        onEntryDeleted={handleExternalDelete}
        onVaultMutated={refreshVault}
        typstPreview={typstPreview}
        onJumpToLine={focusEditorLine}
      />
      {vaultRoot && (
        <NewBookDialog key={vaultRoot} open={newBookOpen} onOpenChange={setNewBookOpen} onCreate={createStarterBook} />
      )}
      <WritingToolsDialog
        key={`writing-tools:${vaultRoot}:${savedBookProject?.targetWordCount ?? 0}:${writingToolsOpen}`}
        open={writingToolsOpen}
        onOpenChange={setWritingToolsOpen}
        documentStats={calculateWritingStats(content)}
        bookWords={bookWritingStats.words}
        bookTargetWordCount={savedBookProject?.targetWordCount ?? 0}
        canSaveBookTarget={vaultRoot !== null}
        onSaveBookTarget={saveBookTarget}
      />
      <DocumentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        snapshots={snapshots}
        error={historyError}
        currentContent={content}
        onRefresh={refreshSnapshots}
        onRead={readSnapshot}
        onRestore={restoreDocumentSnapshot}
        available={vaultRoot !== null && currentPath !== null}
      />
      <GraphViewDialog
        open={graphOpen}
        onOpenChange={setGraphOpen}
        vaultRoot={vaultRoot}
        notes={notes}
        project={savedBookProject}
        currentPath={currentPath}
        onOpenDocument={(path) => void openFile(path)}
      />
      <BibliographyDialog
        key={`bibliography:${vaultRoot}:${bibliography.length}:${bibliographyOpen}`}
        open={bibliographyOpen}
        onOpenChange={setBibliographyOpen}
        entries={bibliography}
        canPersist={vaultRoot !== null}
        onSave={saveBibliography}
      />
      <NoteTemplateDialog
        open={noteTemplatesOpen}
        onOpenChange={setNoteTemplatesOpen}
        vaultRoot={vaultRoot}
        currentContent={content}
        onNoteCreated={(path) => void openNoteCreatedFromTemplate(path)}
      />
      <RenderingTemplateDialog
        open={renderingTemplatesOpen}
        onOpenChange={setRenderingTemplatesOpen}
        vaultRoot={vaultRoot}
        templates={customPublicationTemplates.templates}
        busy={customPublicationTemplates.busy}
        error={customPublicationTemplates.error}
        onCreateTemplate={customPublicationTemplates.createTemplate}
        onDeleteTemplate={customPublicationTemplates.deleteTemplate}
        onSelectTemplate={(id) => {
          selectPublicationStyle(id as typeof currentPublicationStyle);
          setRenderingTemplatesOpen(false);
        }}
      />
    </div>
  );
}

export default App;
