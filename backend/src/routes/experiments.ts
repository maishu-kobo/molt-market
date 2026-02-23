import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { assignTask, submitTask, evaluateTask, listTasks } from '../services/experiment-tasks.js';
import { initBudget, listBudgets } from '../services/experiment-budget.js';
import { logger } from '../logger.js';

const assignTaskSchema = z.object({
  agent_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  deadline_ts: z.string().optional(),
  reward_usdc: z.number().min(0),
  penalty_type: z.string().optional(),
  penalty_value: z.number().min(0).optional(),
});

const submitTaskSchema = z.object({
  result: z.record(z.unknown()).optional(),
});

const evaluateTaskSchema = z.object({
  passed: z.boolean(),
});

const initBudgetSchema = z.object({
  agent_id: z.string().min(1),
  initial_budget_usdc: z.number().positive(),
});

export const experimentsRouter = new Hono();

// GET /experiments/:id/events — paginated event query
experimentsRouter.get('/:id/events', async (c) => {
  const experimentId = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);
  const eventFilter = c.req.query('event');

  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(offset) || offset < 0) {
    return errorResponse(c, 400, 'invalid_pagination',
      'Invalid pagination parameters.',
      'Provide positive limit and non-negative offset.');
  }

  const params: (string | number)[] = [experimentId];
  let query = 'SELECT * FROM experiment_events WHERE experiment_id = $1';
  let idx = 2;

  if (eventFilter) {
    query += ` AND event = $${idx++}`;
    params.push(eventFilter);
  }

  query += ` ORDER BY ts DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  try {
    const result = await pool.query(query, params);
    return c.json({
      data: result.rows,
      pagination: { limit, offset, count: result.rows.length },
    });
  } catch (err) {
    logger.error({ err, experimentId }, 'Failed to query experiment events');
    return errorResponse(c, 500, 'query_failed',
      'Failed to query experiment events.',
      'Retry later or contact support.');
  }
});

// GET /experiments/:id/budgets — budget state
experimentsRouter.get('/:id/budgets', async (c) => {
  const experimentId = c.req.param('id');

  try {
    const budgets = await listBudgets(experimentId);
    return c.json({ data: budgets });
  } catch (err) {
    logger.error({ err, experimentId }, 'Failed to query experiment budgets');
    return errorResponse(c, 500, 'query_failed',
      'Failed to query experiment budgets.',
      'Retry later or contact support.');
  }
});

// GET /experiments/:id/tasks — task list
experimentsRouter.get('/:id/tasks', async (c) => {
  const experimentId = c.req.param('id');
  const status = c.req.query('status');
  const agentId = c.req.query('agent_id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const offset = Number(c.req.query('offset') ?? 0);

  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(offset) || offset < 0) {
    return errorResponse(c, 400, 'invalid_pagination',
      'Invalid pagination parameters.',
      'Provide positive limit and non-negative offset.');
  }

  try {
    const tasks = await listTasks(experimentId, { status, agentId, limit, offset });
    return c.json({
      data: tasks,
      pagination: { limit, offset, count: tasks.length },
    });
  } catch (err) {
    logger.error({ err, experimentId }, 'Failed to query experiment tasks');
    return errorResponse(c, 500, 'query_failed',
      'Failed to query experiment tasks.',
      'Retry later or contact support.');
  }
});

// POST /experiments/:id/tasks — assign task
experimentsRouter.post('/:id/tasks', async (c) => {
  const experimentId = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, 'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.');
  }

  const parsed = assignTaskSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(c, 422, 'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields });
  }

  try {
    const task = await assignTask({
      experimentId,
      agentId: parsed.data.agent_id,
      title: parsed.data.title,
      description: parsed.data.description,
      deadlineTs: parsed.data.deadline_ts,
      rewardUsdc: parsed.data.reward_usdc,
      penaltyType: parsed.data.penalty_type,
      penaltyValue: parsed.data.penalty_value,
    });
    return c.json(task, 201);
  } catch (err) {
    logger.error({ err, experimentId }, 'Failed to assign task');
    return errorResponse(c, 500, 'task_assign_failed',
      'Failed to assign task.',
      'Retry later or contact support.');
  }
});

// POST /experiments/:id/tasks/:tid/submit — submit task
experimentsRouter.post('/:id/tasks/:tid/submit', async (c) => {
  const taskId = c.req.param('tid');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const parsed = submitTaskSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(c, 422, 'validation_error',
      'Invalid request body.',
      'Fix the highlighted fields and retry.',
      { fields });
  }

  try {
    const task = await submitTask(taskId, parsed.data.result);
    return c.json(task);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('not in')) {
      return errorResponse(c, 404, 'task_not_found',
        msg,
        'Check the task ID and its current status.');
    }
    logger.error({ err, taskId }, 'Failed to submit task');
    return errorResponse(c, 500, 'task_submit_failed',
      'Failed to submit task.',
      'Retry later or contact support.');
  }
});

// POST /experiments/:id/tasks/:tid/evaluate — evaluate task
experimentsRouter.post('/:id/tasks/:tid/evaluate', async (c) => {
  const taskId = c.req.param('tid');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, 'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.');
  }

  const parsed = evaluateTaskSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(c, 422, 'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields });
  }

  try {
    const task = await evaluateTask(taskId, parsed.data.passed);
    return c.json(task);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') || msg.includes('not in')) {
      return errorResponse(c, 404, 'task_not_found',
        msg,
        'Check the task ID and its current status.');
    }
    logger.error({ err, taskId }, 'Failed to evaluate task');
    return errorResponse(c, 500, 'task_evaluate_failed',
      'Failed to evaluate task.',
      'Retry later or contact support.');
  }
});

// POST /experiments/:id/budgets — init budget
experimentsRouter.post('/:id/budgets', async (c) => {
  const experimentId = c.req.param('id');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, 'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.');
  }

  const parsed = initBudgetSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(c, 422, 'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields });
  }

  try {
    const budget = await initBudget(
      experimentId,
      parsed.data.agent_id,
      parsed.data.initial_budget_usdc
    );
    return c.json(budget, 201);
  } catch (err) {
    logger.error({ err, experimentId }, 'Failed to init budget');
    return errorResponse(c, 500, 'budget_init_failed',
      'Failed to initialize budget.',
      'Retry later or contact support.');
  }
});
