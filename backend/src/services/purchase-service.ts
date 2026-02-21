import type { ErrorResponseDetails } from '../middleware/error-response.js';
import type { WebhookRecord } from './webhooks.js';

export type ServiceResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
    }
  | {
      ok: false;
      error: ServiceError;
    };

export type ServiceError = {
  status: number;
  errorCode: string;
  message: string;
  suggestedAction: string;
  details?: ErrorResponseDetails;
};

export type PurchaseCreateInput = {
  listingId: string;
  buyerWallet: string;
  idempotencyKey: string;
};

export type AutoPaymentCreateInput = {
  agentId: string;
  recipientAddress: string;
  amountUsdc: string;
  intervalSeconds: number;
  description?: string | null;
};

export type PurchaseListFilters = {
  limit: number;
  offset: number;
  status?: string;
  listingId?: string;
  buyerWallet?: string;
};

export type PurchaseListResponse = {
  data: PurchaseRecord[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
};

export type PurchaseRecord = Record<string, unknown> & {
  id: string;
  listing_id: string;
  buyer_wallet: string;
  seller_agent_id: string;
  amount_usdc: string | number;
  status: string;
  idempotency_key: string;
  tx_hash?: string | null;
};

export type ListingRecord = Record<string, unknown> & {
  id: string;
  agent_id: string;
  price_usdc: string | number;
};

export type AgentRecord = Record<string, unknown> & {
  id: string;
  wallet_address: string;
};

export type AutoPaymentRecord = Record<string, unknown> & {
  id: string;
  agent_id: string;
  recipient_address: string;
  amount_usdc: string | number;
  interval_seconds: number;
};

export type PreparePurchaseResult =
  | {
      kind: 'existing';
      purchase: PurchaseRecord;
    }
  | {
      kind: 'listing_not_found';
    }
  | {
      kind: 'agent_not_found';
    }
  | {
      kind: 'created';
      purchase: PurchaseRecord;
      listing: ListingRecord;
      sellerAgent: AgentRecord;
    };

export interface PurchaseRepository {
  preparePurchase(input: PurchaseCreateInput): Promise<PreparePurchaseResult>;
  markPurchaseFailed(purchaseId: string): Promise<void>;
  completePurchase(params: {
    purchaseId: string;
    txHash: string;
    buyerWallet: string;
  }): Promise<PurchaseRecord>;
  fetchWebhooks(eventType: string): Promise<WebhookRecord[]>;
  createAutoPayment(input: AutoPaymentCreateInput): Promise<AutoPaymentRecord>;
  agentExists(agentId: string): Promise<boolean>;
  listPurchases(filters: PurchaseListFilters): Promise<PurchaseRecord[]>;
}

export interface PaymentExecutor {
  execute(params: {
    purchaseId: string;
    sellerWalletAddress: string;
    amountUsdc: string;
    buyerWallet: string;
  }): Promise<{ txHash: string; buyerWallet: string }>;
}

export interface AuditLogWriter {
  record(params: {
    agentId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface WebhookPublisher {
  publish(params: {
    event: string;
    payload: unknown;
    webhooks: WebhookRecord[];
  }): Promise<void>;
}

export interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export type PurchaseServiceOptions = {
  paymentsDisabled: boolean;
  repository: PurchaseRepository;
  paymentExecutor: PaymentExecutor;
  auditLogs: AuditLogWriter;
  webhookPublisher: WebhookPublisher;
  logger: LoggerLike;
};

export interface PurchaseService {
  createPurchase(input: PurchaseCreateInput): Promise<ServiceResult<PurchaseRecord>>;
  createAutoPayment(input: AutoPaymentCreateInput): Promise<ServiceResult<AutoPaymentRecord>>;
  listPurchases(filters: PurchaseListFilters): Promise<ServiceResult<PurchaseListResponse>>;
}

function success<T>(status: number, data: T): ServiceResult<T> {
  return {
    ok: true,
    status,
    data
  };
}

function failure(
  status: number,
  errorCode: string,
  message: string,
  suggestedAction: string,
  details?: ErrorResponseDetails
): ServiceResult<never> {
  return {
    ok: false,
    error: {
      status,
      errorCode,
      message,
      suggestedAction,
      ...(details ? { details } : {})
    }
  };
}

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function createPurchaseService(options: PurchaseServiceOptions): PurchaseService {
  const {
    paymentsDisabled,
    repository,
    paymentExecutor,
    auditLogs,
    webhookPublisher,
    logger
  } = options;

  async function emitWebhook(event: string, payload: unknown): Promise<void> {
    try {
      const webhooks = await repository.fetchWebhooks(event);
      if (webhooks.length === 0) {
        return;
      }
      await webhookPublisher.publish({ event, payload, webhooks });
    } catch (err) {
      logger.warn({ err, event }, 'Webhook dispatch failed');
    }
  }

  async function writeAuditLog(params: {
    agentId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await auditLogs.record(params);
    } catch (err) {
      logger.warn({ err, action: params.action }, 'Audit log write failed');
    }
  }

  return {
    async createPurchase(input) {
      if (paymentsDisabled) {
        return failure(
          503,
          'payments_disabled',
          'Payment functionality is disabled. Server-side key management is not secure.',
          'Use reviews and stars to evaluate products. Payments require proper Web3 key management.'
        );
      }

      let prepared: PreparePurchaseResult;
      try {
        prepared = await repository.preparePurchase(input);
      } catch (err) {
        logger.error({ err, input }, 'Failed to prepare purchase');
        return failure(
          500,
          'purchase_create_failed',
          'Failed to create purchase.',
          'Retry later or contact support.'
        );
      }

      if (prepared.kind === 'existing') {
        return success(200, prepared.purchase);
      }

      if (prepared.kind === 'listing_not_found') {
        return failure(
          404,
          'listing_not_found',
          'Active listing not found.',
          'Check the listing ID and ensure it is active.'
        );
      }

      if (prepared.kind === 'agent_not_found') {
        return failure(
          404,
          'agent_not_found',
          'Seller agent not found.',
          'The listing references a non-existent agent.'
        );
      }

      const pendingPurchase = prepared.purchase;
      const listing = prepared.listing;
      const sellerAgent = prepared.sellerAgent;

      let paymentResult: { txHash: string; buyerWallet: string };
      try {
        paymentResult = await paymentExecutor.execute({
          purchaseId: pendingPurchase.id,
          sellerWalletAddress: sellerAgent.wallet_address,
          amountUsdc: String(listing.price_usdc),
          buyerWallet: input.buyerWallet
        });
      } catch (err) {
        await repository.markPurchaseFailed(pendingPurchase.id).catch((markFailedErr) => {
          logger.error(
            { err: markFailedErr, purchaseId: pendingPurchase.id },
            'Failed to mark purchase as failed'
          );
        });

        await emitWebhook('payment.failed', {
          purchase_id: pendingPurchase.id,
          listing_id: input.listingId,
          error: asErrorMessage(err)
        });

        logger.error({ err, purchaseId: pendingPurchase.id }, 'On-chain transfer failed');
        return failure(
          502,
          'payment_failed',
          'On-chain USDC transfer failed.',
          'Check wallet balance and retry.'
        );
      }

      let completedPurchase: PurchaseRecord;
      try {
        completedPurchase = await repository.completePurchase({
          purchaseId: pendingPurchase.id,
          txHash: paymentResult.txHash,
          buyerWallet: paymentResult.buyerWallet
        });
      } catch (err) {
        logger.error({ err, purchaseId: pendingPurchase.id }, 'Failed to finalize purchase');
        return failure(
          500,
          'purchase_finalize_failed',
          'Purchase was paid but could not be finalized.',
          'Retry later or contact support.'
        );
      }

      await writeAuditLog({
        agentId: sellerAgent.id,
        action: 'purchase.completed',
        metadata: {
          purchase_id: pendingPurchase.id,
          tx_hash: paymentResult.txHash,
          amount_usdc: listing.price_usdc
        }
      });

      await emitWebhook('purchase.completed', completedPurchase);
      return success(201, completedPurchase);
    },

    async createAutoPayment(input) {
      let agentExists: boolean;
      try {
        agentExists = await repository.agentExists(input.agentId);
      } catch (err) {
        logger.error({ err, input }, 'Failed to verify agent');
        return failure(
          500,
          'auto_payment_create_failed',
          'Failed to create auto payment.',
          'Retry later or contact support.'
        );
      }

      if (!agentExists) {
        return failure(
          404,
          'agent_not_found',
          'Agent not found.',
          'Check the agent ID and try again.'
        );
      }

      let autoPayment: AutoPaymentRecord;
      try {
        autoPayment = await repository.createAutoPayment(input);
      } catch (err) {
        logger.error({ err, input }, 'Failed to insert auto payment');
        return failure(
          500,
          'auto_payment_create_failed',
          'Failed to create auto payment.',
          'Retry later or contact support.'
        );
      }

      await writeAuditLog({
        agentId: input.agentId,
        action: 'auto_payment.created',
        metadata: {
          auto_payment_id: autoPayment.id,
          amount_usdc: input.amountUsdc,
          interval_seconds: input.intervalSeconds
        }
      });

      return success(201, autoPayment);
    },

    async listPurchases(filters) {
      try {
        const rows = await repository.listPurchases(filters);
        return success(200, {
          data: rows,
          pagination: {
            limit: filters.limit,
            offset: filters.offset,
            count: rows.length
          }
        });
      } catch (err) {
        logger.error({ err, filters }, 'Failed to list purchases');
        return failure(
          500,
          'purchase_list_failed',
          'Failed to list purchases.',
          'Retry later or contact support.'
        );
      }
    }
  };
}
