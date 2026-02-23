import { logger } from '../logger.js';
import { checkDeadlines } from '../services/experiment-tasks.js';

/**
 * Polls for overdue experiment tasks every 30 seconds and marks them as missed.
 * Pattern follows auto-payment-scheduler.ts.
 */
export function startDeadlineChecker() {
  const POLL_INTERVAL_MS = 30_000;

  async function poll() {
    try {
      const count = await checkDeadlines();
      if (count > 0) {
        logger.info({ count }, 'Marked overdue experiment tasks as missed');
      }
    } catch (err) {
      logger.error({ err }, 'Deadline checker poll failed');
    }
  }

  poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'Deadline checker started');
  return timer;
}
