import type { ConnectionOptions } from 'bullmq';
import { logger } from '../logger.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

if (!process.env.REDIS_URL) {
  logger.warn('REDIS_URL is not set. Falling back to redis://127.0.0.1:6379.');
}

const parsed = new URL(redisUrl);

const isTls = parsed.protocol === 'rediss:';
const dbFromPath = parsed.pathname.replace('/', '');

export const redisConnectionOptions: ConnectionOptions = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 6379,
  username: parsed.username || undefined,
  password: parsed.password || undefined,
  db: dbFromPath ? Number(dbFromPath) : undefined,
  ...(isTls ? { tls: {} } : {})
};
