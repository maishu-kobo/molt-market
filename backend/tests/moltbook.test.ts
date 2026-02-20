import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

const apiKey = process.env.API_KEY ?? 'test-key';

async function ensureSchema() {
  const result = await pool.query(
    "SELECT to_regclass('public.listings') as listings"
  );
  if (!result.rows[0].listings) {
    throw new Error('Database schema is missing. Run migrations before tests.');
  }
}

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE listings, agents, webhooks, audit_logs RESTART IDENTITY CASCADE'
  );
}

async function createAgent(): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, `did:ethr:0x${'c'.repeat(40)}`, 'owner-1', 'test-agent', `0x${'c'.repeat(40)}`, 'local:test']
  );
  return id;
}

async function createListing(agentId: string, moltbookId?: string): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO listings (id, agent_id, title, product_url, product_type, price_usdc, moltbook_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, agentId, 'Test Product', `https://example.com/${id}`, 'web', 10, moltbookId ?? null]
  );
  return id;
}

afterAll(async () => {
  await pool.end();
});

describe('POST /api/v1/listings/:id/moltbook-retry', () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('returns 404 for non-existent listing', async () => {
    const res = await app.request(`/api/v1/listings/${uuidv4()}/moltbook-retry`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 if listing is already synced', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId, 'moltbook-123');

    const res = await app.request(`/api/v1/listings/${listingId}/moltbook-retry`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.moltbook_id).toBe('moltbook-123');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.request('/api/v1/listings/not-a-uuid/moltbook-retry', {
      method: 'POST',
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(400);
  });
});

describe('Moltbook sync on listing creation', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('listing creation succeeds even when Moltbook sync enqueue fails', async () => {
    // Moltbook sync is fire-and-forget; listing creation should not fail
    const agentId = await createAgent();

    const res = await app.request('/api/v1/listings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        agent_id: agentId,
        title: 'Moltbook Test',
        product_url: 'https://example.com/moltbook-test',
        product_type: 'web',
        price_usdc: 15
      })
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.title).toBe('Moltbook Test');
    // moltbook_id should be null initially (sync happens asynchronously)
    expect(body.moltbook_id).toBeNull();
  });
});
