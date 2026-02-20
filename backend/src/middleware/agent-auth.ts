/**
 * Agent Wallet Authentication Middleware
 * 
 * Verifies that requests are signed by the agent's wallet private key.
 * This ensures only the actual agent (holder of the private key) can:
 * - Create listings under their agent ID
 * - Transfer funds from their wallet
 * - Perform any agent-specific actions
 * 
 * Header format:
 *   X-Agent-Signature: <agent_id>:<timestamp>:<signature>
 * 
 * Signature is over: keccak256(agent_id + timestamp + method + path + body_hash)
 */
import type { MiddlewareHandler } from 'hono';
import { ethers } from 'ethers';
import { pool } from '../db/index.js';
import { errorResponse } from './error-response.js';
import { logger } from '../logger.js';

const SIGNATURE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const agentAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const signature = c.req.header('x-agent-signature');
  
  if (!signature) {
    return errorResponse(
      c,
      401,
      'missing_signature',
      'Agent signature required for this action.',
      'Provide X-Agent-Signature header: <agent_id>:<timestamp>:<signature>'
    );
  }

  const parts = signature.split(':');
  if (parts.length !== 3) {
    return errorResponse(
      c,
      401,
      'invalid_signature_format',
      'Invalid signature format.',
      'Use format: <agent_id>:<timestamp>:<signature>'
    );
  }

  const [agentId, timestampStr, sig] = parts;
  const timestamp = parseInt(timestampStr, 10);

  // Check timestamp freshness
  const now = Date.now();
  if (isNaN(timestamp) || Math.abs(now - timestamp) > SIGNATURE_EXPIRY_MS) {
    return errorResponse(
      c,
      401,
      'signature_expired',
      'Signature has expired or timestamp is invalid.',
      'Generate a fresh signature with current timestamp.'
    );
  }

  // Get agent's wallet address
  const agentResult = await pool.query(
    'SELECT wallet_address FROM agents WHERE id = $1',
    [agentId]
  );

  if (agentResult.rowCount === 0) {
    return errorResponse(
      c,
      404,
      'agent_not_found',
      'Agent not found.',
      'Check the agent ID.'
    );
  }

  const walletAddress = agentResult.rows[0].wallet_address;

  // Reconstruct the message that was signed
  const method = c.req.method;
  const path = c.req.path;
  
  let bodyHash = '0x';
  if (method !== 'GET' && method !== 'DELETE') {
    try {
      const body = await c.req.text();
      // Store body for later use
      c.set('rawBody', body);
      if (body) {
        bodyHash = ethers.keccak256(ethers.toUtf8Bytes(body));
      }
    } catch {
      bodyHash = '0x';
    }
  }

  const message = `${agentId}:${timestamp}:${method}:${path}:${bodyHash}`;
  const messageHash = ethers.hashMessage(message);

  try {
    const recoveredAddress = ethers.recoverAddress(messageHash, sig);
    
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      logger.warn({ 
        agentId, 
        expected: walletAddress, 
        recovered: recoveredAddress 
      }, 'Signature verification failed');
      
      return errorResponse(
        c,
        401,
        'invalid_signature',
        'Signature does not match agent wallet.',
        'Ensure you are signing with the correct wallet private key.'
      );
    }

    // Attach verified agent ID to context
    c.set('verifiedAgentId', agentId);
    c.set('verifiedWallet', walletAddress);

    await next();
  } catch (err) {
    logger.error({ err, agentId }, 'Signature verification error');
    return errorResponse(
      c,
      401,
      'signature_verification_failed',
      'Failed to verify signature.',
      'Check signature format and ensure it is valid.'
    );
  }
};

/**
 * Helper to check if the verified agent matches the requested agent_id
 */
export function requireAgentMatch(verifiedAgentId: string | undefined, requestedAgentId: string): boolean {
  return verifiedAgentId === requestedAgentId;
}
