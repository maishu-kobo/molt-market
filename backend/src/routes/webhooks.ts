import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';

const webhookSchema = z.object({
  event_type: z.string().min(1),
  url: z.string().url()
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
