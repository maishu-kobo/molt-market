import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { recordAuditLog } from '../services/audit-log.js';
import { enqueueWebhookJobs } from '../services/webhooks.js';
import { logger } from '../logger.js';

const reviewSchema = z.object({
  buyer_id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional()
});

export const reviewsRouter = new Hono();

/**
 * POST /api/v1/listings/:id/reviews
 * Submit a review for a listing. Each buyer can only review a listing once.
 * After insertion, the listing's average_rating and review_count are
 * recalculated. If average_rating < 2.0 and review_count >= 5, the
 * listing is automatically hidden and a listing.hidden webhook fires.
 */
reviewsRouter.post('/', async (c) => {
  const listingId = c.req.param('id');
  if (!z.string().uuid().safeParse(listingId).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Listing ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(
      c, 400, 'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.'
    );
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(
      c, 422, 'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields }
    );
  }

  const { buyer_id, rating, comment } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify listing exists
    const listingResult = await client.query(
      'SELECT id, agent_id FROM listings WHERE id = $1',
      [listingId]
    );
    if (listingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(
        c, 404, 'listing_not_found',
        'Listing not found.',
        'Check the listing ID and try again.'
      );
    }

    // Insert review
    const reviewResult = await client.query(
      `INSERT INTO reviews (id, listing_id, buyer_id, rating, comment)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING *`,
      [listingId, buyer_id, rating, comment ?? null]
    );
    const review = reviewResult.rows[0];

    // Recalculate average_rating and review_count
    const statsResult = await client.query(
      `SELECT COUNT(*)::int as review_count, AVG(rating)::numeric(3,2) as average_rating
       FROM reviews WHERE listing_id = $1`,
      [listingId]
    );
    const { review_count, average_rating } = statsResult.rows[0];

    // Check auto-hide condition
    const shouldHide = review_count >= 5 && parseFloat(average_rating) < 2.0;

    // Update listing stats
    await client.query(
      `UPDATE listings
       SET average_rating = $1, review_count = $2, is_hidden = $3
       WHERE id = $4`,
      [average_rating, review_count, shouldHide, listingId]
    );

    await recordAuditLog({
      agentId: listingResult.rows[0].agent_id,
      action: 'review.created',
      metadata: { listing_id: listingId, review_id: review.id, rating },
      client
    });

    // Fire listing.hidden webhook if auto-hidden
    if (shouldHide) {
      const webhookResult = await client.query(
        `SELECT id, event_type, url FROM webhooks
         WHERE event_type = $1 AND is_active = true`,
        ['listing.hidden']
      );
      if (webhookResult.rowCount && webhookResult.rowCount > 0) {
        await enqueueWebhookJobs({
          event: 'listing.hidden',
          payload: { listing_id: listingId, average_rating, review_count },
          webhooks: webhookResult.rows
        });
      }

      await recordAuditLog({
        agentId: listingResult.rows[0].agent_id,
        action: 'listing.hidden',
        metadata: { listing_id: listingId, average_rating, review_count },
        client
      });
    }

    await client.query('COMMIT');

    return c.json({
      ...review,
      listing_stats: {
        average_rating: parseFloat(average_rating),
        review_count,
        is_hidden: shouldHide
      }
    }, 201);
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        return errorResponse(
          c, 409, 'review_conflict',
          'You have already reviewed this listing.',
          'Each buyer can only submit one review per listing.'
        );
      }
    }

    logger.error({ err }, 'Failed to create review');
    return errorResponse(
      c, 500, 'review_create_failed',
      'Failed to create review.',
      'Retry later or contact support.'
    );
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/listings/:id/reviews
 * Retrieve all reviews for a listing.
 */
reviewsRouter.get('/', async (c) => {
  const listingId = c.req.param('id');
  if (!z.string().uuid().safeParse(listingId).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Listing ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

  const result = await pool.query(
    `SELECT * FROM reviews WHERE listing_id = $1 ORDER BY created_at DESC`,
    [listingId]
  );

  return c.json({ data: result.rows, count: result.rowCount });
});
