import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const webhookQueue = new Queue('webhooks', {
  connection: redisConnection
});
