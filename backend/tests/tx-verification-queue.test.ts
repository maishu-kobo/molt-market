import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockQueueAdd, mockQuery, mockLogger } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn(),
  mockQuery: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: mockQueueAdd })),
}));

vi.mock('../src/queue/connection.js', () => ({
  redisConnectionOptions: {},
}));

vi.mock('../src/db/index.js', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/logger.js', () => ({
  logger: mockLogger,
}));

import {
  getTxVerificationQueue,
  enqueueTxVerification,
} from '../src/queue/tx-verification-queue.js';

describe('tx-verification-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTxVerificationQueue', () => {
    it('returns a Queue instance', () => {
      const queue = getTxVerificationQueue();
      expect(queue).toBeDefined();
      expect(queue.add).toBeDefined();
    });

    it('returns the same instance on second call (singleton)', () => {
      const first = getTxVerificationQueue();
      const second = getTxVerificationQueue();
      expect(first).toBe(second);
    });
  });

  describe('enqueueTxVerification', () => {
    it('inserts into DB and adds job to queue', async () => {
      mockQuery.mockResolvedValueOnce({});
      mockQueueAdd.mockResolvedValueOnce({});

      const data = {
        txHash: '0xabc123',
        experimentId: 'exp-001',
      };

      await enqueueTxVerification(data);

      expect(mockQuery).toHaveBeenCalledOnce();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tx_verifications'),
        ['0xabc123', 'exp-001']
      );

      expect(mockQueueAdd).toHaveBeenCalledOnce();
      expect(mockQueueAdd).toHaveBeenCalledWith('verify', data, {
        attempts: 10,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: 'tx-verify-0xabc123',
      });
    });

    it('catches errors and logs warning (never throws)', async () => {
      const dbError = new Error('DB connection failed');
      mockQuery.mockRejectedValueOnce(dbError);

      const data = {
        txHash: '0xfail',
        experimentId: 'exp-fail',
      };

      await expect(enqueueTxVerification(data)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledOnce();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { err: dbError, txHash: '0xfail' },
        'Failed to enqueue tx verification'
      );

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  });
});
