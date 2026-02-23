import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ── Mocks (hoisted to avoid reference-before-init) ───────────────

const {
  mockQuery,
  mockAssignTask,
  mockSubmitTask,
  mockEvaluateTask,
  mockListTasks,
  mockInitBudget,
  mockListBudgets,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockAssignTask: vi.fn(),
  mockSubmitTask: vi.fn(),
  mockEvaluateTask: vi.fn(),
  mockListTasks: vi.fn(),
  mockInitBudget: vi.fn(),
  mockListBudgets: vi.fn(),
}));

vi.mock('../src/db/index.js', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/services/experiment-tasks.js', () => ({
  assignTask: mockAssignTask,
  submitTask: mockSubmitTask,
  evaluateTask: mockEvaluateTask,
  listTasks: mockListTasks,
}));

vi.mock('../src/services/experiment-budget.js', () => ({
  initBudget: mockInitBudget,
  listBudgets: mockListBudgets,
}));

// ── Import under test ────────────────────────────────────────────

import { experimentsRouter } from '../src/routes/experiments.js';

function createApp() {
  const app = new Hono();
  app.route('/experiments', experimentsRouter);
  return app;
}

// ── Helpers ──────────────────────────────────────────────────────

const EXP_ID = 'exp-001';
const TASK_ID = 'task-001';

