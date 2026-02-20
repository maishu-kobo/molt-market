import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { logger } from '../logger.js';
import { pool } from '../db/index.js';
import { walletSigner } from '../services/wallet-signer.js';
import { transferUsdc } from '../services/usdc.js';
import { recordAuditLog } from '../services/audit-log.js';
import { enqueueWebhookJobs, fetchActiveWebhooks } from '../services/webhooks.js';

export type AutoPaymentJob = {
  auto_payment_id: string;
  agent_id: string;
  kms_key_id: string;
  wallet_address: string;
  recipient_address: string;
  amount_usdc: string;
};

/**
 * Worker that executes scheduled auto-payments. For each active
 * auto_payment record whose interval has elapsed, a job is
 * enqueued. The worker attempts the USDC transfer; on failure
 * it fires a payment.failed webhook.
 */
export const autoPaymentWorker = new Worker<AutoPaymentJob>(
  'auto-payments',
  async (job) => {
    const {
      auto_payment_id,
      agent_id,
      kms_key_id,
      wallet_address,
      recipient_address,
      amount_usdc
    } = job.data;

    logger.info(
      { autoPaymentId: auto_payment_id, agentId: agent_id, amount: amount_usdc },
      'Executing auto-payment'
    );

    if (!process.env.USDC_CONTRACT_ADDRESS) {
      // Simulated mode
      logger.warn('USDC_CONTRACT_ADDRESS not set, simulating auto-payment');
      await pool.query(
        'UPDATE auto_payments SET last_executed_at = now() WHERE id = $1',
        [auto_payment_id]
      );
      await recordAuditLog({
        agentId: agent_id,
        action: 'auto_payment.executed',
        metadata: { auto_payment_id, amount_usdc, simulated: true }
      });
      return;
    }

    const signer = await walletSigner.getSigner(kms_key_id);
    const txHash = await transferUsdc(signer, recipient_address, amount_usdc);

    await pool.query(
      'UPDATE auto_payments SET last_executed_at = now() WHERE id = $1',
      [auto_payment_id]
    );

    await recordAuditLog({
      agentId: agent_id,
      action: 'auto_payment.executed',
      metadata: { auto_payment_id, tx_hash: txHash, amount_usdc }
    });

    logger.info({ autoPaymentId: auto_payment_id, txHash }, 'Auto-payment completed');
  },
  {
    connection: redisConnection,
    concurrency: 3
  }
);

autoPaymentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Auto-payment job completed');
});

autoPaymentWorker.on('failed', async (job, err) => {
  if (!job) return;

  const { auto_payment_id, agent_id, amount_usdc } = job.data;

  logger.error(
    { jobId: job.id, autoPaymentId: auto_payment_id, err },
    'Auto-payment failed'
  );

  await recordAuditLog({
    agentId: agent_id,
    action: 'auto_payment.failed',
    metadata: { auto_payment_id, amount_usdc, error: String(err) }
  });

  // Fire payment.failed webhook
  const webhooks = await fetchActiveWebhooks('payment.failed');
  if (webhooks.length > 0) {
    await enqueueWebhookJobs({
      event: 'payment.failed',
      payload: {
        auto_payment_id,
        agent_id,
        amount_usdc,
        error: String(err)
      },
      webhooks
    });
  }
});
