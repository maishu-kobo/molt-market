import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/experiment-tasks.js', () => ({
  checkDeadlines: vi.fn(),
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { checkDeadlines } from '../src/services/experiment-tasks.js';
import { logger } from '../src/logger.js';
import { startDeadlineChecker } from '../src/queue/deadline-checker.js';

const mockCheckDeadlines = vi.mocked(checkDeadlines);
const mockLogger = vi.mocked(logger);

describe('deadline-checker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls poll immediately on start and logs startup', async () => {
    mockCheckDeadlines.mockResolvedValueOnce(0);

    startDeadlineChecker();
    await vi.advanceTimersByTimeAsync(0); // flush the immediate poll()

    expect(mockCheckDeadlines).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { intervalMs: 30_000 },
      'Deadline checker started',
    );
  });

  it('returns a timer that can be cleared', async () => {
    mockCheckDeadlines.mockResolvedValue(0);

    const timer = startDeadlineChecker();
    await vi.advanceTimersByTimeAsync(0);

    expect(timer).toBeDefined();

    // Clear the interval and advance time — no additional poll calls
    clearInterval(timer);
    const callsAfterClear = mockCheckDeadlines.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockCheckDeadlines).toHaveBeenCalledTimes(callsAfterClear);
  });

  it('logs info when checkDeadlines returns count > 0', async () => {
    mockCheckDeadlines.mockResolvedValueOnce(3);

    startDeadlineChecker();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogger.info).toHaveBeenCalledWith(
      { count: 3 },
      'Marked overdue experiment tasks as missed',
    );
  });

  it('does NOT log overdue info when checkDeadlines returns 0', async () => {
    mockCheckDeadlines.mockResolvedValueOnce(0);

    startDeadlineChecker();
    await vi.advanceTimersByTimeAsync(0);

    // The only info log should be the startup message
    const infoCalls = mockLogger.info.mock.calls;
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0]).toEqual([
      { intervalMs: 30_000 },
      'Deadline checker started',
    ]);
  });

  it('logs error and never crashes when checkDeadlines throws', async () => {
    const pollError = new Error('DB timeout');
    mockCheckDeadlines.mockRejectedValueOnce(pollError);

    // Must not throw
    startDeadlineChecker();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: pollError },
      'Deadline checker poll failed',
    );
  });

  it('runs poll on each 30-second interval tick', async () => {
    mockCheckDeadlines.mockResolvedValue(0);

    startDeadlineChecker();
    await vi.advanceTimersByTimeAsync(0); // flush immediate poll
    expect(mockCheckDeadlines).toHaveBeenCalledTimes(1);

    // Advance 30 seconds — second poll
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockCheckDeadlines).toHaveBeenCalledTimes(2);

    // Advance another 30 seconds — third poll
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockCheckDeadlines).toHaveBeenCalledTimes(3);
  });
});
