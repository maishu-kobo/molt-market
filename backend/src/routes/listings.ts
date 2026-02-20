import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { recordAuditLog } from '../services/audit-log.js';
import { enqueueWebhookJobs } from '../services/webhooks.js';
import { enqueueMoltbookSync } from '../services/moltbook-sync.js';
import { logger } from '../logger.js';

const listingSchema = z.object({
  agent_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().max(10000).optional(),
  product_url: z.string().url(),
  product_type: z.string().min(1),
  price_usdc: z.union([z.number(), z.string()]).transform((value) => {
    const parsed = typeof value === 'string' ? Number(value) : value;
    return parsed;
  }),
  repository_url: z.string().url().optional()
});

const listQuerySchema = z.object({
  agent_id: z.string().uuid().optional(),
  product_type: z.string().optional(),
  status: z.string().optional(),
  is_hidden: z.enum(['true', 'false']).optional(),
  limit: z.string().optional(),
  offset: z.string().optional()
});

export const listingsRouter = new Hono();

listingsRouter.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(
      c,
      400,
      'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.'
    );
  }

  const parsed = listingSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(
      c,
      422,
      'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields }
    );
  }

  const data = parsed.data;
  if (!Number.isFinite(data.price_usdc) || data.price_usdc <= 0) {
    return errorResponse(
      c,
      422,
      'validation_error',
      'price_usdc must be a positive number.',
      'Provide a positive price_usdc value.'
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const agentResult = await client.query('SELECT id FROM agents WHERE id = $1', [data.agent_id]);
    if (agentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(
        c,
        403,
        'agent_not_registered',
        'Agent is not registered.',
        'Register the agent before creating a listing.'
      );
    }

    // Rate limit: max 3 listings per agent per day
    const DAILY_LISTING_LIMIT = 3;
    const rateLimitResult = await client.query(
      `SELECT COUNT(*) as count FROM listings 
       WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [data.agent_id]
    );
    const dailyCount = parseInt(rateLimitResult.rows[0].count, 10);
    if (dailyCount >= DAILY_LISTING_LIMIT) {
      await client.query('ROLLBACK');
      return errorResponse(
        c,
        429,
        'rate_limit_exceeded',
        `Daily listing limit reached. Maximum ${DAILY_LISTING_LIMIT} products per day.`,
        'Wait 24 hours before creating more listings.',
        { daily_limit: DAILY_LISTING_LIMIT, current_count: dailyCount }
      );
    }

    const insertResult = await client.query(
      `
        INSERT INTO listings (
          id,
          agent_id,
          title,
          description,
          product_url,
          product_type,
          price_usdc,
          repository_url
        )
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        data.agent_id,
        data.title,
        data.description ?? null,
        data.product_url,
        data.product_type,
        data.price_usdc,
        data.repository_url ?? null
      ]
    );

    const listing = insertResult.rows[0];

    await recordAuditLog({
      agentId: data.agent_id,
      action: 'listing.created',
      metadata: { listing_id: listing.id },
      client
    });

    const webhookResult = await client.query(
      `
        SELECT id, event_type, url
        FROM webhooks
        WHERE event_type = $1 AND is_active = true
      `,
      ['listing.created']
    );

    await enqueueWebhookJobs({
      event: 'listing.created',
      payload: listing,
      webhooks: webhookResult.rows
    });

    await client.query('COMMIT');

    // Enqueue Moltbook sync job (outside transaction, fire-and-forget)
    await enqueueMoltbookSync(listing).catch((err) => {
      logger.error({ err, listingId: listing.id }, 'Failed to enqueue Moltbook sync');
    });

    return c.json(listing, 201);
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        return errorResponse(
          c,
          409,
          'listing_conflict',
          'A listing with the same product_url already exists.',
          'Use a different product_url.'
        );
      }
    }

    logger.error({ err }, 'Failed to create listing');
    return errorResponse(
      c,
      500,
      'listing_create_failed',
      'Failed to create listing.',
      'Retry later or contact support.'
    );
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/listings/:id
 * Retrieve a single listing by UUID, including average_rating and review_count.
 */
listingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Listing ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

  const result = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return errorResponse(
      c, 404, 'listing_not_found',
      'Listing not found.',
      'Check the listing ID and try again.'
    );
  }

  return c.json(result.rows[0]);
});

listingsRouter.get('/', async (c) => {
  const parsedQuery = listQuerySchema.safeParse(c.req.query());
  if (!parsedQuery.success) {
    return errorResponse(
      c,
      400,
      'invalid_query',
      'Invalid query parameters supplied.',
      'Check query parameter formats and retry.'
    );
  }

  const { agent_id, product_type, status, is_hidden, limit, offset } = parsedQuery.data;
  const limitValue = Math.min(Number(limit ?? 50), 100);
  const offsetValue = Number(offset ?? 0);

  if (!Number.isFinite(limitValue) || limitValue <= 0 || !Number.isFinite(offsetValue) || offsetValue < 0) {
    return errorResponse(
      c,
      400,
      'invalid_pagination',
      'Invalid pagination parameters.',
      'Provide positive limit and non-negative offset.'
    );
  }

  const clauses: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (agent_id) {
    clauses.push(`agent_id = $${index++}`);
    values.push(agent_id);
  }
  if (product_type) {
    clauses.push(`product_type = $${index++}`);
    values.push(product_type);
  }
  if (status) {
    clauses.push(`status = $${index++}`);
    values.push(status);
  }
  if (is_hidden !== undefined) {
    const hiddenValue = is_hidden === 'true';
    clauses.push(`is_hidden = $${index++}`);
    values.push(hiddenValue);
  }

  values.push(limitValue, offsetValue);

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const query = `
    SELECT *
    FROM listings
    ${where}
    ORDER BY created_at DESC
    LIMIT $${index++}
    OFFSET $${index++}
  `;

  const result = await pool.query(query, values);

  return c.json({
    data: result.rows,
    pagination: {
      limit: limitValue,
      offset: offsetValue,
      count: result.rows.length
    }
  });
});
