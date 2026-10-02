import { safeGetItem, safeSetItem } from './localStorageSafe';

export type ChapterStatus = 'draft' | 'review' | 'done';

/** Keyed by heading title (see outlineService.ts) - stable enough across edits that only
 * shift line numbers, without needing to track a separate persistent id per heading. */
export type ChapterStatusMap = Record<string, ChapterStatus>;

const STORAGE_PREFIX = 'asciidoc-studio:chapter-status:';

const STATUS_CYCLE: ChapterStatus[] = ['draft', 'review', 'done'];

/** First click sets 'draft'; from there it cycles draft -> review -> done -> draft. */
export function nextChapterStatus(current: ChapterStatus | undefined): ChapterStatus {
  if (!current) return 'draft';
  const index = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
}

// Statuses are scoped per document path - an unsaved document has nowhere stable to
// persist them, so they just live in memory for that session (same tradeoff other
// path-dependent features like recovery/include resolution already make).
export function loadChapterStatuses(docPath: string | null): ChapterStatusMap {
  if (!docPath) return {};
  const raw = safeGetItem(STORAGE_PREFIX + docPath);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ChapterStatusMap;
  } catch (err) {
    console.warn('Failed to parse stored chapter statuses, starting empty:', err);
    return {};
  }
}

export function storeChapterStatuses(docPath: string | null, statuses: ChapterStatusMap): void {
  if (!docPath) return;
  safeSetItem(STORAGE_PREFIX + docPath, JSON.stringify(statuses));
}
