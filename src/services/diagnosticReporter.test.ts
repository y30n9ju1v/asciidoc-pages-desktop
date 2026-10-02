import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistClientDiagnostic } from './diagnosticLogAdapter';
import { installGlobalDiagnosticHandlers, reportReactError } from './diagnosticReporter';

vi.mock('./diagnosticLogAdapter', () => ({ persistClientDiagnostic: vi.fn() }));

const persistMock = vi.mocked(persistClientDiagnostic);

describe('diagnosticReporter', () => {
  beforeEach(() => {
    persistMock.mockReset();
    persistMock.mockResolvedValue(undefined);
  });

  it('reports React errors with their component stack', () => {
    reportReactError(new Error('Preview failed'), 'at LivePreview');

    expect(persistMock).toHaveBeenCalledWith({
      source: 'react-error-boundary',
      message: 'Preview failed',
      stack: expect.stringContaining('Preview failed'),
      componentStack: 'at LivePreview',
    });
  });

  it('records window errors and unregisters the handler during cleanup', () => {
    const cleanup = installGlobalDiagnosticHandlers();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('Worker failed') }));

    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'window-error', message: 'Worker failed' }),
    );

    cleanup();
    persistMock.mockClear();
    window.dispatchEvent(new Event('error'));

    expect(persistMock).not.toHaveBeenCalled();
  });
});
