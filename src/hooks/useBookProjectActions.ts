import { useCallback } from 'react';
import type { AsciidocDocMeta } from '../services/asciidocService';
import type { BibliographyEntry } from '../services/bibliographyService';
import { type BookMetadata, type BookProject, createBookProject } from '../services/bookProjectService';
import {
  projectForBookTemplate,
  type BookTemplateInput,
  createBookTemplatePlan,
} from '../services/bookTemplateService';
import { writeBookTemplate } from '../services/bookTemplateAdapter';
import { notifyBookDetailsSaved } from '../services/workspaceDialogService';

interface BookProjectActionsOptions {
  vaultRoot: string | null;
  savedProject: BookProject | null;
  manuscriptMetadata: AsciidocDocMeta;
  bookMetadata: BookMetadata;
  saveProject: (project: BookProject) => Promise<void>;
  refreshVault: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
}

/** Coordinates persisted Book Project workflows while keeping App as composition only. */
export function useBookProjectActions({
  vaultRoot,
  savedProject,
  manuscriptMetadata,
  bookMetadata,
  saveProject,
  refreshVault,
  openFile,
}: BookProjectActionsOptions) {
  const projectOrDefault = useCallback(
    () => savedProject ?? createBookProject(manuscriptMetadata),
    [manuscriptMetadata, savedProject],
  );

  const saveBookMetadata = useCallback(
    async (metadata: BookMetadata) => {
      await saveProject({ ...projectOrDefault(), metadata });
      await notifyBookDetailsSaved();
    },
    [projectOrDefault, saveProject],
  );

  const saveBibliography = useCallback(
    async (entries: BibliographyEntry[]) => {
      const project = projectOrDefault();
      await saveProject({ ...project, metadata: { ...project.metadata, bibliography: entries } });
    },
    [projectOrDefault, saveProject],
  );

  const saveBookTarget = useCallback(
    async (targetWordCount: number) => {
      await saveProject({ ...projectOrDefault(), metadata: bookMetadata, targetWordCount });
    },
    [bookMetadata, projectOrDefault, saveProject],
  );

  const openNoteCreatedFromTemplate = useCallback(
    async (path: string) => {
      await refreshVault();
      await openFile(path);
    },
    [openFile, refreshVault],
  );

  const createStarterBook = useCallback(
    async (input: BookTemplateInput) => {
      if (!vaultRoot) throw new Error('Open a Vault before creating a book.');
      const plan = createBookTemplatePlan(input);
      const mainDocumentPath = await writeBookTemplate(vaultRoot, plan);
      await saveProject(projectForBookTemplate(vaultRoot, plan));
      await refreshVault();
      await openFile(mainDocumentPath);
    },
    [openFile, refreshVault, saveProject, vaultRoot],
  );

  return {
    saveBookMetadata,
    saveBibliography,
    saveBookTarget,
    openNoteCreatedFromTemplate,
    createStarterBook,
  };
}
