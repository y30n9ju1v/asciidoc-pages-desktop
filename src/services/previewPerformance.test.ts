import { afterEach, expect, it, vi } from 'vitest';
import { measurePreviewStage } from './previewPerformance';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('records only stage, duration and success without document contents', async () => {
  vi.stubEnv('DEV', true);
  const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(125);
  expect(await measurePreviewStage('preview-assets', async () => 'private manuscript')).toBe('private manuscript');
  expect(log).toHaveBeenCalledExactlyOnceWith('[preview-performance]', {
    stage: 'preview-assets',
    milliseconds: 25,
    succeeded: true,
  });
});
it('preserves errors without logging their sensitive contents', async () => {
  vi.stubEnv('DEV', true);
  const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const error = new Error('/private/path');
  await expect(
    measurePreviewStage('preview-assets', async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(log.mock.calls[0][1]).toMatchObject({ succeeded: false });
  expect(JSON.stringify(log.mock.calls)).not.toContain('/private/path');
});
it('does not record production timings', async () => {
  vi.stubEnv('DEV', false);
  const log = vi.spyOn(console, 'debug');
  expect(await measurePreviewStage('preview-assets', async () => 42)).toBe(42);
  expect(log).not.toHaveBeenCalled();
});
