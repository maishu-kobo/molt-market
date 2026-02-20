import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { logger } from '../logger.js';
import {
  registerOnMoltbook,
  linkMoltbookToListing,
  recordMoltbookSyncFailure,
  type MoltbookProduct
} from '../services/moltbook.js';
import { enqueueWebhookJobs, fetchActiveWebhooks } from '../services/webhooks.js';

export type MoltbookSyncJob = {
  listing: {
    id: string;
    agent_id: string;
    title: string;
    description: string | null;
    product_url: string;
    product_type: string;
    price_usdc: number;
  };
};

/**
 * Worker that processes Moltbook sync jobs. When a listing.created
 * event fires, a job is enqueued here. The worker calls the Moltbook
 * API to register the product, then saves the moltbook_id back to
 * the listing record.
 *
 * Retry policy: up to 5 attempts with exponential backoff.
 * On final failure, a listing.moltbook_sync_failed webhook fires.
 */
export const moltbookWorker = new Worker<MoltbookSyncJob>(
  'moltbook-sync',
  async (job) => {
    const { listing } = job.data;

    logger.info(
      { listingId: listing.id, attempt: job.attemptsMade + 1 },
      'Processing Moltbook sync'
    );

    const product: MoltbookProduct = {
      title: listing.title,
      description: listing.description,
      product_url: listing.product_url,
      product_type: listing.product_type,
      price_usdc: listing.price_usdc,
      listing_id: listing.id,
      agent_id: listing.agent_id
    };

    const result = await registerOnMoltbook(product);
    await linkMoltbookToListing(listing.id, result.moltbook_id, listing.agent_id);
  },
  {
    connection: redisConnection,
    concurrency: 5
  }
);

moltbookWorker.on('completed', (job) => {
  logger.info(
    { jobId: job.id, listingId: job.data.listing.id },
    'Moltbook sync completed'
  );
});

moltbookWorker.on('failed', async (job, err) => {
  if (!job) return;

  const { listing } = job.data;
  const isFinalAttempt = job.attemptsMade >= 5;

  logger.error(
    { jobId: job.id, listingId: listing.id, attempt: job.attemptsMade, isFinalAttempt, err },
    'Moltbook sync attempt failed'
  );

  if (isFinalAttempt) {
    await recordMoltbookSyncFailure(listing.id, listing.agent_id, String(err));

    // Fire listing.moltbook_sync_failed webhook
    const webhooks = await fetchActiveWebhooks('listing.moltbook_sync_failed');
    if (webhooks.length > 0) {
      await enqueueWebhookJobs({
        event: 'listing.moltbook_sync_failed',
        payload: { listing_id: listing.id, agent_id: listing.agent_id, error: String(err) },
        webhooks
      });
    }
  }
});
