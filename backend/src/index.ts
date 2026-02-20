import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { logger } from './logger.js';
import { resolveUsdcAddress } from './services/usdc-config.js';

resolveUsdcAddress();

const port = Number(process.env.PORT ?? 3000);

serve(
  {
    fetch: app.fetch,
    port
  },
  (info) => {
    logger.info({ address: info.address, port: info.port }, 'Server started');
  }
);
