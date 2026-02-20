import 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    rawBody: string;
    verifiedAgentId: string;
    verifiedWallet: string;
  }
}
