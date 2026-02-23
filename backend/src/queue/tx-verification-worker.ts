import { Worker } from 'bullmq';
import { ethers } from 'ethers';
import { redisConnectionOptions } from './connection.js';
import { pool } from '../db/index.js';
import { logger } from '../logger.js';
import {
  recordExperimentEvent,
  ExperimentEventName,
} from '../services/experiment-events.js';

export type TxVerificationJob = {
  txHash: string;
  experimentId: string;
};

const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';

export const txVerificationWorker = new Worker<TxVerificationJob>(
  'tx-verifications',
  async (job) => {
    const { txHash, experimentId } = job.data;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const receipt = await provider.getTransactionReceipt(txHash);

    if (receipt) {
      const status = receipt.status === 1 ? 'confirmed' : 'failed';
      const revertReason = receipt.status === 0 ? 'transaction_reverted' : null;

      await pool.query(
        `UPDATE tx_verifications
            SET status = $1,
                gas_used = $2,
                block_number = $3,
                revert_reason = $4,
                updated_at = now()
          WHERE tx_hash = $5`,
        [status, receipt.gasUsed.toString(), receipt.blockNumber, revertReason, txHash]
      );

      await recordExperimentEvent({
        experiment_id: experimentId,
        condition: 'A',
        event: ExperimentEventName.TX_CONFIRMED,
        tx_hash: txHash,
        status,
        metadata: {
          gas_used: receipt.gasUsed.toString(),
          block_number: receipt.blockNumber,
        },
      });

      logger.info({ txHash, status, blockNumber: receipt.blockNumber }, 'TX verified');
      return;
    }

    // No receipt yet — bump attempts
    const res = await pool.query(
      `UPDATE tx_verifications
          SET attempts = attempts + 1,
              updated_at = now()
        WHERE tx_hash = $1
        RETURNING attempts`,
      [txHash]
    );

    const attempts = res.rows[0]?.attempts ?? 0;

    if (attempts >= 10) {
      await pool.query(
        `UPDATE tx_verifications SET status = 'failed', updated_at = now()
         WHERE tx_hash = $1`,
        [txHash]
      );
      logger.warn({ txHash, attempts }, 'TX verification gave up after max attempts');
      return;
    }

    // Throw to trigger BullMQ retry with exponential backoff
    throw new Error(`Receipt not yet available for ${txHash} (attempt ${attempts})`);
  },
  {
    connection: redisConnectionOptions,
    concurrency: 2,
  }
);

txVerificationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, txHash: job.data.txHash }, 'TX verification job completed');
});

txVerificationWorker.on('failed', (job, err) => {
  if (!job) return;
  logger.error({ jobId: job.id, txHash: job.data.txHash, err }, 'TX verification job failed');
});
