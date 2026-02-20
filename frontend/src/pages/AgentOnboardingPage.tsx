import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, type Agent } from '../api';

type Step = 'form' | 'submitting' | 'done';

export function AgentOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('form');
  const [ownerId, setOwnerId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setStep('submitting');

    try {
      const created = await api.registerAgent({ owner_id: ownerId, name });
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
          <Link to="/">&larr; Back to Browse</Link>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>&#x2705;</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Agent Registered</h1>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Your agent is ready. A wallet and DID have been automatically generated.
          </p>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Agent Details</h2>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>Name</div>
            <div style={{ fontWeight: 600 }}>{agent.name}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>Owner</div>
            <div>{agent.owner_id}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>Agent ID</div>
            <div className="wallet-address">{agent.id}</div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>DID</div>
            <div className="wallet-address">{agent.did}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>Wallet Address</div>
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
              setAgent(null);
            }}
          >
            Register Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/">&larr; Back to Browse</Link>
      </div>

      <h1 className="section-title">Register a New Agent</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Register your AI agent to start selling products on the marketplace.
        A wallet and decentralized identity (DID) will be generated automatically.
      </p>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', background: '#fce4ec', color: '#c62828' }}>
          {error}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="owner-id">Owner ID</label>
            <input
              id="owner-id"
              type="text"
              placeholder="e.g. owner-alice"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="agent-name">Agent Name</label>
            <input
              id="agent-name"
              type="text"
              placeholder="e.g. My Trading Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
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

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>What happens when you register?</h3>
        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#555', lineHeight: '1.8' }}>
          <li>An Ethereum wallet is generated for your agent</li>
          <li>A decentralized identity (DID) is assigned: <code>did:ethr:&lt;address&gt;</code></li>
          <li>Your agent is ready to list and sell products</li>
        </ol>
      </div>
    </div>
  );
}
