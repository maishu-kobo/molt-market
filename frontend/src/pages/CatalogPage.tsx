import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, type Listing } from '../api';

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars = '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(5 - full - (half ? 1 : 0));
  return <span className="stars">{stars} ({rating.toFixed(1)})</span>;
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div className="skeleton skeleton-line" style={{ width: '60px', height: '18px', marginBottom: 0 }} />
        <div className="skeleton skeleton-line" style={{ width: '40px', height: '14px', marginBottom: 0 }} />
      </div>
      <div className="skeleton skeleton-line skeleton-title" />
      <div className="skeleton skeleton-line skeleton-line-full" />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
        <div className="skeleton skeleton-price" />
        <div className="skeleton skeleton-line" style={{ width: '100px', height: '14px', marginBottom: 0 }} />
      </div>
    </div>
  );
}

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'rating';

export function CatalogPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productType, setProductType] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, string | number> = { limit: 100, offset: 0 };
    if (productType) params.product_type = productType;
    if (!showHidden) params.is_hidden = 'false';

    api.listListings(params)
      .then((res) => setListings(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [productType, showHidden]);

  const filtered = useMemo(() => {
    let result = listings;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.description && l.description.toLowerCase().includes(q))
      );
    }

    switch (sort) {
      case 'price_asc':
        result = [...result].sort((a, b) => Number(a.price_usdc) - Number(b.price_usdc));
        break;
      case 'price_desc':
        result = [...result].sort((a, b) => Number(b.price_usdc) - Number(a.price_usdc));
        break;
      case 'rating':
        result = [...result].sort((a, b) => Number(b.average_rating) - Number(a.average_rating));
        break;
      case 'newest':
      default:
        result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }

    return result;
  }, [listings, search, sort]);

  return (
    <div>
      <h1 className="section-title">Browse Products</h1>

      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select value={productType} onChange={(e) => setProductType(e.target.value)}>
          <option value="">All Types</option>
          <option value="web">Web</option>
          <option value="api">API</option>
          <option value="cli">CLI</option>
          <option value="mobile">Mobile</option>
          <option value="library">Library</option>
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
          <option value="newest">Newest First</option>
          <option value="rating">Highest Rated</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>

        <label>
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </div>

      {loading && (
        <div className="grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="result-count">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              {search ? 'No products match your search.' : 'No products listed yet.'}
            </div>
          ) : (
            <div className="grid">
              {filtered.map((listing) => (
                <Link key={listing.id} to={`/listings/${listing.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card card-hover" style={{ cursor: 'pointer', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span className={`badge ${listing.is_hidden ? 'badge-hidden' : 'badge-active'}`}>
                        {listing.is_hidden ? 'Hidden' : listing.status}
                      </span>
                      <span className="badge badge-type">{listing.product_type}</span>
                    </div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{listing.title}</h3>
                    {listing.description && (
                      <p style={{
                        fontSize: '0.85rem',
                        color: '#666',
                        marginBottom: '0.75rem',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {listing.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
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
          )}
        </>
      )}
    </div>
  );
}
