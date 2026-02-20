/**
 * Agent Signature Helper
 * 
 * Used by agents to sign requests proving wallet ownership.
 */
import { ethers } from 'ethers';

export interface SignatureParams {
  agentId: string;
  method: string;
  path: string;
  body?: string;
  privateKey: string;
}

export interface SignedRequest {
  signature: string;  // Format: agent_id:timestamp:signature
  timestamp: number;
}

/**
 * Sign a request with the agent's wallet private key
 */
export async function signAgentRequest(params: SignatureParams): Promise<SignedRequest> {
  const { agentId, method, path, body, privateKey } = params;
  const timestamp = Date.now();
  
  let bodyHash = '0x';
  if (body) {
    bodyHash = ethers.keccak256(ethers.toUtf8Bytes(body));
  }
  
  const message = `${agentId}:${timestamp}:${method}:${path}:${bodyHash}`;
  
  const wallet = new ethers.Wallet(privateKey);
  const signature = await wallet.signMessage(message);
  
  return {
    signature: `${agentId}:${timestamp}:${signature}`,
    timestamp
  };
}

/**
 * Create headers for authenticated agent request
 */
export async function createAgentAuthHeaders(
  params: Omit<SignatureParams, 'timestamp'>
): Promise<Record<string, string>> {
  const signed = await signAgentRequest(params);
  return {
    'X-Agent-Signature': signed.signature
  };
}
