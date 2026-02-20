import { pool } from '../db/index.js';
import { logger } from '../logger.js';

/**
 * Recalculate and update agent stats based on their listings and reviews
 */
export async function updateAgentStats(agentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Calculate stats from listings
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as product_count,
        COALESCE(AVG(average_rating) FILTER (WHERE review_count > 0), 0) as avg_rating,
        COALESCE(SUM(review_count), 0) as total_reviews
      FROM listings
      WHERE agent_id = $1 AND is_hidden = false
    `, [agentId]);

    // Calculate sales stats from purchases
    const salesResult = await client.query(`
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(amount_usdc), 0) as total_revenue
      FROM purchases
      WHERE seller_agent_id = $1 AND status = 'completed'
    `, [agentId]);

    const stats = statsResult.rows[0];
    const sales = salesResult.rows[0];

    await client.query(`
      UPDATE agents
      SET 
        product_count = $2,
        average_rating = $3,
        total_reviews = $4,
        total_sales = $5,
        total_revenue_usdc = $6
      WHERE id = $1
    `, [
      agentId,
      parseInt(stats.product_count, 10),
      parseFloat(stats.avg_rating) || 0,
      parseInt(stats.total_reviews, 10),
      parseInt(sales.total_sales, 10),
      parseFloat(sales.total_revenue) || 0
    ]);

    logger.info({ agentId, stats, sales }, 'Updated agent stats');
  } finally {
    client.release();
  }
}

/**
 * Add a star to an agent
 */
export async function starAgent(agentId: string, userId: string): Promise<{ starred: boolean; starCount: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Try to insert the star
    const insertResult = await client.query(`
      INSERT INTO agent_stars (agent_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (agent_id, user_id) DO NOTHING
      RETURNING id
    `, [agentId, userId]);

    const starred = insertResult.rowCount !== null && insertResult.rowCount > 0;

    if (starred) {
      // Update star count
      await client.query(`
        UPDATE agents
        SET star_count = star_count + 1
        WHERE id = $1
      `, [agentId]);
    }

    // Get current star count
    const countResult = await client.query(`
      SELECT star_count FROM agents WHERE id = $1
    `, [agentId]);

    await client.query('COMMIT');

    return {
      starred,
      starCount: countResult.rows[0]?.star_count ?? 0
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remove a star from an agent
 */
export async function unstarAgent(agentId: string, userId: string): Promise<{ unstarred: boolean; starCount: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Try to delete the star
    const deleteResult = await client.query(`
      DELETE FROM agent_stars
      WHERE agent_id = $1 AND user_id = $2
      RETURNING id
    `, [agentId, userId]);

    const unstarred = deleteResult.rowCount !== null && deleteResult.rowCount > 0;

    if (unstarred) {
      // Update star count
      await client.query(`
        UPDATE agents
        SET star_count = GREATEST(star_count - 1, 0)
        WHERE id = $1
      `, [agentId]);
    }

    // Get current star count
    const countResult = await client.query(`
      SELECT star_count FROM agents WHERE id = $1
    `, [agentId]);

    await client.query('COMMIT');

    return {
      unstarred,
      starCount: countResult.rows[0]?.star_count ?? 0
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check if a user has starred an agent
 */
export async function hasStarred(agentId: string, userId: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT 1 FROM agent_stars
    WHERE agent_id = $1 AND user_id = $2
  `, [agentId, userId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get top agents by ranking score
 * Score = (average_rating * 2) + (star_count * 0.5) + (total_sales * 0.1)
 */
export async function getTopAgents(limit: number = 50, offset: number = 0): Promise<unknown[]> {
  const result = await pool.query(`
    SELECT 
      a.*,
      (a.average_rating * 2 + a.star_count * 0.5 + a.total_sales * 0.1) as ranking_score
    FROM agents a
    WHERE a.product_count > 0
    ORDER BY ranking_score DESC, a.created_at ASC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  return result.rows;
}
