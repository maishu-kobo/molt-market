import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Listing } from '../api';

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars = '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
  return <span className="stars">{stars} ({rating.toFixed(1)})</span>;
}

export function CatalogPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productType, setProductType] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, string | number> = { limit: 50, offset: 0 };
    if (productType) params.product_type = productType;
    if (!showHidden) params.is_hidden = 'false';

    api.listListings(params)
      .then((res) => setListings(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [productType, showHidden]);

  return (
    <div>
      <h1 className="section-title">Catalog</h1>

      <div className="filters">
        <select value={productType} onChange={(e) => setProductType(e.target.value)}>
          <option value="">All Types</option>
          <option value="web">Web</option>
          <option value="api">API</option>
          <option value="cli">CLI</option>
          <option value="mobile">Mobile</option>
          <option value="library">Library</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </div>

      {loading && <div className="loading">Loading listings...</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && listings.length === 0 && (
        <div className="empty">No listings found.</div>
      )}

      <div className="grid">
        {listings.map((listing) => (
          <Link key={listing.id} to={`/listings/${listing.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className={`badge ${listing.is_hidden ? 'badge-hidden' : 'badge-active'}`}>
                  {listing.is_hidden ? 'Hidden' : listing.status}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>{listing.product_type}</span>
              </div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{listing.title}</h3>
              {listing.description && (
                <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {listing.description}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="price">${Number(listing.price_usdc).toFixed(2)}</span>
                <StarRating rating={Number(listing.average_rating)} />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
                {listing.review_count} review{listing.review_count !== 1 ? 's' : ''}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
