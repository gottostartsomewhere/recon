// Turns a saved live run into the sample file the app replays with no keys.
//
//   node scripts/check.mjs "Toptal" vendor
//   node scripts/make-demo.mjs runs/toptal-vendor.sse

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/make-demo.mjs runs/<file>.sse');
  process.exit(1);
}

const events = fs
  .readFileSync(file, 'utf8')
  .split('\n\n')
  .filter((l) => l.startsWith('data:'))
  .map((l) => JSON.parse(l.slice(5)))
  // The server announces live or sample mode itself.
  .filter((e) => e.type !== 'mode');

fs.writeFileSync('server/demo-run.json', JSON.stringify(events));
console.log(`server/demo-run.json: ${events.length} events from ${file}`);
