import 'dotenv/config';
import { runRetentionJob, getRetentionStats } from './services/listing-retention.js';
import { logger } from './logger.js';

const INTERVAL_MS = 60 * 60 * 1000; // Run every hour

async function runJob() {
  try {
    const stats = await getRetentionStats();
    logger.info({ stats }, 'Retention stats before job');

    const result = await runRetentionJob();
    logger.info({ result }, 'Retention job completed');
  } catch (err) {
    logger.error({ err }, 'Retention job failed');
  }
}

async function main() {
  logger.info('Starting retention worker');

  // Run immediately on startup
  await runJob();

  // Then run every hour
  setInterval(runJob, INTERVAL_MS);
}

main().catch((err) => {
  logger.error({ err }, 'Retention worker crashed');
  process.exit(1);
});
