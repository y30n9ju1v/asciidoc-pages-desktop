import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaneResizer } from './PaneResizer';
import { PublicationTypographyToolbar } from './PublicationTypographyToolbar';
import { useWorkspaceMode } from '../../hooks/useWorkspaceMode';
import { getPublicationStyle } from '../../services/publicationStyleService';
import { typographyFromPublicationStyle } from '../../services/publicationTypographyService';
import { PublishDialog } from './PublishDialog';
import type { ComponentProps } from 'react';
import { createBookMetadata } from '../../services/bookProjectService';
import { DocumentSaveControl } from './DocumentSaveControl';
import { documentSaveStatus } from '../../services/documentSaveStatus';

vi.mock('../../hooks/usePdfExport', () => ({
  usePdfExport: () => ({ pdfPhase: null, exportPdf: vi.fn(), cancelPdfExport: vi.fn() }),
}));
vi.mock('../../hooks/usePublishExports', () => ({
  usePublishExports: () => ({ exportHtml: vi.fn(), exportEpub: vi.fn(), exportTypst: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('workspace controls', () => {
  it('shows a labeled Save action and never calls an untitled document saved', () => {
    const save = vi.fn();
    act(() => root.render(<DocumentSaveControl dirty={false} onSave={save} />));
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Save document"]')!;
    expect(button.textContent).toContain('Save');
    act(() => button.click());
    expect(save).toHaveBeenCalledTimes(1);
    expect(documentSaveStatus(null, false)).toBe('Not saved');
    expect(documentSaveStatus('/book.adoc', false)).toBe('Saved');
    expect(documentSaveStatus('/book.adoc', true)).toBe('Edited');
  });
  it('keeps unchanged layout free of saving, reset and overflow controls', () => {
    const defaults = typographyFromPublicationStyle(getPublicationStyle('literary'));
    act(() =>
      root.render(
        <PublicationTypographyToolbar
          defaults={defaults}
          typography={defaults}
          styleName="Book"
          hasOverride={false}
          hasUnsavedChanges={false}
          canSave
          onChange={vi.fn()}
          onSave={vi.fn()}
          onReset={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).not.toContain('Save layout');
    expect(container.querySelector('[aria-label="More layout options"]')).toBeNull();
    expect(container.querySelector('[aria-label="Reset typography to style defaults"]')).toBeNull();
    expect(container.textContent).not.toContain('Edit publication style');
  });
  it('closes the publish dialog before navigating to an editor issue', async () => {
    const resolve = vi.fn(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    const issue = {
      id: 'broken-link',
      title: 'Broken link',
      detail: 'Fix this reference',
      severity: 'error' as const,
      line: 3,
    };
    const style = getPublicationStyle('literary');
    const meta = { title: 'Book', author: '', email: '', lang: 'en', attributes: {} };
    const props: ComponentProps<typeof PublishDialog> = {
      renderResult: { html: '', meta },
      currentPath: '/vault/a.adoc',
      currentPublicationStyle: style.id,
      publicationStyles: [style],
      publicationStyle: style,
      onPublicationStyleChange: vi.fn(),
      currentPageSize: 'A4',
      onPageSizeChange: vi.fn(),
      colorMode: 'light',
      bookMetadata: createBookMetadata(meta),
      preflight: { ready: false, pdfReady: false, errorCount: 1, warningCount: 0, issues: [issue] },
      canSaveBookDetails: true,
      onSaveBookMetadata: vi.fn(),
      onResolvePreflightIssue: resolve,
      onJumpToLine: vi.fn(),
    };
    act(() => root.render(<PublishDialog {...props} />));
    act(() => container.querySelector('button')!.click());
    const review = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Review in editor',
    )!;
    await act(async () => {
      review.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(resolve).toHaveBeenCalledWith(issue);
  });
  it('resizes with horizontal arrows only and exposes an accessible separator', () => {
    const resize = vi.fn();
    act(() =>
      root.render(<PaneResizer label="Explorer width" value={270} onResize={resize} onPointerDown={vi.fn()} />),
    );
    const separator = container.querySelector('[role="separator"]')!;
    expect(separator.getAttribute('tabindex')).toBe('0');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown']) {
      act(() => separator.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    }
    expect(resize.mock.calls).toEqual([[-1], [1]]);
  });

  it('starts in writing mode, reveals typesetting on request and remembers proof mode', () => {
    function Harness() {
      const workspace = useWorkspaceMode();
      return (
        <button onClick={workspace.toggleTypesetting}>
          {workspace.mode}:{String(workspace.typesettingOpen)}
        </button>
      );
    }
    act(() => root.render(<Harness />));
    expect(container.textContent).toBe('write:false');
    act(() => container.querySelector('button')!.click());
    expect(container.textContent).toBe('proof:true');
    act(() => root.render(<Harness key="reopen" />));
    expect(container.textContent).toBe('proof:false');
    act(() => container.querySelector('button')!.click());
    expect(container.textContent).toBe('proof:true');
  });

  it('commits bounded numeric values and restores the selected style default independently', () => {
    const defaults = typographyFromPublicationStyle(getPublicationStyle('literary'));
    const typography = { ...defaults, baseFontSizePt: 15 };
    const change = vi.fn();
    const reset = vi.fn();
    act(() =>
      root.render(
        <PublicationTypographyToolbar
          defaults={defaults}
          typography={typography}
          styleName="Literary"
          hasOverride
          hasUnsavedChanges
          canSave
          onChange={change}
          onSave={vi.fn()}
          onReset={reset}
          onClose={vi.fn()}
        />,
      ),
    );
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Body size value"]')!;
    input.value = '99';
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(change).toHaveBeenLastCalledWith({ ...typography, baseFontSizePt: 18 });
    expect(input.value).toBe('18');
    input.value = '';
    change.mockClear();
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(change).not.toHaveBeenCalled();
    expect(input.value).toBe('15');
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Reset Body size"]')!.click());
    expect(change).toHaveBeenLastCalledWith({ ...typography, baseFontSizePt: defaults.baseFontSizePt });
    expect(container.textContent).toContain('Settings not saved');
    expect(container.textContent).toContain('Save layout');
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Reset typography to style defaults"]')!.click());
    expect(reset).toHaveBeenCalledTimes(1);
    expect(container.querySelector('details')).toBeNull();
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(2);
    expect(container.textContent).not.toContain('Paragraph spacing');
    expect(container.textContent).not.toContain('Preview applied');
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(0);
    expect(
      [...container.querySelectorAll('button')].filter((button) => button.textContent === 'Save layout'),
    ).toHaveLength(1);
  });
});
