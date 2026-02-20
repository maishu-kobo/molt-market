import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';

const apiKey = process.env.API_KEY ?? 'test-key';

async function ensureSchema() {
  const result = await pool.query(
    "SELECT to_regclass('public.webhooks') as webhooks"
  );
  if (!result.rows[0].webhooks) {
    throw new Error('Database schema is missing. Run migrations before tests.');
  }
}

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE listings, agents, webhooks, audit_logs RESTART IDENTITY CASCADE'
  );
}

afterAll(async () => {
  await pool.end();
});

describe('POST /api/v1/webhooks', () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it('returns 422 for missing fields', async () => {
    const res = await app.request('/api/v1/webhooks', {
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

  it('returns 422 for invalid url', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        event_type: 'listing.created',
        url: 'not-a-url'
      })
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error_code).toBe('validation_error');
  });

  it('returns 422 for empty event_type', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        event_type: '',
        url: 'https://example.com/webhook'
      })
    });
    expect(res.status).toBe(422);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: 'not json'
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('invalid_json');
  });

  it('creates a webhook and returns 201', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        event_type: 'listing.created',
        url: 'https://example.com/webhook'
      })
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.id).toBeDefined();
    expect(body.event_type).toBe('listing.created');
    expect(body.url).toBe('https://example.com/webhook');
    expect(body.is_active).toBe(true);
    expect(body.created_at).toBeDefined();

    // Verify DB persistence
    const dbCheck = await pool.query('SELECT * FROM webhooks WHERE id = $1', [body.id]);
    expect(dbCheck.rowCount).toBe(1);
    expect(dbCheck.rows[0].event_type).toBe('listing.created');
    expect(dbCheck.rows[0].url).toBe('https://example.com/webhook');
  });

  it('returns 401 without api key', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        event_type: 'listing.created',
        url: 'https://example.com/webhook'
      })
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/webhooks', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('returns empty array when no webhooks exist', async () => {
    const res = await app.request('/api/v1/webhooks', {
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns created webhooks', async () => {
    // Create two webhooks
    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        event_type: 'listing.created',
        url: 'https://example.com/hook1'
      })
    });
    await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        event_type: 'purchase.completed',
        url: 'https://example.com/hook2'
      })
    });

    const res = await app.request('/api/v1/webhooks', {
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.length).toBe(2);
    // Ordered by created_at DESC, so second webhook first
    expect(body.data[0].event_type).toBe('purchase.completed');
    expect(body.data[1].event_type).toBe('listing.created');
  });

  it('returns 401 without api key', async () => {
    const res = await app.request('/api/v1/webhooks');
    expect(res.status).toBe(401);
  });
});
