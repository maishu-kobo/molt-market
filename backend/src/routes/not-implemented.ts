import { Hono } from 'hono';
import { errorResponse } from '../middleware/error-response.js';

export const notImplementedRouter = new Hono();

notImplementedRouter.all('*', (c) => {
  return errorResponse(
    c,
    501,
    'not_implemented',
    'This endpoint is not implemented yet.',
    'Check the roadmap or contact support.'
  );
});
