import type { Pool, PoolClient } from 'pg';
import { pool } from '../db/index.js';
import type {
  AgentRecord,
  AutoPaymentCreateInput,
  AutoPaymentRecord,
  ListingRecord,
  PreparePurchaseResult,
  PurchaseCreateInput,
  PurchaseListFilters,
  PurchaseRecord,
  PurchaseRepository
} from '../services/purchase-service.js';
import type { WebhookRecord } from '../services/webhooks.js';

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === '23505'
  );
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // ignore rollback errors to preserve original exception
  }
}

export function createPostgresPurchaseRepository(dbPool: Pool = pool): PurchaseRepository {
  return {
    async preparePurchase(input: PurchaseCreateInput): Promise<PreparePurchaseResult> {
      const client = await dbPool.connect();

      try {
        await client.query('BEGIN');

        const existingResult = await client.query(
          'SELECT * FROM purchases WHERE idempotency_key = $1',
          [input.idempotencyKey]
        );

        if (existingResult.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            kind: 'existing',
            purchase: existingResult.rows[0] as PurchaseRecord
          };
        }

        const listingResult = await client.query(
          'SELECT * FROM listings WHERE id = $1 AND status = $2',
          [input.listingId, 'active']
        );
        if (listingResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return { kind: 'listing_not_found' };
        }
        const listing = listingResult.rows[0] as ListingRecord;

        const agentResult = await client.query('SELECT * FROM agents WHERE id = $1', [listing.agent_id]);
        if (agentResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return { kind: 'agent_not_found' };
        }
        const sellerAgent = agentResult.rows[0] as AgentRecord;

        const purchaseResult = await client.query(
          `INSERT INTO purchases (
             id,
             listing_id,
             buyer_wallet,
             seller_agent_id,
             amount_usdc,
             status,
             idempotency_key
           )
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', $5)
           RETURNING *`,
          [
            input.listingId,
            input.buyerWallet,
            sellerAgent.id,
            listing.price_usdc,
            input.idempotencyKey
          ]
        );
        const purchase = purchaseResult.rows[0] as PurchaseRecord;

        await client.query('COMMIT');

        return {
          kind: 'created',
          purchase,
          listing,
          sellerAgent
        };
      } catch (err) {
        await rollbackQuietly(client);

        if (isUniqueViolation(err)) {
          const existing = await dbPool.query(
            'SELECT * FROM purchases WHERE idempotency_key = $1',
            [input.idempotencyKey]
          );
          if (existing.rows.length > 0) {
            return {
              kind: 'existing',
              purchase: existing.rows[0] as PurchaseRecord
            };
          }
        }

        throw err;
      } finally {
        client.release();
      }
    },

    async markPurchaseFailed(purchaseId: string): Promise<void> {
      await dbPool.query("UPDATE purchases SET status = 'failed' WHERE id = $1", [purchaseId]);
    },

    async completePurchase(params: {
      purchaseId: string;
      txHash: string;
      buyerWallet: string;
    }): Promise<PurchaseRecord> {
      const result = await dbPool.query(
        "UPDATE purchases SET status = 'completed', tx_hash = $1, buyer_wallet = $2 WHERE id = $3 RETURNING *",
        [params.txHash, params.buyerWallet, params.purchaseId]
      );

      if (result.rows.length === 0) {
        throw new Error('Purchase not found while finalizing');
      }

      return result.rows[0] as PurchaseRecord;
    },

    async fetchWebhooks(eventType: string): Promise<WebhookRecord[]> {
      const result = await dbPool.query(
        `
          SELECT id, event_type, url
          FROM webhooks
          WHERE event_type = $1 AND is_active = true
        `,
        [eventType]
      );
      return result.rows as WebhookRecord[];
    },

    async createAutoPayment(input: AutoPaymentCreateInput): Promise<AutoPaymentRecord> {
      const result = await dbPool.query(
        `INSERT INTO auto_payments (
           id,
           agent_id,
           recipient_address,
           amount_usdc,
           interval_seconds,
           description
         )
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.agentId,
          input.recipientAddress,
          input.amountUsdc,
          input.intervalSeconds,
          input.description ?? null
        ]
      );

      return result.rows[0] as AutoPaymentRecord;
    },

    async agentExists(agentId: string): Promise<boolean> {
      const result = await dbPool.query('SELECT 1 FROM agents WHERE id = $1', [agentId]);
      return result.rows.length > 0;
    },

    async listPurchases(filters: PurchaseListFilters): Promise<PurchaseRecord[]> {
      let query = `
        SELECT p.*, l.title as listing_title, l.product_type, a.name as seller_name
        FROM purchases p
        LEFT JOIN listings l ON p.listing_id = l.id
        LEFT JOIN agents a ON p.seller_agent_id = a.id
        WHERE 1=1
      `;
      const params: (string | number)[] = [];
      let index = 1;

      if (filters.status) {
        query += ` AND p.status = $${index++}`;
        params.push(filters.status);
      }
      if (filters.listingId) {
        query += ` AND p.listing_id = $${index++}`;
        params.push(filters.listingId);
      }
      if (filters.buyerWallet) {
        query += ` AND p.buyer_wallet = $${index++}`;
        params.push(filters.buyerWallet);
      }

      query += ` ORDER BY p.created_at DESC LIMIT $${index++} OFFSET $${index++}`;
      params.push(filters.limit, filters.offset);

      const result = await dbPool.query(query, params);
      return result.rows as PurchaseRecord[];
    }
  };
}
