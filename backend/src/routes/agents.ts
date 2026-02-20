import { Hono } from 'hono';
import { z } from 'zod';
import { ethers } from 'ethers';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { recordAuditLog } from '../services/audit-log.js';
import { getUsdcBalance } from '../services/usdc.js';
import { starAgent, unstarAgent, hasStarred, getTopAgents } from '../services/agent-stats.js';
import { logger } from '../logger.js';

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Compute terms hash from actual TERMS.md file
const __dirname = dirname(fileURLToPath(import.meta.url));
const TERMS_PATH = join(__dirname, '../../../TERMS.md');
let TERMS_HASH: string;
let TERMS_VERSION: string;
let TERMS_MESSAGE: string;

try {
  const termsContent = readFileSync(TERMS_PATH, 'utf-8');
  TERMS_HASH = createHash('sha256').update(termsContent).digest('hex');
  // Extract version from file (Last Updated line)
  const versionMatch = termsContent.match(/Last Updated: (\w+ \d{4})/);
  TERMS_VERSION = versionMatch ? versionMatch[1] : 'current';
  TERMS_MESSAGE = `I agree to Molt Market Terms v${TERMS_VERSION} hash:${TERMS_HASH}`;
  console.log(`[Terms] Loaded TERMS.md - Version: ${TERMS_VERSION}, Hash: ${TERMS_HASH.slice(0, 16)}...`);
} catch (err) {
  console.error('[Terms] Failed to load TERMS.md:', err);
  TERMS_HASH = 'unknown';
  TERMS_VERSION = 'unknown';
  TERMS_MESSAGE = 'TERMS_NOT_LOADED';
}

// Agent registration schema
// wallet_address is REQUIRED - all agents must have a wallet
// terms_signature is REQUIRED - agent must sign agreement to terms
const agentSchema = z.object({
  owner_id: z.string().min(1),
  name: z.string().min(1),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  terms_signature: z.string().min(1) // Signature of TERMS_MESSAGE
});

export const agentsRouter = new Hono();

/**
 * GET /api/v1/agents/terms
 * Get the current terms message that agents must sign to register.
 */
agentsRouter.get('/terms', (c) => {
  return c.json({
    version: TERMS_VERSION,
    hash: TERMS_HASH,
    message: TERMS_MESSAGE,
    terms_url: 'https://github.com/maishu-kobo/molt-market/blob/main/TERMS.md'
  });
});

/**
 * POST /api/v1/agents
 * Register a new agent with wallet address and signed terms agreement.
 */
