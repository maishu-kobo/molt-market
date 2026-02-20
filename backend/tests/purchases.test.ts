import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

const apiKey = process.env.API_KEY ?? 'test-key';

async function ensureSchema() {
  const result = await pool.query(
    "SELECT to_regclass('public.purchases') as purchases, to_regclass('public.agents') as agents"
  );
  if (!result.rows[0].purchases || !result.rows[0].agents) {
    throw new Error('Database schema is missing. Run migrations before tests.');
  }
}

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE purchases, listings, agents, webhooks, audit_logs RESTART IDENTITY CASCADE'
  );
  // Also truncate auto_payments if it exists
  await pool.query(
    "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auto_payments') THEN TRUNCATE TABLE auto_payments RESTART IDENTITY CASCADE; END IF; END $$"
  );
}

async function createAgent(): Promise<{ id: string; wallet_address: string }> {
  const id = uuidv4();
  const wallet = `0x${'b'.repeat(40)}`;
  await pool.query(
    `INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, `did:ethr:${wallet}`, 'owner-1', 'test-agent', wallet, 'local:m/44\'/60\'/0\'/0/10']
  );
  return { id, wallet_address: wallet };
}

async function createListing(agentId: string): Promise<{ id: string; price: number }> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO listings (id, agent_id, title, product_url, product_type, price_usdc)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, agentId, 'Test Product', `https://example.com/${id}`, 'web', 10]
  );
  return { id, price: 10 };
}

describe('POST /api/v1/purchases', () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('returns 422 for missing fields', async () => {
    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(422);
  });

  it('returns 404 for non-existent listing', async () => {
    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        listing_id: uuidv4(),
        buyer_wallet: '0x1234',
        idempotency_key: 'key-1'
      })
    });
    expect(res.status).toBe(404);
  });

  it('creates a purchase record (simulated without USDC contract)', async () => {
    const agent = await createAgent();
    const listing = await createListing(agent.id);

    const res = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        listing_id: listing.id,
        buyer_wallet: '0xbuyer',
        idempotency_key: 'purchase-1'
      })
    });

    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.listing_id).toBe(listing.id);
    expect(body.status).toBe('completed');
    expect(body.tx_hash).toMatch(/^sim:/);
    expect(body.idempotency_key).toBe('purchase-1');

    // Verify DB persistence
    const dbCheck = await pool.query('SELECT * FROM purchases WHERE id = $1', [body.id]);
    expect(dbCheck.rowCount).toBe(1);
    expect(dbCheck.rows[0].status).toBe('completed');
  });

  it('returns existing purchase for duplicate idempotency_key', async () => {
    const agent = await createAgent();
    const listing = await createListing(agent.id);

    const payload = {
      listing_id: listing.id,
      buyer_wallet: '0xbuyer',
      idempotency_key: 'idempotent-key'
    };

    const res1 = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload)
    });
    expect(res1.status).toBe(201);
    const first: any = await res1.json();

    const res2 = await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload)
    });
    expect(res2.status).toBe(200);
    const second: any = await res2.json();
    expect(second.id).toBe(first.id);
  });

  it('records audit log on purchase', async () => {
    const agent = await createAgent();
    const listing = await createListing(agent.id);

    await app.request('/api/v1/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        listing_id: listing.id,
        buyer_wallet: '0xbuyer',
        idempotency_key: 'audit-key'
      })
    });

    const logs = await pool.query(
      "SELECT * FROM audit_logs WHERE action = 'purchase.completed'"
    );
    expect(logs.rowCount).toBeGreaterThanOrEqual(1);
  });
});
