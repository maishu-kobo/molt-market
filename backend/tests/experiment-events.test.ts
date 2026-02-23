import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/index.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) }
}));
vi.mock('../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { pool } from '../src/db/index.js';
import { logger } from '../src/logger.js';
import {
  ExperimentEventName,
  FailureReason,
  recordExperimentEvent
} from '../src/services/experiment-events.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── ExperimentEventName constants ────────────────────────────────

describe('ExperimentEventName', () => {
  it('contains all expected event names with correct values', () => {
    expect(ExperimentEventName.VISIT_MARKET).toBe('visit_market');
    expect(ExperimentEventName.VIEW_PRODUCT).toBe('view_product');
    expect(ExperimentEventName.LIST_PRODUCTS).toBe('list_products');
    expect(ExperimentEventName.SEARCH_QUERY).toBe('search_query');
    expect(ExperimentEventName.ATTEMPT_PURCHASE).toBe('attempt_purchase');
    expect(ExperimentEventName.TX_SUBMITTED).toBe('tx_submitted');
    expect(ExperimentEventName.TX_CONFIRMED).toBe('tx_confirmed');
    expect(ExperimentEventName.PURCHASE_SUCCESS).toBe('purchase_success');
    expect(ExperimentEventName.PURCHASE_FAILED).toBe('purchase_failed');
    expect(ExperimentEventName.TASK_ASSIGNED).toBe('task_assigned');
    expect(ExperimentEventName.TASK_SUBMITTED).toBe('task_submitted');
    expect(ExperimentEventName.TASK_EVALUATED).toBe('task_evaluated');
    expect(ExperimentEventName.TASK_MISSED).toBe('task_missed');
    expect(ExperimentEventName.BUDGET_CHANGE).toBe('budget_change');
  });

  it('has exactly 14 event names', () => {
    expect(Object.keys(ExperimentEventName)).toHaveLength(14);
  });
});

// ── FailureReason constants ──────────────────────────────────────

describe('FailureReason', () => {
  it('contains all expected failure reasons with correct values', () => {
    expect(FailureReason.NO_NEED).toBe('no_need');
    expect(FailureReason.BUILD_INSTEAD).toBe('build_instead');
    expect(FailureReason.PRICE_TOO_HIGH).toBe('price_too_high');
    expect(FailureReason.CANNOT_EVALUATE_QUALITY).toBe('cannot_evaluate_quality');
    expect(FailureReason.TRUST_ISSUE).toBe('trust_issue');
    expect(FailureReason.PURCHASE_FRICTION).toBe('purchase_friction');
    expect(FailureReason.NO_DISCOVERY).toBe('no_discovery');
    expect(FailureReason.INSUFFICIENT_FUNDS).toBe('insufficient_funds');
    expect(FailureReason.TX_REVERTED).toBe('tx_reverted');
  });

  it('has exactly 9 failure reasons', () => {
    expect(Object.keys(FailureReason)).toHaveLength(9);
  });
});

// ── recordExperimentEvent ────────────────────────────────────────

describe('recordExperimentEvent', () => {
  it('inserts into experiment_events with all fields', async () => {
    await recordExperimentEvent({
      experiment_id: 'exp-1',
      condition: 'treatment',
      agent_id: 'agent-42',
      session_id: 'sess-99',
      event: ExperimentEventName.ATTEMPT_PURCHASE,
      product_id: 'prod-7',
      price_usdc: '25.50',
      tx_hash: '0xabc123',
      status: 'completed',
      reason: FailureReason.PRICE_TOO_HIGH,
      metadata: { source: 'api', retries: 3 }
    });

    expect(pool.query).toHaveBeenCalledOnce();

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('INSERT INTO experiment_events');
    expect(params).toEqual([
      'exp-1',
      'treatment',
      'agent-42',
      'sess-99',
      'attempt_purchase',
      'prod-7',
      '25.50',
      '0xabc123',
      'completed',
      'price_too_high',
      JSON.stringify({ source: 'api', retries: 3 })
    ]);
  });

  it('sets null for optional fields when they are omitted', async () => {
    await recordExperimentEvent({
      experiment_id: 'exp-2',
      condition: 'control',
      event: ExperimentEventName.VISIT_MARKET
    });

    expect(pool.query).toHaveBeenCalledOnce();

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual([
      'exp-2',
      'control',
      null,       // agent_id
      null,       // session_id
      'visit_market',
      null,       // product_id
      null,       // price_usdc
      null,       // tx_hash
      null,       // status
      null,       // reason
      null        // metadata
    ]);
  });

  it('JSON.stringifies metadata when provided', async () => {
    const metadata = { key: 'value', nested: { a: 1 } };

    await recordExperimentEvent({
      experiment_id: 'exp-3',
      condition: 'treatment',
      event: ExperimentEventName.SEARCH_QUERY,
      metadata
    });

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    // metadata is the last parameter (index 10)
    expect(params![10]).toBe(JSON.stringify(metadata));
  });

  it('passes null when metadata is explicitly undefined', async () => {
    await recordExperimentEvent({
      experiment_id: 'exp-4',
      condition: 'control',
      event: ExperimentEventName.BUDGET_CHANGE,
      metadata: undefined
    });

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params![10]).toBeNull();
  });

  it('catches DB errors and logs them without throwing', async () => {
    const dbError = new Error('connection refused');
    vi.mocked(pool.query).mockRejectedValueOnce(dbError);

    // Must not throw
    await expect(
      recordExperimentEvent({
        experiment_id: 'exp-5',
        condition: 'treatment',
        event: ExperimentEventName.TX_SUBMITTED
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: dbError, event: 'tx_submitted' },
      'Failed to record experiment event'
    );
  });

  it('returns void (undefined) on success', async () => {
    const result = await recordExperimentEvent({
      experiment_id: 'exp-6',
      condition: 'control',
      event: ExperimentEventName.PURCHASE_SUCCESS
    });

    expect(result).toBeUndefined();
  });

  it('uses nullish coalescing for each optional field individually', async () => {
    // Provide some optional fields but not others to verify each ?? null path
    await recordExperimentEvent({
      experiment_id: 'exp-7',
      condition: 'treatment',
      agent_id: 'agent-1',
      event: ExperimentEventName.VIEW_PRODUCT,
      product_id: 'prod-1',
      price_usdc: 10
    });

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual([
      'exp-7',
      'treatment',
      'agent-1',  // provided
      null,       // session_id omitted
      'view_product',
      'prod-1',   // provided
      10,         // provided as number
      null,       // tx_hash omitted
      null,       // status omitted
      null,       // reason omitted
      null        // metadata omitted
    ]);
  });
});
