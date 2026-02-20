import { readFileSync } from 'node:fs';
import { logger } from '../logger.js';

/**
 * Resolve the USDC contract address from either:
 * 1. USDC_CONTRACT_ADDRESS env var (explicit config)
 * 2. /data/usdc.env file (written by deploy-usdc container)
 */
export function resolveUsdcAddress(): string | undefined {
  if (process.env.USDC_CONTRACT_ADDRESS) {
    return process.env.USDC_CONTRACT_ADDRESS;
  }

  try {
    const content = readFileSync('/data/usdc.env', 'utf-8');
    const match = content.match(/USDC_CONTRACT_ADDRESS=(.+)/);
    if (match) {
      const address = match[1].trim();
      process.env.USDC_CONTRACT_ADDRESS = address;
      logger.info({ address }, 'Loaded USDC contract address from /data/usdc.env');
      return address;
    }
  } catch {
    // File not found — USDC not deployed
  }

  return undefined;
}
