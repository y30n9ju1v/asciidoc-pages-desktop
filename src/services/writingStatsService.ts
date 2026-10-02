export interface WritingStats {
  words: number;
  characters: number;
  paragraphs: number;
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 220;

// A paragraph is a run of consecutive non-blank lines, not one line each -
// AsciiDoc source routinely word-wraps a single paragraph across several
// lines, so counting non-blank lines directly would overcount paragraphs.
function paragraphCount(content: string): number {
  return content.split(/\r?\n/).reduce<{ count: number; inParagraph: boolean }>(
    (state, line) => {
      const hasText = line.trim().length > 0;
      return hasText && !state.inParagraph
        ? { count: state.count + 1, inParagraph: true }
        : { count: state.count, inParagraph: hasText };
    },
    { count: 0, inParagraph: false },
  ).count;
}

export function countWords(content: string): number {
  const matches = content.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

export function calculateWritingStats(content: string): WritingStats {
  const words = countWords(content);
  return {
    words,
    characters: [...content].length,
    paragraphs: paragraphCount(content),
    readingMinutes: words === 0 ? 0 : Math.ceil(words / WORDS_PER_MINUTE),
  };
}

export function progressPercent(words: number, targetWordCount: number): number {
  if (targetWordCount <= 0) return 0;
  return Math.min(100, Math.round((words / targetWordCount) * 100));
}
