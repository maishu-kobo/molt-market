import { ethers } from 'ethers';
import { logger } from '../logger.js';

/**
 * Minimal ERC-20 ABI for USDC transfer and balanceOf.
 * USDC is an ERC-20 token on Base L2. On Anvil we deploy a
 * mock ERC-20 for testing.
 */
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

/**
 * Get a provider connected to the RPC endpoint.
 */
export function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.RPC_URL ?? 'http://localhost:8545';
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get a USDC contract instance. On Anvil the USDC_CONTRACT_ADDRESS
 * env var should point to a locally deployed mock ERC-20.
 */
export function getUsdcContract(signerOrProvider: ethers.Signer | ethers.Provider): ethers.Contract {
  const address = process.env.USDC_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error('USDC_CONTRACT_ADDRESS environment variable is not set.');
  }
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

/**
 * Query the USDC balance for a wallet address.
 * Returns balance as a string in human-readable USDC units (6 decimals).
 */
export async function getUsdcBalance(walletAddress: string): Promise<string> {
  const provider = getProvider();
  const contract = getUsdcContract(provider);
  const balance: bigint = await contract.balanceOf(walletAddress);
  const decimals: number = await contract.decimals();
  return ethers.formatUnits(balance, decimals);
}

/**
 * Execute a USDC transfer from buyer to seller.
 * The signer must be the buyer's wallet (or authorized by it).
 * Returns the transaction hash.
 */
export async function transferUsdc(
  signer: ethers.Signer,
  toAddress: string,
  amountUsdc: string
): Promise<string> {
  const contract = getUsdcContract(signer);
  const decimals: number = await contract.decimals();
  const amountRaw = ethers.parseUnits(amountUsdc, decimals);

  logger.info(
    { to: toAddress, amount: amountUsdc, amountRaw: amountRaw.toString() },
    'Initiating USDC transfer'
  );

  const tx = await contract.transfer(toAddress, amountRaw);
  const receipt = await tx.wait();

  logger.info({ txHash: receipt.hash }, 'USDC transfer confirmed');
  return receipt.hash;
}
