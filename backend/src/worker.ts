import 'dotenv/config';
import { logger } from './logger.js';
import './queue/webhook-worker.js';
import './queue/moltbook-worker.js';
import './queue/auto-payment-worker.js';
import { startAutoPaymentScheduler } from './queue/auto-payment-scheduler.js';

startAutoPaymentScheduler();

logger.info('Workers started (webhook + moltbook-sync + auto-payments)');
