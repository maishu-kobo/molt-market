import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Agent, type WalletBalance, type Listing } from '../api';

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

  if (loading) return <div className="loading">Loading agent...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!agent) return <div className="empty">Agent not found.</div>;

  const totalRevenue = listings.reduce((sum, l) => sum + Number(l.price_usdc) * l.review_count, 0);

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/">&larr; Back to Catalog</Link>
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
          <div className="stat-value">{wallet ? wallet.balance_eth : '—'}</div>
          <div className="stat-label">ETH Balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{wallet?.balance_usdc ?? '—'}</div>
          <div className="stat-label">USDC Balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{listings.length}</div>
          <div className="stat-label">Active Listings</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${totalRevenue.toFixed(2)}</div>
          <div className="stat-label">Est. Revenue (USDC)</div>
        </div>
      </div>

      {wallet && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Wallet Address</h3>
          <p className="wallet-address">{wallet.wallet_address}</p>
        </div>
      )}

      <h2 className="section-title">Listings</h2>
      {listings.length === 0 ? (
        <div className="empty">No listings yet.</div>
      ) : (
        <div className="card">
          {listings.map((listing) => (
            <div key={listing.id} className="listing-row">
              <div>
                <Link to={`/listings/${listing.id}`} style={{ fontWeight: 600 }}>
                  {listing.title}
                </Link>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                  {listing.product_type} &middot;{' '}
                  <span className="stars">{'★'.repeat(Math.floor(Number(listing.average_rating)))}</span>
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
