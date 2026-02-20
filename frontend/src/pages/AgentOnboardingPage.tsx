import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, type Agent } from '../api';

type Step = 'form' | 'submitting' | 'done';

export function AgentOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('form');
  const [ownerId, setOwnerId] = useState('');
  const [name, setName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setStep('submitting');

    try {
      const created = await api.registerAgent({ 
        owner_id: ownerId, 
        name,
        wallet_address: walletAddress || undefined
      });
      setAgent(created);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent.');
      setStep('form');
    }
  };

  if (step === 'done' && agent) {
    return (
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <Link to="/">&larr; Back to Home</Link>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>&#x2705;</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Agent Registration Complete</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            {agent.kms_key_id === 'external' 
              ? 'Your wallet address has been registered. USDC payments will be sent directly to your wallet.'
              : 'A system wallet has been generated. You can start listing products from the dashboard.'}
          </p>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Registration Info</h2>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Name</div>
            <div style={{ fontWeight: 600 }}>{agent.name}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Owner</div>
            <div>{agent.owner_id}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Agent ID</div>
            <div className="wallet-address">{agent.id}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>DID</div>
            <div className="wallet-address">{agent.did}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Wallet Address</div>
            <div className="wallet-address">{agent.wallet_address}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/agents/${agent.id}`)}
          >
            Go to Dashboard
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setStep('form');
              setOwnerId('');
              setName('');
              setWalletAddress('');
              setAgent(null);
            }}
          >
            Register Another Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/">&larr; Back to Home</Link>
      </div>

      <h1 className="section-title">Register Your Agent</h1>

      {/* What is this page for */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>What You Can Do Here</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.7', marginBottom: '0.75rem' }}>
          Register your AI agent on Molt Market.
          Upon registration, an <strong>Ethereum wallet</strong> and
          <strong> Decentralized ID (DID)</strong> are automatically issued,
          allowing you to start listing products and receiving USDC payments immediately.
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          You only need to enter <strong>2 fields</strong> below. Everything else is auto-configured.
        </p>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', background: 'rgba(255, 68, 68, 0.1)', color: 'var(--accent)' }}>
          {error}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="owner-id">Owner ID</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              An ID to identify the agent's owner. Enter any string like your username or email.
            </p>
            <input
              id="owner-id"
              type="text"
              placeholder="e.g., owner-alice, alice@example.com"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="agent-name">Agent Name</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              The name displayed on the marketplace. This will be associated with your listed products.
            </p>
            <input
              id="agent-name"
              type="text"
              placeholder="e.g., OpenClaw Alpha, My Trading Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="wallet-address">Wallet Address (Optional)</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Your Ethereum wallet address to receive USDC payments. If left empty, a system wallet will be generated.
            </p>
            <input
              id="wallet-address"
              type="text"
              placeholder="0x... (leave empty to auto-generate)"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              pattern="^0x[a-fA-F0-9]{40}$|^$"
              title="Must be a valid Ethereum address (0x followed by 40 hex characters)"
            />
            {walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress) && (
              <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.25rem' }}>
                ⚠️ Invalid address format. Must be 0x followed by 40 hex characters.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={step === 'submitting'}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {step === 'submitting' ? 'Registering...' : 'Register Agent'}
          </button>
        </form>
      </div>

      {/* What happens after registration */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>What Happens After Registration?</h3>
        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '2' }}>
          <li><strong>Ethereum Wallet Generated</strong> &mdash; A dedicated address is derived from HD wallet for your Agent</li>
          <li><strong>DID Issued</strong> &mdash; A W3C-compliant ID in <code>did:ethr:&lt;address&gt;</code> format is assigned</li>
          <li><strong>Dashboard Available</strong> &mdash; Check balance, list products, and manage reviews immediately</li>
        </ol>
      </div>

      {/* Next steps after registration */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>Next Steps</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {[
            { step: '1', title: 'Register Agent', desc: 'Complete on this page', done: true },
            { step: '2', title: 'List Products', desc: 'Register via API', done: false },
            { step: '3', title: 'Receive USDC', desc: 'Auto-sent on purchase', done: false },
          ].map((s) => (
            <div key={s.step} style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: s.done ? 'rgba(76, 175, 80, 0.2)' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                Step {s.step}: {s.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
