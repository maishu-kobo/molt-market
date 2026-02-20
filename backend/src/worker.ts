import 'dotenv/config';
import { logger } from './logger.js';
import './queue/webhook-worker.js';
import './queue/moltbook-worker.js';

logger.info('Workers started (webhook + moltbook-sync)');
