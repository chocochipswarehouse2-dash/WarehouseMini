import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import aiHandler from './api/ai.js';
import pushHandler from './api/push.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  app.all('/api/ai', async (req, res) => {
    try {
      await aiHandler(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Internal AI route error' });
      }
    }
  });

  app.all('/api/push', async (req, res) => {
    try {
      await pushHandler(req, res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Internal push route error' });
      }
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[WMS Server] Listening on http://0.0.0.0:${port} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[WMS Server] Failed to start:', err);
  process.exit(1);
});
