import type { SafeBlock, SafeDocument } from './safeDocument';

export interface PublicationQualityFinding {
  id: string;
  title: string;
  detail: string;
  line: number | null;
}

const MAX_TABLE_COLUMNS = 6;
const MAX_CODE_LINE_LENGTH = 120;

function nestedBlocks(block: SafeBlock): SafeBlock[] {
  if (
    block.type === 'section' ||
    block.type === 'container' ||
    block.type === 'formal' ||
    block.type === 'columns' ||
    block.type === 'documentPart'
  )
    return block.blocks;
  if (block.type === 'list') return block.items.flatMap((item) => item.blocks);
  if (block.type === 'descriptionList') return block.items.flatMap((item) => item.descriptionBlocks);
  return [];
}

function inspectBlock(block: SafeBlock, findings: PublicationQualityFinding[]): void {
  if (block.type === 'table' && block.rows.some((row) => row.length > MAX_TABLE_COLUMNS)) {
    findings.push({
      id: `wide-table-${block.location.line ?? 'unknown'}`,
      title: 'Wide table may not fit the page',
      detail: `Tables with more than ${MAX_TABLE_COLUMNS} columns can overflow PDF and EPUB reading layouts.`,
      line: block.location.line,
    });
  }
  if (block.type === 'code' && block.code.split(/\r?\n/).some((line) => line.length > MAX_CODE_LINE_LENGTH)) {
    findings.push({
      id: `long-code-line-${block.location.line ?? 'unknown'}`,
      title: 'Long code line may overflow',
      detail: `A code line exceeds ${MAX_CODE_LINE_LENGTH} characters and may be clipped in narrow print layouts.`,
      line: block.location.line,
    });
  }
  for (const child of nestedBlocks(block)) inspectBlock(child, findings);
}

/** Conservative layout-risk checks shared by PDF and EPUB preflight. These
 * are warnings: they require editorial judgment and never reject valid prose. */
export function inspectPublicationQuality(document: SafeDocument | undefined): PublicationQualityFinding[] {
  if (!document) return [];
  const findings: PublicationQualityFinding[] = [];
  for (const block of document.blocks) inspectBlock(block, findings);
  return findings;
}
