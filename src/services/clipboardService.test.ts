import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboardService';

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
});

describe('copyTextToClipboard', () => {
  it('reports success after the platform accepts the text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await expect(copyTextToClipboard('PDF error')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('PDF error');
  });

  it('reports failure when clipboard permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    await expect(copyTextToClipboard('PDF error')).resolves.toBe(false);
  });
});
