import { useState } from 'react';
import { Eye, History, RotateCcw } from 'lucide-react';
import type { DocumentSnapshot } from '../../services/documentHistoryService';
import { compareDocumentLines, type DocumentDiff } from '../../services/documentDiffService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DocumentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: DocumentSnapshot[];
  error: string | null;
  currentContent: string;
  onRefresh: () => Promise<void>;
  onRead: (snapshot: DocumentSnapshot) => Promise<string>;
  onRestore: (snapshot: DocumentSnapshot) => Promise<void>;
  available: boolean;
}

function displaySnapshotTime(createdAt: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(createdAt));
}

/** Lets a writer explicitly restore a pre-save version; restoration remains an unsaved editor change. */
export function DocumentHistoryDialog({
  open,
  onOpenChange,
  snapshots,
  error,
  currentContent,
  onRefresh,
  onRead,
  onRestore,
  available,
}: DocumentHistoryDialogProps) {
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DocumentDiff | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);

  const restore = async (snapshot: DocumentSnapshot) => {
    setRestoringPath(snapshot.path);
    setRestoreError(null);
    try {
      await onRestore(snapshot);
      onOpenChange(false);
    } catch (reason) {
      setRestoreError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRestoringPath(null);
    }
  };

  const compare = async (snapshot: DocumentSnapshot) => {
    setRestoreError(null);
    try {
      setDiff(compareDocumentLines(await onRead(snapshot), currentContent));
      setDiffPath(snapshot.path);
    } catch (reason) {
      setRestoreError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,calc(100%-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" /> Version history
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Snapshots are created before a changed Vault document is saved. Restoring one does not overwrite the file
            until you save.
          </p>
        </DialogHeader>
        <div className="grid gap-3 p-5 pt-1">
          {!available ? (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              Open a document inside a selected Vault to use version history.
            </p>
          ) : snapshots.length === 0 ? (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              No saved versions yet. The first changed save creates a snapshot of the prior version.
            </p>
          ) : (
            <ol className="grid gap-2">
              {snapshots.map((snapshot) => (
                <li key={snapshot.path} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <span className="text-sm">{displaySnapshotTime(snapshot.createdAt)}</span>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void compare(snapshot)}>
                      <Eye className="size-3.5" /> Compare
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void restore(snapshot)}
                      disabled={restoringPath === snapshot.path}
                    >
                      <RotateCcw className="size-3.5" /> {restoringPath === snapshot.path ? 'Restoring…' : 'Restore'}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {diff && (
            <section className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs" aria-label="Version comparison">
              <p className="font-medium text-foreground">Changes from selected snapshot</p>
              {diff.unchangedBefore > 0 && (
                <p className="text-muted-foreground">… {diff.unchangedBefore} unchanged lines above</p>
              )}
              {diff.removed.map((line, index) => (
                <pre
                  key={`removed-${index}`}
                  className="whitespace-pre-wrap rounded bg-destructive/10 px-2 py-1 text-destructive"
                >
                  - {line}
                </pre>
              ))}
              {diff.added.map((line, index) => (
                <pre
                  key={`added-${index}`}
                  className="whitespace-pre-wrap rounded bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300"
                >
                  + {line}
                </pre>
              ))}
              {diff.unchangedAfter > 0 && (
                <p className="text-muted-foreground">… {diff.unchangedAfter} unchanged lines below</p>
              )}
              <p className="sr-only">Comparing {diffPath}</p>
            </section>
          )}
          {(error || restoreError) && <p className="text-xs text-destructive">{restoreError ?? error}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => void onRefresh()} disabled={!available}>
              Refresh
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
