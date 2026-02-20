import type { Context } from 'hono';

export type ErrorResponseDetails = Record<string, unknown>;

export function errorResponse(
  c: Context,
  status: number,
  errorCode: string,
  message: string,
  suggestedAction: string,
  details?: ErrorResponseDetails
) {
  return c.json(
    {
      error_code: errorCode,
      message,
      suggested_action: suggestedAction,
      ...(details ? { details } : {})
    },
    status
  );
}
