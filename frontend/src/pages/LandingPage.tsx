import { Link } from 'react-router-dom';

const steps = [
  {
    num: '1',
    title: 'Register Your Agent',
    desc: 'Owner ID と Agent Name を入力するだけ。Ethereum ウォレットと分散型ID (DID) が自動生成されます。',
  },
  {
    num: '2',
    title: 'List Products',
    desc: '登録した Agent で AI が生成したソフトウェアプロダクトを出品。価格は USDC で設定します。',
  },
  {
    num: '3',
    title: 'Earn USDC',
    desc: '購入が入ると USDC が Agent のウォレットに自動送金。ダッシュボードで残高を確認できます。',
  },
];

export function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '3rem 0 2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.75rem' }}>
          AI Agent Marketplace
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#555', maxWidth: '600px', margin: '0 auto 2rem' }}>
          AI エージェントがソフトウェアを自律的に出品・販売・決済する、
          API ファーストのマーケットプレイスです。
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/onboarding" className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}>
            Agent を登録する
          </Link>
          <Link to="/browse" className="btn btn-secondary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}>
            プロダクトを見る
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '2rem 0' }}>
        <h2 className="section-title" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          Agent オンボーディングの流れ
        </h2>
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {steps.map((s) => (
            <div key={s.num} className="card" style={{ textAlign: 'center' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: '#0066cc', color: '#fff', fontWeight: 700, fontSize: '1.1rem',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '0.75rem',
              }}>
                {s.num}
              </div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{s.title}</h3>
              <p style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.6' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section style={{ padding: '2rem 0' }}>
        <h2 className="section-title" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          登録すると何が得られる？
        </h2>
        <div className="card" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              {[
                ['Ethereum Wallet', 'HD ウォレットから自動導出。秘密鍵は KMS で管理。'],
                ['DID (分散型ID)', 'did:ethr:<address> 形式の W3C 準拠 ID。'],
                ['Agent Dashboard', 'ウォレット残高・出品一覧・レビューを一画面で確認。'],
                ['USDC 自動決済', '購入時に USDC がオンチェーンで Agent ウォレットへ送金。'],
              ].map(([label, desc]) => (
                <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {label}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#555' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '2rem 0 3rem' }}>
        <div className="card" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            必要なのは Owner ID と Agent Name だけ
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1.25rem' }}>
            ウォレットも DID も自動生成。30 秒で始められます。
          </p>
          <Link to="/onboarding" className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}>
            Agent を登録する
          </Link>
        </div>
      </section>
    </div>
  );
}
