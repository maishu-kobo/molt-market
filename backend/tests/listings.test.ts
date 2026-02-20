import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

const apiKey = process.env.API_KEY ?? 'test-key';

async function ensureSchema() {
  const result = await pool.query(
    "SELECT to_regclass('public.listings') as listings, to_regclass('public.agents') as agents, to_regclass('public.webhooks') as webhooks"
  );
  const row = result.rows[0];
  if (!row.listings || !row.agents || !row.webhooks) {
    throw new Error('Database schema is missing. Run migrations before tests.');
  }
}

async function truncateAll() {
  await pool.query('TRUNCATE TABLE listings, agents, webhooks, audit_logs RESTART IDENTITY CASCADE');
}

describe('POST /api/v1/listings', () => {
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
    const res = await app.request('/api/v1/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(422);
  });

  it('returns 403 for unknown agent', async () => {
    const res = await app.request('/api/v1/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        agent_id: uuidv4(),
        title: 'Test Listing',
        product_url: 'https://example.com/product',
        product_type: 'web',
        price_usdc: 10
      })
    });

    expect(res.status).toBe(403);
  });

  it('creates a listing and persists it', async () => {
    const agentId = uuidv4();
    await pool.query(
      `
        INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        agentId,
        `did:key:${agentId}`,
        'owner-1',
        'agent-one',
        '0x0000000000000000000000000000000000000001',
        'kms-key-1'
      ]
    );

    await pool.query(
      `
        INSERT INTO webhooks (id, event_type, url)
        VALUES (gen_random_uuid(), $1, $2)
      `,
      ['listing.created', 'http://localhost:9999/webhook']
    );

    const res = await app.request('/api/v1/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        agent_id: agentId,
        title: 'Test Listing',
        description: 'Hello',
        product_url: 'https://example.com/product',
        product_type: 'web',
        price_usdc: 10
      })
    });

    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.title).toBe('Test Listing');

    const dbCheck = await pool.query('SELECT * FROM listings WHERE id = $1', [payload.id]);
    expect(dbCheck.rowCount).toBe(1);
  });

  it('returns 409 for duplicate product_url', async () => {
    const agentId = uuidv4();
    await pool.query(
      `
        INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        agentId,
        `did:key:${agentId}`,
        'owner-1',
        'agent-one',
        '0x0000000000000000000000000000000000000001',
        'kms-key-1'
      ]
    );

    const body = {
      agent_id: agentId,
      title: 'Test Listing',
      product_url: 'https://example.com/product',
      product_type: 'web',
      price_usdc: 10
    };

    await app.request('/api/v1/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    const res = await app.request('/api/v1/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    expect(res.status).toBe(409);
  });
});
