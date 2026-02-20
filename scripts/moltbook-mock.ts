import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOLTBOOK_MOCK_PORT ?? 4000);

const products = new Map<string, unknown>();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // POST /api/v1/products — register a product for marketing
  if (req.method === 'POST' && url.pathname === '/api/v1/products') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const id = `moltbook-${randomUUID().slice(0, 8)}`;
        const product = { id, status: 'active', ...data, created_at: new Date().toISOString() };
        products.set(id, product);
        console.log(`[Moltbook Mock] Registered product: ${id} — ${data.title}`);
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(product));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /api/v1/products/:id
  const productMatch = url.pathname.match(/^\/api\/v1\/products\/(.+)$/);
  if (req.method === 'GET' && productMatch) {
    const product = products.get(productMatch[1]);
    if (product) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(product));
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', products: products.size }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Moltbook Mock] Running on http://0.0.0.0:${PORT}`);
});
