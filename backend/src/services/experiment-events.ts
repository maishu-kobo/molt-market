import { pool } from '../db/index.js';
import { logger } from '../logger.js';

export const ExperimentEventName = {
  VISIT_MARKET: 'visit_market',
  VIEW_PRODUCT: 'view_product',
  LIST_PRODUCTS: 'list_products',
  SEARCH_QUERY: 'search_query',
  ATTEMPT_PURCHASE: 'attempt_purchase',
  TX_SUBMITTED: 'tx_submitted',
  TX_CONFIRMED: 'tx_confirmed',
  PURCHASE_SUCCESS: 'purchase_success',
  PURCHASE_FAILED: 'purchase_failed',
  TASK_ASSIGNED: 'task_assigned',
  TASK_SUBMITTED: 'task_submitted',
  TASK_EVALUATED: 'task_evaluated',
  TASK_MISSED: 'task_missed',
  BUDGET_CHANGE: 'budget_change',
} as const;

export type ExperimentEventNameType =
  (typeof ExperimentEventName)[keyof typeof ExperimentEventName];

export const FailureReason = {
  NO_NEED: 'no_need',
  BUILD_INSTEAD: 'build_instead',
  PRICE_TOO_HIGH: 'price_too_high',
  CANNOT_EVALUATE_QUALITY: 'cannot_evaluate_quality',
  TRUST_ISSUE: 'trust_issue',
  PURCHASE_FRICTION: 'purchase_friction',
  NO_DISCOVERY: 'no_discovery',
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  TX_REVERTED: 'tx_reverted',
} as const;

export type ExperimentContext = {
  experiment_id: string;
  condition: string;
  agent_id: string;
  session_id: string;
} | null;

export type ExperimentEvent = {
  experiment_id: string;
  condition: string;
  agent_id?: string;
  session_id?: string;
  event: string;
  product_id?: string;
  price_usdc?: number | string;
  tx_hash?: string;
  status?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Extract the four base fields from a non-null ExperimentContext
 * for use in recordExperimentEvent calls.
 */
export function buildEventBase(ctx: NonNullable<ExperimentContext>) {
  return {
    experiment_id: ctx.experiment_id,
    condition: ctx.condition,
    agent_id: ctx.agent_id,
    session_id: ctx.session_id,
  };
}

/**
 * Record an experiment event. Fire-and-forget: errors are logged but
 * never thrown so callers are never blocked.
 */
export async function recordExperimentEvent(
  event: ExperimentEvent
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO experiment_events
         (id, experiment_id, condition, agent_id, session_id,
          event, product_id, price_usdc, tx_hash, status, reason, metadata)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.experiment_id,
        event.condition,
        event.agent_id ?? null,
        event.session_id ?? null,
        event.event,
        event.product_id ?? null,
        event.price_usdc ?? null,
        event.tx_hash ?? null,
        event.status ?? null,
        event.reason ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );
  } catch (err) {
    logger.warn({ err, event: event.event }, 'Failed to record experiment event');
  }
}
