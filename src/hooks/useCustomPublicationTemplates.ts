import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCustomPublicationTemplate,
  publicationStyleFromCustomTemplate,
  type CreateCustomPublicationTemplateInput,
  type CustomPublicationTemplate,
} from '../services/customPublicationTemplateService';
import {
  deleteCustomPublicationTemplate,
  listCustomPublicationTemplates,
  saveCustomPublicationTemplate,
} from '../services/customPublicationTemplateAdapter';
import { PUBLICATION_STYLE_LIST, type PublicationStyleId } from '../services/publicationStyleService';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads rendering-template files for the current vault and owns their small
 * create/delete flow. Components receive data and callbacks, never Tauri I/O. */
export function useCustomPublicationTemplates(vaultRoot: string | null) {
  const [templates, setTemplates] = useState<CustomPublicationTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!vaultRoot) {
      setTemplates([]);
      return;
    }
    try {
      const loaded = await listCustomPublicationTemplates(vaultRoot);
      setTemplates(loaded);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [vaultRoot]);

  useEffect(() => {
    let active = true;
    if (!vaultRoot) {
      queueMicrotask(() => {
        if (active) setTemplates([]);
      });
      return () => {
        active = false;
      };
    }
    void listCustomPublicationTemplates(vaultRoot)
      .then((loaded) => {
        if (!active) return;
        setTemplates(loaded);
        setError(null);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [vaultRoot]);

  const createTemplate = useCallback(
    async (input: CreateCustomPublicationTemplateInput): Promise<CustomPublicationTemplate | null> => {
      if (!vaultRoot) return null;
      setBusy(true);
      try {
        const ids: PublicationStyleId[] = [
          ...PUBLICATION_STYLE_LIST.map((style) => style.id),
          ...templates.map((style) => style.id),
        ];
        const template = createCustomPublicationTemplate(input, ids);
        await saveCustomPublicationTemplate(vaultRoot, template);
        setTemplates((current) => [...current, template].sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
        return template;
      } catch (reason) {
        setError(errorMessage(reason));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [templates, vaultRoot],
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      if (!vaultRoot) return false;
      setBusy(true);
      try {
        await deleteCustomPublicationTemplate(vaultRoot, id);
        setTemplates((current) => current.filter((template) => template.id !== id));
        setError(null);
        return true;
      } catch (reason) {
        setError(errorMessage(reason));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot],
  );

  const styles = useMemo(
    () => [...PUBLICATION_STYLE_LIST, ...templates.map(publicationStyleFromCustomTemplate)],
    [templates],
  );

  return { templates, styles, error, busy, refresh, createTemplate, deleteTemplate };
}
