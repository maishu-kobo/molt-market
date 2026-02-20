if (!process.env.API_KEY) {
  process.env.API_KEY = 'test-key';
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for tests.');
}

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required for tests.');
}
