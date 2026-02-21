/**
 * Testnet buyer service.
 * Uses a pre-funded test wallet to simulate purchases on Base Sepolia.
 * DO NOT USE IN PRODUCTION - this wallet's private key is well-known.
 */
import { ethers } from 'ethers';
import { logger } from '../logger.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// Default Anvil/Hardhat test mnemonic - well-known, not secret
const TEST_MNEMONIC = process.env.LOCAL_WALLET_MNEMONIC ?? 
  'test test test test test test test test test test test junk';

/**
 * Get a signer for the test buyer wallet.
 * Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 */
export function getTestBuyerSigner(): ethers.HDNodeWallet {
  const rpcUrl = process.env.RPC_URL ?? 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = ethers.Wallet.fromPhrase(TEST_MNEMONIC, provider);
  return wallet;
}

/**
 * Execute a USDC transfer from the test buyer wallet to a seller.
 * Returns the transaction hash.
 */
export async function executeTestnetPurchase(
  sellerAddress: string,
  amountUsdc: string
): Promise<{ txHash: string; buyerAddress: string }> {
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS;
  if (!usdcAddress) {
    throw new Error('USDC_CONTRACT_ADDRESS not configured');
  }

  const signer = getTestBuyerSigner();
  const buyerAddress = await signer.getAddress();
  
  logger.info({
    buyer: buyerAddress,
    seller: sellerAddress,
    amount: amountUsdc,
    usdc: usdcAddress
  }, 'Executing testnet USDC purchase');

  const contract = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
  
  // Check buyer balance
  const decimals = await contract.decimals();
  const balance = await contract.balanceOf(buyerAddress);
  const amountRaw = ethers.parseUnits(amountUsdc, Number(decimals));
  
  if (balance < amountRaw) {
    throw new Error(`Insufficient USDC balance. Have: ${ethers.formatUnits(balance, Number(decimals))}, Need: ${amountUsdc}`);
  }

  // Check ETH for gas
  const ethBalance = await signer.provider!.getBalance(buyerAddress);
  if (ethBalance === 0n) {
    throw new Error('Test buyer wallet has no ETH for gas. Please fund via faucet.');
  }

  // Execute transfer
  const tx = await contract.transfer(sellerAddress, amountRaw);
  logger.info({ txHash: tx.hash }, 'Transaction submitted, waiting for confirmation...');
  
  const receipt = await tx.wait();
  logger.info({ 
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString()
  }, 'USDC transfer confirmed on Base Sepolia');

  return { txHash: receipt.hash, buyerAddress };
}

/**
 * Get the test buyer wallet's balances.
 */
export async function getTestBuyerBalances(): Promise<{
  address: string;
  ethBalance: string;
  usdcBalance: string;
}> {
  const signer = getTestBuyerSigner();
  const address = await signer.getAddress();
  
  const ethBalance = await signer.provider!.getBalance(address);
  
  let usdcBalance = '0';
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS;
  if (usdcAddress) {
    const contract = new ethers.Contract(usdcAddress, ERC20_ABI, signer.provider!);
    const balance = await contract.balanceOf(address);
    const decimals = await contract.decimals();
    usdcBalance = ethers.formatUnits(balance, Number(decimals));
  }

  return {
    address,
    ethBalance: ethers.formatEther(ethBalance),
    usdcBalance
  };
}
