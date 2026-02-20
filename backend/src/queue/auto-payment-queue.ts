import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const autoPaymentQueue = new Queue('auto-payments', {
  connection: redisConnection
});
