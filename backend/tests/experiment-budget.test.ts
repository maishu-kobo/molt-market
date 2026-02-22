import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/index.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../src/services/experiment-events.js', () => ({
  recordExperimentEvent: vi.fn(),
  ExperimentEventName: {
    BUDGET_CHANGE: 'budget_change',
  },
}));

import { pool } from '../src/db/index.js';
import { recordExperimentEvent } from '../src/services/experiment-events.js';
import {
  initBudget,
  adjustBudget,
  getBudget,
  listBudgets,
} from '../src/services/experiment-budget.js';

const mockQuery = vi.mocked(pool.query);
const mockRecordEvent = vi.mocked(recordExperimentEvent);

const fakeBudgetRow = {
  id: 'budget-1',
  experiment_id: 'exp-1',
  agent_id: 'agent-1',
  initial_budget_usdc: '100',
  current_budget_usdc: '100',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initBudget', () => {
  it('returns the newly inserted row on fresh insert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeBudgetRow] } as never);

    const result = await initBudget('exp-1', 'agent-1', 100);

    expect(result).toEqual(fakeBudgetRow);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO experiment_budgets'),
      ['exp-1', 'agent-1', 100]
    );
  });

  it('fetches the existing row when ON CONFLICT is hit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    mockQuery.mockResolvedValueOnce({ rows: [fakeBudgetRow] } as never);

    const result = await initBudget('exp-1', 'agent-1', 100);

    expect(result).toEqual(fakeBudgetRow);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT * FROM experiment_budgets'),
      ['exp-1', 'agent-1']
    );
  });
});

describe('adjustBudget', () => {
  it('updates budget, records event, and returns the row', async () => {
    const updatedRow = {
      ...fakeBudgetRow,
      current_budget_usdc: '80',
      updated_at: '2025-01-02T00:00:00Z',
    };
    mockQuery.mockResolvedValueOnce({ rows: [updatedRow] } as never);
    mockRecordEvent.mockResolvedValueOnce(undefined as never);

    const result = await adjustBudget('exp-1', 'agent-1', -20, 'purchase');

    expect(result).toEqual(updatedRow);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE experiment_budgets'),
      [-20, 'exp-1', 'agent-1']
    );
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordEvent).toHaveBeenCalledWith({
      experiment_id: 'exp-1',
      condition: 'B',
      agent_id: 'agent-1',
      event: 'budget_change',
      metadata: {
        delta_usdc: -20,
        new_balance: '80',
        reason: 'purchase',
      },
    });
  });

  it('throws when budget is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(
      adjustBudget('exp-404', 'agent-404', -10, 'purchase')
    ).rejects.toThrow(
      'Budget not found for experiment=exp-404 agent=agent-404'
    );

    expect(mockRecordEvent).not.toHaveBeenCalled();
  });
});

describe('getBudget', () => {
  it('returns the row when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeBudgetRow] } as never);

    const result = await getBudget('exp-1', 'agent-1');

    expect(result).toEqual(fakeBudgetRow);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM experiment_budgets'),
      ['exp-1', 'agent-1']
    );
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const result = await getBudget('exp-404', 'agent-404');

    expect(result).toBeNull();
  });
});

describe('listBudgets', () => {
  it('returns an array of budget rows', async () => {
    const secondRow = {
      ...fakeBudgetRow,
      id: 'budget-2',
      agent_id: 'agent-2',
    };
    mockQuery.mockResolvedValueOnce({
      rows: [fakeBudgetRow, secondRow],
    } as never);

    const result = await listBudgets('exp-1');

    expect(result).toEqual([fakeBudgetRow, secondRow]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM experiment_budgets'),
      ['exp-1']
    );
  });
});
