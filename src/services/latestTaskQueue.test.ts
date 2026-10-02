import { describe, expect, it, vi } from 'vitest';
import { LatestTaskQueue } from './latestTaskQueue';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('LatestTaskQueue', () => {
  it('runs only the newest value after a burst of edits', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async (value: string) => value);
    const success = vi.fn();
    const queue = new LatestTaskQueue({
      delayMs: 100,
      run,
      onStart: vi.fn(),
      onSuccess: success,
      onDiscard: vi.fn(),
      onError: vi.fn(),
    });

    queue.enqueue('first');
    queue.enqueue('second');
    queue.enqueue('latest');
    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('latest');
    expect(success).toHaveBeenCalledWith('latest');
    vi.useRealTimers();
  });

  it('coalesces edits received while a task is running into one follow-up task', async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const run = vi.fn((value: string) => (value === 'first' ? first.promise : Promise.resolve(value)));
    const success = vi.fn();
    const discarded = vi.fn();
    const queue = new LatestTaskQueue({
      delayMs: 100,
      run,
      onStart: vi.fn(),
      onSuccess: success,
      onDiscard: discarded,
      onError: vi.fn(),
    });

    queue.enqueue('first');
    await vi.advanceTimersByTimeAsync(100);
    queue.enqueue('middle');
    queue.enqueue('latest');
    await vi.advanceTimersByTimeAsync(100);
    first.resolve('first.pdf');
    await vi.runAllTimersAsync();

    expect(run.mock.calls.map(([value]) => value)).toEqual(['first', 'latest']);
    expect(discarded).toHaveBeenCalledWith('first.pdf');
    expect(success).toHaveBeenCalledWith('latest');
    vi.useRealTimers();
  });

  it('does not publish a result after its queued input is cleared', async () => {
    vi.useFakeTimers();
    const task = deferred<string>();
    const success = vi.fn();
    const discarded = vi.fn();
    const queue = new LatestTaskQueue({
      delayMs: 100,
      run: () => task.promise,
      onStart: vi.fn(),
      onSuccess: success,
      onDiscard: discarded,
      onError: vi.fn(),
    });

    queue.enqueue('document');
    await vi.advanceTimersByTimeAsync(100);
    queue.clear();
    task.resolve('stale.pdf');
    await vi.runAllTimersAsync();

    expect(success).not.toHaveBeenCalled();
    expect(discarded).toHaveBeenCalledWith('stale.pdf');
    vi.useRealTimers();
  });
});
