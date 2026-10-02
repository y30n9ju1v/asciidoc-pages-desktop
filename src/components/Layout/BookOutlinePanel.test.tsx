import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookOutlinePanel } from './BookOutlinePanel';
import { createBookProject } from '../../services/bookProjectService';

let container: HTMLDivElement;
let root: Root;
const notes = [
  { path: '/book/one.adoc', name: 'one', title: 'First chapter', content: 'First chapter text' },
  { path: '/book/two.adoc', name: 'two', title: 'Second chapter', content: 'Second chapter text' },
];
const project = createBookProject({ title: 'Test book', author: '', email: '', lang: 'en', attributes: {} });
const callbacks = () => ({
  onSave: vi.fn().mockResolvedValue(undefined),
  onAssemble: vi.fn().mockResolvedValue(undefined),
  onOpenFile: vi.fn(),
});
function button(label: string) {
  const result = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  expect(result).toBeDefined();
  return result!;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows no book UI without a folder or project', () => {
  act(() => root.render(<BookOutlinePanel vaultRoot={null} project={project} notes={notes} {...callbacks()} />));
  expect(container.innerHTML).toBe('');
  act(() => root.render(<BookOutlinePanel vaultRoot="/book" project={null} notes={notes} {...callbacks()} />));
  expect(container.innerHTML).toBe('');
});

it('provides a collapsible inline outline without a modal and saves reordered chapters', async () => {
  const actions = callbacks();
  act(() => root.render(<BookOutlinePanel vaultRoot="/book" project={project} notes={notes} {...actions} />));
  expect(container.querySelector('summary')?.textContent).toContain('Book outline');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(button('Assemble book…').disabled).toBe(true);
  act(() => button('Add all notes').click());
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Move chapter down"]')!.click());
  await act(async () => button('Save outline').click());
  expect(actions.onSave.mock.calls[0][0].chapters.map((chapter: { path: string }) => chapter.path)).toEqual([
    notes[1].path,
    notes[0].path,
  ]);
  expect(project.chapters).toEqual([]);
  await act(async () => button('Assemble book…').click());
  expect(actions.onAssemble).toHaveBeenCalledWith(actions.onSave.mock.calls[0][0]);
  act(() => button('First chapter').click());
  expect(actions.onOpenFile).toHaveBeenCalledWith(notes[0].path);
});

it('preserves pending chapters when other book settings change and saves the latest metadata', async () => {
  const actions = callbacks();
  act(() => root.render(<BookOutlinePanel vaultRoot="/book" project={project} notes={notes} {...actions} />));
  act(() => button('Add all notes').click());
  const updated = { ...project, metadata: { ...project.metadata, title: 'Updated title' } };
  act(() => root.render(<BookOutlinePanel vaultRoot="/book" project={updated} notes={notes} {...actions} />));
  await act(async () => button('Save outline').click());
  expect(actions.onSave.mock.calls[0][0].metadata.title).toBe('Updated title');
  expect(actions.onSave.mock.calls[0][0].chapters).toHaveLength(2);
});

it('keeps failed edits available to retry and resets drafts when the folder changes', async () => {
  const actions = callbacks();
  actions.onSave.mockRejectedValueOnce(new Error('Disk full'));
  act(() => root.render(<BookOutlinePanel vaultRoot="/book" project={project} notes={notes} {...actions} />));
  act(() => button('Add all notes').click());
  await act(async () => button('Save outline').click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Disk full');
  expect(button('Save outline').disabled).toBe(false);
  await act(async () => button('Save outline').click());
  expect(actions.onSave.mock.calls[1][0].chapters).toHaveLength(2);
  act(() => root.render(<BookOutlinePanel vaultRoot="/other" project={project} notes={[]} {...actions} />));
  expect(button('Assemble book…').disabled).toBe(true);
});
