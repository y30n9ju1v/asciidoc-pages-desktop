import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookMarked, Save, Plus, Trash2 } from 'lucide-react';
import type { BookProject } from '../../services/bookProjectService';
import {
  addBookChapter,
  calculateBookProgress,
  moveBookChapter,
  removeBookChapter,
  selectedBookNotes,
  updateBookChapterStatus,
} from '../../services/bookProjectWorkspaceService';
import type { ChapterStatus } from '../../services/chapterStatusService';
import type { VaultNote } from '../../services/vaultService';
import { calculateWritingStats, progressPercent } from '../../services/writingStatsService';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
interface BookOutlinePanelProps {
  onAssemble: (project: BookProject) => Promise<void>;
  vaultRoot: string | null;
  notes: VaultNote[];
  project: BookProject | null;
  onSave: (project: BookProject) => Promise<void>;
  onOpenFile: (path: string) => void;
}

interface WorkspaceBoardProps {
  onAssemble: (project: BookProject) => Promise<void>;
  project: BookProject;
  notes: VaultNote[];
  onSave: (project: BookProject) => Promise<void>;
  onOpenFile: (path: string) => void;
}

const statusLabel: Record<ChapterStatus, string> = { draft: 'Draft', review: 'Review', done: 'Done' };

function wordGoal(value: string): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function WorkspaceBoard({ project, notes, onSave, onOpenFile, onAssemble }: WorkspaceBoardProps) {
  const [chapters, updateChapters] = useState(project.chapters);
  const [goalDraft, setGoalDraft] = useState(String(project.targetWordCount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedNotes = useMemo(() => selectedBookNotes(chapters, notes), [chapters, notes]);
  const progress = useMemo(() => calculateBookProgress(chapters), [chapters]);
  const writing = useMemo(
    () => calculateWritingStats(selectedNotes.map((note) => note.content).join('\n')),
    [selectedNotes],
  );
  const availableNotes = useMemo(
    () => notes.filter((note) => !chapters.some((chapter) => chapter.path === note.path)),
    [chapters, notes],
  );
  const target = wordGoal(goalDraft);

  const addAllNotes = () => updateChapters(availableNotes.reduce(addBookChapter, chapters));
  const saveWorkspace = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...project, chapters, targetWordCount: target });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };
  const assemble = async () => {
    setSaving(true);
    setError(null);
    try {
      await onAssemble({ ...project, chapters, targetWordCount: target });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={saving} className="grid min-w-0 gap-3 p-3 pt-1">
      <section className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-2">
        <Metric label="Draft" value={progress.draft} />
        <Metric label="Review" value={progress.review} />
        <Metric label="Complete" value={progress.done} />
        <Metric label="Book words" value={writing.words.toLocaleString()} />
      </section>
      <section className="grid gap-2 rounded-lg border p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Writing target</p>
          </div>
          <input
            className="h-8 w-28 rounded-md border bg-background px-2 text-right text-sm"
            inputMode="numeric"
            aria-label="Book word goal"
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
          />
        </div>
        {target > 0 && <Progress words={writing.words} target={target} />}
      </section>
      <section className="grid gap-3 rounded-lg border p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Manuscript order</p>
            <p className="text-xs text-muted-foreground">Original files stay unchanged.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAllNotes}
            disabled={availableNotes.length === 0}
          >
            <Plus className="size-3.5" /> Add all notes
          </Button>
        </div>
        <ChapterList chapters={chapters} onUpdate={updateChapters} onOpenFile={onOpenFile} />
        <AvailableNotes notes={availableNotes} chapters={chapters} onUpdate={updateChapters} />
      </section>
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button type="button" variant="outline" disabled={saving || !chapters.length} onClick={() => void assemble()}>
          Assemble book…
        </Button>
        <Button type="button" onClick={() => void saveWorkspace()} disabled={saving}>
          <Save className="size-3.5" /> {saving ? 'Saving…' : 'Save outline'}
        </Button>
      </div>
    </fieldset>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function Progress({ words, target }: { words: number; target: number }) {
  const completion = progressPercent(words, target);
  return (
    <div className="grid gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {completion}% of {target.toLocaleString()} words
      </p>
    </div>
  );
}

function ChapterList({
  chapters,
  onUpdate,
  onOpenFile,
}: {
  chapters: BookProject['chapters'];
  onUpdate: (chapters: BookProject['chapters']) => void;
  onOpenFile: (path: string) => void;
}) {
  if (chapters.length === 0) return <p className="text-xs text-muted-foreground">Add notes to arrange your book.</p>;
  return (
    <ol className="grid gap-2">
      {chapters.map((chapter, index) => (
        <li key={chapter.path} className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border bg-card p-2">
          <span className="w-5 text-right text-xs text-muted-foreground">{index + 1}</span>
          <button
            type="button"
            className="min-w-0 flex-[1_1_75%] truncate text-left text-sm font-medium hover:underline"
            title={chapter.title}
            onClick={() => onOpenFile(chapter.path)}
          >
            {chapter.title}
          </button>
          <Select
            value={chapter.status}
            onValueChange={(value) => onUpdate(updateBookChapterStatus(chapters, chapter.path, value as ChapterStatus))}
          >
            <SelectTrigger size="sm" className="w-24" aria-label={`${chapter.title} status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['draft', 'review', 'done'] as ChapterStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabel[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Move chapter up"
            onClick={() => onUpdate(moveBookChapter(chapters, chapter.path, -1))}
            disabled={index === 0}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Move chapter down"
            onClick={() => onUpdate(moveBookChapter(chapters, chapter.path, 1))}
            disabled={index === chapters.length - 1}
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            aria-label="Remove chapter from book"
            onClick={() => onUpdate(removeBookChapter(chapters, chapter.path))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ol>
  );
}

function AvailableNotes({
  notes,
  chapters,
  onUpdate,
}: {
  notes: VaultNote[];
  chapters: BookProject['chapters'];
  onUpdate: (chapters: BookProject['chapters']) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="grid gap-1 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">Available notes</p>
      {notes.map((note) => (
        <Button
          key={note.path}
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 justify-start"
          onClick={() => onUpdate(addBookChapter(chapters, note))}
        >
          <Plus className="size-3.5 shrink-0" /> <span className="truncate">{note.title}</span>
        </Button>
      ))}
    </div>
  );
}

/** Optional book composition within Explorer; ordinary folders need no book UI. */
export function BookOutlinePanel({ vaultRoot, project, ...actions }: BookOutlinePanelProps) {
  if (!vaultRoot || !project) return null;
  return (
    <details className="max-h-[60%] shrink-0 overflow-y-auto border-b" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        <BookMarked className="mr-2 inline size-4" />
        Book outline
      </summary>
      <WorkspaceBoard
        key={JSON.stringify([vaultRoot, project.chapters, project.targetWordCount])}
        project={project}
        {...actions}
      />
    </details>
  );
}
