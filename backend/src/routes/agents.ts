import { Hono } from 'hono';
import { z } from 'zod';
import { ethers } from 'ethers';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { recordAuditLog } from '../services/audit-log.js';
import { walletSigner } from '../services/wallet-signer.js';
import { getUsdcBalance } from '../services/usdc.js';
import { logger } from '../logger.js';

const agentSchema = z.object({
  owner_id: z.string().min(1),
  name: z.string().min(1)
});

export const agentsRouter = new Hono();

/**
 * POST /api/v1/agents
 * Register a new agent. Generates a DID (did:ethr:<address>) and
 * an Ethereum wallet address using the WalletSigner abstraction.
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

  const { owner_id, name } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { address, kmsKeyId } = await walletSigner.generateWallet();
    const did = `did:ethr:${address}`;

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
