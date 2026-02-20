import { pool } from '../db/index.js';
import { autoPaymentQueue } from './auto-payment-queue.js';
import { logger } from '../logger.js';

/**
 * Polls the auto_payments table every 30 seconds for payments
 * that are due (based on interval_seconds and last_executed_at).
 * Enqueues a job for each due payment.
 */
export function startAutoPaymentScheduler() {
  const POLL_INTERVAL_MS = 30_000;

  async function poll() {
    try {
      // Find active auto-payments that are due:
      // Either never executed, or last_executed_at + interval_seconds < now()
      const result = await pool.query(
        `SELECT ap.*, a.kms_key_id, a.wallet_address
         FROM auto_payments ap
         JOIN agents a ON a.id = ap.agent_id
         WHERE ap.is_active = true
           AND (
             ap.last_executed_at IS NULL
             OR ap.last_executed_at + (ap.interval_seconds || ' seconds')::interval < now()
           )`
      );

      if (result.rowCount && result.rowCount > 0) {
        logger.info({ count: result.rowCount }, 'Scheduling due auto-payments');
        for (const row of result.rows) {
          await autoPaymentQueue.add(
            'execute',
            {
              auto_payment_id: row.id,
              agent_id: row.agent_id,
              kms_key_id: row.kms_key_id,
              wallet_address: row.wallet_address,
              recipient_address: row.recipient_address,
              amount_usdc: String(row.amount_usdc)
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              jobId: `auto-payment-${row.id}-${Date.now()}`
            }
          );
        }
      }
    } catch (err) {
      logger.error({ err }, 'Auto-payment scheduler poll failed');
    }
  }

  // Run immediately, then on interval
  poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'Auto-payment scheduler started');
  return timer;
}
