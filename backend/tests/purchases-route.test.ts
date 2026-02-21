import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createPurchasesRouter } from '../src/routes/purchases.js';
import type { PurchaseService } from '../src/services/purchase-service.js';

function createServiceMock(): PurchaseService {
  return {
    createPurchase: vi.fn(async () => ({
      ok: true as const,
      status: 201,
      data: { id: 'purchase-1', status: 'completed' }
    })),
    createAutoPayment: vi.fn(async () => ({
      ok: true as const,
      status: 201,
      data: { id: 'ap-1' }
    })),
    listPurchases: vi.fn(async () => ({
      ok: true as const,
      status: 200,
      data: { data: [], pagination: { limit: 50, offset: 0, count: 0 } }
    }))
  };
}

function createMountedApp(service: PurchaseService, deps?: Parameters<typeof createPurchasesRouter>[0]) {
  const app = new Hono();
  const testLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  const router = createPurchasesRouter({
    purchaseService: service,
    logger: testLogger,
    ...deps
  });

  app.route('/api/v1/purchases', router);
  app.route('/api/v1/agents', router);
  return app;
}

describe('purchases routes', () => {
  it('returns null for testnet buyer when payments are disabled', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service, { paymentsDisabled: true });

    const res = await app.request('/api/v1/purchases/testnet-buyer');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns balances when testnet buyer fetch succeeds', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service, {
      paymentsDisabled: false,
      getTestBuyerBalancesFn: async () => ({
        address: `0x${'1'.repeat(40)}`,
        ethBalance: '0.1',
        usdcBalance: '10'
      })
    });

    const res = await app.request('/api/v1/purchases/testnet-buyer');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usdcBalance).toBe('10');
  });

  it('returns 502 when testnet buyer fetch fails', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service, {
      paymentsDisabled: false,
      getTestBuyerBalancesFn: async () => {
        throw new Error('rpc down');
      }
    });

    const res = await app.request('/api/v1/purchases/testnet-buyer');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error_code).toBe('testnet_wallet_unavailable');
  });

  it('returns 400 for invalid JSON on purchase creation', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_json');
  });

  it('returns 422 for invalid purchase payload', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listing_id: 'not-a-uuid',
        buyer_wallet: 'bad-wallet',
        idempotency_key: '*'
      })
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe('validation_error');
  });

  it('maps purchase service error response', async () => {
    const service = createServiceMock();
    (service.createPurchase as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: {
        status: 404,
        errorCode: 'listing_not_found',
        message: 'not found',
        suggestedAction: 'retry'
      }
    });
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listing_id: '2f4e0f89-161f-4c9e-b157-0f77c37d8f6f',
        buyer_wallet: `0x${'1'.repeat(40)}`,
        idempotency_key: 'idempotent_123'
      })
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error_code).toBe('listing_not_found');
  });

  it('returns purchase response on success', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        listing_id: '2f4e0f89-161f-4c9e-b157-0f77c37d8f6f',
        buyer_wallet: `0x${'1'.repeat(40)}`,
        idempotency_key: 'idempotent_123'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('purchase-1');
  });

  it('returns 400 for invalid agent id on auto-payment', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/agents/bad-id/auto-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_id');
  });

  it('returns 400 for invalid json on auto-payment', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/agents/2f4e0f89-161f-4c9e-b157-0f77c37d8f6f/auto-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_json');
  });

  it('returns 422 for invalid auto-payment payload', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/agents/2f4e0f89-161f-4c9e-b157-0f77c37d8f6f/auto-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient_address: 'bad',
        amount_usdc: 10,
        interval_seconds: 1
      })
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe('validation_error');
  });

  it('maps auto-payment service error response', async () => {
    const service = createServiceMock();
    (service.createAutoPayment as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: {
        status: 404,
        errorCode: 'agent_not_found',
        message: 'not found',
        suggestedAction: 'retry'
      }
    });
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/agents/2f4e0f89-161f-4c9e-b157-0f77c37d8f6f/auto-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient_address: `0x${'1'.repeat(40)}`,
        amount_usdc: 10,
        interval_seconds: 120
      })
    });

    expect(res.status).toBe(404);
  });

  it('returns auto-payment response on success', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/agents/2f4e0f89-161f-4c9e-b157-0f77c37d8f6f/auto-payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipient_address: `0x${'1'.repeat(40)}`,
        amount_usdc: 10,
        interval_seconds: 120
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('ap-1');
  });

  it('returns 400 for invalid pagination', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases?limit=-1');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_pagination');
  });

  it('returns 400 for invalid status', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases?status=unknown');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_status');
  });

  it('returns 400 for invalid listing_id', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases?listing_id=bad');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_listing_id');
  });

  it('returns 400 for invalid buyer_wallet filter', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases?buyer_wallet=bad');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_buyer_wallet');
  });

  it('maps listPurchases service errors', async () => {
    const service = createServiceMock();
    (service.listPurchases as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: {
        status: 500,
        errorCode: 'purchase_list_failed',
        message: 'failed',
        suggestedAction: 'retry'
      }
    });
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error_code).toBe('purchase_list_failed');
  });

  it('returns list response on success', async () => {
    const service = createServiceMock();
    const app = createMountedApp(service);

    const res = await app.request('/api/v1/purchases?limit=5&offset=2&status=completed&listing_id=2f4e0f89-161f-4c9e-b157-0f77c37d8f6f&buyer_wallet=0x1111111111111111111111111111111111111111');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(50);
    expect((service.listPurchases as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      limit: 5,
      offset: 2,
      status: 'completed',
      listingId: '2f4e0f89-161f-4c9e-b157-0f77c37d8f6f',
      buyerWallet: '0x1111111111111111111111111111111111111111'
    });
  });
});
