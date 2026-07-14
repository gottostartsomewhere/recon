import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hasKeys } from './providers.js';
import { runResearch } from './agent.js';
import { runDemo } from './demo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Permissive CORS (dev convenience; Vite proxies /api in normal use).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...hasKeys() });
});

app.post('/api/research', async (req, res) => {
  const { query, demo } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const emit = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  const keys = hasKeys();
  const useDemo = Boolean(demo) || !keys.groq || !keys.tavily;

  try {
    if (useDemo) {
      emit('mode', { demo: true, reason: keys.groq && keys.tavily ? 'requested' : 'missing-keys' });
      await runDemo(query, emit);
    } else {
      emit('mode', { demo: false });
      await runResearch(query || '', emit);
    }
  } catch (e) {
    emit('error', { message: e.message || String(e) });
  } finally {
    res.end();
  }
});

// In production, serve the built frontend from this same server (single service).
const distDir = join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  const k = hasKeys();
  console.log(`[recon] api on http://localhost:${PORT}  (groq:${k.groq ? 'on' : 'off'} tavily:${k.tavily ? 'on' : 'off'})`);
});
