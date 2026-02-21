if (!process.env.API_KEY) {
  process.env.API_KEY = 'test-key';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/molt_market_test';
}

if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
}
