import { logger } from '../logger.js';
import { pool } from '../db/index.js';
import { recordAuditLog } from './audit-log.js';

/**
 * Moltbook is the marketing platform where listings are registered
 * for automated marketing campaigns. This service handles the
 * HTTP communication with the Moltbook API.
 *
 * The Moltbook API base URL is configured via the MOLTBOOK_API_URL
 * environment variable. If not set, calls will fail gracefully.
 */

export interface MoltbookProduct {
  title: string;
  description: string | null;
  product_url: string;
  product_type: string;
  price_usdc: number;
  listing_id: string;
  agent_id: string;
}

export interface MoltbookRegistrationResult {
  moltbook_id: string;
}

/**
 * Register a product on the Moltbook marketing platform.
 * Returns the moltbook_id assigned by the platform.
 */
export async function registerOnMoltbook(
  product: MoltbookProduct
): Promise<MoltbookRegistrationResult> {
  const apiUrl = process.env.MOLTBOOK_API_URL;
  if (!apiUrl) {
    throw new Error('MOLTBOOK_API_URL environment variable is not set.');
  }

  const apiKey = process.env.MOLTBOOK_API_KEY ?? '';

  const response = await fetch(`${apiUrl}/api/v1/products`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
      'user-agent': 'openclaw-marketplace'
    },
    body: JSON.stringify({
      title: product.title,
      description: product.description,
      url: product.product_url,
      type: product.product_type,
      price: product.price_usdc,
      source: 'openclaw-marketplace',
      source_id: product.listing_id,
      agent_id: product.agent_id
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Moltbook API responded with ${response.status}: ${body}`
    );
  }

  const data = await response.json() as { id: string };
  return { moltbook_id: data.id };
}

/**
 * Update the listing record with the moltbook_id after successful
 * registration, and record an audit log.
 */
export async function linkMoltbookToListing(
  listingId: string,
  moltbookId: string,
  agentId: string
): Promise<void> {
  await pool.query(
    'UPDATE listings SET moltbook_id = $1 WHERE id = $2',
    [moltbookId, listingId]
  );

  await recordAuditLog({
    agentId,
    action: 'moltbook.synced',
    metadata: { listing_id: listingId, moltbook_id: moltbookId }
  });

  logger.info({ listingId, moltbookId }, 'Linked Moltbook ID to listing');
}

/**
 * Record a sync failure in the audit log.
 */
export async function recordMoltbookSyncFailure(
  listingId: string,
  agentId: string,
  error: string
): Promise<void> {
  await recordAuditLog({
    agentId,
    action: 'moltbook.sync_failed',
    metadata: { listing_id: listingId, error }
  });

  logger.error({ listingId, error }, 'Moltbook sync failed');
}
