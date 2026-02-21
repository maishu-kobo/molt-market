import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { swaggerUI } from '@hono/swagger-ui';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from './middleware/body-limit.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { handleError } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorResponse } from './middleware/error-response.js';
import { openApiSpec } from './openapi.js';
// Note: API key auth removed - using wallet signatures for write operations
import { listingsRouter } from './routes/listings.js';
import { agentsRouter } from './routes/agents.js';
import { reviewsRouter } from './routes/reviews.js';
import { moltbookRouter } from './routes/moltbook.js';
import { purchasesRouter } from './routes/purchases.js';
import { webhooksRouter } from './routes/webhooks.js';
import { launchesRouter } from './routes/launches.js';

export function createApp() {
  const app = new Hono();

  app.onError(handleError);

  app.use('*', secureHeaders());
  app.use('*', requestLogger);
  app.use('/api/*', cors({
    origin: ['https://molt-market-dev.exe.xyz:8000', 'http://localhost:8000', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Agent-Signature'],
    maxAge: 86400
  }));
  app.use('/api/*', rateLimitMiddleware);
  app.use('/api/*', bodyLimit(10 * 1024 * 1024));
  // No global auth - GET is public, POST/PUT/DELETE require wallet signature per-route

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/openapi.json', (c) => c.json(openApiSpec));
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));

  app.route('/api/v1/listings', listingsRouter);
  app.route('/api/v1/listings', moltbookRouter);
  app.route('/api/v1/webhooks', webhooksRouter);
  app.route('/api/v1/launches', launchesRouter);

  app.route('/api/v1/agents', agentsRouter);
  app.route('/api/v1/purchases', purchasesRouter);
  app.route('/api/v1/listings/:id/reviews', reviewsRouter);

  // Serve static files
  app.use('/*', serveStatic({ root: '../public' }));

  // SPA fallback - serve index.html for non-API routes
  app.notFound(async (c) => {
    const path = c.req.path;
    if (path.startsWith('/api/')) {
      return errorResponse(
        c,
        404,
        'not_found',
        'Requested resource was not found.',
        'Check the URL and try again.'
      );
    }
    // Serve index.html for SPA routes
    const fs = await import('fs/promises');
    try {
      const html = await fs.readFile('../public/index.html', 'utf-8');
      return c.html(html);
    } catch {
      return errorResponse(
        c,
        404,
        'not_found',
        'Requested resource was not found.',
        'Check the URL and try again.'
      );
    }
  });

  return app;
}

export const app = createApp();
