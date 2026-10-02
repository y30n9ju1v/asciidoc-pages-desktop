import { safeGetItem, safeSetItem } from './localStorageSafe';
import {
  getPublicationStyle,
  PUBLICATION_STYLES,
  type FontRole,
  type PublicationStyleId,
  type PublicationStyleOption,
} from './publicationStyleService';

/**
 * Legacy adapter for integrations written before Publication Style existed.
 * Application UI must select PublicationStyleId only; this module preserves
 * stable export contracts while mapping their typography to that catalog.
 */
export type LegacyPublishTemplateId = 'manuscript' | 'novel' | 'technical-book';
export type PublishTemplateId = LegacyPublishTemplateId | PublicationStyleId;
export type { FontRole };

export interface PublishTemplateOption {
  id: string;
  name: string;
  description: string;
  bodyFont: FontRole;
  headingFont: FontRole;
  baseFontSizePt: number;
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  paragraphSpacingEm: number;
  firstLineIndentEm: number;
  headingNumbering: boolean;
  bodyJustification: boolean;
  chapterStartsOnNewPage: boolean;
  /** Optional #rrggbb, independently validated by the native writer. */
  accentColor?: string;
}

/** Produces the IPC-safe Typst settings from a complete publication style.
 * Custom styles use one of the vetted built-in layout families rather than
 * sending a user-controlled template ID to Rust. */
function publishTemplateFromPublicationStyle(style: PublicationStyleOption): PublishTemplateOption {
  return {
    id: style.baseStyleId,
    name: style.name,
    description: style.description,
    ...style.typst,
    accentColor: style.accentColor,
  };
}

const styleTemplate = (id: LegacyPublishTemplateId, styleId: 'book-serif' | 'literary' | 'reference', name: string) => {
  const style = getPublicationStyle(styleId);
  return { id, name, description: style.description, ...style.typst };
};

export const DEFAULT_PUBLISH_TEMPLATE_ID: LegacyPublishTemplateId = 'manuscript';
const PUBLISH_TEMPLATES: Record<LegacyPublishTemplateId, PublishTemplateOption> = {
  manuscript: styleTemplate('manuscript', 'book-serif', 'Manuscript'),
  novel: styleTemplate('novel', 'literary', 'Novel'),
  'technical-book': styleTemplate('technical-book', 'reference', 'Technical Book'),
};
export const PUBLISH_TEMPLATE_LIST = Object.values(PUBLISH_TEMPLATES);

export function getPublishTemplate(id: PublishTemplateId | PublicationStyleOption): PublishTemplateOption {
  if (typeof id !== 'string') return publishTemplateFromPublicationStyle(id);
  if (id in PUBLICATION_STYLES) {
    const style = getPublicationStyle(id as PublicationStyleId);
    return publishTemplateFromPublicationStyle(style);
  }
  return PUBLISH_TEMPLATES[id as LegacyPublishTemplateId] ?? PUBLISH_TEMPLATES[DEFAULT_PUBLISH_TEMPLATE_ID];
}

const STORAGE_KEY = 'asciidoc-studio:publish-template';
export function loadStoredPublishTemplateId(): LegacyPublishTemplateId {
  const stored = safeGetItem(STORAGE_KEY);
  return stored && stored in PUBLISH_TEMPLATES ? (stored as LegacyPublishTemplateId) : DEFAULT_PUBLISH_TEMPLATE_ID;
}
export function storePublishTemplateId(id: LegacyPublishTemplateId): void {
  safeSetItem(STORAGE_KEY, id);
}
