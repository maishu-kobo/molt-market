import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('../src/db/index.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/services/experiment-events.js', () => ({
  recordExperimentEvent: vi.fn(),
  ExperimentEventName: {
    TASK_ASSIGNED: 'task_assigned',
    TASK_SUBMITTED: 'task_submitted',
    TASK_EVALUATED: 'task_evaluated',
    TASK_MISSED: 'task_missed',
  },
}));

vi.mock('../src/services/experiment-budget.js', () => ({
  adjustBudget: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────

import { pool } from '../src/db/index.js';
import { logger } from '../src/logger.js';
import { recordExperimentEvent } from '../src/services/experiment-events.js';
import { adjustBudget } from '../src/services/experiment-budget.js';
import {
  assignTask,
  submitTask,
  evaluateTask,
  checkDeadlines,
  listTasks,
} from '../src/services/experiment-tasks.js';

// ── Typed mock references ────────────────────────────────────────

const mockQuery = vi.mocked(pool.query);
const mockRecordEvent = vi.mocked(recordExperimentEvent);
const mockAdjustBudget = vi.mocked(adjustBudget);

// ── Shared fixtures ──────────────────────────────────────────────

const taskRow = {
  id: 'task-1',
  experiment_id: 'exp-1',
  agent_id: 'agent-1',
  title: 'Test task',
  description: null,
  deadline_ts: '2024-01-01T00:00:00Z',
  reward_usdc: '10',
  penalty_type: 'budget_deduction',
  penalty_value: '5',
  status: 'assigned',
  result: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── assignTask ───────────────────────────────────────────────────

describe('assignTask', () => {
  it('inserts a task and records TASK_ASSIGNED event', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [taskRow] } as never);

    const result = await assignTask({
      experimentId: 'exp-1',
      agentId: 'agent-1',
      title: 'Test task',
      description: 'Some description',
      deadlineTs: '2024-01-01T00:00:00Z',
      rewardUsdc: 10,
      penaltyType: 'budget_deduction',
      penaltyValue: 5,
    });

    expect(result).toEqual(taskRow);

    // Verify INSERT query
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO experiment_tasks');
    expect(params).toEqual([
      'exp-1',
      'agent-1',
      'Test task',
      'Some description',
      '2024-01-01T00:00:00Z',
      10,
      'budget_deduction',
      5,
    ]);

    // Verify event
    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_assigned',
      metadata: { task_id: 'task-1', title: 'Test task', reward_usdc: 10 },
    });
  });

  it('uses nullish defaults for optional params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [taskRow] } as never);

    await assignTask({
      experimentId: 'exp-1',
      agentId: 'agent-1',
      title: 'Test task',
      rewardUsdc: 10,
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([
      'exp-1',
      'agent-1',
      'Test task',
      null,  // description ?? null
      null,  // deadlineTs ?? null
      10,
      null,  // penaltyType ?? null
      0,     // penaltyValue ?? 0
    ]);
  });
});

// ── submitTask ───────────────────────────────────────────────────

describe('submitTask', () => {
  it('updates to submitted and records TASK_SUBMITTED event', async () => {
    const submittedRow = { ...taskRow, status: 'submitted' };
    mockQuery.mockResolvedValueOnce({ rows: [submittedRow] } as never);

    const result = await submitTask('task-1', { score: 42 });

    expect(result).toEqual(submittedRow);

    // Verify UPDATE query
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("SET status = 'submitted'");
    expect(params).toEqual([JSON.stringify({ score: 42 }), 'task-1']);

    // Verify event
    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_submitted',
      metadata: { task_id: 'task-1' },
    });
  });

  it('passes JSON.stringify(result) when result object is provided', async () => {
    const submittedRow = { ...taskRow, status: 'submitted' };
    mockQuery.mockResolvedValueOnce({ rows: [submittedRow] } as never);

    await submitTask('task-1', { key: 'value', nested: { a: 1 } });

    const [, params] = mockQuery.mock.calls[0];
    expect(params![0]).toBe(JSON.stringify({ key: 'value', nested: { a: 1 } }));
  });

  it('passes null when result is not provided', async () => {
    const submittedRow = { ...taskRow, status: 'submitted' };
    mockQuery.mockResolvedValueOnce({ rows: [submittedRow] } as never);

    await submitTask('task-1');

    const [, params] = mockQuery.mock.calls[0];
    expect(params![0]).toBeNull();
  });

  it('throws when task is not found or wrong status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(submitTask('task-missing')).rejects.toThrow(
      "Task task-missing not found or not in 'assigned' status"
    );

    // Event should NOT be recorded
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });
});

