import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, verifyDatabaseIntegrity } from './src/db/client.ts';
import { securityHeadersMiddleware } from './src/server/middleware.ts';
import { authRouter } from './src/server/routes/auth.ts';
import { ownerRouter } from './src/server/routes/owner.ts';
import { publicRouter } from './src/server/routes/public.ts';
import { schoolRouter } from './src/server/routes/school.ts';

async function startServer() {
  // Initialize SQLite schema, migration checksums, PRAGMAs, and RBAC catalog
  getDb();
  const integrity = verifyDatabaseIntegrity();
  if (!integrity.ok) {
    throw new Error(
      `Database integrity verification failed on startup: ${integrity.integrityCheck}`,
    );
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);

  // Scoped payload limits: allow up to 8 MB for base64 file uploads while keeping global JSON capped at 1 MB
  app.use('/api/school/files', express.json({ limit: '8mb' }));
  app.use('/api/school/profile/logo', express.json({ limit: '8mb' }));
  app.use('/api/school/students', express.json({ limit: '8mb' }));
  app.use('/api/school/teachers', express.json({ limit: '8mb' }));
  app.use('/api/school/admissions', express.json({ limit: '8mb' }));
  app.use('/api/school/finance', express.json({ limit: '8mb' }));
  app.use('/api/school/website', express.json({ limit: '8mb' }));
  app.use('/api/school/cbt', express.json({ limit: '8mb' }));
  app.use('/api/school/communications', express.json({ limit: '8mb' }));
  app.use('/api/owner/files', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      platform: 'Dave Timi EdTech Systems',
      phase: 'Version 1 — Complete Multi-School Production Release',
    });
  });

  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/api/school', schoolRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output missing. Run npm run build.');
      }
    });
  }

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('Unhandled server error:', err);
      res.status(500).json({ error: 'An internal server error occurred.' });
    },
  );

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Dave Timi EdTech Systems running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
