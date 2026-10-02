import { describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { syncVaultSearchIndex } from './searchService';
import type { VaultNote } from './vaultService';

describe('incremental search synchronization', () => {
  it('sends only changed bodies while retaining all live paths for deletion detection', async () => {
    const a: VaultNote = { path: '/v/a.adoc', name: 'a', title: 'A', content: 'Original' };
    const b: VaultNote = { path: '/v/b.adoc', name: 'b', title: 'B', content: 'Other' };
    const previous = new Map<string, VaultNote>();
    invoke.mockResolvedValue(undefined);
    await syncVaultSearchIndex('/v', [a, b], previous);
    const edited = { ...a, content: 'Edited' };
    await syncVaultSearchIndex('/v', [edited, b], previous);
    expect(invoke).toHaveBeenLastCalledWith('sync_search_index', {
      vaultRoot: '/v',
      notes: [edited],
      paths: [a.path, b.path],
    });
    await syncVaultSearchIndex('/v', [b], previous);
    expect(invoke).toHaveBeenLastCalledWith('sync_search_index', { vaultRoot: '/v', notes: [], paths: [b.path] });
  });
});
