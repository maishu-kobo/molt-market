import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Agent, type WalletBalance, type Listing } from '../api';

function AgentSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: '4px' }} />
      </div>
      <div className="skeleton-card" style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton skeleton-line" style={{ width: '40%', height: '24px', marginBottom: '1rem' }} />
        <div className="skeleton skeleton-line skeleton-line-medium" />
        <div className="skeleton skeleton-line skeleton-line-short" />
      </div>
      <div className="stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-card" style={{ textAlign: 'center', padding: '1.25rem' }}>
            <div className="skeleton" style={{ width: '60%', height: '24px', margin: '0 auto 0.5rem', borderRadius: '4px' }} />
            <div className="skeleton" style={{ width: '80%', height: '12px', margin: '0 auto', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getAgent(id),
      api.getWalletBalance(id).catch(() => null),
      api.listListings({ agent_id: id, limit: 100 })
    ])
      .then(([a, w, l]) => {
        setAgent(a);
        setWallet(w);
        setListings(l.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <AgentSkeleton />;
  if (error) return <div className="error">{error}</div>;
  if (!agent) return <div className="empty">Agent not found.</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/">&larr; Back to Browse</Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{agent.name}</h1>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
          DID: <span className="wallet-address">{agent.did}</span>
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
          Owner: {agent.owner_id}
        </p>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Registered: {new Date(agent.created_at).toLocaleDateString()}
        </p>
      </div>

      <h2 className="section-title">Wallet</h2>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{wallet ? wallet.balance_eth : '\u2014'}</div>
          <div className="stat-label">ETH Balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{wallet?.balance_usdc ?? '\u2014'}</div>
          <div className="stat-label">USDC Balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{listings.length}</div>
          <div className="stat-label">Listings</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{listings.reduce((sum, l) => sum + l.review_count, 0)}</div>
          <div className="stat-label">Total Reviews</div>
        </div>
      </div>

      {wallet && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Wallet Address</h3>
          <p className="wallet-address">{wallet.wallet_address}</p>
        </div>
      )}

      <h2 className="section-title">Products by this Agent</h2>
      {listings.length === 0 ? (
        <div className="empty">This agent has no listings yet.</div>
      ) : (
        <div className="card">
          {listings.map((listing) => (
            <div key={listing.id} className="listing-row">
              <div>
                <Link to={`/listings/${listing.id}`} style={{ fontWeight: 600 }}>
                  {listing.title}
                </Link>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                  <span className="badge badge-type" style={{ marginRight: '0.5rem' }}>{listing.product_type}</span>
                  <span className="stars">{'\u2605'.repeat(Math.floor(Number(listing.average_rating)))}</span>
                  {' '}({listing.review_count} reviews)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="price">${Number(listing.price_usdc).toFixed(2)}</div>
                <span className={`badge ${listing.is_hidden ? 'badge-hidden' : 'badge-active'}`}>
                  {listing.is_hidden ? 'Hidden' : listing.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
