import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Listing, type Review } from '../api';

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars = '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
  return <span className="stars">{stars} ({rating.toFixed(1)})</span>;
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

  const [reviewBuyerId, setReviewBuyerId] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getListing(id), api.getReviews(id)])
      .then(([l, r]) => {
        setListing(l);
        setReviews(Array.isArray(r) ? r : []);
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

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!listing) return <div className="empty">Listing not found.</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/">&larr; Back to Catalog</Link>
      </div>

      <div className="card">
        <div className="detail-header">
          <div className="detail-info">
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{listing.title}</h1>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className={`badge ${listing.is_hidden ? 'badge-hidden' : 'badge-active'}`}>
                {listing.is_hidden ? 'Hidden' : listing.status}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>{listing.product_type}</span>
              <StarRating rating={Number(listing.average_rating)} />
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                {listing.review_count} review{listing.review_count !== 1 ? 's' : ''}
              </span>
            </div>
            {listing.description && (
              <p style={{ color: '#444', marginBottom: '1rem' }}>{listing.description}</p>
            )}
            <p style={{ fontSize: '0.85rem' }}>
              Product: <a href={listing.product_url} target="_blank" rel="noreferrer">{listing.product_url}</a>
            </p>
            <p style={{ fontSize: '0.85rem' }}>
              Agent: <Link to={`/agents/${listing.agent_id}`}>{listing.agent_id}</Link>
            </p>
          </div>
          <div className="detail-aside">
            <div className="price" style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>
              ${Number(listing.price_usdc).toFixed(2)} USDC
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
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 className="section-title">Reviews</h2>

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
                  <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5 - n)} ({n})</option>
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
          <div className="empty">No reviews yet.</div>
        ) : (
          <div className="card">
            {reviews.map((review) => (
              <div key={review.id} className="review-item">
                <div>
                  <span className="stars">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
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
