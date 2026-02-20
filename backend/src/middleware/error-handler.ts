import type { Context } from 'hono';
import { logger } from '../logger.js';
import { errorResponse } from './error-response.js';

export function handleError(err: unknown, c: Context) {
  logger.error({ err }, 'Unhandled error');
  return errorResponse(
    c,
    500,
    'internal_error',
    'An unexpected error occurred.',
    'Retry later or contact support.'
  );
}
