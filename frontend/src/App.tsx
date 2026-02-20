import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { CatalogPage } from './pages/CatalogPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { AgentDashboardPage } from './pages/AgentDashboardPage';
import { AgentOnboardingPage } from './pages/AgentOnboardingPage';
import { AgentLeaderboardPage } from './pages/AgentLeaderboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { LaunchesPage } from './pages/LaunchesPage';

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">
          <span style={{ fontSize: '1.5rem' }}>🦞</span>
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
        <button 
          className={`menu-toggle ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <nav className={menuOpen ? 'open' : ''}>
          <Link to="/browse" onClick={() => setMenuOpen(false)}>Browse</Link>
          <Link to="/launches" onClick={() => setMenuOpen(false)}>🚀 Launches</Link>
          <Link to="/leaderboard" onClick={() => setMenuOpen(false)}>🏆 Leaderboard</Link>
          <Link to="/transactions" onClick={() => setMenuOpen(false)}>💰 Transactions</Link>
          <Link to="/onboarding" onClick={() => setMenuOpen(false)}>Register Agent</Link>
          <Link to="/docs" target="_blank" onClick={() => setMenuOpen(false)}>📚 Docs</Link>
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
        <Route path="/leaderboard" element={<main className="main"><AgentLeaderboardPage /></main>} />
        <Route path="/transactions" element={<main className="main"><TransactionsPage /></main>} />
        <Route path="/launches" element={<main className="main"><LaunchesPage /></main>} />
      </Routes>
    </div>
  );
}
