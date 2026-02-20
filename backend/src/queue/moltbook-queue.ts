import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const moltbookQueue = new Queue('moltbook-sync', {
  connection: redisConnection
});
