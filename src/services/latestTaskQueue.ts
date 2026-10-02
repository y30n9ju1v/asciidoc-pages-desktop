export interface LatestTaskQueueOptions<Input, Output> {
  delayMs: number;
  run: (input: Input) => Promise<Output>;
  onStart: () => void;
  onQueued?: () => void;
  onSuccess: (output: Output) => void;
  onDiscard: (output: Output) => void;
  onError: (error: unknown) => void;
}

interface QueuedTask<Input> {
  input: Input;
  version: number;
}

/**
 * Runs at most one asynchronous task at a time. New input replaces queued
 * work instead of adding another task, so expensive native work never backs
 * up behind rapid edits.
 */
export class LatestTaskQueue<Input, Output> {
  private latest: QueuedTask<Input> | null = null;
  private activeVersion: number | null = null;
  private nextVersion = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private runImmediatelyAfterActive = false;
  private disposed = false;

  constructor(private readonly options: LatestTaskQueueOptions<Input, Output>) {}

  enqueue(input: Input): void {
    if (this.disposed) return;
    this.latest = { input, version: ++this.nextVersion };
    this.options.onQueued?.();
    this.schedule(this.options.delayMs);
  }

  /** Starts the newest input now, or immediately after the current task. */
  flush(): void {
    if (this.disposed || !this.latest) return;
    this.clearTimer();
    void this.startLatest();
  }

  /** Prevents queued work from starting; an already-running task is ignored on completion. */
  clear(): void {
    this.latest = null;
    this.runImmediatelyAfterActive = false;
    this.clearTimer();
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startLatest();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private isLatest(task: QueuedTask<Input>): boolean {
    return this.latest?.version === task.version;
  }

  private async startLatest(): Promise<void> {
    const task = this.takeLatestTask();
    if (!task) return;
    this.options.onStart();
    try {
      const output = await this.options.run(task.input);
      if (!this.disposed && this.isLatest(task)) this.options.onSuccess(output);
      else this.options.onDiscard(output);
    } catch (error) {
      if (!this.disposed && this.isLatest(task)) this.options.onError(error);
    } finally {
      this.finishActiveTask();
    }
  }

  private takeLatestTask(): QueuedTask<Input> | null {
    if (this.disposed || !this.latest) return null;
    if (this.activeVersion === null) {
      this.activeVersion = this.latest.version;
      return this.latest;
    }
    this.runImmediatelyAfterActive = true;
    return null;
  }

  private finishActiveTask(): void {
    this.activeVersion = null;
    if (this.disposed || !this.runImmediatelyAfterActive) return;
    this.runImmediatelyAfterActive = false;
    // A later edit may have scheduled another debounce timer after the
    // active task's timer fired. Starting the newest input now consumes it;
    // otherwise it could trigger a duplicate compilation while this task runs.
    this.clearTimer();
    void this.startLatest();
  }
}
