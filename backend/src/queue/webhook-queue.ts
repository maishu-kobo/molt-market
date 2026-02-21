import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';

let webhookQueue: Queue | null = null;

export function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue('webhooks', {
      connection: redisConnectionOptions
    });
  }

  return webhookQueue;
}
