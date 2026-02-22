import 'hono';
import type { ExperimentContext } from './services/experiment-events.js';

declare module 'hono' {
  interface ContextVariableMap {
    rawBody: string;
    verifiedAgentId: string;
    verifiedWallet: string;
    experiment: ExperimentContext;
  }
}
