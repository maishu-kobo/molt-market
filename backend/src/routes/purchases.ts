import { Hono } from 'hono';
import { z } from 'zod';
import { ethers } from 'ethers';
import { logger as baseLogger } from '../logger.js';
import { errorResponse } from '../middleware/error-response.js';
import { createPostgresPurchaseRepository } from '../repositories/purchase-repository.js';
import { recordAuditLog } from '../services/audit-log.js';
import {
  createPurchaseService,
  type PurchaseListFilters,
  type PurchaseService
} from '../services/purchase-service.js';
import { executeTestnetPurchase, getTestBuyerBalances } from '../services/testnet-buyer.js';
import { enqueueWebhookJobs } from '../services/webhooks.js';

const walletAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a 20-byte hex wallet address.')
  .refine((value) => ethers.isAddress(value), 'Invalid wallet address checksum or format.');

const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, 'idempotency_key must use only A-Z, a-z, 0-9, :, _, -');

const purchaseSchema = z.object({
  listing_id: z.string().uuid(),
  buyer_wallet: walletAddressSchema,
  idempotency_key: idempotencyKeySchema
});

const autoPaymentSchema = z.object({
  recipient_address: walletAddressSchema,
  amount_usdc: z.union([z.number(), z.string()]).transform((value) => String(value)),
  interval_seconds: z.number().int().min(60),
  description: z.string().max(500).optional()
});

const uuidSchema = z.string().uuid();
const statusSchema = z.enum(['completed', 'failed', 'pending']);

type PurchasesRouterDeps = {
  purchaseService?: PurchaseService;
  paymentsDisabled?: boolean;
  getTestBuyerBalancesFn?: () => Promise<{
    address: string;
    ethBalance: string;
    usdcBalance: string;
  }>;
  logger?: Pick<typeof baseLogger, 'info' | 'warn' | 'error'>;
};

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  maxValue: number
): number | null {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, maxValue);
}

