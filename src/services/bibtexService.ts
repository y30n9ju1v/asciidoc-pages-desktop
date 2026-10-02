import type { BibliographyEntry } from './bibliographyService';

export interface BibtexImportResult {
  entries: BibliographyEntry[];
  skippedCount: number;
}

function isCitationKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const unwrapped =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))
      ? trimmed.slice(1, -1)
      : trimmed;
  // BibTeX braces protect capitalization. They are markup, not visible
  // citation text, so remove only the delimiters after balanced parsing.
  return unwrapped.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

interface ScanState {
  depth: number;
  quoted: boolean;
  escaped: boolean;
}

const INITIAL_SCAN_STATE: ScanState = { depth: 0, quoted: false, escaped: false };

function advanceScanState(state: ScanState, character: string): ScanState {
  if (state.escaped) return { ...state, escaped: false };
  if (state.quoted && character === '\\') return { ...state, escaped: true };
  if (character === '"') return { ...state, quoted: !state.quoted };
  if (state.quoted) return state;
  if (character === '{') return { ...state, depth: state.depth + 1 };
  if (character === '}') return { ...state, depth: state.depth - 1 };
  return state;
}

function isTopLevelSeparator(state: ScanState, character: string, separator: string): boolean {
  return !state.quoted && !state.escaped && state.depth === 0 && character === separator;
}

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let state = INITIAL_SCAN_STATE;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const isSeparator = isTopLevelSeparator(state, character, separator);
    state = advanceScanState(state, character);
    if (isSeparator) {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

function fieldMap(body: string): Map<string, string> | null {
  const segments = splitTopLevel(body, ',');
  const key = segments.shift()?.trim() ?? '';
  if (!isCitationKey(key)) return null;
  const fields = new Map<string, string>([['key', key]]);
  for (const segment of segments) {
    const [rawName, ...rawValue] = splitTopLevel(segment, '=');
    if (!rawName || rawValue.length === 0) continue;
    const name = rawName.trim().toLowerCase();
    const value = unquote(rawValue.join('='));
    if (name && value) fields.set(name, value);
  }
  return fields;
}

function firstField(fields: Map<string, string>, names: string[]): string {
  for (const name of names) {
    const value = fields.get(name);
    if (value) return value;
  }
  return '';
}

function entryFromFields(fields: Map<string, string>): BibliographyEntry {
  const doi = firstField(fields, ['doi']);
  return {
    key: fields.get('key')!,
    author: firstField(fields, ['author', 'editor']),
    title: firstField(fields, ['title']),
    year: firstField(fields, ['year', 'date']).slice(0, 4),
    publisher: firstField(fields, ['publisher', 'journal', 'booktitle', 'institution']),
    url: firstField(fields, ['url']) || (doi ? `https://doi.org/${doi}` : ''),
  };
}

function nextEntryBody(source: string, at: number): { body: string; end: number } | null {
  const opener = source.indexOf('{', at);
  if (opener === -1) return null;
  let state = INITIAL_SCAN_STATE;
  for (let index = opener; index < source.length; index += 1) {
    const character = source[index];
    const closesEntry = !state.quoted && !state.escaped && state.depth === 1 && character === '}';
    state = advanceScanState(state, character);
    if (closesEntry) return { body: source.slice(opener + 1, index), end: index + 1 };
  }
  return null;
}

/** Parses the portable, authoring-relevant subset of BibTeX. This scanner
 * deliberately does not evaluate @string macros or TeX commands: imported
 * data remains plain bibliography metadata, never executable markup. */
export function parseBibtex(source: string): BibtexImportResult {
  const entries: BibliographyEntry[] = [];
  const knownKeys = new Set<string>();
  let skippedCount = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const at = source.indexOf('@', cursor);
    if (at === -1) break;
    const typeMatch = /^@([A-Za-z]+)\s*\{/.exec(source.slice(at));
    if (!typeMatch) {
      cursor = at + 1;
      continue;
    }
    const result = nextEntryBody(source, at);
    if (!result) {
      skippedCount += 1;
      break;
    }
    cursor = result.end;
    const type = typeMatch[1].toLowerCase();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;
    const fields = fieldMap(result.body);
    if (!fields || knownKeys.has(fields.get('key')!)) {
      skippedCount += 1;
      continue;
    }
    knownKeys.add(fields.get('key')!);
    entries.push(entryFromFields(fields));
  }
  return { entries, skippedCount };
}

/** Adds only new citation keys. Importing a shared .bib file must never
 * silently replace book-specific edits already stored in the project. */
export function addImportedBibliographyEntries(
  current: BibliographyEntry[],
  imported: BibliographyEntry[],
): BibliographyEntry[] {
  const knownKeys = new Set(current.map((entry) => entry.key));
  return [...current, ...imported.filter((entry) => !knownKeys.has(entry.key))];
}
