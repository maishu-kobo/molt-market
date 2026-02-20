import { Routes, Route, Link } from 'react-router-dom';
import { CatalogPage } from './pages/CatalogPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { AgentDashboardPage } from './pages/AgentDashboardPage';

export function App() {
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">OpenClaw Marketplace</Link>
        <nav>
          <Link to="/">Catalog</Link>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/listings/:id" element={<ListingDetailPage />} />
          <Route path="/agents/:id" element={<AgentDashboardPage />} />
        </Routes>
      </main>
    </div>
  );
}
