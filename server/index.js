import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hasKeys, newMeter, withMeter, ProviderDown } from './providers.js';
import { runResearch } from './agent.js';
import { runDemo } from './demo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', true); // hosts like Render put the visitor's address in X-Forwarded-For
app.use(express.json());

// Every live check spends Token Factory credit (about $0.06 each), so a public
// deploy caps them per day and per visitor; past the cap the visitor gets the
// recorded sample. Unset means unlimited, for local use. Counts live in memory
// and reset on restart, so this bounds a burst rather than acting as billing.
// 0 is a real limit (sample only). When unset, a hosted deploy still gets a cap,
// because a host that ignores the blueprint's variables must not mean unlimited
// spend; only local runs default to unlimited. Render sets RENDER=true.
const hosted = Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production';
const limit = (v, fallback) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const DAILY_CAP = limit(process.env.LIVE_CHECKS_PER_DAY, hosted ? 15 : Infinity);
const PER_IP_CAP = limit(process.env.LIVE_CHECKS_PER_IP, hosted ? 3 : Infinity);
const quota = { day: '', total: 0, byIp: new Map() };

function takeLiveCheck(ip) {
  const day = new Date().toISOString().slice(0, 10);
  if (quota.day !== day) Object.assign(quota, { day, total: 0, byIp: new Map() });
  if (quota.total >= DAILY_CAP) return 'daily-cap';
  if ((quota.byIp.get(ip) || 0) >= PER_IP_CAP) return 'ip-cap';
  quota.total += 1;
  quota.byIp.set(ip, (quota.byIp.get(ip) || 0) + 1);
  return null;
}

// A check the provider refused spent nothing, so it does not count.
function refundLiveCheck(ip) {
  quota.total = Math.max(0, quota.total - 1);
  const n = quota.byIp.get(ip) || 0;
  if (n > 0) quota.byIp.set(ip, n - 1);
}

// A provider that refuses the account (bad key, no balance) refuses every
// check until someone fixes it, so for a while visitors go straight to the
// sample instead of each watching a live check fail first.
const PAUSE_MS = 10 * 60 * 1000;
let pausedUntil = 0;

// Permissive CORS (dev convenience; Vite proxies /api in normal use).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

app.get('/api/health', (_req, res) => {
  const liveLeft = DAILY_CAP === Infinity ? null : Math.max(0, DAILY_CAP - (quota.day === new Date().toISOString().slice(0, 10) ? quota.total : 0));
  res.json({ ok: true, ...hasKeys(), liveLeft, paused: Date.now() < pausedUntil });
});

app.post('/api/research', async (req, res) => {
  const { query, demo, intent } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const emit = (type, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  const keys = hasKeys();
  let sampleReason = demo
    ? 'requested'
    : !keys.nebius || !keys.tavily
      ? 'missing-keys'
      : Date.now() < pausedUntil
        ? 'unavailable'
        : null;
  if (!sampleReason && (query || '').trim()) sampleReason = takeLiveCheck(req.ip);

  try {
    if (!sampleReason) {
      // Parallel stages still in flight when a provider refuses the account
      // must not write into the sample that replaces the run.
      let live = true;
      const liveEmit = (type, data) => live && emit(type, data);
      emit('mode', { demo: false });
      const meter = newMeter();
      try {
        await withMeter(meter, () => runResearch(query || '', liveEmit, { intent, meter }));
      } catch (e) {
        if (!(e instanceof ProviderDown)) throw e;
        live = false;
        pausedUntil = Date.now() + PAUSE_MS;
        refundLiveCheck(req.ip);
        console.warn(`[recon] live checks paused for ${PAUSE_MS / 60000} min: ${e.message}`);
        sampleReason = 'unavailable';
      }
    }
    if (sampleReason) {
      emit('mode', { demo: true, reason: sampleReason });
      await runDemo(query, emit);
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
  console.log(`[recon] api on http://localhost:${PORT}  (nebius:${k.nebius ? 'on' : 'off'} tavily:${k.tavily ? 'on' : 'off'})`);
});
