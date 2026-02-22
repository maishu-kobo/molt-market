import { describe, expect, it, vi } from 'vitest';

const { mockRecordExperimentEvent, mockEnqueueTxVerification } = vi.hoisted(() => ({
  mockRecordExperimentEvent: vi.fn(),
  mockEnqueueTxVerification: vi.fn(),
}));

vi.mock('../src/services/experiment-events.js', () => ({
  recordExperimentEvent: mockRecordExperimentEvent,
  ExperimentEventName: {
    ATTEMPT_PURCHASE: 'attempt_purchase',
    TX_SUBMITTED: 'tx_submitted',
    PURCHASE_SUCCESS: 'purchase_success',
    PURCHASE_FAILED: 'purchase_failed',
  },
  buildEventBase: (ctx: Record<string, string>) => ({
    experiment_id: ctx.experiment_id,
    condition: ctx.condition,
    agent_id: ctx.agent_id,
    session_id: ctx.session_id,
  }),
}));

vi.mock('../src/queue/tx-verification-queue.js', () => ({
  enqueueTxVerification: mockEnqueueTxVerification,
}));

import {
  createPurchaseService,
  type AgentRecord,
  type AutoPaymentRecord,
  type ListingRecord,
  type PreparePurchaseResult,
  type PurchaseRecord,
  type PurchaseRepository
} from '../src/services/purchase-service.js';

