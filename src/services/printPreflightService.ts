import type { PageSizeId } from './pageSizeService';
import type { PublicationStyleOption } from './publicationStyleService';
import type { SafeBlock, SafeDocument } from './safeDocument';

export type PrintPreflightSeverity = 'warning' | 'info';

export interface PrintPreflightFinding {
  id: `print-${string}`;
  severity: PrintPreflightSeverity;
  title: string;
  detail: string;
  line: number | null;
}

export interface PrintPreflightInput {
  document: SafeDocument | undefined;
  pageSizeId: PageSizeId;
  publicationStyle: PublicationStyleOption;
}

function finding(
  severity: PrintPreflightSeverity,
  id: string,
  title: string,
  detail: string,
  line: number | null = null,
): PrintPreflightFinding {
  return { severity, id: `print-${id}`, title, detail, line };
}

function childBlocks(block: SafeBlock): SafeBlock[] {
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

function hasVisibleDescendant(blocks: SafeBlock[]): boolean {
  return blocks.some((block) => block.type !== 'section' || hasVisibleDescendant(block.blocks));
}

type BlockInspector = (block: SafeBlock, findings: PrintPreflightFinding[]) => void;

const noBlockFinding: BlockInspector = () => {};

function inspectSection(block: SafeBlock, findings: PrintPreflightFinding[]): void {
  const section = block as Extract<SafeBlock, { type: 'section' }>;
  if (hasVisibleDescendant(section.blocks)) return;
  findings.push(
    finding(
      'warning',
      `empty-section-${section.location.line ?? 'unknown'}`,
      'Section has no printable content',
      'Add body content or remove this heading so the print edition does not contain an empty chapter or section.',
      section.location.line,
    ),
  );
}

function inspectTable(block: SafeBlock, findings: PrintPreflightFinding[]): void {
  const table = block as Extract<SafeBlock, { type: 'table' }>;
  if (table.rows.length <= 24) return;
  findings.push(
    finding(
      'warning',
      `long-table-${table.location.line ?? 'unknown'}`,
      'Long table may split poorly across pages',
      'Review this table in the PDF proof. Consider splitting it into smaller tables or moving supporting data to an appendix.',
      table.location.line,
    ),
  );
}

function inspectImage(block: SafeBlock, findings: PrintPreflightFinding[]): void {
  const image = block as Extract<SafeBlock, { type: 'image' }>;
  if (image.caption?.trim()) return;
  findings.push(
    finding(
      'info',
      `uncaptioned-image-${image.location.line ?? 'unknown'}`,
      'Image has no print caption',
      'Add a caption when readers need to identify, cite, or cross-reference this image in the printed book.',
      image.location.line,
    ),
  );
}

const BLOCK_INSPECTORS: Record<SafeBlock['type'], BlockInspector> = {
  section: inspectSection,
  table: inspectTable,
  image: inspectImage,
  container: noBlockFinding,
  formal: noBlockFinding,
  columns: noBlockFinding,
  documentPart: noBlockFinding,
  paragraph: noBlockFinding,
  code: noBlockFinding,
  diagram: noBlockFinding,
  mathBlock: noBlockFinding,
  list: noBlockFinding,
  descriptionList: noBlockFinding,
  quote: noBlockFinding,
  admonition: noBlockFinding,
  thematicBreak: noBlockFinding,
  pageBreak: noBlockFinding,
};

function inspectBlocks(blocks: SafeBlock[], findings: PrintPreflightFinding[]): void {
  for (const block of blocks) {
    BLOCK_INSPECTORS[block.type](block, findings);
    inspectBlocks(childBlocks(block), findings);
  }
}

function inspectStyle(input: PrintPreflightInput): PrintPreflightFinding[] {
  const { typst } = input.publicationStyle;
  const findings: PrintPreflightFinding[] = [];
  if (typst.baseFontSizePt < 9.5) {
    findings.push(
      finding(
        'warning',
        'small-body-type',
        'Body type is small for print',
        `${typst.baseFontSizePt}pt body text can be difficult to read in a printed ${input.pageSizeId} edition. Review a physical proof before delivery.`,
      ),
    );
  }
  if (typst.lineHeight < 1.25) {
    findings.push(
      finding(
        'warning',
        'tight-leading',
        'Line spacing is tight for print',
        `${typst.lineHeight.toFixed(1)}em leading can reduce readability in long-form print. Review the PDF proof at 100% size.`,
      ),
    );
  }
  if (!typst.bodyJustification) {
    findings.push(
      finding(
        'info',
        'ragged-paragraphs',
        'Body paragraphs are ragged-right',
        'This is a deliberate editorial choice. Enable justified paragraphs in Publication style editor for a traditional book layout.',
      ),
    );
  }
  if (!typst.chapterStartsOnNewPage) {
    findings.push(
      finding(
        'info',
        'continuous-chapters',
        'Chapters may continue on the same page',
        'Enable chapter page starts in Publication style editor if each top-level chapter should begin on a fresh page.',
      ),
    );
  }
  return findings;
}

/** Editorial print-proof checks. They flag layout risks but never pretend to
 * certify printer-specific bleed, colour profile, or PDF/X requirements. */
export function inspectPrintPreflight(input: PrintPreflightInput): PrintPreflightFinding[] {
  const findings = inspectStyle(input);
  if (!input.document) return findings;
  inspectBlocks(input.document.blocks, findings);
  const lastBlock = input.document.blocks[input.document.blocks.length - 1];
  if (lastBlock?.type === 'pageBreak') {
    findings.push(
      finding(
        'warning',
        `trailing-page-break-${lastBlock.location.line ?? 'unknown'}`,
        'Document ends with a page break',
        'Remove the final page break unless the final blank page is intentional.',
        lastBlock.location.line,
      ),
    );
  }
  return findings;
}
