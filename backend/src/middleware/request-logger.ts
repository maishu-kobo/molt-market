import type { MiddlewareHandler } from 'hono';
import { logger } from '../logger.js';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  const experiment = c.var.experiment;
  logger.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: durationMs,
    ...(experiment ? {
      experiment_id: experiment.experiment_id,
      condition: experiment.condition,
      agent_id: experiment.agent_id,
      session_id: experiment.session_id,
    } : {}),
  }, 'request');
};
