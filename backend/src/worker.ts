import 'dotenv/config';
import { logger } from './logger.js';
import './queue/webhook-worker.js';

logger.info('Webhook worker started');
