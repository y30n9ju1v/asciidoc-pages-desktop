import { VaultNote } from './vaultService';
import { mapAsciiDocProse } from './asciidocProse';

export interface Wikilink {
  /** The full "[[target]]" or "[[target|alias]]" match. */
  raw: string;
  target: string;
  alias?: string;
}

// Standalone [[id]] remains an AsciiDoc anchor. Use [[note|label]] for a
// standalone wiki link. Source/literal blocks are never rewritten.
const WIKILINK_RE = /\[\[([^\]|\r\n]+?)(?:\|([^\]\r\n]+?))?\]\]/g;

export function extractWikilinks(content: string): Wikilink[] {
  const links: Wikilink[] = [];
  mapAsciiDocProse(content, (text) => {
    for (const match of text.matchAll(WIKILINK_RE)) {
      if (match[1].includes(',')) continue;
      links.push({ raw: match[0], target: match[1].trim(), alias: match[2]?.trim() });
    }
    return text;
  });
  return links;
}

/**
 * Normalizes a note name/filename/title for matching a wikilink target
 * against it: case-insensitive, extension-insensitive, and treats spaces/
 * hyphens/underscores as equivalent so "[[Meeting Notes]]" matches a file
 * named "meeting-notes.adoc" as readily as a note titled "Meeting Notes".
 */
function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\.(adoc|asciidoc|txt)$/, '')
    .replace(/[\s_-]+/g, ' ');
}

/** Resolves a wikilink's target text to a note in the vault - by title
 * first (what a user actually typed as `= Title`), falling back to
 * filename, or null if nothing in the vault matches yet. */
export function resolveWikilinkTarget(target: string, notes: readonly VaultNote[]): VaultNote | null {
  const matches = wikilinkCandidates(target, notes);
  return matches.length === 1 ? matches[0] : null;
}

export function wikilinkCandidates(target: string, notes: readonly VaultNote[]): VaultNote[] {
  if (target.includes('/')) {
    const path = target.replace(/\.(adoc|asciidoc|txt)$/, '');
    return notes.filter((note) => {
      const candidate = note.path.replace(/\.(adoc|asciidoc|txt)$/, '');
      return candidate === path || candidate.endsWith(`/${path}`);
    });
  }
  const normalizedTarget = normalizeForMatch(target);
  const titles = notes.filter((n) => normalizeForMatch(n.title) === normalizedTarget);
  return titles.length ? titles : notes.filter((n) => normalizeForMatch(n.name) === normalizedTarget);
}

function addCandidate(index: Map<string, VaultNote[]>, key: string, note: VaultNote): void {
  const matches = index.get(key) ?? [];
  if (!matches.includes(note)) matches.push(note);
  index.set(key, matches);
}

/** Build once for graph/render passes. Ambiguous titles never select a random note. */
export function createWikilinkResolver(notes: readonly VaultNote[]): (target: string) => VaultNote | null {
  const titles = new Map<string, VaultNote[]>();
  const names = new Map<string, VaultNote[]>();
  const paths = new Map<string, VaultNote[]>();
  for (const note of notes) {
    addCandidate(titles, normalizeForMatch(note.title), note);
    addCandidate(names, normalizeForMatch(note.name), note);
    const path = note.path.replace(/\.(adoc|asciidoc|txt)$/, '');
    const segments = path.split('/');
    for (let i = 0; i < segments.length - 1; i++) addCandidate(paths, segments.slice(i).join('/'), note);
  }
  return (target) => {
    const key = normalizeForMatch(target);
    const matches = target.includes('/')
      ? paths.get(target.replace(/\.(adoc|asciidoc|txt)$/, ''))
      : (titles.get(key) ?? names.get(key));
    return matches?.length === 1 ? matches[0] : null;
  };
}

// Strips/replaces the characters that would otherwise break out of
// AsciiDoc's `link:target[text,role=...]` macro syntax: "," would be parsed
// as an extra attribute. Also strips "[" / "]", though WIKILINK_RE's own
// capturing groups already exclude "]" (so an alias/target containing one
// stops the match rather than reaching here) - kept anyway as a defensive
// second layer in case that regex ever changes to allow it.
function escapeForLinkMacro(s: string): string {
  return s.replace(/[[\]]/g, '').replace(/,/g, ' ');
}

/**
 * Rewrites every [[target]]/[[target|alias]] in content into a real
 * AsciiDoc `link:` macro, meant to run on the raw AsciiDoc source before
 * handing it to Asciidoctor (see App.tsx's render pipeline, right after
 * resolveIncludes).
 *
 * Chosen over emitting raw HTML via a passthrough (`+++<a ...>+++`)
 * because `link:target[text,role=name]` is plain, well-supported AsciiDoc
 * syntax: Asciidoctor's HTML5 converter turns `role` into the anchor's CSS
 * class(es) on its own, so this needs no pass:[] macro and isn't at risk of
 * sanitizeAsciidocHtml stripping something it doesn't recognize.
 *
 * The "wikilink:" URL scheme is never actually navigated to - LivePreview
 * intercepts clicks on it instead - it's just a stable, greppable marker
 * that distinguishes a wikilink anchor from an ordinary one. (Also added to
 * sanitizeHtml.ts's ALLOWED_URI_REGEXP, the same way "asset:" already is,
 * or DOMPurify would strip the href as an unrecognized scheme.)
 *
 * Unresolved targets (no note in the vault yet - the target text itself
 * doesn't matter beyond that) get an extra `wikilink-new` role so
 * LivePreview's CSS can show them differently, Obsidian-style, and so
 * App.tsx's click handler knows to offer creating the note instead of just
 * failing to open it.
 */
export function rewriteWikilinksForRender(content: string, notes: readonly VaultNote[]): string {
  const resolve = createWikilinkResolver(notes);
  return mapAsciiDocProse(content, (text) =>
    text.replace(WIKILINK_RE, (_raw, rawTarget: string, rawAlias?: string) => {
      if (rawTarget.includes(',')) return _raw;
      const target = rawTarget.trim();
      const alias = rawAlias?.trim() || target;
      const resolved = resolve(target);
      const role = resolved ? 'wikilink' : 'wikilink wikilink-new';
      return `link:wikilink:${encodeURIComponent(target)}[${escapeForLinkMacro(alias)},role="${role}"]`;
    }),
  );
}
