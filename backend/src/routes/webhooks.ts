import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { isWebhookUrlAllowed } from '../security/network.js';

const webhookEventSchema = z.enum([
  'listing.created',
  'purchase.completed',
  'payment.failed',
  'listing.moltbook_sync_failed'
]);

const webhookSchema = z.object({
  event_type: webhookEventSchema,
  url: z.string().url().max(2048)
});

export const webhooksRouter = new Hono();

webhooksRouter.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(
      c,
      400,
      'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.'
    );
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(
      c,
      422,
      'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields }
    );
  }

  const { event_type, url } = parsed.data;
  if (!isWebhookUrlAllowed(url)) {
    return errorResponse(
      c,
      422,
      'invalid_webhook_url',
      'Webhook URL is not allowed.',
      'Use a public HTTPS URL or set ALLOW_PRIVATE_WEBHOOK_URLS/ALLOW_HTTP_WEBHOOKS in controlled environments.'
    );
  }

  const result = await pool.query(
    `
      INSERT INTO webhooks (id, event_type, url)
      VALUES (gen_random_uuid(), $1, $2)
      RETURNING id, event_type, url, is_active, created_at
    `,
    [event_type, url]
  );

  return c.json(result.rows[0], 201);
});

webhooksRouter.get('/', async (c) => {
  const result = await pool.query(
    `
      SELECT id, event_type, url, is_active, created_at
      FROM webhooks
      ORDER BY created_at DESC
    `
  );

  return c.json({ data: result.rows });
});
