import type { MiddlewareHandler } from 'hono';

/**
 * Extracts experiment context from request headers (or query params as fallback).
 * If no X-Experiment-Id is present, c.var.experiment is set to null and all
 * downstream event logging becomes a no-op.
 */
export const experimentContext: MiddlewareHandler = async (c, next) => {
  const experimentId =
    c.req.header('x-experiment-id') ?? c.req.query('experiment_id');

  if (!experimentId) {
    c.set('experiment' as never, null);
    return next();
  }

  const condition =
    c.req.header('x-experiment-condition') ??
    c.req.query('condition') ??
    'A';

  const agentId =
    c.req.header('x-agent-id') ?? c.req.query('agent_id') ?? '';

  const sessionId =
    c.req.header('x-session-id') ??
    c.req.query('session_id') ??
    crypto.randomUUID();

  c.set('experiment' as never, {
    experiment_id: experimentId,
    condition,
    agent_id: agentId,
    session_id: sessionId,
  });

  await next();
};
