import { describe, expect, it } from 'vitest';
import {
  documentHistoryDirectory,
  keepLatestSnapshots,
  snapshotCreatedAt,
  snapshotFileName,
} from './documentHistoryService';

describe('documentHistoryService', () => {
  it('uses a hidden vault directory and rejects documents outside the vault', () => {
    expect(documentHistoryDirectory('/vault', '/vault/chapters/one.adoc')).toBe(
      '/vault/.asciidoc-studio/history/chapters%2Fone.adoc',
    );
    expect(documentHistoryDirectory('/vault', '/elsewhere/one.adoc')).toBeNull();
  });

  it('keeps different documents from sharing a history key even when names contain "__"', () => {
    const first = documentHistoryDirectory('/vault', '/vault/notes__x/y.adoc');
    const second = documentHistoryDirectory('/vault', '/vault/notes/x__y.adoc');
    expect(first).not.toBeNull();
    expect(first).not.toBe(second);
  });

  it('round-trips sortable snapshot timestamps', () => {
    const name = snapshotFileName(new Date('2026-01-02T03:04:05.678Z'));
    expect(snapshotCreatedAt(`/vault/${name}`)).toBe('2026-01-02T03:04:05.678Z');
    expect(snapshotCreatedAt(`/vault/${name.replace('.adoc', '-unique.adoc')}`)).toBe('2026-01-02T03:04:05.678Z');
  });

  it('keeps the newest bounded set of snapshots', () => {
    const snapshots = Array.from({ length: 32 }, (_, index) => ({
      path: String(index),
      createdAt: `2026-01-${String(index).padStart(2, '0')}`,
    }));
    expect(keepLatestSnapshots(snapshots)).toHaveLength(30);
  });
});
