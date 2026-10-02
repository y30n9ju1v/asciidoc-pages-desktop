import { readTextFile } from '@tauri-apps/plugin-fs';
import { dirnameOf, resolveWithinRoot } from './pathSafety';
import { mapAsciiDocProse } from './asciidocProse';

const MAX_INCLUDE_DEPTH = 5;
const INCLUDE_RE = /^include::([^[]+)\[(.*?)\]$/gm;

interface IncludeDirective {
  fullMatch: string;
  relativePath: string;
}

interface IncludeContext {
  depth: number;
  rootDir: string;
  visited: ReadonlySet<string>;
}

function canResolveIncludes(content: string, currentPath: string | null, depth: number): currentPath is string {
  return Boolean(content && currentPath && depth <= MAX_INCLUDE_DEPTH && dirnameOf(currentPath));
}

function blockedInclude(relativePath: string): string {
  return `// [Include Blocked: ${relativePath}]`;
}

function missingInclude(relativePath: string): string {
  return `// [Include File Not Found: ${relativePath}]`;
}

function recursiveInclude(relativePath: string): string {
  return `// [Recursive Include Warning: ${relativePath}]`;
}

async function resolveDirective(
  directive: IncludeDirective,
  currentPath: string,
  context: IncludeContext,
): Promise<string> {
  const parentDir = dirnameOf(currentPath);
  if (!parentDir) return directive.fullMatch;

  const targetPath = resolveWithinRoot(parentDir, directive.relativePath, context.rootDir);
  if (!targetPath) {
    console.warn(`Refusing to include "${directive.relativePath}": resolves outside the document's folder.`);
    return blockedInclude(directive.relativePath);
  }
  if (context.visited.has(targetPath)) return recursiveInclude(directive.relativePath);

  try {
    const fileText = await readTextFile(targetPath);
    const visited = new Set(context.visited).add(targetPath);
    return resolveIncludeContent(fileText, targetPath, { ...context, depth: context.depth + 1, visited });
  } catch (err) {
    console.warn(`Could not resolve include file: ${targetPath}`, err);
    return missingInclude(directive.relativePath);
  }
}

async function resolveIncludeContent(
  content: string,
  currentPath: string | null,
  context: IncludeContext,
): Promise<string> {
  if (!canResolveIncludes(content, currentPath, context.depth)) return content;

  const directives: IncludeDirective[] = [];
  const marker = `include-${crypto.randomUUID()}`;
  let resolvedContent = mapAsciiDocProse(content, (text) =>
    text.replace(INCLUDE_RE, (fullMatch, relativePath: string) => {
      directives.push({ fullMatch, relativePath: relativePath.trim() });
      return `${marker}-${directives.length - 1}`;
    }),
  );
  for (const [index, directive] of directives.entries()) {
    const replacement = await resolveDirective(directive, currentPath, context);
    resolvedContent = resolvedContent.replace(`${marker}-${index}`, () => replacement);
  }
  return resolvedContent;
}

/**
 * Resolves `include::filename.adoc[]` directives recursively while pinning
 * every target to the top-level document folder. Parsing, validation, and
 * filesystem work are separated above so each branch has a small, testable
 * responsibility.
 */
export async function resolveIncludes(content: string, currentPath: string | null): Promise<string> {
  const rootDir = currentPath && dirnameOf(currentPath);
  if (!rootDir) return content;

  return resolveIncludeContent(content, currentPath, { depth: 0, rootDir, visited: new Set() });
}
