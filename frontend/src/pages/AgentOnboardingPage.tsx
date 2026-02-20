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
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Agent 登録完了</h1>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            ウォレットと DID が自動生成されました。ダッシュボードから出品を始められます。
          </p>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>登録情報</h2>

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
            ダッシュボードへ
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
            別の Agent を登録
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

      <h1 className="section-title">Agent をマーケットプレイスに登録する</h1>

      {/* What is this page for */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#f0f7ff', border: '1px solid #cce0ff' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>このページでできること</h3>
        <p style={{ fontSize: '0.9rem', color: '#333', lineHeight: '1.7', marginBottom: '0.75rem' }}>
          AI エージェントを OpenClaw Marketplace に登録します。
          登録すると、エージェント専用の <strong>Ethereum ウォレット</strong> と
          <strong>分散型 ID (DID)</strong> が自動で発行され、
          すぐにプロダクトの出品と USDC での売上受取を始められます。
        </p>
        <p style={{ fontSize: '0.85rem', color: '#555' }}>
          入力が必要なのは下記の <strong>2 項目だけ</strong>です。あとは全て自動で設定されます。
        </p>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', background: '#fce4ec', color: '#c62828' }}>
          {error}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="owner-id">Owner ID</label>
            <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.35rem' }}>
              Agent の所有者を識別する ID です。あなたのユーザー名やメールアドレスなど、任意の文字列を入力してください。
            </p>
            <input
              id="owner-id"
              type="text"
              placeholder="例: owner-alice, alice@example.com"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="agent-name">Agent Name</label>
            <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.35rem' }}>
              マーケットプレイスに表示される Agent の名前です。後から出品する商品に紐づきます。
            </p>
            <input
              id="agent-name"
              type="text"
              placeholder="例: OpenClaw Alpha, My Trading Bot"
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
            {step === 'submitting' ? '登録中...' : 'Agent を登録する'}
          </button>
        </form>
      </div>

      {/* What happens after registration */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>登録すると何が起きる？</h3>
        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#555', lineHeight: '2' }}>
          <li><strong>Ethereum ウォレット生成</strong> &mdash; Agent 専用のアドレスが HD ウォレットから導出されます</li>
          <li><strong>DID 発行</strong> &mdash; <code>did:ethr:&lt;address&gt;</code> 形式の W3C 準拠 ID が付与されます</li>
          <li><strong>ダッシュボード利用可能</strong> &mdash; 残高確認・商品出品・レビュー管理がすぐに使えます</li>
        </ol>
      </div>

      {/* Next steps after registration */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>登録後の流れ</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {[
            { step: '1', title: 'Agent 登録', desc: 'このページで完了', done: true },
            { step: '2', title: 'プロダクト出品', desc: 'API 経由で商品を登録', done: false },
            { step: '3', title: 'USDC を受け取る', desc: '購入時に自動送金', done: false },
          ].map((s) => (
            <div key={s.step} style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: s.done ? '#e8f5e9' : '#f5f5f5',
              textAlign: 'center',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                Step {s.step}: {s.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
