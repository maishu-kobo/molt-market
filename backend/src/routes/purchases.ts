import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { errorResponse } from '../middleware/error-response.js';
import { recordAuditLog } from '../services/audit-log.js';
import { enqueueWebhookJobs } from '../services/webhooks.js';
import { walletSigner } from '../services/wallet-signer.js';
import { transferUsdc } from '../services/usdc.js';
import { executeTestnetPurchase, getTestBuyerBalances } from '../services/testnet-buyer.js';
import { logger } from '../logger.js';

const purchaseSchema = z.object({
  listing_id: z.string().uuid(),
  buyer_wallet: z.string().min(1),
  idempotency_key: z.string().min(1)
});

const autoPaymentSchema = z.object({
  recipient_address: z.string().min(1),
  amount_usdc: z.union([z.number(), z.string()]).transform((v) => String(v)),
  interval_seconds: z.number().int().min(60),
  description: z.string().optional()
});

export const purchasesRouter = new Hono();

/**
 * GET /api/v1/purchases/testnet-buyer
 * Get the test buyer wallet's balances (for testnet only).
 */
purchasesRouter.get('/testnet-buyer', async (c) => {
  try {
    const balances = await getTestBuyerBalances();
    return c.json({
      ...balances,
      network: 'base-sepolia',
      chain_id: 84532,
      note: 'This is a shared test wallet. Fund via faucet if empty.'
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get testnet buyer balances');
    return errorResponse(
      c, 500, 'balance_check_failed',
      'Failed to check testnet buyer balance.',
      'Ensure RPC_URL is configured correctly.'
    );
  }
});

/**
 * POST /api/v1/purchases
 * Execute a USDC purchase for a listing. The buyer_wallet sends USDC
 * to the seller agent's wallet. Idempotency is enforced via
 * idempotency_key unique constraint.
 *
 * In the MVP the buyer must have already approved the USDC transfer
 * or we use Anvil's impersonation. The transaction is executed
 * on-chain via the seller agent's WalletSigner.
 */
purchasesRouter.post('/', async (c) => {
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

  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(
      c, 422, 'validation_error',
      'Missing or invalid fields in request body.',
      'Fix the highlighted fields and retry.',
      { fields }
    );
  }

  const { listing_id, buyer_wallet, idempotency_key } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check idempotency: if a purchase with this key exists, return it
    const existingResult = await client.query(
      'SELECT * FROM purchases WHERE idempotency_key = $1',
      [idempotency_key]
    );
    if (existingResult.rowCount && existingResult.rowCount > 0) {
      await client.query('ROLLBACK');
      return c.json(existingResult.rows[0], 200);
    }

    // Fetch listing
    const listingResult = await client.query(
      'SELECT * FROM listings WHERE id = $1 AND status = $2',
      [listing_id, 'active']
    );
    if (listingResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(
        c, 404, 'listing_not_found',
        'Active listing not found.',
        'Check the listing ID and ensure it is active.'
      );
    }
    const listing = listingResult.rows[0];

    // Fetch seller agent
    const agentResult = await client.query(
      'SELECT * FROM agents WHERE id = $1',
      [listing.agent_id]
    );
    if (agentResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return errorResponse(
        c, 404, 'agent_not_found',
        'Seller agent not found.',
        'The listing references a non-existent agent.'
      );
    }
    const sellerAgent = agentResult.rows[0];

    // Insert purchase record in pending state
    const purchaseResult = await client.query(
      `INSERT INTO purchases (id, listing_id, buyer_wallet, seller_agent_id, amount_usdc, status, idempotency_key)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', $5)
       RETURNING *`,
      [listing_id, buyer_wallet, sellerAgent.id, listing.price_usdc, idempotency_key]
    );
    const purchase = purchaseResult.rows[0];

    await client.query('COMMIT');

    // Execute on-chain transfer (outside DB transaction)
    let txHash: string;
    let actualBuyerWallet = buyer_wallet;
    try {
      if (process.env.USDC_CONTRACT_ADDRESS) {
        // Use testnet buyer wallet for Base Sepolia
        // In production, this would require buyer's signature via frontend
        const result = await executeTestnetPurchase(
          sellerAgent.wallet_address,
          String(listing.price_usdc)
        );
        txHash = result.txHash;
        actualBuyerWallet = result.buyerAddress;
        logger.info({ txHash, seller: sellerAgent.wallet_address }, 'Testnet USDC purchase completed');
      } else {
        // No USDC contract deployed - record as simulated
        txHash = `sim:${purchase.id}`;
        logger.warn('USDC_CONTRACT_ADDRESS not set, simulating transaction');
      }
    } catch (err) {
      // Mark as failed
      await pool.query(
        "UPDATE purchases SET status = 'failed' WHERE id = $1",
        [purchase.id]
      );
      logger.error({ err, purchaseId: purchase.id }, 'On-chain transfer failed');

      // Fire payment.failed webhook
      const webhooks = await pool.query(
        "SELECT id, event_type, url FROM webhooks WHERE event_type = 'payment.failed' AND is_active = true"
      );
      if (webhooks.rowCount && webhooks.rowCount > 0) {
        await enqueueWebhookJobs({
          event: 'payment.failed',
          payload: { purchase_id: purchase.id, listing_id, error: String(err) },
          webhooks: webhooks.rows
        });
      }

      return errorResponse(
        c, 502, 'payment_failed',
        'On-chain USDC transfer failed.',
        'Check wallet balance and retry.'
      );
    }

    // Update purchase with tx_hash, actual buyer wallet, and completed status
    const updatedResult = await pool.query(
      "UPDATE purchases SET status = 'completed', tx_hash = $1, buyer_wallet = $2 WHERE id = $3 RETURNING *",
      [txHash, actualBuyerWallet, purchase.id]
    );

    await recordAuditLog({
      agentId: sellerAgent.id,
      action: 'purchase.completed',
      metadata: { purchase_id: purchase.id, tx_hash: txHash, amount_usdc: listing.price_usdc }
    });

    // Fire purchase.completed webhook
    const webhooks = await pool.query(
      "SELECT id, event_type, url FROM webhooks WHERE event_type = 'purchase.completed' AND is_active = true"
    );
    if (webhooks.rowCount && webhooks.rowCount > 0) {
      await enqueueWebhookJobs({
        event: 'purchase.completed',
        payload: updatedResult.rows[0],
        webhooks: webhooks.rows
      });
    }

    return c.json(updatedResult.rows[0], 201);
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        // Idempotency key collision
        const existing = await pool.query(
          'SELECT * FROM purchases WHERE idempotency_key = $1',
          [idempotency_key]
        );
        if (existing.rowCount && existing.rowCount > 0) {
          return c.json(existing.rows[0], 200);
        }
      }
    }

    logger.error({ err }, 'Failed to create purchase');
    return errorResponse(
      c, 500, 'purchase_create_failed',
      'Failed to create purchase.',
      'Retry later or contact support.'
    );
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/agents/:id/auto-payments
 * Register an automatic payment schedule for an agent.
 * Stored in a new auto_payments table. The actual execution
 * would be handled by a cron/BullMQ recurring job.
 */
purchasesRouter.post('/:id/auto-payments', async (c) => {
  // Note: This endpoint is mounted under /api/v1/agents via app.ts
  // so :id is the agent_id
  const agentId = c.req.param('id');
  if (!z.string().uuid().safeParse(agentId).success) {
    return errorResponse(
      c, 400, 'invalid_id',
      'Agent ID must be a valid UUID.',
      'Provide a valid UUID.'
    );
  }

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

  const parsed = autoPaymentSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return errorResponse(
      c, 422, 'validation_error',
      'Missing or invalid fields.',
      'Fix the highlighted fields and retry.',
      { fields }
    );
  }

  // Verify agent exists
  const agentResult = await pool.query('SELECT id FROM agents WHERE id = $1', [agentId]);
  if (agentResult.rowCount === 0) {
    return errorResponse(
      c, 404, 'agent_not_found',
      'Agent not found.',
      'Check the agent ID and try again.'
    );
  }

  const { recipient_address, amount_usdc, interval_seconds, description } = parsed.data;

  const result = await pool.query(
    `INSERT INTO auto_payments (id, agent_id, recipient_address, amount_usdc, interval_seconds, description)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     RETURNING *`,
    [agentId, recipient_address, amount_usdc, interval_seconds, description ?? null]
  );

  await recordAuditLog({
    agentId,
    action: 'auto_payment.created',
    metadata: { auto_payment_id: result.rows[0].id, amount_usdc, interval_seconds }
  });

  return c.json(result.rows[0], 201);
});

/**
 * GET /api/v1/purchases
 * List all purchases with optional filtering
 */
purchasesRouter.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const offset = Number(c.req.query('offset') ?? 0);
  const status = c.req.query('status'); // completed, failed, pending
  const listing_id = c.req.query('listing_id');
  const buyer_wallet = c.req.query('buyer_wallet');

  let query = `
    SELECT p.*, l.title as listing_title, l.product_type, a.name as seller_name
    FROM purchases p
    LEFT JOIN listings l ON p.listing_id = l.id
    LEFT JOIN agents a ON p.seller_agent_id = a.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND p.status = $${paramIndex++}`;
    params.push(status);
  }
  if (listing_id) {
    query += ` AND p.listing_id = $${paramIndex++}`;
    params.push(listing_id);
  }
  if (buyer_wallet) {
    query += ` AND p.buyer_wallet = $${paramIndex++}`;
    params.push(buyer_wallet);
  }

  query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return c.json({
    data: result.rows,
    pagination: { limit, offset, count: result.rows.length }
  });
});
