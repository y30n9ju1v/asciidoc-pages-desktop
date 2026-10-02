import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentActionsMenu } from './DocumentActionsMenu';
import { PublicationLayoutBar } from './PublicationLayoutBar';
import { getPublicationStyle } from '../../services/publicationStyleService';

let container: HTMLDivElement;
let root: Root;
let scroll: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  scroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (scroll) Object.defineProperty(Element.prototype, 'scrollIntoView', scroll);
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});

function open(selector: string) {
  const trigger = container.querySelector<HTMLElement>(selector)!;
  act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
}
const actions = () => ({
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onShowNoteTemplates: vi.fn(),
  onImportMarkdown: vi.fn(),
  onSaveCopy: vi.fn(),
  onShowHistory: vi.fn(),
  onNewBook: vi.fn(),
  onShowBibliography: vi.fn(),
  onShowHelp: vi.fn(),
});

it('keeps only contextual document actions and narrow-screen fallbacks in More', () => {
  const callbacks = actions();
  act(() => root.render(<DocumentActionsMenu vaultRoot={null} currentPath={null} {...callbacks} />));
  open('[aria-label="More tools"]');
  const menu = document.querySelector('[role="menu"]')!;
  expect(menu.textContent).toContain('Save a copy');
  for (const removed of [
    'Page layout',
    'Writing tools',
    'Graph view',
    'Vim',
    'Publication style editor',
    'Import Markdown',
    'Version history',
    'New book',
  ]) {
    expect(menu.textContent).not.toContain(removed);
  }
  const newItem = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === 'New document',
  )!;
  expect(newItem.classList.contains('lg:hidden')).toBe(true);
  act(() => newItem.click());
  expect(callbacks.onNew).toHaveBeenCalledOnce();
});

it('exposes folder actions when a saved document and folder are present', () => {
  act(() => root.render(<DocumentActionsMenu vaultRoot="/book" currentPath="/book/main.adoc" {...actions()} />));
  open('[aria-label="More tools"]');
  const menu = document.querySelector('[role="menu"]')!;
  expect(menu.textContent).toContain('Import Markdown');
  expect(menu.textContent).toContain('Version history');
  expect(menu.textContent).toContain('New book');
});

it('opens style management without changing the selected publication style', () => {
  const manage = vi.fn();
  const change = vi.fn();
  act(() =>
    root.render(
      <PublicationLayoutBar
        styleId="book-serif"
        styles={[getPublicationStyle('book-serif')]}
        onStyleChange={change}
        pageSize="A4"
        onPageSizeChange={vi.fn()}
        onManageStyles={manage}
      />,
    ),
  );
  open('[aria-label="Publication style"]');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === 'Manage styles…',
  )!;
  expect(option).toBeDefined();
  act(() => option.click());
  expect(manage).toHaveBeenCalledOnce();
  expect(change).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="Publication style"]')?.textContent).toContain('Book Serif');
});
