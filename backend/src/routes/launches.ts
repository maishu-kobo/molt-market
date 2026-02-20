import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { recordAuditLog } from '../services/audit-log.js';
import { logger } from '../logger.js';

const launchSchema = z.object({
  listing_id: z.string().uuid(),
  tagline: z.string().max(140).optional()
});

export const launchesRouter = new Hono();

/**
 * POST /api/v1/launches
 * Launch a product (Product Hunt style). Each listing can only be launched once.
 */
launchesRouter.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, 'invalid_json', 'Request body must be valid JSON.', 'Ensure valid JSON.');
  }

  const parsed = launchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, 422, 'validation_error', 'Invalid fields.', 'Fix fields and retry.', 
      { fields: parsed.error.flatten().fieldErrors });
  }

  const { listing_id, tagline } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify listing exists and get agent_id
    const listingResult = await client.query(
      'SELECT id, agent_id, title FROM listings WHERE id = $1 AND status = $2',
      [listing_id, 'active']
    );
    if (listingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(c, 404, 'listing_not_found', 'Active listing not found.', 'Check listing ID.');
    }

    // Check if already launched
    const existingLaunch = await client.query(
      'SELECT id FROM launches WHERE listing_id = $1',
      [listing_id]
    );
    if (existingLaunch.rowCount && existingLaunch.rowCount > 0) {
      await client.query('ROLLBACK');
      return errorResponse(c, 409, 'already_launched', 'This product has already been launched.', 
        'Each product can only be launched once.');
    }

    // Create launch
    const result = await client.query(
      `INSERT INTO launches (listing_id, tagline, launched_at)
       VALUES ($1, $2, CURRENT_DATE)
       RETURNING *`,
      [listing_id, tagline || null]
    );

    await recordAuditLog({
      agentId: listingResult.rows[0].agent_id,
      action: 'launch.created',
      metadata: { launch_id: result.rows[0].id, listing_id },
      client
    });

    await client.query('COMMIT');

    return c.json({
      ...result.rows[0],
      listing: listingResult.rows[0]
    }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to create launch');
    return errorResponse(c, 500, 'launch_failed', 'Failed to launch product.', 'Try again later.');
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/launches
 * Get launches, optionally filtered by date. Defaults to today.
 */
launchesRouter.get('/', async (c) => {
  const date = c.req.query('date'); // YYYY-MM-DD format
  const featured = c.req.query('featured') === 'true';
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const offset = Number(c.req.query('offset') ?? 0);

  let query = `
    SELECT 
      l.*,
      li.title, li.description, li.product_url, li.product_type, 
      li.price_usdc, li.average_rating, li.review_count, li.repository_url,
      a.id as agent_id, a.name as agent_name, a.wallet_address
    FROM launches l
    JOIN listings li ON l.listing_id = li.id
    JOIN agents a ON li.agent_id = a.id
    WHERE 1=1
  `;
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (date) {
    query += ` AND l.launched_at = $${paramIndex++}`;
    params.push(date);
  }

  if (featured) {
    query += ` AND l.is_featured = true`;
  }

  query += ` ORDER BY l.is_featured DESC, l.upvote_count DESC, l.created_at DESC`;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return c.json({
    data: result.rows,
    pagination: { limit, offset, count: result.rows.length }
  });
});

/**
 * GET /api/v1/launches/today
 * Get today's launches (convenience endpoint)
 */
launchesRouter.get('/today', async (c) => {
  const result = await pool.query(`
    SELECT 
      l.*,
      li.title, li.description, li.product_url, li.product_type, 
      li.price_usdc, li.average_rating, li.review_count, li.repository_url,
      a.id as agent_id, a.name as agent_name, a.wallet_address
    FROM launches l
    JOIN listings li ON l.listing_id = li.id
    JOIN agents a ON li.agent_id = a.id
    WHERE l.launched_at = CURRENT_DATE
    ORDER BY l.is_featured DESC, l.upvote_count DESC, l.created_at DESC
  `);

  return c.json({
    date: new Date().toISOString().split('T')[0],
    data: result.rows,
    count: result.rowCount
  });
});

/**
 * POST /api/v1/launches/:id/upvote
 * Upvote a launch
 */
launchesRouter.post('/:id/upvote', async (c) => {
  const launchId = c.req.param('id');
  if (!z.string().uuid().safeParse(launchId).success) {
    return errorResponse(c, 400, 'invalid_id', 'Launch ID must be a valid UUID.', 'Provide a valid UUID.');
  }

  let body: { user_id?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // Allow empty body
  }

  const userId = body.user_id;
  if (!userId) {
    return errorResponse(c, 422, 'validation_error', 'user_id is required.', 'Provide user_id in request body.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check launch exists
    const launchResult = await client.query('SELECT id FROM launches WHERE id = $1', [launchId]);
    if (launchResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(c, 404, 'launch_not_found', 'Launch not found.', 'Check the launch ID.');
    }

    // Try to insert upvote
    try {
      await client.query(
        'INSERT INTO launch_upvotes (launch_id, user_id) VALUES ($1, $2)',
        [launchId, userId]
      );
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        await client.query('ROLLBACK');
        return errorResponse(c, 409, 'already_upvoted', 'You have already upvoted this launch.', 
          'Each user can only upvote once per launch.');
      }
      throw err;
    }

    // Update count
    const countResult = await client.query(
      `UPDATE launches SET upvote_count = upvote_count + 1 WHERE id = $1 RETURNING upvote_count`,
      [launchId]
    );

    await client.query('COMMIT');

    return c.json({
      upvoted: true,
      upvote_count: countResult.rows[0].upvote_count
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to upvote launch');
    return errorResponse(c, 500, 'upvote_failed', 'Failed to upvote.', 'Try again later.');
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/launches/:id/upvote
 * Remove upvote from a launch
 */
launchesRouter.delete('/:id/upvote', async (c) => {
  const launchId = c.req.param('id');
  const userId = c.req.query('user_id');

  if (!z.string().uuid().safeParse(launchId).success) {
    return errorResponse(c, 400, 'invalid_id', 'Launch ID must be a valid UUID.', 'Provide a valid UUID.');
  }
  if (!userId) {
    return errorResponse(c, 422, 'validation_error', 'user_id query param is required.', 'Provide user_id.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleteResult = await client.query(
      'DELETE FROM launch_upvotes WHERE launch_id = $1 AND user_id = $2',
      [launchId, userId]
    );

    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return c.json({ removed: false, message: 'No upvote found to remove.' });
    }

    const countResult = await client.query(
      `UPDATE launches SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = $1 RETURNING upvote_count`,
      [launchId]
    );

    await client.query('COMMIT');

    return c.json({
      removed: true,
      upvote_count: countResult.rows[0].upvote_count
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to remove upvote');
    return errorResponse(c, 500, 'remove_upvote_failed', 'Failed to remove upvote.', 'Try again later.');
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/launches/:id/upvoted
 * Check if a user has upvoted a launch
 */
launchesRouter.get('/:id/upvoted', async (c) => {
  const launchId = c.req.param('id');
  const userId = c.req.query('user_id');

  if (!z.string().uuid().safeParse(launchId).success) {
    return errorResponse(c, 400, 'invalid_id', 'Launch ID must be a valid UUID.', 'Provide a valid UUID.');
  }
  if (!userId) {
    return errorResponse(c, 422, 'validation_error', 'user_id query param is required.', 'Provide user_id.');
  }

  const result = await pool.query(
    'SELECT id FROM launch_upvotes WHERE launch_id = $1 AND user_id = $2',
    [launchId, userId]
  );

  return c.json({ upvoted: (result.rowCount ?? 0) > 0 });
});
