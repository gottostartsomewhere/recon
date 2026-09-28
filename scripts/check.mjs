// Runs one live check against a local server, saves the event stream to
// runs/, and prints the summary.
//
//   node scripts/check.mjs "Crossover" employer [port]

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [query, intent = 'general', port = process.env.PORT || 8787] = process.argv.slice(2);
if (!query) {
  console.error('usage: node scripts/check.mjs "<name>" [client|vendor|partner|employer|general] [port]');
  process.exit(1);
}

fs.mkdirSync('runs', { recursive: true });
const file = `runs/${query.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${intent}.sse`;
const t0 = Date.now();
const res = await fetch(`http://localhost:${port}/api/research`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, intent }),
});
fs.writeFileSync(file, await res.text());
console.log(`${query} / ${intent}: ${((Date.now() - t0) / 1000).toFixed(0)}s → ${file}`);
console.log(execFileSync(process.execPath, ['scripts/summarize-sse.mjs', file], { encoding: 'utf8' }));
