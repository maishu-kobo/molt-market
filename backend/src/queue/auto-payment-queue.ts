import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';

export const autoPaymentQueue = new Queue('auto-payments', {
  connection: redisConnectionOptions
});
