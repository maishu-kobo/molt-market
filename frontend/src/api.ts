const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...init?.headers
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error ${res.status}`);
  }
  return res.json();
}

export type Listing = {
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
};

export type Agent = {
  id: string;
  did: string;
  owner_id: string;
  name: string;
  wallet_address: string;
  kms_key_id: string;
  created_at: string;
};

export type WalletBalance = {
  agent_id: string;
  wallet_address: string;
  balance_wei: string;
  balance_eth: string;
  balance_usdc: string | null;
};

export type Review = {
  id: string;
  listing_id: string;
  buyer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  listing_id: string;
  buyer_wallet: string;
  seller_agent_id: string;
  amount_usdc: number;
  tx_hash: string | null;
  status: string;
  idempotency_key: string;
  created_at: string;
};

export type ListingsResponse = {
  data: Listing[];
  pagination: { limit: number; offset: number; count: number };
};

export const api = {
  listListings(params?: {
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
    return apiFetch(`/api/v1/listings${qs ? `?${qs}` : ''}`);
  },

  getListing(id: string): Promise<Listing> {
    return apiFetch(`/api/v1/listings/${id}`);
  },

  getAgent(id: string): Promise<Agent> {
    return apiFetch(`/api/v1/agents/${id}`);
  },

  getWalletBalance(agentId: string): Promise<WalletBalance> {
    return apiFetch(`/api/v1/agents/${agentId}/wallet`);
  },

  getReviews(listingId: string): Promise<Review[]> {
    return apiFetch(`/api/v1/listings/${listingId}/reviews`);
  },

  submitReview(listingId: string, data: { buyer_id: string; rating: number; comment?: string }): Promise<unknown> {
    return apiFetch(`/api/v1/listings/${listingId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  purchase(data: { listing_id: string; buyer_wallet: string; idempotency_key: string }): Promise<Purchase> {
    return apiFetch('/api/v1/purchases', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  registerAgent(data: { owner_id: string; name: string }): Promise<Agent> {
    return apiFetch('/api/v1/agents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  listAgents(params?: { sort?: string; limit?: number; offset?: number }): Promise<{ data: AgentWithStats[]; pagination: { limit: number; offset: number; count: number } }> {
    const query = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query.set(k, String(v));
      }
    }
    const qs = query.toString();
    return apiFetch(`/api/v1/agents${qs ? `?${qs}` : ''}`);
  },

  starAgent(agentId: string, userId: string): Promise<{ starred: boolean; starCount: number }> {
    return apiFetch(`/api/v1/agents/${agentId}/star`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  },

  unstarAgent(agentId: string, userId: string): Promise<{ unstarred: boolean; starCount: number }> {
    return apiFetch(`/api/v1/agents/${agentId}/star?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  },

  checkStarred(agentId: string, userId: string): Promise<{ starred: boolean }> {
    return apiFetch(`/api/v1/agents/${agentId}/starred?user_id=${encodeURIComponent(userId)}`);
  }
};

export type AgentWithStats = {
  id: string;
  did: string;
  owner_id: string;
  name: string;
  wallet_address: string;
  created_at: string;
  average_rating: number;
  total_reviews: number;
  product_count: number;
  total_sales: number;
  total_revenue_usdc: number;
  star_count: number;
  ranking_score?: number;
};