agentsRouter.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(
      c, 400, 'invalid_json',
      'Request body must be valid JSON.',
      'Ensure the request body is valid JSON.'
    );
  }

  const parsed = agentSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(
      c, 422, 'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields }
    );
  }

  const { owner_id, name, wallet_address, terms_signature } = parsed.data;

  // Verify terms signature
  const address = ethers.getAddress(wallet_address); // Normalize to checksum
  try {
    const recoveredAddress = ethers.verifyMessage(TERMS_MESSAGE, terms_signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return errorResponse(
        c, 401, 'invalid_terms_signature',
        'Terms signature does not match wallet address.',
        `Sign this message with your wallet: "${TERMS_MESSAGE}"`
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to verify terms signature');
    return errorResponse(
      c, 401, 'invalid_terms_signature',
      'Invalid terms signature format.',
      `Sign this message with your wallet: "${TERMS_MESSAGE}"`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const did = `did:ethr:${address}`;
    const kmsKeyId = 'self-managed';
    logger.info({ address, did }, 'Registering agent with self-managed wallet');

    const result = await client.query(
      `INSERT INTO agents (id, did, owner_id, name, wallet_address, kms_key_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING *`,
      [did, owner_id, name, address, kmsKeyId]
    );

    const agent = result.rows[0];

    await recordAuditLog({
      agentId: agent.id,
      action: 'agent.registered',
      metadata: { did, wallet_address: address },
      client
    });

    await client.query('COMMIT');

    return c.json(agent, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Failed to register agent');
    return errorResponse(
      c, 500, 'agent_create_failed',
      'Failed to register agent.',
      'Retry later or contact support.'
    );
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/agents/:id
 * Retrieve agent details by UUID.
 */
agentsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Agent ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

  const result = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return errorResponse(
      c, 404, 'agent_not_found',
      'Agent not found.',
      'Check the agent ID and try again.'
    );
  }

  return c.json(result.rows[0]);
});

/**
 * GET /api/v1/agents/:id/wallet
 * Query on-chain balance for an agent's wallet via RPC.
 * Returns balance in ETH and raw wei. For USDC balance a
 * contract read would be needed (added in the payments feature).
 */
agentsRouter.get('/:id/wallet', async (c) => {
  const id = c.req.param('id');
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Agent ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

  const result = await pool.query(
    'SELECT id, wallet_address, kms_key_id FROM agents WHERE id = $1',
    [id]
  );
  if (result.rowCount === 0) {
    return errorResponse(
      c, 404, 'agent_not_found',
      'Agent not found.',
      'Check the agent ID and try again.'
    );
  }

  const agent = result.rows[0];
  const rpcUrl = process.env.RPC_URL ?? 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    const balanceWei = await provider.getBalance(agent.wallet_address);
    const balanceEth = ethers.formatEther(balanceWei);

    // Query USDC balance if contract is configured
    let balanceUsdc: string | null = null;
    if (process.env.USDC_CONTRACT_ADDRESS) {
      try {
        balanceUsdc = await getUsdcBalance(agent.wallet_address);
      } catch (usdcErr) {
        logger.warn({ err: usdcErr, wallet: agent.wallet_address }, 'Failed to query USDC balance');
      }
    }

    return c.json({
      agent_id: agent.id,
      wallet_address: agent.wallet_address,
      balance_wei: balanceWei.toString(),
      balance_eth: balanceEth,
      balance_usdc: balanceUsdc
    });
  } catch (err) {
    logger.error({ err, wallet: agent.wallet_address }, 'Failed to query wallet balance');
    return errorResponse(
      c, 502, 'rpc_error',
      'Failed to query blockchain balance.',
      'Ensure the RPC endpoint is reachable and retry.'
    );
  }
});

/**
 * GET /api/v1/agents
 * List agents with optional filtering and sorting
 */
agentsRouter.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const offset = Number(c.req.query('offset') ?? 0);
  const sort = c.req.query('sort') ?? 'ranking'; // ranking, stars, products, newest

  let orderBy = '(average_rating * 2 + star_count * 0.5 + total_sales * 0.1) DESC';
  switch (sort) {
    case 'stars':
      orderBy = 'star_count DESC';
      break;
    case 'products':
      orderBy = 'product_count DESC';
      break;
    case 'newest':
      orderBy = 'created_at DESC';
      break;
    case 'rating':
      orderBy = 'average_rating DESC';
      break;
  }

  const result = await pool.query(`
    SELECT 
      id, did, owner_id, name, wallet_address, created_at,
      average_rating, total_reviews, product_count, total_sales, 
      total_revenue_usdc, star_count,
      (average_rating * 2 + star_count * 0.5 + total_sales * 0.1) as ranking_score
    FROM agents
    ORDER BY ${orderBy}, created_at ASC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  return c.json({
    data: result.rows,
    pagination: { limit, offset, count: result.rows.length }
  });
});

/**
 * POST /api/v1/agents/:id/star
 * Star an agent
 */
agentsRouter.post('/:id/star', async (c) => {
  const agentId = c.req.param('id');
  if (!z.string().uuid().safeParse(agentId).success) {
    return errorResponse(c, 400, 'invalid_id', 'Agent ID must be a valid UUID.', 'Provide a valid UUID.');
  }

  let body: { user_id?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // Allow empty body, will require user_id
  }

  const userId = body.user_id;
  if (!userId) {
    return errorResponse(c, 422, 'validation_error', 'user_id is required.', 'Provide a user_id in the request body.');
  }

  // Check agent exists
  const agentResult = await pool.query('SELECT id FROM agents WHERE id = $1', [agentId]);
  if (agentResult.rowCount === 0) {
    return errorResponse(c, 404, 'agent_not_found', 'Agent not found.', 'Check the agent ID.');
  }

  try {
    const result = await starAgent(agentId, userId);
    return c.json(result);
  } catch (err) {
    logger.error({ err, agentId, userId }, 'Failed to star agent');
    return errorResponse(c, 500, 'star_failed', 'Failed to star agent.', 'Try again later.');
  }
});

/**
 * DELETE /api/v1/agents/:id/star
 * Unstar an agent
 */
agentsRouter.delete('/:id/star', async (c) => {
  const agentId = c.req.param('id');
  if (!z.string().uuid().safeParse(agentId).success) {
    return errorResponse(c, 400, 'invalid_id', 'Agent ID must be a valid UUID.', 'Provide a valid UUID.');
  }

  const userId = c.req.query('user_id');
  if (!userId) {
    return errorResponse(c, 422, 'validation_error', 'user_id query param is required.', 'Provide user_id as query parameter.');
  }

  try {
    const result = await unstarAgent(agentId, userId);
    return c.json(result);
  } catch (err) {
    logger.error({ err, agentId, userId }, 'Failed to unstar agent');
    return errorResponse(c, 500, 'unstar_failed', 'Failed to unstar agent.', 'Try again later.');
  }
});

/**
 * GET /api/v1/agents/:id/starred
 * Check if user has starred an agent
 */
agentsRouter.get('/:id/starred', async (c) => {
  const agentId = c.req.param('id');
  const userId = c.req.query('user_id');

  if (!z.string().uuid().safeParse(agentId).success) {
    return errorResponse(c, 400, 'invalid_id', 'Agent ID must be a valid UUID.', 'Provide a valid UUID.');
  }
  if (!userId) {
    return errorResponse(c, 422, 'validation_error', 'user_id query param is required.', 'Provide user_id as query parameter.');
  }

  const starred = await hasStarred(agentId, userId);
  return c.json({ starred });
});

/**
 * GET /api/v1/agents/leaderboard
 * Get top agents leaderboard
 */
agentsRouter.get('/leaderboard', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const agents = await getTopAgents(limit, 0);
  return c.json({ data: agents });
});
