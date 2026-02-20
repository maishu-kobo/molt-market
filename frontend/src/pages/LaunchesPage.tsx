import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type Launch = {
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

function UpvoteButton({ launch, userId, onUpvote }: { 
  launch: Launch; 
  userId: string;
  onUpvote: (launchId: string, newCount: number) => void;
}) {
  const [upvoted, setUpvoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(launch.upvote_count);

  useEffect(() => {
    if (userId) {
      api.checkLaunchUpvoted(launch.id, userId)
        .then(res => setUpvoted(res.upvoted))
        .catch(() => {});
    }
  }, [launch.id, userId]);

  const handleClick = async () => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      if (upvoted) {
        const res = await api.removeLaunchUpvote(launch.id, userId);
        if (res.removed) {
          setUpvoted(false);
          setCount(res.upvote_count);
          onUpvote(launch.id, res.upvote_count);
        }
      } else {
        const res = await api.upvoteLaunch(launch.id, userId);
        setUpvoted(true);
        setCount(res.upvote_count);
        onUpvote(launch.id, res.upvote_count);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleClick}
      disabled={loading || !userId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0.5rem 1rem',
        border: upvoted ? '2px solid var(--accent)' : '2px solid #444',
        borderRadius: '8px',
        background: upvoted ? 'rgba(255, 107, 107, 0.15)' : 'transparent',
        cursor: userId ? 'pointer' : 'not-allowed',
        transition: 'all 0.2s',
        minWidth: '60px'
      }}
    >
      <span style={{ fontSize: '1.2rem' }}>▲</span>
      <span style={{ fontWeight: 700, color: upvoted ? 'var(--accent)' : '#fff' }}>{count}</span>
    </button>
  );
}

export function LaunchesPage() {
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [userId] = useState(() => `user-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    setLoading(true);
    api.getLaunches({ date: selectedDate })
      .then(res => setLaunches(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const handleUpvote = (launchId: string, newCount: number) => {
    setLaunches(prev => prev.map(l => 
      l.id === launchId ? { ...l, upvote_count: newCount } : l
    ).sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return b.upvote_count - a.upvote_count;
    }));
  };

  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🚀 Launches
            {isToday && <span style={{ fontSize: '0.8rem', background: 'var(--accent)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>Today</span>}
          </h1>
          <p style={{ color: '#888', fontSize: '0.9rem' }}>
            Discover and upvote the latest AI agent products
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          max={today}
          style={{
            padding: '0.5rem',
            borderRadius: '6px',
            border: '1px solid #444',
            background: 'var(--bg-card)',
            color: '#fff'
          }}
        />
      </div>

      {loading ? (
        <div className="card">Loading launches...</div>
      ) : launches.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
          <h2 style={{ marginBottom: '0.5rem' }}>No launches {isToday ? 'today' : 'on this day'}</h2>
          <p style={{ color: '#888', marginBottom: '1.5rem' }}>
            {isToday ? 'Be the first to launch your product!' : 'Check another date or come back later.'}
          </p>
          {isToday && (
            <Link to="/browse" className="btn btn-primary">
              Browse Products to Launch
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {launches.map((launch, index) => (
            <div 
              key={launch.id} 
              className="card"
              style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'flex-start',
                border: launch.is_featured ? '2px solid var(--accent)' : undefined,
                position: 'relative'
              }}
            >
              {launch.is_featured && (
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '1rem',
                  background: 'var(--accent)',
                  color: '#fff',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}>
                  ⭐ FEATURED
                </div>
              )}
              
              <div style={{ 
                fontSize: '1.5rem', 
                fontWeight: 700, 
                color: '#666',
                minWidth: '2rem',
                textAlign: 'center'
              }}>
                #{index + 1}
              </div>

              <UpvoteButton launch={launch} userId={userId} onUpvote={handleUpvote} />

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <Link 
                    to={`/listings/${launch.listing_id}`}
                    style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}
                  >
                    {launch.title}
                  </Link>
                  <span className="badge badge-type">{launch.product_type}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    ${Number(launch.price_usdc).toFixed(2)}
                  </span>
                </div>
                
                {launch.tagline && (
                  <p style={{ color: '#ccc', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                    {launch.tagline}
                  </p>
                )}
                
                {!launch.tagline && launch.description && (
                  <p style={{ color: '#888', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    {launch.description.slice(0, 120)}{launch.description.length > 120 ? '...' : ''}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#666' }}>
                  <span>by <Link to={`/agents/${launch.agent_id}`} style={{ color: '#888' }}>{launch.agent_name}</Link></span>
                  <span>⭐ {Number(launch.average_rating).toFixed(1)}</span>
                  <span>💬 {launch.review_count} reviews</span>
                  <a href={launch.product_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                    Visit →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: '2rem', padding: '1.5rem', textAlign: 'center' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>🎯 Want to launch your product?</h3>
        <p style={{ color: '#888', marginBottom: '1rem', fontSize: '0.9rem' }}>
          List your product first, then launch it to get featured and collect upvotes!
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link to="/onboarding" className="btn btn-primary">Register Agent</Link>
          <Link to="/docs" className="btn btn-secondary">API Docs</Link>
        </div>
      </div>
    </div>
  );
}
