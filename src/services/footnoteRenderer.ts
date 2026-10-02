function footnoteContainers(doc: Document): HTMLElement[] {
  const chapters = Array.from(doc.body.querySelectorAll<HTMLElement>(':scope > .sect1'));
  return chapters.length > 0 ? chapters : [doc.body];
}

function footnoteOwner(definition: HTMLElement, containers: HTMLElement[]): HTMLElement {
  const referenceId = definition.id.replace('_footnotedef_', '_footnoteref_');
  const reference = referenceId === definition.id ? null : definition.ownerDocument.getElementById(referenceId);
  return (
    containers.find((container) => reference && container.contains(reference)) ?? containers[containers.length - 1]
  );
}

function groupDefinitionsByContainer(
  definitions: HTMLElement[],
  containers: HTMLElement[],
): Map<HTMLElement, HTMLElement[]> {
  return definitions.reduce((groups, definition) => {
    const owner = footnoteOwner(definition, containers);
    const group = groups.get(owner) ?? [];
    group.push(definition);
    groups.set(owner, group);
    return groups;
  }, new Map<HTMLElement, HTMLElement[]>());
}

function appendFootnoteGroups(doc: Document, groups: Map<HTMLElement, HTMLElement[]>): void {
  for (const [container, definitions] of groups) {
    const group = doc.createElement('div');
    group.className = 'footnotes';
    definitions.forEach((definition) => group.appendChild(definition));
    container.appendChild(group);
  }
}

// Asciidoctor's HTML5 backend always collects every footnote definition into a
// single <div id="footnotes"> at the end of the document. Relocate definitions
// into the top-level section that contains their reference link instead.
export function groupFootnotesByChapter(html: string): string {
  if (!html.includes('id="footnotes"')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const footnotesBlock = doc.getElementById('footnotes');
  if (!footnotesBlock) return html;

  const definitions = Array.from(footnotesBlock.querySelectorAll<HTMLElement>('.footnote[id]'));
  if (definitions.length === 0) return html;

  const groups = groupDefinitionsByContainer(definitions, footnoteContainers(doc));
  footnotesBlock.remove();
  appendFootnoteGroups(doc, groups);
  return doc.body.innerHTML;
}
