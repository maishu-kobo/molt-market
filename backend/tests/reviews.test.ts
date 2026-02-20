import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { pool } from '../src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

const apiKey = process.env.API_KEY ?? 'test-key';

async function ensureSchema() {
  const result = await pool.query(
    "SELECT to_regclass('public.reviews') as reviews"
  );
  if (!result.rows[0].reviews) {
    throw new Error('Database schema is missing. Run migrations before tests.');
  }
}

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE reviews, listings, agents, webhooks, audit_logs RESTART IDENTITY CASCADE'
  );
}

/** Helper: insert an agent and return its id */
async function createAgent(): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, `did:ethr:0x${'a'.repeat(40)}`, 'owner-1', 'test-agent', `0x${'a'.repeat(40)}`, 'local:test']
  );
  return id;
}

/** Helper: insert a listing and return its id */
async function createListing(agentId: string, url?: string): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO listings (id, agent_id, title, product_url, product_type, price_usdc)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, agentId, 'Test Product', url ?? `https://example.com/${id}`, 'web', 10]
  );
  return id;
}

describe('POST /api/v1/listings/:id/reviews', () => {
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
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    const res = await app.request(`/api/v1/listings/${listingId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(422);
  });

  it('returns 404 for non-existent listing', async () => {
    const fakeId = uuidv4();
    const res = await app.request(`/api/v1/listings/${fakeId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ buyer_id: 'buyer-1', rating: 4 })
    });
    expect(res.status).toBe(404);
  });

  it('creates a review and updates listing stats', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    const res = await app.request(`/api/v1/listings/${listingId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ buyer_id: 'buyer-1', rating: 4, comment: 'Great product!' })
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.rating).toBe(4);
    expect(body.listing_stats.average_rating).toBe(4.0);
    expect(body.listing_stats.review_count).toBe(1);
    expect(body.listing_stats.is_hidden).toBe(false);

    // Verify listing updated
    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    expect(parseFloat(listing.rows[0].average_rating)).toBe(4.0);
    expect(listing.rows[0].review_count).toBe(1);
  });

  it('returns 409 for duplicate review from same buyer', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    await app.request(`/api/v1/listings/${listingId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ buyer_id: 'buyer-1', rating: 4 })
    });

    const res = await app.request(`/api/v1/listings/${listingId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ buyer_id: 'buyer-1', rating: 3 })
    });
    expect(res.status).toBe(409);
  });

  it('auto-hides listing when avg rating < 2.0 and 5+ reviews', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    // Submit 5 reviews with low ratings (all 1 star)
    for (let i = 0; i < 5; i++) {
      const res = await app.request(`/api/v1/listings/${listingId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ buyer_id: `buyer-${i}`, rating: 1 })
      });
      expect(res.status).toBe(201);
    }

    // Verify listing is hidden
    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    expect(listing.rows[0].is_hidden).toBe(true);
    expect(parseFloat(listing.rows[0].average_rating)).toBe(1.0);
    expect(listing.rows[0].review_count).toBe(5);
  });

  it('does not auto-hide when avg rating >= 2.0', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    // Submit 5 reviews: mix of ratings averaging >= 2.0
    const ratings = [2, 2, 3, 2, 3]; // avg = 2.4
    for (let i = 0; i < 5; i++) {
      await app.request(`/api/v1/listings/${listingId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ buyer_id: `buyer-${i}`, rating: ratings[i] })
      });
    }

    const listing = await pool.query('SELECT * FROM listings WHERE id = $1', [listingId]);
    expect(listing.rows[0].is_hidden).toBe(false);
  });
});

describe('GET /api/v1/listings/:id/reviews', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('returns empty array for listing with no reviews', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    const res = await app.request(`/api/v1/listings/${listingId}/reviews`, {
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns reviews for a listing', async () => {
    const agentId = await createAgent();
    const listingId = await createListing(agentId);

    await app.request(`/api/v1/listings/${listingId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ buyer_id: 'buyer-1', rating: 5, comment: 'Excellent' })
    });

    const res = await app.request(`/api/v1/listings/${listingId}/reviews`, {
      headers: { 'x-api-key': apiKey }
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].rating).toBe(5);
  });
});
