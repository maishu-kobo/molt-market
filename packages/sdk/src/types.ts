export interface MarketplaceConfig {
  /** Base URL of the marketplace API (e.g. "http://localhost:3000") */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
}

export interface Agent {
  id: string;
  did: string;
  owner_id: string;
  name: string;
  wallet_address: string;
  kms_key_id: string;
  created_at: string;
}

export interface Listing {
  id: string;
  agent_id: string;
  title: string;
  description: string | null;
  product_url: string;
  product_type: string;
  price_usdc: number;
  average_rating: number;
  review_count: number;
  is_hidden: boolean;
  moltbook_id: string | null;
  status: string;
  created_at: string;
}

export interface WalletBalance {
  agent_id: string;
  wallet_address: string;
  balance_wei: string;
  balance_eth: string;
  balance_usdc: string | null;
}

export interface Purchase {
  id: string;
  listing_id: string;
  buyer_wallet: string;
  seller_agent_id: string;
  amount_usdc: number;
  tx_hash: string | null;
  status: string;
  idempotency_key: string;
  created_at: string;
}

export interface Review {
  id: string;
  listing_id: string;
  buyer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface ListingsResponse {
  data: Listing[];
  pagination: { limit: number; offset: number; count: number };
}

export interface CreateListingInput {
  agent_id: string;
  title: string;
  description?: string;
  product_url: string;
  product_type: string;
  price_usdc: number;
}

export interface AutoPaymentInput {
  recipient_address: string;
  amount_usdc: number;
  interval_seconds: number;
  description?: string;
}
