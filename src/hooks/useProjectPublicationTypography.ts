import { useCallback, useMemo, useState } from 'react';
import { createBookProject, type BookProject, withPublicationTypographyOverride } from '../services/bookProjectService';
import type { AsciidocDocMeta } from '../services/asciidocService';
import {
  currentPublicationTypography,
  isSamePublicationTypography,
  type PublicationTypography,
} from '../services/publicationTypographyService';
import type { PublicationStyleId, PublicationStyleOption } from '../services/publicationStyleService';

interface UseProjectPublicationTypographyInput {
  scopeKey?: string;
  styleId: PublicationStyleId;
  style: PublicationStyleOption;
  savedProject: BookProject | null;
  manuscriptMetadata: AsciidocDocMeta;
  saveProject: (project: BookProject) => Promise<void>;
}

/**
 * Keeps temporary proofing changes separate from the project-backed value.
 * A pending edit is never mistaken for a saved publishing decision, and a
 * style switch simply selects that style's own pending or persisted value.
 */
export function useProjectPublicationTypography({
  scopeKey = 'single-document',
  styleId,
  style,
  savedProject,
  manuscriptMetadata,
  saveProject,
}: UseProjectPublicationTypographyInput) {
  const [pendingOverrides, setPendingOverrides] = useState<Partial<Record<string, PublicationTypography | null>>>({});
  const savedOverride = savedProject?.publicationTypographyOverrides[styleId] ?? null;
  const draftKey = JSON.stringify([scopeKey, styleId]);
  const hasPendingOverride = Object.prototype.hasOwnProperty.call(pendingOverrides, draftKey);
  const override = hasPendingOverride ? (pendingOverrides[draftKey] ?? null) : savedOverride;
  const [saving, setSaving] = useState(false);
  const typography = useMemo(() => currentPublicationTypography(style, override), [override, style]);

  const change = useCallback(
    (next: PublicationTypography) => setPendingOverrides((current) => ({ ...current, [draftKey]: next })),
    [draftKey],
  );
  const reset = useCallback(() => setPendingOverrides((current) => ({ ...current, [draftKey]: null })), [draftKey]);
  const save = useCallback(async () => {
    const project = savedProject ?? createBookProject(manuscriptMetadata);
    setSaving(true);
    try {
      await saveProject(withPublicationTypographyOverride(project, styleId, override));
      setPendingOverrides((current) => {
        if (current[draftKey] !== override) return current;
        const remaining = { ...current };
        delete remaining[draftKey];
        return remaining;
      });
      return override !== null;
    } finally {
      setSaving(false);
    }
  }, [manuscriptMetadata, override, saveProject, savedProject, styleId, draftKey]);

  return {
    typography,
    saving,
    override,
    hasUnsavedChanges: !isSamePublicationTypography(override, savedOverride),
    change,
    reset,
    save,
  };
}
