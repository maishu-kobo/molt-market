import { Pool, type QueryResultRow } from 'pg';
import { logger } from '../logger.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  logger.warn('DATABASE_URL is not set. Database connections will fail.');
}

export const pool = new Pool({
  connectionString: databaseUrl
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL client error');
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params);
}
