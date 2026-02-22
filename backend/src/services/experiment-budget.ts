import { pool } from '../db/index.js';
import {
  recordExperimentEvent,
  ExperimentEventName,
} from './experiment-events.js';

export type BudgetRow = {
  id: string;
  experiment_id: string;
  agent_id: string;
  initial_budget_usdc: string;
  current_budget_usdc: string;
  created_at: string;
  updated_at: string;
};

/**
 * Initialise a budget for an agent in an experiment.
 * Uses INSERT … ON CONFLICT DO NOTHING so it is safe to call repeatedly.
 */
export async function initBudget(
  experimentId: string,
  agentId: string,
  initialBudgetUsdc: number
): Promise<BudgetRow> {
  const result = await pool.query(
    `INSERT INTO experiment_budgets
       (id, experiment_id, agent_id, initial_budget_usdc, current_budget_usdc)
     VALUES (gen_random_uuid(), $1, $2, $3, $3)
     ON CONFLICT (experiment_id, agent_id) DO NOTHING
     RETURNING *`,
    [experimentId, agentId, initialBudgetUsdc]
  );

  // If ON CONFLICT hit, fetch existing row
  if (result.rows.length === 0) {
    const existing = await pool.query(
      `SELECT * FROM experiment_budgets
       WHERE experiment_id = $1 AND agent_id = $2`,
      [experimentId, agentId]
    );
    return existing.rows[0] as BudgetRow;
  }

  return result.rows[0] as BudgetRow;
}

/**
 * Adjust an agent's budget by deltaUsdc (positive = credit, negative = debit).
 * Records a BUDGET_CHANGE experiment event.
 */
export async function adjustBudget(
  experimentId: string,
  agentId: string,
  deltaUsdc: number,
  reason: string
): Promise<BudgetRow> {
  const result = await pool.query(
    `UPDATE experiment_budgets
        SET current_budget_usdc = current_budget_usdc + $1,
            updated_at = now()
      WHERE experiment_id = $2 AND agent_id = $3
      RETURNING *`,
    [deltaUsdc, experimentId, agentId]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Budget not found for experiment=${experimentId} agent=${agentId}`
    );
  }

  const row = result.rows[0] as BudgetRow;

  await recordExperimentEvent({
    experiment_id: experimentId,
    condition: 'B',
    agent_id: agentId,
    event: ExperimentEventName.BUDGET_CHANGE,
    metadata: {
      delta_usdc: deltaUsdc,
      new_balance: row.current_budget_usdc,
      reason,
    },
  });

  return row;
}

/**
 * Get the current budget for an agent in an experiment.
 */
export async function getBudget(
  experimentId: string,
  agentId: string
): Promise<BudgetRow | null> {
  const result = await pool.query(
    `SELECT * FROM experiment_budgets
     WHERE experiment_id = $1 AND agent_id = $2`,
    [experimentId, agentId]
  );
  return (result.rows[0] as BudgetRow) ?? null;
}

/**
 * Get all budgets for an experiment.
 */
export async function listBudgets(
  experimentId: string
): Promise<BudgetRow[]> {
  const result = await pool.query(
    `SELECT * FROM experiment_budgets
     WHERE experiment_id = $1
     ORDER BY agent_id`,
    [experimentId]
  );
  return result.rows as BudgetRow[];
}
