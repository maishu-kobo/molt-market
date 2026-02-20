import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { logger } from '../logger.js';

export type WebhookJob = {
  url: string;
  event: string;
  payload: unknown;
};

export const webhookWorker = new Worker<WebhookJob>(
  'webhooks',
  async (job) => {
    const { url, event, payload } = job.data;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'openclaw-marketplace-webhook'
      },
      body: JSON.stringify({ event, payload })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Webhook failed with status ${response.status}: ${body}`);
    }
  },
  {
    connection: redisConnection
  }
);

webhookWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, event: job.data.event }, 'Webhook delivered');
});

webhookWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Webhook delivery failed');
});
