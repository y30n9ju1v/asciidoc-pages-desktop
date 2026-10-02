import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { persistClientDiagnostic, saveDiagnosticLog } from './diagnosticLogAdapter';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

describe('diagnosticLogAdapter', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('sends a sanitized diagnostic through the narrow Tauri command', async () => {
    await persistClientDiagnostic({
      source: 'window-error',
      message: 'Could not open /Users/kim/private/book.adoc',
      stack: 'at open (file:///Users/kim/private/book.adoc:1:1)',
    });

    expect(invokeMock).toHaveBeenCalledWith('record_client_diagnostic', {
      diagnostic: {
        source: 'window-error',
        message: 'Could not open <local-path>',
        stack: 'at open (<local-path>)',
      },
    });
  });

  it('uses a command without caller-supplied paths to save a log copy', async () => {
    await saveDiagnosticLog();

    expect(invokeMock).toHaveBeenCalledWith('save_diagnostic_log');
  });
});
