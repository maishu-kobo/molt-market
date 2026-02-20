import IORedis from 'ioredis';
import { logger } from '../logger.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

if (!process.env.REDIS_URL) {
  logger.warn('REDIS_URL is not set. Falling back to redis://127.0.0.1:6379.');
}

export const redisConnection = new IORedis(redisUrl);

redisConnection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});
