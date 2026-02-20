import { pool } from '../db/index.js';
import { logger } from '../logger.js';

const RETENTION_HOURS = 24;
const TOP_PERMANENT_COUNT = 100;

/**
 * Mark top 100 listings as permanent based on rating and review count.
 * Only considers non-hidden listings with at least 1 review.
 */
export async function markTopListingsAsPermanent(): Promise<number> {
  const result = await pool.query(`
    WITH top_listings AS (
      SELECT id
      FROM listings
      WHERE is_hidden = false AND review_count > 0
      ORDER BY average_rating DESC, review_count DESC, created_at ASC
      LIMIT $1
    )
    UPDATE listings
    SET is_permanent = true
    WHERE id IN (SELECT id FROM top_listings)
      AND is_permanent = false
    RETURNING id
  `, [TOP_PERMANENT_COUNT]);

  return result.rowCount ?? 0;
}

/**
 * Remove non-permanent listings older than RETENTION_HOURS.
 * Returns the number of deleted listings.
 */
export async function cleanupOldListings(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const result = await pool.query(`
    DELETE FROM listings
    WHERE is_permanent = false
      AND created_at < $1
    RETURNING id
  `, [cutoff]);

  return result.rowCount ?? 0;
}

/**
 * Run the full retention job:
 * 1. Mark top listings as permanent
 * 2. Clean up old non-permanent listings
 */
export async function runRetentionJob(): Promise<{ marked: number; deleted: number }> {
  logger.info('Starting listing retention job');

  const marked = await markTopListingsAsPermanent();
  logger.info({ marked }, 'Marked top listings as permanent');

  const deleted = await cleanupOldListings();
  logger.info({ deleted }, 'Deleted old non-permanent listings');

  return { marked, deleted };
}

/**
 * Get retention stats for monitoring
 */
export async function getRetentionStats(): Promise<{
  total: number;
  permanent: number;
  temporary: number;
  olderThan24h: number;
}> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_permanent = true) as permanent,
      COUNT(*) FILTER (WHERE is_permanent = false) as temporary,
      COUNT(*) FILTER (WHERE is_permanent = false AND created_at < $1) as older_than_24h
    FROM listings
  `, [cutoff]);

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    permanent: parseInt(row.permanent, 10),
    temporary: parseInt(row.temporary, 10),
    olderThan24h: parseInt(row.older_than_24h, 10)
  };
}
