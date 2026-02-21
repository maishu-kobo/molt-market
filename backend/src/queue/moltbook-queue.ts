import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';

export const moltbookQueue = new Queue('moltbook-sync', {
  connection: redisConnectionOptions
});
