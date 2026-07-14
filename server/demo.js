// Scripted replay of a real research run, so Recon works with zero API keys
// (and gives a bulletproof demo video even with no network). Emits the exact
// same event stream as the live agent, paced with small delays to feel live.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(query, emit) {
  const raw = await readFile(join(__dirname, 'demo-data.json'), 'utf8');
  const data = JSON.parse(raw);

  emit('status', { phase: 'planning', label: 'Planning research' });
  emit('log', { level: 'info', text: `Target acquired · "${data.identity.name}"` });
  await sleep(500);
  emit('log', { level: 'info', text: 'Establishing identity & research plan…' });
  await sleep(700);
  emit('identity', data.identity);
  await sleep(400);

  emit('status', { phase: 'searching', label: 'Searching the open web' });
  for (const sec of data.sections) {
    emit('log', { level: 'search', text: `Searching · ${sec.title}` });
    await sleep(360);
  }
  await sleep(300);
  for (const sec of data.sections) {
    emit('log', { level: 'read', text: `Read 5 sources · ${sec.title}` });
    await sleep(160);
  }
  emit('sources', data.sources);
  await sleep(400);

  emit('log', { level: 'think', text: 'Extracting key facts…' });
  await sleep(500);
  if (data.vitals) emit('vitals', data.vitals);
  await sleep(300);

  emit('status', { phase: 'analyzing', label: 'Synthesizing dossier' });
  for (const sec of data.sections) {
    emit('log', { level: 'think', text: `Analyzing · ${sec.title}` });
    await sleep(650);
    emit('section', sec);
    await sleep(350);
  }

  emit('status', { phase: 'verdict', label: 'Forming verdict' });
  emit('log', { level: 'think', text: 'Weighing evidence & forming the bottom line…' });
  await sleep(800);
  emit('verdict', data.verdict);

  emit('status', { phase: 'done', label: 'Dossier complete' });
  emit('done', { sources: data.sources.length });
}
