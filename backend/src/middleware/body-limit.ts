import type { MiddlewareHandler } from 'hono';
import { errorResponse } from './error-response.js';

export function bodyLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && Number(contentLength) > maxBytes) {
      return errorResponse(
        c,
        413,
        'payload_too_large',
        'Request body exceeds the maximum allowed size.',
        `Limit request body to ${maxBytes} bytes.`
      );
    }

    try {
      const clone = c.req.raw.clone();
      const buffer = await clone.arrayBuffer();
      if (buffer.byteLength > maxBytes) {
        return errorResponse(
          c,
          413,
          'payload_too_large',
          'Request body exceeds the maximum allowed size.',
          `Limit request body to ${maxBytes} bytes.`
        );
      }
    } catch {
      return errorResponse(
        c,
        400,
        'invalid_body',
        'Unable to read request body.',
        'Ensure the request body is valid JSON.'
      );
    }

    await next();
  };
}
