import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Listing, type Review, type TestnetBuyer } from '../api';

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars = '\u2605'.repeat(full) + (half ? '\u00BD' : '') + '\u2606'.repeat(5 - full - (half ? 1 : 0));
  return <span className="stars">{stars} ({rating.toFixed(1)})</span>;
}

function DetailSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: '4px' }} />
      </div>
      <div className="skeleton-card">
        <div className="skeleton skeleton-line" style={{ width: '50%', height: '24px', marginBottom: '1rem' }} />
        <div className="skeleton skeleton-line skeleton-line-full" />
        <div className="skeleton skeleton-line skeleton-line-medium" />
        <div className="skeleton skeleton-line skeleton-line-short" style={{ marginTop: '1rem' }} />
      </div>
    </div>
  );
}

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buyerWallet, setBuyerWallet] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<string | null>(null);

  const [testnetBuyer, setTestnetBuyer] = useState<TestnetBuyer | null>(null);

  const [reviewBuyerId, setReviewBuyerId] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getListing(id), api.getReviews(id), api.getTestnetBuyer()])
      .then(([l, r, tb]) => {
        setListing(l);
        setReviews(Array.isArray(r) ? r : []);
        setTestnetBuyer(tb);
        // Pre-fill with testnet buyer address
        if (tb && !buyerWallet) {
          setBuyerWallet(tb.address);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handlePurchase() {
    if (!listing || !buyerWallet) return;
    setPurchasing(true);
    setPurchaseResult(null);
    try {
      const result = await api.purchase({
        listing_id: listing.id,
        buyer_wallet: buyerWallet,
        idempotency_key: `purchase-${listing.id}-${Date.now()}`
      });
      setPurchaseResult(`Purchase completed! tx: ${result.tx_hash || 'pending'}`);
    } catch (err: unknown) {
      setPurchaseResult(`Purchase failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPurchasing(false);
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !reviewBuyerId) return;
    setSubmittingReview(true);
    try {
      await api.submitReview(id, {
        buyer_id: reviewBuyerId,
        rating: reviewRating,
        comment: reviewComment || undefined
      });
      const updated = await api.getReviews(id);
      setReviews(Array.isArray(updated) ? updated : []);
      const updatedListing = await api.getListing(id);
      setListing(updatedListing);
      setReviewBuyerId('');
      setReviewComment('');
      setReviewRating(5);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingReview(false);
    }
  }

  if (loading) return <DetailSkeleton />;
  if (error) return <div className="error">{error}</div>;
  if (!listing) return <div className="empty">Listing not found.</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/">&larr; Back to Browse</Link>
      </div>

      <div className="card">
        <div className="detail-header">
          <div className="detail-info">
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{listing.title}</h1>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span className={`badge ${listing.is_hidden ? 'badge-hidden' : 'badge-active'}`}>
                {listing.is_hidden ? 'Hidden' : listing.status}
              </span>
              <span className="badge badge-type">{listing.product_type}</span>
              <StarRating rating={Number(listing.average_rating)} />
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                {listing.review_count} review{listing.review_count !== 1 ? 's' : ''}
              </span>
            </div>
            {listing.description && (
              <p style={{ color: '#444', marginBottom: '1rem', lineHeight: 1.6 }}>{listing.description}</p>
            )}
            <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Product: <a href={listing.product_url} target="_blank" rel="noreferrer">{listing.product_url}</a>
            </p>
            {listing.repository_url && (
              <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                📂 Source: <a href={listing.repository_url} target="_blank" rel="noreferrer">{listing.repository_url}</a>
                {listing.repository_url && <span style={{ marginLeft: '0.5rem', color: 'var(--success)', fontSize: '0.75rem' }}>✓ Open Source</span>}
              </p>
            )}
            {listing.license && listing.license !== 'Unknown' && (
              <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                📋 License: <span style={{ 
                  background: listing.license === 'Proprietary' ? 'rgba(255, 68, 68, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem'
                }}>{listing.license}</span>
              </p>
            )}
            <p style={{ fontSize: '0.85rem' }}>
              Sold by: <Link to={`/agents/${listing.agent_id}`}>View Agent</Link>
            </p>
          </div>
          <div className="detail-aside">
            <div className="price" style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>
              ${Number(listing.price_usdc).toFixed(2)} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#666' }}>USDC</span>
            </div>
            <div className="form-group">
              <input
                type="text"
                placeholder="Your wallet address (0x...)"
                value={buyerWallet}
                onChange={(e) => setBuyerWallet(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handlePurchase}
              disabled={purchasing || !buyerWallet}
            >
              {purchasing ? 'Processing...' : 'Buy Now'}
            </button>
            {purchaseResult && (
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: purchaseResult.includes('failed') ? '#c62828' : '#2e7d32' }}>
                {purchaseResult}
              </p>
            )}
            {testnetBuyer && (
              <div className="testnet-info" style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255, 183, 77, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 183, 77, 0.3)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f57c00', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ⚠️ Base Sepolia Testnet
                </div>
                <div style={{ fontSize: '0.75rem', color: '#aaa' }}>
                  <div>Test Buyer: <code style={{ fontSize: '0.65rem' }}>{testnetBuyer.address.slice(0, 10)}...{testnetBuyer.address.slice(-8)}</code></div>
                  <div style={{ marginTop: '0.25rem' }}>ETH: {Number(testnetBuyer.ethBalance).toFixed(4)} | USDC: {Number(testnetBuyer.usdcBalance).toFixed(2)}</div>
                  {Number(testnetBuyer.ethBalance) === 0 && (
                    <div style={{ marginTop: '0.5rem', color: '#ef5350' }}>
                      ⛽ No ETH for gas! Get from <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noreferrer" style={{ color: '#ff9800' }}>faucet</a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 className="section-title">Reviews ({reviews.length})</h2>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Write a Review</h3>
          <form onSubmit={handleReviewSubmit}>
            <div className="form-group">
              <label>Buyer ID</label>
              <input
                type="text"
                value={reviewBuyerId}
                onChange={(e) => setReviewBuyerId(e.target.value)}
                placeholder="your-buyer-id"
                required
              />
            </div>
            <div className="form-group">
              <label>Rating</label>
              <select value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{'\u2605'.repeat(n)}{'\u2606'.repeat(5 - n)} ({n})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Comment (optional)</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Your thoughts on this product..."
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submittingReview || !reviewBuyerId}>
              {submittingReview ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>
        </div>

        {reviews.length === 0 ? (
          <div className="empty">No reviews yet. Be the first!</div>
        ) : (
          <div className="card">
            {reviews.map((review) => (
              <div key={review.id} className="review-item">
                <div>
                  <span className="stars">{'\u2605'.repeat(review.rating)}{'\u2606'.repeat(5 - review.rating)}</span>
                </div>
                {review.comment && <p style={{ margin: '0.25rem 0' }}>{review.comment}</p>}
                <div className="review-meta">
                  by {review.buyer_id} &middot; {new Date(review.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
