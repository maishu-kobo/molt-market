import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth.js';
import { bodyLimit } from './middleware/body-limit.js';
import { handleError } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorResponse } from './middleware/error-response.js';
import { listingsRouter } from './routes/listings.js';
import { agentsRouter } from './routes/agents.js';
import { reviewsRouter } from './routes/reviews.js';
import { moltbookRouter } from './routes/moltbook.js';
import { purchasesRouter } from './routes/purchases.js';
import { webhooksRouter } from './routes/webhooks.js';

export function createApp() {
  const app = new Hono();

  app.onError(handleError);

  app.use('*', requestLogger);
  app.use('/api/*', bodyLimit(10 * 1024 * 1024));
  app.use('/api/*', authMiddleware);

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/docs', (c) =>
    errorResponse(
      c,
      501,
      'not_implemented',
      'OpenAPI docs are not implemented yet.',
      'Check back after the API spec is published.'
    )
  );

  app.route('/api/v1/listings', listingsRouter);
  app.route('/api/v1/listings', moltbookRouter);
  app.route('/api/v1/webhooks', webhooksRouter);

  app.route('/api/v1/agents', agentsRouter);
  app.route('/api/v1/purchases', purchasesRouter);
  app.route('/api/v1/listings/:id/reviews', reviewsRouter);

  app.notFound((c) =>
    errorResponse(
      c,
      404,
      'not_found',
      'Requested resource was not found.',
      'Check the URL and try again.'
    )
  );

  return app;
}

export const app = createApp();
