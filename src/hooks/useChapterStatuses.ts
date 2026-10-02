import { useCallback, useEffect, useState } from 'react';
import {
  ChapterStatusMap,
  loadChapterStatuses,
  nextChapterStatus,
  storeChapterStatuses,
} from '../services/chapterStatusService';
import { OutlineItem } from '../services/outlineService';

interface ChapterStatusState {
  path: string | null;
  statuses: ChapterStatusMap;
}

function statusStateFor(path: string | null): ChapterStatusState {
  return { path, statuses: loadChapterStatuses(path) };
}

/** Owns chapter-status state and persists completed transitions outside state updaters. */
export function useChapterStatuses(currentPath: string | null) {
  const [state, setState] = useState<ChapterStatusState>(() => statusStateFor(currentPath));

  if (state.path !== currentPath) {
    setState(statusStateFor(currentPath));
  }

  useEffect(() => {
    storeChapterStatuses(state.path, state.statuses);
  }, [state]);

  const cycleStatus = useCallback((item: OutlineItem) => {
    setState((current) => ({
      ...current,
      statuses: {
        ...current.statuses,
        [item.title]: nextChapterStatus(current.statuses[item.title]),
      },
    }));
  }, []);

  return { chapterStatuses: state.statuses, cycleStatus };
}
