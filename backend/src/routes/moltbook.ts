import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { enqueueMoltbookSync } from '../services/moltbook-sync.js';
import { logger } from '../logger.js';

export const moltbookRouter = new Hono();

/**
 * POST /api/v1/listings/:id/moltbook-retry
 * Manually retry Moltbook sync for a listing that failed
 * automatic sync. This enqueues a new sync job.
 */
moltbookRouter.post('/:id/moltbook-retry', async (c) => {
  const listingId = c.req.param('id');
  if (!z.string().uuid().safeParse(listingId).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Listing ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

  const result = await pool.query(
    'SELECT * FROM listings WHERE id = $1',
    [listingId]
  );
  if (result.rowCount === 0) {
    return errorResponse(
      c, 404, 'listing_not_found',
      'Listing not found.',
      'Check the listing ID and try again.'
    );
  }

  const listing = result.rows[0];

  if (listing.moltbook_id) {
    return c.json({
      message: 'Listing is already synced with Moltbook.',
      moltbook_id: listing.moltbook_id
    });
  }

  try {
    await enqueueMoltbookSync(listing);
    logger.info({ listingId }, 'Manual Moltbook retry enqueued');
    return c.json({ message: 'Moltbook sync job enqueued.', listing_id: listingId }, 202);
  } catch (err) {
    logger.error({ err, listingId }, 'Failed to enqueue Moltbook retry');
    return errorResponse(
      c, 500, 'moltbook_retry_failed',
      'Failed to enqueue Moltbook retry.',
      'Retry later or contact support.'
    );
  }
});
