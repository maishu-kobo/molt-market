import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { experimentContext } from '../src/middleware/experiment-context.js';

// UUID v4 pattern: 8-4-4-4-12 hex chars
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tiny Hono app that applies the middleware then echoes back
 * whatever `c.var.experiment` was set to.
 */
function buildApp() {
  const app = new Hono();
  app.use('*', experimentContext);
  app.get('/test', (c) => c.json(c.get('experiment')));
  return app;
}

describe('experimentContext middleware', () => {
  const app = buildApp();

  // ── 1. No experiment headers → null ────────────────────────────
  it('sets experiment to null when no experiment id is provided', async () => {
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  // ── 2. Only X-Experiment-Id header → defaults ─────────────────
  it('populates context with defaults when only experiment id header is present', async () => {
    const res = await app.request('/test', {
      headers: { 'x-experiment-id': 'exp-001' },
    });
    const body = await res.json();

    expect(body).toMatchObject({
      experiment_id: 'exp-001',
      condition: 'A',
      agent_id: '',
    });
    // session_id should be auto-generated UUID
    expect(body.session_id).toMatch(UUID_RE);
  });

  // ── 3. All headers present → all fields from headers ──────────
  it('populates all fields from headers when all are provided', async () => {
    const res = await app.request('/test', {
      headers: {
        'x-experiment-id': 'exp-002',
        'x-experiment-condition': 'B',
        'x-agent-id': 'agent-42',
        'x-session-id': 'sess-fixed',
      },
    });
    expect(await res.json()).toEqual({
      experiment_id: 'exp-002',
      condition: 'B',
      agent_id: 'agent-42',
      session_id: 'sess-fixed',
    });
  });

  // ── 4. Query params fallback ──────────────────────────────────
  it('reads experiment context from query params when headers are absent', async () => {
    const qs = new URLSearchParams({
      experiment_id: 'exp-qs',
      condition: 'C',
      agent_id: 'agent-qs',
      session_id: 'sess-qs',
    });
    const res = await app.request(`/test?${qs.toString()}`);
    expect(await res.json()).toEqual({
      experiment_id: 'exp-qs',
      condition: 'C',
      agent_id: 'agent-qs',
      session_id: 'sess-qs',
    });
  });

  // ── 5. Headers take precedence over query params ──────────────
  it('prefers header values over query param values', async () => {
    const qs = new URLSearchParams({
      experiment_id: 'qs-exp',
      condition: 'qs-cond',
      agent_id: 'qs-agent',
      session_id: 'qs-sess',
    });
    const res = await app.request(`/test?${qs.toString()}`, {
      headers: {
        'x-experiment-id': 'hdr-exp',
        'x-experiment-condition': 'hdr-cond',
        'x-agent-id': 'hdr-agent',
        'x-session-id': 'hdr-sess',
      },
    });
    expect(await res.json()).toEqual({
      experiment_id: 'hdr-exp',
      condition: 'hdr-cond',
      agent_id: 'hdr-agent',
      session_id: 'hdr-sess',
    });
  });

  // ── 6. Missing session id → auto-generated UUID ───────────────
  it('generates a valid UUID for session_id when neither header nor query is provided', async () => {
    const res = await app.request('/test', {
      headers: {
        'x-experiment-id': 'exp-uuid',
        'x-experiment-condition': 'A',
        'x-agent-id': 'agent-1',
      },
    });
    const body = await res.json();
    expect(body.session_id).toMatch(UUID_RE);
  });

  // ── 7. Missing condition → defaults to 'A' ───────────────────
  it("defaults condition to 'A' when not provided", async () => {
    const res = await app.request('/test', {
      headers: {
        'x-experiment-id': 'exp-def-cond',
        'x-agent-id': 'agent-1',
        'x-session-id': 'sess-1',
      },
    });
    const body = await res.json();
    expect(body.condition).toBe('A');
  });

  // ── 8. Missing agent id → defaults to '' ──────────────────────
  it("defaults agent_id to '' when not provided", async () => {
    const res = await app.request('/test', {
      headers: {
        'x-experiment-id': 'exp-def-agent',
        'x-experiment-condition': 'B',
        'x-session-id': 'sess-1',
      },
    });
    const body = await res.json();
    expect(body.agent_id).toBe('');
  });
});
