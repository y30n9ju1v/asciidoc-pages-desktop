import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PageSizeSelect } from './PageSizeSelect';
import type { PageSizeId } from '../../services/pageSizeService';

it('shares the selected paper between compact editing and publishing controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const scroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    const [size, setSize] = useState<PageSizeId>('B5');
    return (
      <>
        <PageSizeSelect value={size} onChange={setSize} compact />
        <PageSizeSelect value={size} onChange={setSize} />
      </>
    );
  }
  try {
    act(() => root.render(<Harness />));
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(trigger.textContent).toContain('B5');
    act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
      item.textContent?.includes('A5 Handbook'),
    )!;
    expect(option).toBeDefined();
    act(() => option.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(trigger.textContent).toContain('A5');
    expect(container.textContent).toContain('A5 Handbook');
    expect(container.textContent).toContain('148 × 210 mm');
  } finally {
    act(() => root.unmount());
    container.remove();
    if (scroll) Object.defineProperty(Element.prototype, 'scrollIntoView', scroll);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    vi.unstubAllGlobals();
  }
});
