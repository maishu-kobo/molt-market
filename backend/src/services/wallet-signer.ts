import { ethers } from 'ethers';
import { logger } from '../logger.js';

/**
 * WalletSigner abstracts key management so the application never
 * touches raw private keys directly. In production this would
 * delegate to AWS KMS or GCP KMS. For local development we derive
 * deterministic wallets from a mnemonic stored in the environment.
 */
export interface WalletSigner {
  /** Generate a new wallet and return its address + an opaque key reference. */
  generateWallet(): Promise<{ address: string; kmsKeyId: string }>;
  /** Return an ethers Signer for the given key reference. */
  getSigner(kmsKeyId: string): Promise<ethers.Signer>;
}

/**
 * LocalWalletSigner derives wallets from a HD mnemonic for
 * development/testing against Anvil. The mnemonic comes from
 * LOCAL_WALLET_MNEMONIC env var (defaults to Anvil's well-known
 * test mnemonic). Each call to generateWallet() increments an
 * internal index so every agent gets a unique address.
 */
export class LocalWalletSigner implements WalletSigner {
  private mnemonic: string;
  private nextIndex: number;
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl: string, mnemonic?: string) {
    this.mnemonic =
      mnemonic ??
      process.env.LOCAL_WALLET_MNEMONIC ??
      'test test test test test test test test test test test junk';
    this.nextIndex = 10; // start at 10 to avoid colliding with Anvil default accounts
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async generateWallet(): Promise<{ address: string; kmsKeyId: string }> {
    const path = `m/44'/60'/0'/0/${this.nextIndex}`;
    const hdNode = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(this.mnemonic),
      path
    );
    const kmsKeyId = `local:${path}`;
    this.nextIndex++;
    logger.info({ address: hdNode.address, kmsKeyId }, 'Generated local wallet');
    return { address: hdNode.address, kmsKeyId };
  }

  async getSigner(kmsKeyId: string): Promise<ethers.Signer> {
    if (!kmsKeyId.startsWith('local:')) {
      throw new Error(`LocalWalletSigner cannot handle kmsKeyId: ${kmsKeyId}`);
    }
    const path = kmsKeyId.replace('local:', '');
    const hdNode = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(this.mnemonic),
      path
    );
    return hdNode.connect(this.provider);
  }
}

const rpcUrl = process.env.RPC_URL ?? 'http://localhost:8545';

export const walletSigner: WalletSigner = new LocalWalletSigner(rpcUrl);
