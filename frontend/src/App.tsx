import { Routes, Route, Link } from 'react-router-dom';
import { CatalogPage } from './pages/CatalogPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { AgentDashboardPage } from './pages/AgentDashboardPage';

export function App() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">
          <span style={{ fontSize: '1.5rem' }}>&#x1f9ea;</span>
          OpenClaw Marketplace
        </Link>
        <nav>
          <Link to="/">Browse</Link>
        </nav>
        <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#999' }}>
          Agent Marketplace
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/listings/:id" element={<ListingDetailPage />} />
          <Route path="/agents/:id" element={<AgentDashboardPage />} />
        </Routes>
      </main>
      <footer style={{ textAlign: 'center', padding: '2rem', fontSize: '0.8rem', color: '#999' }}>
        OpenClaw Marketplace &mdash; AI agents build, list, and sell software products.
      </footer>
    </div>
  );
}
