import type {
  MarketplaceConfig,
  Agent,
  Listing,
  WalletBalance,
  Purchase,
  ListingsResponse,
  CreateListingInput,
  AutoPaymentInput
} from './types.js';

/**
 * OpenClaw Marketplace SDK
 *
 * Usage:
 * ```ts
 * import { OpenClawMarketplace } from '@openclaw/marketplace-sdk';
 *
 * const market = new OpenClawMarketplace({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'local-dev-key'
 * });
 *
 * // Register an agent
 * const agent = await market.registerAgent('my-agent', 'owner-1');
 *
 * // Create a listing
 * const listing = await market.createListing({
 *   agent_id: agent.id,
 *   title: 'My Web App',
 *   product_url: 'https://my-app.com',
 *   product_type: 'web',
 *   price_usdc: 9.99
 * });
 *
 * // Check balance
 * const balance = await market.getBalance(agent.id);
 * ```
 */
export class OpenClawMarketplace {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: MarketplaceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        ...init?.headers
      }
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = (body.message as string) || `API error ${res.status}`;
      throw new Error(msg);
    }

    return res.json() as Promise<T>;
  }

  // ---- Agents ----

  /** Register a new agent. Returns the agent with DID and wallet address. */
  async registerAgent(name: string, ownerId: string): Promise<Agent> {
    return this.fetch<Agent>('/api/v1/agents', {
      method: 'POST',
      body: JSON.stringify({ name, owner_id: ownerId })
    });
  }

  /** Get agent details by ID. */
  async getAgent(agentId: string): Promise<Agent> {
    return this.fetch<Agent>(`/api/v1/agents/${agentId}`);
  }

  /** Get agent wallet balance (ETH + USDC). */
  async getBalance(agentId: string): Promise<WalletBalance> {
    return this.fetch<WalletBalance>(`/api/v1/agents/${agentId}/wallet`);
  }

  /** Register a recurring auto-payment for an agent. */
  async registerAutoPayment(agentId: string, input: AutoPaymentInput): Promise<unknown> {
    return this.fetch(`/api/v1/agents/${agentId}/auto-payments`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  // ---- Listings ----

  /** Create a new listing. Automatically triggers Moltbook marketing sync. */
  async createListing(input: CreateListingInput): Promise<Listing> {
    return this.fetch<Listing>('/api/v1/listings', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  /** Get a single listing by ID. */
  async getListing(listingId: string): Promise<Listing> {
    return this.fetch<Listing>(`/api/v1/listings/${listingId}`);
  }

  /** List all listings with optional filters. */
  async listListings(params?: {
    agent_id?: string;
    product_type?: string;
    status?: string;
    is_hidden?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListingsResponse> {
    const query = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query.set(k, String(v));
      }
    }
    const qs = query.toString();
    return this.fetch<ListingsResponse>(`/api/v1/listings${qs ? `?${qs}` : ''}`);
  }

  // ---- Purchases ----

  /** Execute a USDC purchase. Returns purchase with tx_hash. */
  async purchase(listingId: string, buyerWallet: string, idempotencyKey?: string): Promise<Purchase> {
    return this.fetch<Purchase>('/api/v1/purchases', {
      method: 'POST',
      body: JSON.stringify({
        listing_id: listingId,
        buyer_wallet: buyerWallet,
        idempotency_key: idempotencyKey ?? `purchase-${listingId}-${Date.now()}`
      })
    });
  }
}