function parseNonNegativeInteger(value: string | undefined, defaultValue: number): number | null {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function createDefaultPurchaseService(): PurchaseService {
  const repository = createPostgresPurchaseRepository();

  return createPurchaseService({
    paymentsDisabled: process.env.PAYMENTS_DISABLED === 'true',
    repository,
    paymentExecutor: {
      async execute(params) {
        if (!process.env.USDC_CONTRACT_ADDRESS) {
          baseLogger.warn('USDC_CONTRACT_ADDRESS not set, simulating transaction');
          return {
            txHash: `sim:${params.purchaseId}`,
            buyerWallet: params.buyerWallet
          };
        }

        const result = await executeTestnetPurchase(
          params.sellerWalletAddress,
          params.amountUsdc
        );
        baseLogger.info(
          { txHash: result.txHash, seller: params.sellerWalletAddress },
          'Testnet USDC purchase completed'
        );

        return {
          txHash: result.txHash,
          buyerWallet: result.buyerAddress
        };
      }
    },
    auditLogs: {
      async record(params) {
        await recordAuditLog({
          agentId: params.agentId,
          action: params.action,
          metadata: params.metadata
        });
      }
    },
    webhookPublisher: {
      async publish(params) {
        await enqueueWebhookJobs(params);
      }
    },
    logger: baseLogger
  });
}

export function createPurchasesRouter(deps: PurchasesRouterDeps = {}): Hono {
  const purchaseService = deps.purchaseService ?? createDefaultPurchaseService();
  const paymentsDisabled = deps.paymentsDisabled ?? process.env.PAYMENTS_DISABLED === 'true';
  const fetchTestBuyerBalances = deps.getTestBuyerBalancesFn ?? getTestBuyerBalances;
  const logger = deps.logger ?? baseLogger;
  const router = new Hono();

  /**
   * GET /api/v1/purchases/testnet-buyer
   * Get test buyer wallet balances on testnet.
   */
  router.get('/testnet-buyer', async (c) => {
    if (paymentsDisabled) {
      return c.json(null);
    }

    try {
      const balances = await fetchTestBuyerBalances();
      return c.json(balances);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch test buyer balances');
      return errorResponse(
        c,
        502,
        'testnet_wallet_unavailable',
        'Failed to fetch testnet buyer wallet balances.',
        'Verify RPC and USDC configuration, then retry.'
      );
    }
  });

  /**
   * POST /api/v1/purchases
   * Create a purchase and execute payment (or simulation).
   */
  router.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(
        c,
        400,
        'invalid_json',
        'Request body must be valid JSON.',
        'Ensure the request body is valid JSON.'
      );
    }

    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      return errorResponse(
        c,
        422,
        'validation_error',
        'Missing or invalid fields in request body.',
        'Fix the highlighted fields and retry.',
        { fields }
      );
    }

    const result = await purchaseService.createPurchase({
      listingId: parsed.data.listing_id,
      buyerWallet: parsed.data.buyer_wallet,
      idempotencyKey: parsed.data.idempotency_key
    });

    if (!result.ok) {
      return errorResponse(
        c,
        result.error.status,
        result.error.errorCode,
        result.error.message,
        result.error.suggestedAction,
        result.error.details
      );
    }

    return c.json(result.data, result.status as 200 | 201);
  });

  /**
   * POST /api/v1/agents/:id/auto-payments
   * Register an automatic payment schedule for an agent.
   */
  router.post('/:id/auto-payments', async (c) => {
    const agentId = c.req.param('id');
    if (!uuidSchema.safeParse(agentId).success) {
      return errorResponse(
        c,
        400,
        'invalid_id',
        'Agent ID must be a valid UUID.',
        'Provide a valid UUID.'
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(
        c,
        400,
        'invalid_json',
        'Request body must be valid JSON.',
        'Ensure the request body is valid JSON.'
      );
    }

    const parsed = autoPaymentSchema.safeParse(body);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      return errorResponse(
        c,
        422,
        'validation_error',
        'Missing or invalid fields.',
        'Fix the highlighted fields and retry.',
        { fields }
      );
    }

    const result = await purchaseService.createAutoPayment({
      agentId,
      recipientAddress: parsed.data.recipient_address,
      amountUsdc: parsed.data.amount_usdc,
      intervalSeconds: parsed.data.interval_seconds,
      description: parsed.data.description
    });

    if (!result.ok) {
      return errorResponse(
        c,
        result.error.status,
        result.error.errorCode,
        result.error.message,
        result.error.suggestedAction,
        result.error.details
      );
    }

    return c.json(result.data, result.status as 201);
  });

  /**
   * GET /api/v1/purchases
   * List all purchases with optional filtering and pagination.
   */
  router.get('/', async (c) => {
    const limit = parsePositiveInteger(c.req.query('limit'), 50, 100);
    const offset = parseNonNegativeInteger(c.req.query('offset'), 0);

    if (limit === null || offset === null) {
      return errorResponse(
        c,
        400,
        'invalid_pagination',
        'Invalid pagination parameters.',
        'Provide positive limit and non-negative offset.'
      );
    }

    const status = c.req.query('status');
    if (status !== undefined && !statusSchema.safeParse(status).success) {
      return errorResponse(
        c,
        400,
        'invalid_status',
        'Invalid status filter.',
        'Use one of: completed, failed, pending.'
      );
    }

    const listingId = c.req.query('listing_id');
    if (listingId !== undefined && !uuidSchema.safeParse(listingId).success) {
      return errorResponse(
        c,
        400,
        'invalid_listing_id',
        'listing_id must be a valid UUID.',
        'Provide a valid listing_id value.'
      );
    }

    const buyerWallet = c.req.query('buyer_wallet');
    if (buyerWallet !== undefined && !walletAddressSchema.safeParse(buyerWallet).success) {
      return errorResponse(
        c,
        400,
        'invalid_buyer_wallet',
        'buyer_wallet must be a valid EVM address.',
        'Provide a valid buyer_wallet value.'
      );
    }

    const filters: PurchaseListFilters = {
      limit,
      offset,
      ...(status ? { status } : {}),
      ...(listingId ? { listingId } : {}),
      ...(buyerWallet ? { buyerWallet } : {})
    };

    const result = await purchaseService.listPurchases(filters);
    if (!result.ok) {
      return errorResponse(
        c,
        result.error.status,
        result.error.errorCode,
        result.error.message,
        result.error.suggestedAction,
        result.error.details
      );
    }

    return c.json(result.data);
  });

  return router;
}

export const purchasesRouter = createPurchasesRouter();
