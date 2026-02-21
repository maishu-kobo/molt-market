import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { createPostgresPurchaseRepository } from '../src/repositories/purchase-repository.js';

type QueryResult = {
  rows?: unknown[];
};

function makePoolClient(
  queryImpl: (text: string, params?: unknown[]) => Promise<QueryResult>
): PoolClient {
  return {
    query: vi.fn(queryImpl),
    release: vi.fn()
  } as unknown as PoolClient;
}

function makePool(params: {
  client: PoolClient;
  queryImpl?: (text: string, params?: unknown[]) => Promise<QueryResult>;
}): Pool {
  return {
    connect: vi.fn(async () => params.client),
    query: vi.fn(params.queryImpl ?? (async () => ({ rows: [] })))
  } as unknown as Pool;
}

describe('createPostgresPurchaseRepository', () => {
  it('returns existing purchase during preparePurchase', async () => {
    const existing = { id: 'p1' };
    const client = makePoolClient(async (text) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM purchases WHERE idempotency_key')) return { rows: [existing] };
      return { rows: [] };
    });
    const pool = makePool({ client });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.preparePurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') expect(result.purchase.id).toBe('p1');
    expect((client.release as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('returns listing_not_found during preparePurchase', async () => {
    const client = makePoolClient(async (text) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM purchases WHERE idempotency_key')) return { rows: [] };
      if (text.includes('FROM listings')) return { rows: [] };
      return { rows: [] };
    });
    const pool = makePool({ client });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.preparePurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.kind).toBe('listing_not_found');
  });

  it('returns agent_not_found during preparePurchase', async () => {
    const listing = { id: 'listing-1', agent_id: 'agent-1', price_usdc: '9' };
    const client = makePoolClient(async (text) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM purchases WHERE idempotency_key')) return { rows: [] };
      if (text.includes('FROM listings')) return { rows: [listing] };
      if (text.includes('FROM agents')) return { rows: [] };
      return { rows: [] };
    });
    const pool = makePool({ client });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.preparePurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.kind).toBe('agent_not_found');
  });

  it('creates pending purchase during preparePurchase', async () => {
    const listing = { id: 'listing-1', agent_id: 'agent-1', price_usdc: '9' };
    const agent = { id: 'agent-1', wallet_address: `0x${'2'.repeat(40)}` };
    const purchase = { id: 'purchase-1', status: 'pending' };
    const client = makePoolClient(async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('FROM purchases WHERE idempotency_key')) return { rows: [] };
      if (text.includes('FROM listings')) return { rows: [listing] };
      if (text.includes('FROM agents')) return { rows: [agent] };
      if (text.includes('INSERT INTO purchases')) return { rows: [purchase] };
      return { rows: [] };
    });
    const pool = makePool({ client });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.preparePurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.kind).toBe('created');
    if (result.kind === 'created') {
      expect(result.purchase.id).toBe('purchase-1');
      expect(result.listing.id).toBe('listing-1');
      expect(result.sellerAgent.id).toBe('agent-1');
    }
  });

  it('returns existing purchase on unique violation', async () => {
    const listing = { id: 'listing-1', agent_id: 'agent-1', price_usdc: '9' };
    const agent = { id: 'agent-1', wallet_address: `0x${'2'.repeat(40)}` };
    const uniqueError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const client = makePoolClient(async (text) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('FROM purchases WHERE idempotency_key')) return { rows: [] };
      if (text.includes('FROM listings')) return { rows: [listing] };
      if (text.includes('FROM agents')) return { rows: [agent] };
      if (text.includes('INSERT INTO purchases')) throw uniqueError;
      return { rows: [] };
    });
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: [{ id: 'existing-purchase' }] })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.preparePurchase({
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`,
      idempotencyKey: 'idem-1'
    });

    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') expect(result.purchase.id).toBe('existing-purchase');
    expect((pool.query as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it('throws original error even if rollback fails', async () => {
    const original = new Error('boom');
    const client = makePoolClient(async (text) => {
      if (text === 'BEGIN') throw original;
      if (text === 'ROLLBACK') throw new Error('rollback failed');
      return { rows: [] };
    });
    const pool = makePool({ client });
    const repo = createPostgresPurchaseRepository(pool);

    await expect(
      repo.preparePurchase({
        listingId: 'listing-1',
        buyerWallet: `0x${'1'.repeat(40)}`,
        idempotencyKey: 'idem-1'
      })
    ).rejects.toThrow('boom');
  });

  it('updates purchase status to failed', async () => {
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({ client });
    const repo = createPostgresPurchaseRepository(pool);

    await repo.markPurchaseFailed('purchase-1');

    expect((pool.query as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "UPDATE purchases SET status = 'failed' WHERE id = $1",
      ['purchase-1']
    );
  });

  it('completes purchase successfully', async () => {
    const completed = { id: 'purchase-1', status: 'completed' };
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: [completed] })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.completePurchase({
      purchaseId: 'purchase-1',
      txHash: '0xhash',
      buyerWallet: `0x${'1'.repeat(40)}`
    });

    expect(result.id).toBe('purchase-1');
  });

  it('throws when completePurchase cannot find purchase', async () => {
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: [] })
    });
    const repo = createPostgresPurchaseRepository(pool);

    await expect(
      repo.completePurchase({
        purchaseId: 'missing',
        txHash: '0xhash',
        buyerWallet: `0x${'1'.repeat(40)}`
      })
    ).rejects.toThrow('Purchase not found while finalizing');
  });

  it('fetches active webhooks', async () => {
    const webhooks = [{ id: 'w1', event_type: 'purchase.completed', url: 'https://example.com' }];
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: webhooks })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.fetchWebhooks('purchase.completed');
    expect(result).toEqual(webhooks);
  });

  it('creates auto payment', async () => {
    const autoPayment = { id: 'ap1', agent_id: 'agent-1' };
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: [autoPayment] })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.createAutoPayment({
      agentId: 'agent-1',
      recipientAddress: `0x${'4'.repeat(40)}`,
      amountUsdc: '10',
      intervalSeconds: 120,
      description: null
    });

    expect(result.id).toBe('ap1');
  });

  it('returns true when agent exists', async () => {
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: [{}] })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.agentExists('agent-1');
    expect(result).toBe(true);
  });

  it('returns false when agent does not exist', async () => {
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows: [] })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.agentExists('agent-1');
    expect(result).toBe(false);
  });

  it('lists purchases with all filters', async () => {
    const rows = [{ id: 'purchase-1' }];
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.listPurchases({
      limit: 20,
      offset: 10,
      status: 'completed',
      listingId: 'listing-1',
      buyerWallet: `0x${'1'.repeat(40)}`
    });

    expect(result).toEqual(rows);
    const call = (pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sql = call[0] as string;
    expect(sql).toContain('AND p.status = $1');
    expect(sql).toContain('AND p.listing_id = $2');
    expect(sql).toContain('AND p.buyer_wallet = $3');
    expect(call[1]).toEqual(['completed', 'listing-1', `0x${'1'.repeat(40)}`, 20, 10]);
  });

  it('lists purchases without optional filters', async () => {
    const rows = [{ id: 'purchase-1' }];
    const client = makePoolClient(async () => ({ rows: [] }));
    const pool = makePool({
      client,
      queryImpl: async () => ({ rows })
    });
    const repo = createPostgresPurchaseRepository(pool);

    const result = await repo.listPurchases({
      limit: 5,
      offset: 0
    });

    expect(result).toEqual(rows);
    const call = (pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toEqual([5, 0]);
  });
});