function jsonPost(body: unknown) {
  return {
    method: 'POST' as const,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function brokenJsonPost() {
  return {
    method: 'POST' as const,
    headers: { 'content-type': 'application/json' },
    body: '{',
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('experiments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────
  // GET /:id/events
  // ────────────────────────────────────────────────────────────────
  describe('GET /:id/events', () => {
    it('returns paginated events on success', async () => {
      const rows = [
        { id: 1, event: 'created', experiment_id: EXP_ID },
        { id: 2, event: 'started', experiment_id: EXP_ID },
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events?limit=10&offset=0`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual(rows);
      expect(body.pagination).toEqual({ limit: 10, offset: 0, count: 2 });

      // Verify the SQL query was called with correct params
      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('experiment_id = $1');
      expect(params).toEqual([EXP_ID, 10, 0]);
    });

    it('applies event filter query param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, event: 'started' }] });

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events?event=started&limit=5&offset=0`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination.count).toBe(1);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('AND event = $2');
      expect(params).toEqual([EXP_ID, 'started', 5, 0]);
    });

    it('uses default limit=50 and offset=0 when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events`);
      expect(res.status).toBe(200);

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([EXP_ID, 50, 0]);
    });

    it('caps limit at 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events?limit=500`);
      expect(res.status).toBe(200);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe(200);
    });

    it('returns 400 for invalid pagination (negative limit)', async () => {
      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events?limit=-1`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_pagination');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid pagination (negative offset)', async () => {
      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events?offset=-5`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_pagination');
    });

    it('returns 400 for NaN limit', async () => {
      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events?limit=abc`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_pagination');
    });

    it('returns 500 when pool.query throws', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection lost'));

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/events`);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('query_failed');
      expect(body.message).toBe('Failed to query experiment events.');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /:id/budgets
  // ────────────────────────────────────────────────────────────────
  describe('GET /:id/budgets', () => {
    it('returns budgets on success', async () => {
      const budgets = [
        { agent_id: 'agent-1', remaining_usdc: 100 },
        { agent_id: 'agent-2', remaining_usdc: 50 },
      ];
      mockListBudgets.mockResolvedValueOnce(budgets);

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/budgets`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual(budgets);
      expect(mockListBudgets).toHaveBeenCalledWith(EXP_ID);
    });

    it('returns 500 when listBudgets throws', async () => {
      mockListBudgets.mockRejectedValueOnce(new Error('db error'));

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/budgets`);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('query_failed');
      expect(body.message).toBe('Failed to query experiment budgets.');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /:id/tasks
  // ────────────────────────────────────────────────────────────────
  describe('GET /:id/tasks', () => {
    it('returns paginated tasks on success', async () => {
      const tasks = [{ id: 'task-1', title: 'Do something' }];
      mockListTasks.mockResolvedValueOnce(tasks);

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/tasks?limit=20&offset=5`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual(tasks);
      expect(body.pagination).toEqual({ limit: 20, offset: 5, count: 1 });
      expect(mockListTasks).toHaveBeenCalledWith(EXP_ID, {
        status: undefined,
        agentId: undefined,
        limit: 20,
        offset: 5,
      });
    });

    it('passes status and agent_id filters', async () => {
      mockListTasks.mockResolvedValueOnce([]);

      const app = createApp();
      const res = await app.request(
        `/experiments/${EXP_ID}/tasks?status=pending&agent_id=agent-1&limit=10&offset=0`
      );
      expect(res.status).toBe(200);

      expect(mockListTasks).toHaveBeenCalledWith(EXP_ID, {
        status: 'pending',
        agentId: 'agent-1',
        limit: 10,
        offset: 0,
      });
    });

    it('uses default limit and offset when not provided', async () => {
      mockListTasks.mockResolvedValueOnce([]);

      const app = createApp();
      await app.request(`/experiments/${EXP_ID}/tasks`);

      expect(mockListTasks).toHaveBeenCalledWith(EXP_ID, {
        status: undefined,
        agentId: undefined,
        limit: 50,
        offset: 0,
      });
    });

    it('returns 400 for invalid pagination', async () => {
      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/tasks?limit=-1`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_pagination');
      expect(mockListTasks).not.toHaveBeenCalled();
    });

    it('returns 400 for NaN offset', async () => {
      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/tasks?offset=xyz`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_pagination');
    });

    it('returns 500 when listTasks throws', async () => {
      mockListTasks.mockRejectedValueOnce(new Error('timeout'));

      const app = createApp();
      const res = await app.request(`/experiments/${EXP_ID}/tasks`);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('query_failed');
      expect(body.message).toBe('Failed to query experiment tasks.');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /:id/tasks
  // ────────────────────────────────────────────────────────────────
  describe('POST /:id/tasks', () => {
    const validPayload = {
      agent_id: 'agent-1',
      title: 'Solve problem X',
      description: 'Detailed description',
      reward_usdc: 5.0,
    };

    it('returns 201 on success', async () => {
      const created = { id: TASK_ID, ...validPayload };
      mockAssignTask.mockResolvedValueOnce(created);

      const app = createApp();
      const res = await app.request(
        `/experiments/${EXP_ID}/tasks`,
        jsonPost(validPayload)
      );
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBe(TASK_ID);

      expect(mockAssignTask).toHaveBeenCalledWith({
        experimentId: EXP_ID,
        agentId: 'agent-1',
        title: 'Solve problem X',
        description: 'Detailed description',
        deadlineTs: undefined,
        rewardUsdc: 5.0,
        penaltyType: undefined,
        penaltyValue: undefined,
      });
    });

    it('returns 400 for invalid JSON', async () => {
      const app = createApp();
      const res = await app.request(
        `/experiments/${EXP_ID}/tasks`,
        brokenJsonPost()
      );
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_json');
    });

    it('returns 422 for validation error (missing required fields)', async () => {
      const app = createApp();
      const res = await app.request(
        `/experiments/${EXP_ID}/tasks`,
        jsonPost({ agent_id: '' })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
      expect(body.details).toBeDefined();
      expect(body.details.fields).toBeDefined();
    });

    it('returns 422 when reward_usdc is negative', async () => {
      const app = createApp();
      const res = await app.request(
        `/experiments/${EXP_ID}/tasks`,
        jsonPost({
          ...validPayload,
          reward_usdc: -1,
        })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 500 when assignTask throws', async () => {
      mockAssignTask.mockRejectedValueOnce(new Error('db write failed'));

      const app = createApp();
      const res = await app.request(
        `/experiments/${EXP_ID}/tasks`,
        jsonPost(validPayload)
      );
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('task_assign_failed');
      expect(body.message).toBe('Failed to assign task.');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /:id/tasks/:tid/submit
  // ────────────────────────────────────────────────────────────────
  describe('POST /:id/tasks/:tid/submit', () => {
    const submitUrl = `/experiments/${EXP_ID}/tasks/${TASK_ID}/submit`;

    it('returns 200 on success with empty body', async () => {
      const submitted = { id: TASK_ID, status: 'submitted' };
      mockSubmitTask.mockResolvedValueOnce(submitted);

      const app = createApp();
      const res = await app.request(submitUrl, jsonPost({}));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(TASK_ID);
      expect(mockSubmitTask).toHaveBeenCalledWith(TASK_ID, undefined);
    });

    it('returns 200 with result body', async () => {
      const resultData = { answer: 42 };
      const submitted = { id: TASK_ID, status: 'submitted', result: resultData };
      mockSubmitTask.mockResolvedValueOnce(submitted);

      const app = createApp();
      const res = await app.request(
        submitUrl,
        jsonPost({ result: resultData })
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.result).toEqual(resultData);
      expect(mockSubmitTask).toHaveBeenCalledWith(TASK_ID, resultData);
    });

    it('handles invalid JSON gracefully (body defaults to {})', async () => {
      // The submit endpoint catches JSON parse errors and sets body = {}
      // submitTaskSchema accepts {} (result is optional), so it proceeds
      const submitted = { id: TASK_ID, status: 'submitted' };
      mockSubmitTask.mockResolvedValueOnce(submitted);

      const app = createApp();
      const res = await app.request(submitUrl, brokenJsonPost());
      expect(res.status).toBe(200);

      expect(mockSubmitTask).toHaveBeenCalledWith(TASK_ID, undefined);
    });

    it('returns 422 when result is not a record', async () => {
      const app = createApp();
      const res = await app.request(
        submitUrl,
        jsonPost({ result: 'not-an-object' })
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 404 when submitTask throws "not found"', async () => {
      mockSubmitTask.mockRejectedValueOnce(new Error('Task not found'));

      const app = createApp();
      const res = await app.request(submitUrl, jsonPost({}));
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error_code).toBe('task_not_found');
      expect(body.message).toBe('Task not found');
    });

    it('returns 404 when submitTask throws "not in" message', async () => {
      mockSubmitTask.mockRejectedValueOnce(
        new Error('Task is not in assigned status')
      );

      const app = createApp();
      const res = await app.request(submitUrl, jsonPost({}));
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error_code).toBe('task_not_found');
      expect(body.message).toContain('not in');
    });

    it('returns 500 when submitTask throws generic error', async () => {
      mockSubmitTask.mockRejectedValueOnce(new Error('database crash'));

      const app = createApp();
      const res = await app.request(submitUrl, jsonPost({}));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('task_submit_failed');
      expect(body.message).toBe('Failed to submit task.');
    });

    it('returns 500 when submitTask throws non-Error value', async () => {
      mockSubmitTask.mockRejectedValueOnce('some string error');

      const app = createApp();
      const res = await app.request(submitUrl, jsonPost({}));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('task_submit_failed');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /:id/tasks/:tid/evaluate
  // ────────────────────────────────────────────────────────────────
  describe('POST /:id/tasks/:tid/evaluate', () => {
    const evalUrl = `/experiments/${EXP_ID}/tasks/${TASK_ID}/evaluate`;

    it('returns 200 on success (passed: true)', async () => {
      const evaluated = { id: TASK_ID, status: 'passed' };
      mockEvaluateTask.mockResolvedValueOnce(evaluated);

      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({ passed: true }));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('passed');
      expect(mockEvaluateTask).toHaveBeenCalledWith(TASK_ID, true);
    });

    it('returns 200 on success (passed: false)', async () => {
      const evaluated = { id: TASK_ID, status: 'failed' };
      mockEvaluateTask.mockResolvedValueOnce(evaluated);

      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({ passed: false }));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('failed');
      expect(mockEvaluateTask).toHaveBeenCalledWith(TASK_ID, false);
    });

    it('returns 400 for invalid JSON', async () => {
      const app = createApp();
      const res = await app.request(evalUrl, brokenJsonPost());
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_json');
      expect(mockEvaluateTask).not.toHaveBeenCalled();
    });

    it('returns 422 for validation error (missing passed)', async () => {
      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({}));
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
      expect(body.details.fields).toBeDefined();
    });

    it('returns 422 when passed is not boolean', async () => {
      const app = createApp();
      const res = await app.request(
        evalUrl,
        jsonPost({ passed: 'yes' })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 404 when evaluateTask throws "not found"', async () => {
      mockEvaluateTask.mockRejectedValueOnce(new Error('Task not found'));

      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({ passed: true }));
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error_code).toBe('task_not_found');
      expect(body.message).toBe('Task not found');
    });

    it('returns 404 when evaluateTask throws "not in" message', async () => {
      mockEvaluateTask.mockRejectedValueOnce(
        new Error('Task is not in submitted status')
      );

      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({ passed: true }));
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error_code).toBe('task_not_found');
      expect(body.message).toContain('not in');
    });

    it('returns 500 when evaluateTask throws generic error', async () => {
      mockEvaluateTask.mockRejectedValueOnce(new Error('unexpected failure'));

      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({ passed: true }));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('task_evaluate_failed');
      expect(body.message).toBe('Failed to evaluate task.');
    });

    it('returns 500 when evaluateTask throws non-Error value', async () => {
      mockEvaluateTask.mockRejectedValueOnce('raw string error');

      const app = createApp();
      const res = await app.request(evalUrl, jsonPost({ passed: false }));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('task_evaluate_failed');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /:id/budgets
  // ────────────────────────────────────────────────────────────────
  describe('POST /:id/budgets', () => {
    const budgetUrl = `/experiments/${EXP_ID}/budgets`;
    const validBudget = { agent_id: 'agent-1', initial_budget_usdc: 100 };

    it('returns 201 on success', async () => {
      const created = { experiment_id: EXP_ID, agent_id: 'agent-1', remaining_usdc: 100 };
      mockInitBudget.mockResolvedValueOnce(created);

      const app = createApp();
      const res = await app.request(budgetUrl, jsonPost(validBudget));
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.remaining_usdc).toBe(100);
      expect(mockInitBudget).toHaveBeenCalledWith(EXP_ID, 'agent-1', 100);
    });

    it('returns 400 for invalid JSON', async () => {
      const app = createApp();
      const res = await app.request(budgetUrl, brokenJsonPost());
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error_code).toBe('invalid_json');
      expect(mockInitBudget).not.toHaveBeenCalled();
    });

    it('returns 422 for validation error (missing agent_id)', async () => {
      const app = createApp();
      const res = await app.request(
        budgetUrl,
        jsonPost({ initial_budget_usdc: 100 })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
      expect(body.details.fields).toBeDefined();
    });

    it('returns 422 for validation error (missing initial_budget_usdc)', async () => {
      const app = createApp();
      const res = await app.request(
        budgetUrl,
        jsonPost({ agent_id: 'agent-1' })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 422 when initial_budget_usdc is zero', async () => {
      const app = createApp();
      const res = await app.request(
        budgetUrl,
        jsonPost({ agent_id: 'agent-1', initial_budget_usdc: 0 })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 422 when initial_budget_usdc is negative', async () => {
      const app = createApp();
      const res = await app.request(
        budgetUrl,
        jsonPost({ agent_id: 'agent-1', initial_budget_usdc: -10 })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 422 when agent_id is empty string', async () => {
      const app = createApp();
      const res = await app.request(
        budgetUrl,
        jsonPost({ agent_id: '', initial_budget_usdc: 50 })
      );
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body.error_code).toBe('validation_error');
    });

    it('returns 500 when initBudget throws', async () => {
      mockInitBudget.mockRejectedValueOnce(new Error('insert failed'));

      const app = createApp();
      const res = await app.request(budgetUrl, jsonPost(validBudget));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error_code).toBe('budget_init_failed');
      expect(body.message).toBe('Failed to initialize budget.');
    });
  });
});
