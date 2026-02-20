import type { MiddlewareHandler } from 'hono';
import { errorResponse } from './error-response.js';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    return errorResponse(
      c,
      500,
      'server_misconfigured',
      'API key is not configured on the server.',
      'Set API_KEY environment variable.'
    );
  }

  const apiKey = c.req.header('x-api-key');
  if (!apiKey || apiKey !== expectedKey) {
    return errorResponse(
      c,
      401,
      'unauthorized',
      'Invalid or missing API key.',
      'Provide a valid x-api-key header.'
    );
  }

  await next();
};
