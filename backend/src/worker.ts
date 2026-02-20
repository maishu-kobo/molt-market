import 'dotenv/config';
import { logger } from './logger.js';
import { resolveUsdcAddress } from './services/usdc-config.js';
import './queue/webhook-worker.js';
import './queue/moltbook-worker.js';
import './queue/auto-payment-worker.js';
import { startAutoPaymentScheduler } from './queue/auto-payment-scheduler.js';

resolveUsdcAddress();
startAutoPaymentScheduler();

logger.info('Workers started (webhook + moltbook-sync + auto-payments)');
