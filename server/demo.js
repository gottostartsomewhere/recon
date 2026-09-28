// Replays a real recorded check (server/demo-run.json) so Recon works with zero
// API keys, and the sample shows exactly what a live check streams: the
// investigation, the drafts, the cross-examination and the decision. Paced by
// event type so it reads like a live run, in about twenty seconds.
//
// Record a new one with: node scripts/make-demo.mjs runs/<file>.sse

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PACE = {
  plan: 200,
  identity: 500,
  status: 300,
  log: 170,
  sources: 80,
  vitals: 400,
  section: 550,
  verdict: 900,
  cost: 100,
};

export async function runDemo(_query, emit) {
  const events = JSON.parse(await readFile(join(__dirname, 'demo-run.json'), 'utf8'));
  for (const { type, data } of events) {
    await sleep(PACE[type] ?? 120);
    emit(type, data);
  }
}