function buildFixture() {
  const pendingPurchase: PurchaseRecord = {
    id: 'purchase-1',
    listing_id: 'listing-1',
    buyer_wallet: `0x${'1'.repeat(40)}`,
    seller_agent_id: 'agent-1',
    amount_usdc: '10',
    status: 'pending',
    idempotency_key: 'idem-1',
    tx_hash: null
  };

  const completedPurchase: PurchaseRecord = {
    ...pendingPurchase,
    status: 'completed',
    buyer_wallet: `0x${'2'.repeat(40)}`,
    tx_hash: '0xhash'
  };

  const listing: ListingRecord = {
    id: 'listing-1',
    agent_id: 'agent-1',
    price_usdc: '10'
  };

  const sellerAgent: AgentRecord = {
    id: 'agent-1',
    wallet_address: `0x${'3'.repeat(40)}`
  };

  const preparePurchase = vi.fn<() => Promise<PreparePurchaseResult>>(async () => ({
    kind: 'created',
    purchase: pendingPurchase,
    listing,
    sellerAgent
  }));
  const markPurchaseFailed = vi.fn(async () => undefined);
  const completePurchase = vi.fn(async () => completedPurchase);
  const fetchWebhooks = vi.fn(async () => []);
  const createAutoPayment = vi.fn<() => Promise<AutoPaymentRecord>>(async () => ({
    id: 'auto-payment-1',
    agent_id: 'agent-1',
    recipient_address: `0x${'4'.repeat(40)}`,
    amount_usdc: '1',
    interval_seconds: 600
  }));
  const agentExists = vi.fn(async () => true);
  const listPurchases = vi.fn(async () => [completedPurchase]);

  const repository: PurchaseRepository = {
    preparePurchase,
    markPurchaseFailed,
    completePurchase,
    fetchWebhooks,
    createAutoPayment,
    agentExists,
    listPurchases
  };

  const paymentExecutor = {
    execute: vi.fn(async () => ({ txHash: '0xhash', buyerWallet: `0x${'2'.repeat(40)}` }))
  };

  const auditLogs = {
    record: vi.fn(async () => undefined)
  };

  const webhookPublisher = {
    publish: vi.fn(async () => undefined)
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  const service = createPurchaseService({
    paymentsDisabled: false,
    repository,
    paymentExecutor,
    auditLogs,
    webhookPublisher,
    logger
  });

  return {
    service,
    repository,
    pendingPurchase,
    completedPurchase,
    preparePurchase,
    markPurchaseFailed,
    completePurchase,
    fetchWebhooks,
    createAutoPayment,
    agentExists,
    listPurchases,
    paymentExecutor,
    auditLogs,
    webhookPublisher,
    logger
  };
}

describe('createPurchaseService', () => {
  it('returns 503 when payments are disabled', async () => {
    const fixture = buildFixture();
    const service = createPurchaseService({
      paymentsDisabled: true,
      repository: fixture.repository,
      paymentExecutor: fixture.paymentExecutor,
      auditLogs: fixture.auditLogs,
      webhookPublisher: fixture.webhookPublisher,
      logger: fixture.logger
    });

    const result = await service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.status).toBe(503);
    expect(fixture.preparePurchase).not.toHaveBeenCalled();
  });

  it('returns 500 when preparePurchase throws', async () => {
    const fixture = buildFixture();
    fixture.preparePurchase.mockRejectedValue(new Error('db down'));

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.status).toBe(500);
    expect(result.error.errorCode).toBe('purchase_create_failed');
    expect(fixture.logger.error).toHaveBeenCalled();
  });

  it('returns 404 when listing is missing', async () => {
    const fixture = buildFixture();
    fixture.preparePurchase.mockResolvedValue({ kind: 'listing_not_found' });

    const result = await fixture.service.createPurchase({
      listingId: 'listing-404',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('listing_not_found');
  });

  it('returns 404 when seller agent is missing', async () => {
    const fixture = buildFixture();
    fixture.preparePurchase.mockResolvedValue({ kind: 'agent_not_found' });

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('agent_not_found');
  });

  it('returns existing purchase for idempotent key', async () => {
    const fixture = buildFixture();
    fixture.preparePurchase.mockResolvedValue({
      kind: 'existing',
      purchase: fixture.completedPurchase
    });

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.status).toBe(200);
    expect(result.data.id).toBe(fixture.completedPurchase.id);
    expect(fixture.paymentExecutor.execute).not.toHaveBeenCalled();
  });

  it('marks failed and returns 502 when payment execution fails', async () => {
    const fixture = buildFixture();
    fixture.fetchWebhooks.mockResolvedValue([{ id: '1', event_type: 'payment.failed', url: 'https://example.com' }]);
    fixture.paymentExecutor.execute.mockRejectedValue('rpc timeout');

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.status).toBe(502);
    expect(fixture.markPurchaseFailed).toHaveBeenCalledWith('purchase-1');
    expect(fixture.webhookPublisher.publish).toHaveBeenCalledWith({
      event: 'payment.failed',
      payload: {
        purchase_id: 'purchase-1',
        listing_id: 'listing-1',
        error: 'rpc timeout'
      },
      webhooks: [{ id: '1', event_type: 'payment.failed', url: 'https://example.com' }]
    });
  });

  it('continues returning 502 even when markPurchaseFailed fails', async () => {
    const fixture = buildFixture();
    fixture.markPurchaseFailed.mockRejectedValue(new Error('update failed'));
    fixture.paymentExecutor.execute.mockRejectedValue(new Error('chain fail'));

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('payment_failed');
    expect(fixture.logger.error).toHaveBeenCalled();
  });

  it('returns 500 when finalization fails', async () => {
    const fixture = buildFixture();
    fixture.completePurchase.mockRejectedValue(new Error('db write failed'));

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.status).toBe(500);
    expect(result.error.errorCode).toBe('purchase_finalize_failed');
  });

  it('returns 201 on success and tolerates audit/webhook failures', async () => {
    const fixture = buildFixture();
    fixture.fetchWebhooks.mockResolvedValue([{ id: '1', event_type: 'purchase.completed', url: 'https://example.com' }]);
    fixture.auditLogs.record.mockRejectedValueOnce(new Error('audit unavailable'));
    fixture.webhookPublisher.publish.mockRejectedValueOnce(new Error('queue unavailable'));

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.status).toBe(201);
    expect(result.data.status).toBe('completed');
    expect(fixture.completePurchase).toHaveBeenCalledWith({
      purchaseId: 'purchase-1',
      txHash: '0xhash',
      buyerWallet: `0x${'2'.repeat(40)}`
    });
    expect(fixture.logger.warn).toHaveBeenCalled();
  });

  it('continues success when fetchWebhooks throws', async () => {
    const fixture = buildFixture();
    fixture.fetchWebhooks.mockRejectedValue(new Error('webhooks table unavailable'));

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.status).toBe(201);
    expect(fixture.logger.warn).toHaveBeenCalled();
  });

  it('returns 500 when agentExists throws while creating auto-payment', async () => {
    const fixture = buildFixture();
    fixture.agentExists.mockRejectedValue(new Error('db down'));

    const result = await fixture.service.createAutoPayment({
      agentId: 'agent-1',
      recipientAddress: `0x${'4'.repeat(40)}`,
      amountUsdc: '3',
      intervalSeconds: 120
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('auto_payment_create_failed');
  });

  it('returns 404 when creating auto-payment for missing agent', async () => {
    const fixture = buildFixture();
    fixture.agentExists.mockResolvedValue(false);

    const result = await fixture.service.createAutoPayment({
      agentId: 'agent-missing',
      recipientAddress: `0x${'4'.repeat(40)}`,
      amountUsdc: '3',
      intervalSeconds: 120
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('agent_not_found');
    expect(fixture.createAutoPayment).not.toHaveBeenCalled();
  });

  it('returns 500 when createAutoPayment insert fails', async () => {
    const fixture = buildFixture();
    fixture.createAutoPayment.mockRejectedValue(new Error('insert failed'));

    const result = await fixture.service.createAutoPayment({
      agentId: 'agent-1',
      recipientAddress: `0x${'4'.repeat(40)}`,
      amountUsdc: '3',
      intervalSeconds: 120
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('auto_payment_create_failed');
  });

  it('returns 201 when auto-payment is created and audit failure is tolerated', async () => {
    const fixture = buildFixture();
    fixture.auditLogs.record.mockRejectedValueOnce(new Error('audit failed'));

    const result = await fixture.service.createAutoPayment({
      agentId: 'agent-1',
      recipientAddress: `0x${'4'.repeat(40)}`,
      amountUsdc: '3',
      intervalSeconds: 120
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.status).toBe(201);
    expect(fixture.logger.warn).toHaveBeenCalled();
  });

  it('returns list data for listPurchases', async () => {
    const fixture = buildFixture();

    const result = await fixture.service.listPurchases({
      limit: 10,
      offset: 0,
      status: 'completed'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.data.pagination.count).toBe(1);
    expect(fixture.listPurchases).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      status: 'completed'
    });
  });

  it('returns 500 when listPurchases fails', async () => {
    const fixture = buildFixture();
    fixture.listPurchases.mockRejectedValue(new Error('select failed'));

    const result = await fixture.service.listPurchases({
      limit: 10,
      offset: 0
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.errorCode).toBe('purchase_list_failed');
  });

  it('records experiment events on successful purchase with context', async () => {
    const fixture = buildFixture();
    mockRecordExperimentEvent.mockClear();
    mockEnqueueTxVerification.mockClear();
    mockRecordExperimentEvent.mockResolvedValue(undefined);
    mockEnqueueTxVerification.mockResolvedValue(undefined);

    const experimentCtx = {
      experiment_id: 'exp-1',
      condition: 'A',
      agent_id: 'agent-x',
      session_id: 'sess-1',
    };

    const result = await fixture.service.createPurchase(
      {
        listingId: 'listing-1',
        buyerWallet: `0x${'1'.repeat(40)}`,
        idempotencyKey: 'idem-1'
      },
      experimentCtx
    );

    expect(result.ok).toBe(true);
    // Should have recorded: attempt_purchase, tx_submitted, purchase_success
    expect(mockRecordExperimentEvent).toHaveBeenCalledTimes(3);
    expect(mockRecordExperimentEvent.mock.calls[0][0].event).toBe('attempt_purchase');
    expect(mockRecordExperimentEvent.mock.calls[1][0].event).toBe('tx_submitted');
    expect(mockRecordExperimentEvent.mock.calls[2][0].event).toBe('purchase_success');
    expect(mockEnqueueTxVerification).toHaveBeenCalledWith({
      txHash: '0xhash',
      experimentId: 'exp-1',
    });
  });

  it('records purchase_failed experiment event when payment fails', async () => {
    const fixture = buildFixture();
    mockRecordExperimentEvent.mockClear();
    mockEnqueueTxVerification.mockClear();
    mockRecordExperimentEvent.mockResolvedValue(undefined);
    fixture.paymentExecutor.execute.mockRejectedValue(new Error('out of gas'));

    const experimentCtx = {
      experiment_id: 'exp-2',
      condition: 'B',
      agent_id: 'agent-y',
      session_id: 'sess-2',
    };

    const result = await fixture.service.createPurchase(
      {
        listingId: 'listing-1',
        buyerWallet: `0x${'1'.repeat(40)}`,
        idempotencyKey: 'idem-1'
      },
      experimentCtx
    );

    expect(result.ok).toBe(false);
    // Should have recorded: attempt_purchase, purchase_failed
    expect(mockRecordExperimentEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordExperimentEvent.mock.calls[0][0].event).toBe('attempt_purchase');
    expect(mockRecordExperimentEvent.mock.calls[1][0].event).toBe('purchase_failed');
    expect(mockRecordExperimentEvent.mock.calls[1][0].reason).toBe('out of gas');
  });

  it('does not record experiment events when experimentCtx is undefined', async () => {
    const fixture = buildFixture();
    mockRecordExperimentEvent.mockClear();
    mockEnqueueTxVerification.mockClear();

    const result = await fixture.service.createPurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.ok).toBe(true);
    expect(mockRecordExperimentEvent).not.toHaveBeenCalled();
    expect(mockEnqueueTxVerification).not.toHaveBeenCalled();
  });
});
