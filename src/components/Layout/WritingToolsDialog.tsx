import { useEffect, useState } from 'react';
import { BookOpenCheck, Pause, Play, RotateCcw } from 'lucide-react';
import type { WritingStats } from '../../services/writingStatsService';
import { progressPercent } from '../../services/writingStatsService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface WritingToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentStats: WritingStats;
  bookWords: number;
  bookTargetWordCount: number;
  canSaveBookTarget: boolean;
  onSaveBookTarget: (targetWordCount: number) => Promise<void>;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function validGoal(value: string): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

/** Presents local writing feedback; the timer deliberately has no tracking or network side effects. */
export function WritingToolsDialog({
  open,
  onOpenChange,
  documentStats,
  bookWords,
  bookTargetWordCount,
  canSaveBookTarget,
  onSaveBookTarget,
}: WritingToolsDialogProps) {
  const [goalDraft, setGoalDraft] = useState(String(bookTargetWordCount));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const saveGoal = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSaveBookTarget(validGoal(goalDraft));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const target = validGoal(goalDraft);
  const progress = progressPercent(bookWords, target);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,calc(100%-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="size-4 text-primary" /> Writing tools
          </DialogTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Private, local feedback for the current document and selected book chapters.
          </p>
        </DialogHeader>
        <div className="grid gap-4 p-5 pt-1">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Words</p>
              <p className="text-lg font-semibold">{documentStats.words.toLocaleString()}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Characters</p>
              <p className="text-lg font-semibold">{documentStats.characters.toLocaleString()}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Paragraphs</p>
              <p className="text-lg font-semibold">{documentStats.paragraphs.toLocaleString()}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Reading time</p>
              <p className="text-lg font-semibold">{documentStats.readingMinutes}m</p>
            </div>
          </section>
          <section className="grid gap-3 rounded-lg border p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Book word goal</p>
                <p className="text-xs text-muted-foreground">
                  {bookWords.toLocaleString()} words in selected manuscript chapters
                </p>
              </div>
              <input
                className="h-8 w-28 rounded-md border bg-background px-2 text-right text-sm"
                inputMode="numeric"
                aria-label="Book word goal"
                value={goalDraft}
                onChange={(event) => setGoalDraft(event.target.value)}
                disabled={!canSaveBookTarget}
              />
            </div>
            {target > 0 && (
              <div className="grid gap-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress}% of {target.toLocaleString()} words
                </p>
              </div>
            )}
            {!canSaveBookTarget && (
              <p className="text-xs text-muted-foreground">Open a Vault Book Project to save a word goal.</p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void saveGoal()}
                disabled={!canSaveBookTarget || saving}
              >
                {saving ? 'Saving…' : 'Save goal'}
              </Button>
            </div>
          </section>
          <section className="flex items-center justify-between gap-3 rounded-lg border p-3.5">
            <div>
              <p className="text-sm font-medium">Focus session</p>
              <p className="text-xs text-muted-foreground">{formatDuration(elapsedSeconds)} in this session</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Reset focus timer"
                onClick={() => setElapsedSeconds(0)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button type="button" size="sm" onClick={() => setRunning((current) => !current)}>
                {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                {running ? 'Pause' : 'Start'}
              </Button>
            </div>
          </section>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
