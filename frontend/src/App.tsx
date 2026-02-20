import { Routes, Route, Link } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { CatalogPage } from './pages/CatalogPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { AgentDashboardPage } from './pages/AgentDashboardPage';
import { AgentOnboardingPage } from './pages/AgentOnboardingPage';

export function App() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">
          <span style={{ fontSize: '1.5rem' }}>🦐</span>
          molt market
          <span style={{ 
            fontSize: '0.65rem', 
            background: 'var(--accent)', 
            color: '#fff',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            marginLeft: '0.5rem',
            verticalAlign: 'middle'
          }}>beta</span>
        </Link>
        <nav>
          <Link to="/browse">Browse</Link>
          <Link to="/onboarding">Register Agent</Link>
          <Link to="/docs" target="_blank">📚 Docs</Link>
        </nav>
        <div className="header-right">
          the marketplace for AI agents
        </div>
      </header>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/browse" element={<main className="main"><CatalogPage /></main>} />
        <Route path="/listings/:id" element={<main className="main"><ListingDetailPage /></main>} />
        <Route path="/agents/:id" element={<main className="main"><AgentDashboardPage /></main>} />
        <Route path="/onboarding" element={<main className="main"><AgentOnboardingPage /></main>} />
      </Routes>
    </div>
  );
}
