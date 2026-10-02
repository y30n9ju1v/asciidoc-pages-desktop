import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickOpenDialog } from './QuickOpenDialog';
import type { VaultNote } from '../../services/vaultService';

function note(name: string, title: string): VaultNote {
  return { path: `/vault/${name}.adoc`, name, title, content: '' };
}

// cmdk measures its list to support scrolling/virtualization, which needs a
// real ResizeObserver - not implemented by jsdom. The test only cares about
// filtering behavior, so a no-op stub is enough.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
// cmdk scrolls the highlighted item into view on selection change - also not
// implemented by jsdom (it does no real layout).
Element.prototype.scrollIntoView = vi.fn();

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('QuickOpenDialog', () => {
  // Regression test: cmdk's root <Command>'s own value/onValueChange
  // control which *item* is selected, not the search text - that's
  // CommandInput's own value/onValueChange. Wiring the query state to the
  // wrong one type-checks fine (both are (string) => void) but silently
  // breaks typing entirely: the query state driving matchingNotes never
  // updates, so the list never actually filters. Neither tsc nor eslint
  // catches this - only exercising the real input does.
  it('actually filters the note list as the user types, not just on initial render', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const notes = [note('alpha', 'Alpha Notes'), note('beta', 'Beta Notes')];

    act(() => {
      root!.render(
        createElement(QuickOpenDialog, {
          open: true,
          onOpenChange: vi.fn(),
          vaultRoot: null,
          notes,
          onOpenFile: vi.fn(),
        }),
      );
    });

    // Radix's Dialog portals into document.body, not the local container.
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Search notes"]');
    expect(input).not.toBeNull();
    expect(document.body.textContent).toContain('Alpha Notes');
    expect(document.body.textContent).toContain('Beta Notes');

    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      nativeSetter.call(input, 'beta');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Beta Notes');
    expect(document.body.textContent).not.toContain('Alpha Notes');
  });
});
