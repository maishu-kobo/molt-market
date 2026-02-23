import { pool } from '../db/index.js';
import { logger } from '../logger.js';
import {
  recordExperimentEvent,
  ExperimentEventName,
} from './experiment-events.js';
import { adjustBudget } from './experiment-budget.js';

export type TaskRow = {
  id: string;
  experiment_id: string;
  agent_id: string;
  title: string;
  description: string | null;
  deadline_ts: string | null;
  reward_usdc: string;
  penalty_type: string | null;
  penalty_value: string;
  status: string;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AssignTaskParams = {
  experimentId: string;
  agentId: string;
  title: string;
  description?: string;
  deadlineTs?: string;
  rewardUsdc: number;
  penaltyType?: string;
  penaltyValue?: number;
};

/**
 * Assign a new task to an agent within an experiment.
 */
export async function assignTask(params: AssignTaskParams): Promise<TaskRow> {
  const result = await pool.query(
    `INSERT INTO experiment_tasks
       (id, experiment_id, agent_id, title, description,
        deadline_ts, reward_usdc, penalty_type, penalty_value, status)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'assigned')
     RETURNING *`,
    [
      params.experimentId,
      params.agentId,
      params.title,
      params.description ?? null,
      params.deadlineTs ?? null,
      params.rewardUsdc,
      params.penaltyType ?? null,
      params.penaltyValue ?? 0,
    ]
  );

  const task = result.rows[0] as TaskRow;

  await recordExperimentEvent({
    experiment_id: params.experimentId,
    condition: 'B',
    agent_id: params.agentId,
    event: ExperimentEventName.TASK_ASSIGNED,
    metadata: { task_id: task.id, title: params.title, reward_usdc: params.rewardUsdc },
  });

  return task;
}

/**
 * Mark a task as submitted by the agent.
 */
export async function submitTask(
  taskId: string,
  result?: Record<string, unknown>
): Promise<TaskRow> {
  const res = await pool.query(
    `UPDATE experiment_tasks
        SET status = 'submitted',
            result = $1,
            updated_at = now()
      WHERE id = $2 AND status = 'assigned'
      RETURNING *`,
    [result ? JSON.stringify(result) : null, taskId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Task ${taskId} not found or not in 'assigned' status`);
  }

  const task = res.rows[0] as TaskRow;

  await recordExperimentEvent({
    experiment_id: task.experiment_id,
    condition: 'B',
    agent_id: task.agent_id,
    event: ExperimentEventName.TASK_SUBMITTED,
    metadata: { task_id: task.id },
  });

  return task;
}

/**
 * Evaluate a submitted task. If passed, credit reward; if failed, apply penalty.
 */
export async function evaluateTask(
  taskId: string,
  passed: boolean
): Promise<TaskRow> {
  const res = await pool.query(
    `UPDATE experiment_tasks
        SET status = 'evaluated',
            updated_at = now()
      WHERE id = $1 AND status = 'submitted'
      RETURNING *`,
    [taskId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Task ${taskId} not found or not in 'submitted' status`);
  }

  const task = res.rows[0] as TaskRow;

  if (passed) {
    const reward = Number(task.reward_usdc);
    if (reward > 0) {
      await adjustBudget(
        task.experiment_id,
        task.agent_id,
        reward,
        `task_reward:${task.id}`
      );
    }
  } else if (task.penalty_type === 'budget_deduction') {
    const penalty = Number(task.penalty_value);
    if (penalty > 0) {
      await adjustBudget(
        task.experiment_id,
        task.agent_id,
        -penalty,
        `task_penalty:${task.id}`
      );
    }
  }

  await recordExperimentEvent({
    experiment_id: task.experiment_id,
    condition: 'B',
    agent_id: task.agent_id,
    event: ExperimentEventName.TASK_EVALUATED,
    metadata: { task_id: task.id, passed },
  });

  return task;
}

/**
 * Check for overdue tasks and mark them as missed, applying penalties.
 * Uses WHERE status='assigned' to prevent races with concurrent submits.
 */
export async function checkDeadlines(): Promise<number> {
  const res = await pool.query(
    `UPDATE experiment_tasks
        SET status = 'missed',
            updated_at = now()
      WHERE status = 'assigned'
        AND deadline_ts IS NOT NULL
        AND deadline_ts < now()
      RETURNING *`
  );

  for (const row of res.rows) {
    const task = row as TaskRow;

    if (task.penalty_type === 'budget_deduction') {
      const penalty = Number(task.penalty_value);
      if (penalty > 0) {
        try {
          await adjustBudget(
            task.experiment_id,
            task.agent_id,
            -penalty,
            `task_missed:${task.id}`
          );
        } catch (err) {
          logger.warn({ err, taskId: task.id }, 'Failed to apply deadline penalty');
        }
      }
    }

    await recordExperimentEvent({
      experiment_id: task.experiment_id,
      condition: 'B',
      agent_id: task.agent_id,
      event: ExperimentEventName.TASK_MISSED,
      metadata: { task_id: task.id, deadline_ts: task.deadline_ts },
    });
  }

  return res.rowCount ?? 0;
}

/**
 * List tasks for an experiment with optional filters.
 */
export async function listTasks(
  experimentId: string,
  filters?: { status?: string; agentId?: string; limit?: number; offset?: number }
): Promise<TaskRow[]> {
  const params: (string | number)[] = [experimentId];
  let query = 'SELECT * FROM experiment_tasks WHERE experiment_id = $1';
  let idx = 2;

  if (filters?.status) {
    query += ` AND status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters?.agentId) {
    query += ` AND agent_id = $${idx++}`;
    params.push(filters.agentId);
  }

  query += ` ORDER BY created_at DESC`;
  query += ` LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(filters?.limit ?? 50, filters?.offset ?? 0);

  const result = await pool.query(query, params);
  return result.rows as TaskRow[];
}
