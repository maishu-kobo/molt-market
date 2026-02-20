import type { PoolClient } from 'pg';
import { pool } from '../db/index.js';

export async function recordAuditLog(params: {
  agentId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}) {
  const { agentId, action, metadata, client } = params;
  const runner = client ?? pool;
  await runner.query(
    `
      INSERT INTO audit_logs (id, agent_id, action, metadata)
      VALUES (gen_random_uuid(), $1, $2, $3)
    `,
    [agentId ?? null, action, metadata ?? null]
  );
}