// ── evaluateTask ─────────────────────────────────────────────────

describe('evaluateTask', () => {
  it('passed=true with reward > 0 calls adjustBudget with positive amount', async () => {
    const evaluatedRow = { ...taskRow, status: 'evaluated', reward_usdc: '10' };
    mockQuery.mockResolvedValueOnce({ rows: [evaluatedRow] } as never);

    const result = await evaluateTask('task-1', true);

    expect(result).toEqual(evaluatedRow);

    // adjustBudget called with positive reward
    expect(mockAdjustBudget).toHaveBeenCalledOnce();
    expect(mockAdjustBudget).toHaveBeenCalledWith(
      'exp-1',
      'agent-1',
      10,
      'task_reward:task-1'
    );

    // Event recorded
    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_evaluated',
      metadata: { task_id: 'task-1', passed: true },
    });
  });

  it('passed=true with reward = 0 does NOT call adjustBudget', async () => {
    const evaluatedRow = { ...taskRow, status: 'evaluated', reward_usdc: '0' };
    mockQuery.mockResolvedValueOnce({ rows: [evaluatedRow] } as never);

    await evaluateTask('task-1', true);

    expect(mockAdjustBudget).not.toHaveBeenCalled();

    // Event still recorded
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it('passed=false with penalty_type=budget_deduction and penalty > 0 calls adjustBudget with negative amount', async () => {
    const evaluatedRow = {
      ...taskRow,
      status: 'evaluated',
      penalty_type: 'budget_deduction',
      penalty_value: '5',
    };
    mockQuery.mockResolvedValueOnce({ rows: [evaluatedRow] } as never);

    await evaluateTask('task-1', false);

    expect(mockAdjustBudget).toHaveBeenCalledOnce();
    expect(mockAdjustBudget).toHaveBeenCalledWith(
      'exp-1',
      'agent-1',
      -5,
      'task_penalty:task-1'
    );

    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_evaluated',
      metadata: { task_id: 'task-1', passed: false },
    });
  });

  it('passed=false with penalty_type=budget_deduction and penalty = 0 does NOT call adjustBudget', async () => {
    const evaluatedRow = {
      ...taskRow,
      status: 'evaluated',
      penalty_type: 'budget_deduction',
      penalty_value: '0',
    };
    mockQuery.mockResolvedValueOnce({ rows: [evaluatedRow] } as never);

    await evaluateTask('task-1', false);

    expect(mockAdjustBudget).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it('passed=false with penalty_type=null does NOT call adjustBudget', async () => {
    const evaluatedRow = {
      ...taskRow,
      status: 'evaluated',
      penalty_type: null,
      penalty_value: '5',
    };
    mockQuery.mockResolvedValueOnce({ rows: [evaluatedRow] } as never);

    await evaluateTask('task-1', false);

    expect(mockAdjustBudget).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it('throws when task is not found or wrong status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(evaluateTask('task-missing', true)).rejects.toThrow(
      "Task task-missing not found or not in 'submitted' status"
    );

    expect(mockAdjustBudget).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });
});

// ── checkDeadlines ───────────────────────────────────────────────

