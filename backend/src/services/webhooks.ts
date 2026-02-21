import { pool } from '../db/index.js';
import { getWebhookQueue } from '../queue/webhook-queue.js';

export type WebhookRecord = {
  id: string;
  event_type: string;
  url: string;
};

export async function fetchActiveWebhooks(eventType: string): Promise<WebhookRecord[]> {
  const result = await pool.query<WebhookRecord>(
    `
      SELECT id, event_type, url
      FROM webhooks
      WHERE event_type = $1 AND is_active = true
    `,
    [eventType]
  );
  return result.rows;
}

export async function enqueueWebhookJobs(params: {
  event: string;
  payload: unknown;
  webhooks: WebhookRecord[];
}) {
  const { event, payload, webhooks } = params;
  if (webhooks.length === 0) {
    return;
  }

  const queue = getWebhookQueue();

  await Promise.all(
    webhooks.map((webhook) =>
      queue.add(
        'deliver',
        {
          url: webhook.url,
          event,
          payload
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      )
    )
  );
}
