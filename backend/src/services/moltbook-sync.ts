import { moltbookQueue } from '../queue/moltbook-queue.js';

/**
 * Enqueue a Moltbook sync job for a newly created listing.
 * The job will be processed by the moltbook-worker with up to
 * 5 retry attempts using exponential backoff.
 */
export async function enqueueMoltbookSync(listing: {
  id: string;
  agent_id: string;
  title: string;
  description: string | null;
  product_url: string;
  product_type: string;
  price_usdc: number;
}): Promise<void> {
  await moltbookQueue.add(
    'sync',
    { listing },
    {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    }
  );
}
