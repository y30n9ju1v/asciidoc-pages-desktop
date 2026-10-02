import { safeGetItem, safeSetItem } from './localStorageSafe';

export type PageSizeId = 'B5' | 'A4' | 'A5' | 'Letter';

export const DEFAULT_PAGE_SIZE_ID: PageSizeId = 'B5';

export interface PageSizeOption {
  id: PageSizeId;
  name: string;
  dimensions: string;
  widthPx: number;
  description: string;
  printSize: string;
  /** CSS @page margin shorthand for exported HTML printing (top right bottom left) */
  printMargin: string;
}

const PAGE_SIZES: Record<PageSizeId, PageSizeOption> = {
  B5: {
    id: 'B5',
    name: 'B5 Standard',
    dimensions: '182 × 257 mm',
    widthPx: 688,
    description: 'Technical & academic book standard',
    printSize: '182mm 257mm',
    printMargin: '15mm 15mm 18mm 15mm',
  },
  A4: {
    id: 'A4',
    name: 'A4 Manual',
    dimensions: '210 × 297 mm',
    widthPx: 794,
    description: 'Standard document & technical manual',
    printSize: '210mm 297mm',
    printMargin: '18mm 18mm 22mm 18mm',
  },
  A5: {
    id: 'A5',
    name: 'A5 Handbook',
    dimensions: '148 × 210 mm',
    widthPx: 560,
    description: 'Compact handbook & pocket novel',
    printSize: '148mm 210mm',
    printMargin: '12mm 12mm 15mm 12mm',
  },
  Letter: {
    id: 'Letter',
    name: 'US Letter',
    dimensions: '215.9 × 279.4 mm',
    widthPx: 816,
    description: 'North American publishing standard',
    printSize: '8.5in 11in',
    printMargin: '0.75in 0.75in 0.9in 0.75in',
  },
};

export const PAGE_SIZE_LIST: PageSizeOption[] = Object.values(PAGE_SIZES);

export function getPageSize(id: PageSizeId): PageSizeOption {
  return PAGE_SIZES[id] || PAGE_SIZES.B5;
}

const STORAGE_KEY = 'asciidoc-studio:page-size';

export function loadStoredPageSizeId(): PageSizeId {
  const stored = safeGetItem(STORAGE_KEY);
  if (stored && stored in PAGE_SIZES) return stored as PageSizeId;
  return DEFAULT_PAGE_SIZE_ID;
}

export function storePageSizeId(id: PageSizeId): void {
  safeSetItem(STORAGE_KEY, id);
}
