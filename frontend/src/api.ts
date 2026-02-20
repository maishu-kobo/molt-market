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
  repository_url: string | null;
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

export type TestnetBuyer = {
  address: string;
  ethBalance: string;
  usdcBalance: string;
  network: string;
  chain_id: number;
  note: string;
};

export type Launch = {
  id: string;
  listing_id: string;
  launched_at: string;
  tagline: string | null;
  upvote_count: number;
  is_featured: boolean;
  title: string;
  description: string | null;
  product_url: string;
  product_type: string;
  price_usdc: string;
  average_rating: string;
  review_count: number;
  repository_url: string | null;
  agent_id: string;
  agent_name: string;
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

  getTerms(): Promise<{ version: string; hash: string; message: string; terms_url: string }> {
    return apiFetch('/api/v1/agents/terms');
  },

  registerAgent(data: { 
    owner_id: string; 
    name: string; 
    wallet_address: string;
    terms_signature: string;
  }): Promise<Agent> {
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
  },

  listPurchases(params?: { status?: string; listing_id?: string; buyer_wallet?: string; limit?: string }): Promise<{ data: PurchaseWithDetails[]; pagination: { limit: number; offset: number; count: number } }> {
    const query = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query.set(k, v);
      }
    }
    const qs = query.toString();
    return apiFetch(`/api/v1/purchases${qs ? `?${qs}` : ''}`);
  },

  getTestnetBuyer(): Promise<TestnetBuyer> {
    return apiFetch('/api/v1/purchases/testnet-buyer');
  },

  // Launches (Product Hunt style)
  getLaunches(params?: { date?: string; featured?: boolean; limit?: number }): Promise<{ data: Launch[]; pagination: { limit: number; offset: number; count: number } }> {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.featured) query.set('featured', 'true');
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiFetch(`/api/v1/launches${qs ? `?${qs}` : ''}`);
  },

  getTodayLaunches(): Promise<{ date: string; data: Launch[]; count: number }> {
    return apiFetch('/api/v1/launches/today');
  },

  createLaunch(data: { listing_id: string; tagline?: string }): Promise<Launch> {
    return apiFetch('/api/v1/launches', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  upvoteLaunch(launchId: string, userId: string): Promise<{ upvoted: boolean; upvote_count: number }> {
    return apiFetch(`/api/v1/launches/${launchId}/upvote`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  },

  removeLaunchUpvote(launchId: string, userId: string): Promise<{ removed: boolean; upvote_count: number }> {
    return apiFetch(`/api/v1/launches/${launchId}/upvote?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  },

  checkLaunchUpvoted(launchId: string, userId: string): Promise<{ upvoted: boolean }> {
    return apiFetch(`/api/v1/launches/${launchId}/upvoted?user_id=${encodeURIComponent(userId)}`);
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

export type PurchaseWithDetails = {
  id: string;
  listing_id: string;
  listing_title: string;
  product_type: string;
  buyer_wallet: string;
  seller_agent_id: string;
  seller_name: string;
  amount_usdc: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
};
