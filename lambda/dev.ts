import { serve } from '@hono/node-server';
import { app } from '../src/app';

const port = Number(process.env.PORT ?? 3000);

serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port,
});

console.log(`Local server: http://localhost:${port}`);
