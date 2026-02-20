import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';

const apiKey = process.env.API_KEY ?? 'test-key';

async function ensureSchema() {
  const result = await pool.query(
    "SELECT to_regclass('public.agents') as agents"
  );
  if (!result.rows[0].agents) {
    throw new Error('Database schema is missing. Run migrations before tests.');
  }
}

async function truncateAll() {
  await pool.query('TRUNCATE TABLE listings, agents, webhooks, audit_logs RESTART IDENTITY CASCADE');
}

describe('POST /api/v1/agents', () => {
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
    const res = await app.request('/api/v1/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe('validation_error');
  });

  it('creates an agent with DID and wallet address', async () => {
    const res = await app.request('/api/v1/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        owner_id: 'owner-1',
        name: 'test-agent'
      })
    });
    expect(res.status).toBe(201);
    const agent = await res.json();
    expect(agent.id).toBeDefined();
    expect(agent.did).toMatch(/^did:ethr:0x[0-9a-fA-F]{40}$/);
    expect(agent.wallet_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(agent.owner_id).toBe('owner-1');
    expect(agent.name).toBe('test-agent');
    expect(agent.kms_key_id).toMatch(/^local:/);

    // Verify DB persistence
    const dbCheck = await pool.query('SELECT * FROM agents WHERE id = $1', [agent.id]);
    expect(dbCheck.rowCount).toBe(1);
    expect(dbCheck.rows[0].did).toBe(agent.did);
  });

  it('creates unique wallets for each agent', async () => {
    const res1 = await app.request('/api/v1/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ owner_id: 'owner-1', name: 'agent-a' })
    });
    const res2 = await app.request('/api/v1/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ owner_id: 'owner-1', name: 'agent-b' })
    });

    const a1 = await res1.json();
    const a2 = await res2.json();
    expect(a1.wallet_address).not.toBe(a2.wallet_address);
    expect(a1.did).not.toBe(a2.did);
  });

  it('records audit log on creation', async () => {
    await app.request('/api/v1/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ owner_id: 'owner-1', name: 'audit-agent' })
    });

    const logs = await pool.query(
      "SELECT * FROM audit_logs WHERE action = 'agent.registered'"
    );
    expect(logs.rowCount).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/agents/:id', () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('returns 404 for non-existent agent', async () => {
    const res = await app.request(
      '/api/v1/agents/00000000-0000-0000-0000-000000000000',
      { headers: { 'x-api-key': apiKey } }
    );
    expect(res.status).toBe(404);
  });

  it('returns agent details', async () => {
    const createRes = await app.request('/api/v1/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ owner_id: 'owner-1', name: 'get-test-agent' })
    });
    const created = await createRes.json();

    const res = await app.request(`/api/v1/agents/${created.id}`, {
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(200);
    const agent = await res.json();
    expect(agent.id).toBe(created.id);
    expect(agent.name).toBe('get-test-agent');
  });
});
