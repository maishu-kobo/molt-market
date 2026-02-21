/**
 * Simple in-memory rate limiter by IP
 * For production, use Redis-based rate limiting
 */
import type { MiddlewareHandler } from 'hono';
import { errorResponse } from './error-response.js';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute per IP

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() 
    || c.req.header('x-real-ip') 
    || 'unknown';
  
  const now = Date.now();
  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
    if (record.count > MAX_REQUESTS) {
      return errorResponse(
        c,
        429,
        'rate_limit_exceeded',
        'Too many requests. Please slow down.',
        `Maximum ${MAX_REQUESTS} requests per minute.`
      );
    }
  }

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, val] of requestCounts.entries()) {
      if (now > val.resetAt) requestCounts.delete(key);
    }
  }

  await next();
};
