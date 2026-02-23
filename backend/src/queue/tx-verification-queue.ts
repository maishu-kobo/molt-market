import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';
import { pool } from '../db/index.js';
import { logger } from '../logger.js';

let txVerificationQueue: Queue | null = null;

export function getTxVerificationQueue(): Queue {
  if (!txVerificationQueue) {
    txVerificationQueue = new Queue('tx-verifications', {
      connection: redisConnectionOptions,
    });
  }
  return txVerificationQueue;
}

/**
 * Insert a row into tx_verifications and enqueue a verification job.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function enqueueTxVerification(data: {
  txHash: string;
  experimentId: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tx_verifications (id, tx_hash, experiment_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'pending')
       ON CONFLICT (tx_hash) DO NOTHING`,
      [data.txHash, data.experimentId]
    );

    await getTxVerificationQueue().add('verify', data, {
      attempts: 10,
      backoff: { type: 'exponential', delay: 5000 },
      jobId: `tx-verify-${data.txHash}`,
    });
  } catch (err) {
    logger.warn({ err, txHash: data.txHash }, 'Failed to enqueue tx verification');
  }
}