describe('checkDeadlines', () => {
  it('returns 0 when no overdue tasks', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const count = await checkDeadlines();

    expect(count).toBe(0);
    expect(mockAdjustBudget).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('applies penalty for overdue task with budget_deduction and penalty > 0', async () => {
    const missedRow = {
      ...taskRow,
      status: 'missed',
      penalty_type: 'budget_deduction',
      penalty_value: '5',
    };
    mockQuery.mockResolvedValueOnce({ rows: [missedRow], rowCount: 1 } as never);

    const count = await checkDeadlines();

    expect(count).toBe(1);

    expect(mockAdjustBudget).toHaveBeenCalledOnce();
    expect(mockAdjustBudget).toHaveBeenCalledWith(
      'exp-1',
      'agent-1',
      -5,
      'task_missed:task-1'
    );

    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_missed',
      metadata: { task_id: 'task-1', deadline_ts: '2024-01-01T00:00:00Z' },
    });
  });

  it('skips adjustBudget for overdue task with budget_deduction and penalty = 0', async () => {
    const missedRow = {
      ...taskRow,
      status: 'missed',
      penalty_type: 'budget_deduction',
      penalty_value: '0',
    };
    mockQuery.mockResolvedValueOnce({ rows: [missedRow], rowCount: 1 } as never);

    const count = await checkDeadlines();

    expect(count).toBe(1);
    expect(mockAdjustBudget).not.toHaveBeenCalled();

    // Event is still recorded
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it('skips adjustBudget for overdue task with no penalty_type', async () => {
    const missedRow = {
      ...taskRow,
      status: 'missed',
      penalty_type: null,
      penalty_value: '5',
    };
    mockQuery.mockResolvedValueOnce({ rows: [missedRow], rowCount: 1 } as never);

    const count = await checkDeadlines();

    expect(count).toBe(1);
    expect(mockAdjustBudget).not.toHaveBeenCalled();

    // Event is still recorded
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it('catches adjustBudget failure without throwing', async () => {
    const missedRow = {
      ...taskRow,
      status: 'missed',
      penalty_type: 'budget_deduction',
      penalty_value: '5',
    };
    mockQuery.mockResolvedValueOnce({ rows: [missedRow], rowCount: 1 } as never);

    const budgetError = new Error('Insufficient budget');
    mockAdjustBudget.mockRejectedValueOnce(budgetError);

    // Must not throw
    const count = await checkDeadlines();

    expect(count).toBe(1);
    expect(mockAdjustBudget).toHaveBeenCalledOnce();

    // Error is logged
    expect(logger.warn).toHaveBeenCalledWith(
      { err: budgetError, taskId: 'task-1' },
      'Failed to apply deadline penalty'
    );

    // Event is still recorded even after budget error
    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_missed',
      metadata: { task_id: 'task-1', deadline_ts: '2024-01-01T00:00:00Z' },
    });
  });

  it('always records TASK_MISSED event for each overdue task', async () => {
    const missedRow1 = { ...taskRow, id: 'task-1', agent_id: 'agent-1', penalty_type: null };
    const missedRow2 = { ...taskRow, id: 'task-2', agent_id: 'agent-2', penalty_type: null };
    mockQuery.mockResolvedValueOnce({ rows: [missedRow1, missedRow2], rowCount: 2 } as never);

    const count = await checkDeadlines();

    expect(count).toBe(2);
    expect(mockAdjustBudget).not.toHaveBeenCalled();

    expect(mockRecordEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'task_missed',
      metadata: { task_id: 'task-1', deadline_ts: '2024-01-01T00:00:00Z' },
    });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-2',
      event: 'task_missed',
      metadata: { task_id: 'task-2', deadline_ts: '2024-01-01T00:00:00Z' },
    });
  });

  it('returns 0 when rowCount is null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: null } as never);

    const count = await checkDeadlines();

    expect(count).toBe(0);
  });
});

// ── listTasks ────────────────────────────────────────────────────

describe('listTasks', () => {
  it('returns tasks with all filters applied', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [taskRow] } as never);

    const result = await listTasks('exp-1', {
      status: 'assigned',
      agentId: 'agent-1',
      limit: 20,
      offset: 10,
    });

    expect(result).toEqual([taskRow]);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE experiment_id = $1');
    expect(sql).toContain('AND status = $2');
    expect(sql).toContain('AND agent_id = $3');
    expect(sql).toContain('LIMIT $4 OFFSET $5');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual(['exp-1', 'assigned', 'agent-1', 20, 10]);
  });

  it('uses default limit=50 and offset=0 without optional filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const result = await listTasks('exp-1');

    expect(result).toEqual([]);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE experiment_id = $1');
    expect(sql).not.toContain('AND status');
    expect(sql).not.toContain('AND agent_id');
    expect(sql).toContain('LIMIT $2 OFFSET $3');
    expect(params).toEqual(['exp-1', 50, 0]);
  });

  it('applies only status filter when agentId is not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [taskRow] } as never);

    await listTasks('exp-1', { status: 'submitted' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('AND status = $2');
    expect(sql).not.toContain('AND agent_id');
    expect(sql).toContain('LIMIT $3 OFFSET $4');
    expect(params).toEqual(['exp-1', 'submitted', 50, 0]);
  });

  it('applies only agentId filter when status is not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [taskRow] } as never);

    await listTasks('exp-1', { agentId: 'agent-1' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('AND status');
    expect(sql).toContain('AND agent_id = $2');
    expect(sql).toContain('LIMIT $3 OFFSET $4');
    expect(params).toEqual(['exp-1', 'agent-1', 50, 0]);
  });
});
