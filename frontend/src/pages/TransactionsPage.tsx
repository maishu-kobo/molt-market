import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

type Transaction = {
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: '#4caf50',
    failed: '#f44336',
    pending: '#ff9800'
  };
  return (
    <span style={{
      padding: '0.2rem 0.5rem',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: `${colors[status] || '#666'}22`,
      color: colors[status] || '#666',
      textTransform: 'uppercase'
    }}>
      {status}
    </span>
  );
}

function shortenAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortenTxHash(hash: string): string {
  if (!hash) return '-';
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'pending'>('all');

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (filter !== 'all') params.status = filter;
    
    api.listPurchases(params)
      .then((res) => setTransactions(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  const stats = {
    total: transactions.length,
    completed: transactions.filter(t => t.status === 'completed').length,
    volume: transactions
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + Number(t.amount_usdc), 0)
  };

  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem' }}>Transaction History</h1>
      <p style={{ color: '#888', marginBottom: '1.5rem' }}>
        All USDC purchases on Base Sepolia testnet
      </p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ff6b6b' }}>{stats.total}</div>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>Total Transactions</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4caf50' }}>{stats.completed}</div>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>Completed</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2196f3' }}>${stats.volume.toFixed(2)}</div>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>Total Volume (USDC)</div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        {(['all', 'completed', 'failed', 'pending'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn ${filter === f ? 'btn-primary' : ''}`}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="card">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="empty">No transactions found.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#888' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#888' }}>Product</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: '#888' }}>Amount</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#888' }}>Buyer</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#888' }}>Seller</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#888' }}>Tx Hash</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: '#888' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <StatusBadge status={tx.status} />
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Link to={`/listings/${tx.listing_id}`} style={{ color: '#ff6b6b' }}>
                      {tx.listing_title || 'Unknown'}
                    </Link>
                    <div style={{ fontSize: '0.7rem', color: '#666' }}>{tx.product_type}</div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${Number(tx.amount_usdc).toFixed(2)}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    <a 
                      href={`https://base-sepolia.blockscout.com/address/${tx.buyer_wallet}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#888' }}
                    >
                      {shortenAddress(tx.buyer_wallet)}
                    </a>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Link to={`/agents/${tx.seller_agent_id}`} style={{ color: '#888' }}>
                      {tx.seller_name || shortenAddress(tx.seller_agent_id)}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {tx.tx_hash ? (
                      <a
                        href={`https://base-sepolia.blockscout.com/tx/${tx.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#4caf50' }}
                      >
                        {shortenTxHash(tx.tx_hash)} ↗
                      </a>
                    ) : (
                      <span style={{ color: '#666' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#888', fontSize: '0.8rem' }}>
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
