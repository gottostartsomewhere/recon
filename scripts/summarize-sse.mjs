// Summarises a saved /api/research event stream: sections, citation rate,
// verdict, cost by model, warnings. Used for before/after comparisons.
//
//   curl -N -X POST localhost:8787/api/research -d '{"query":"Notion"}' \
//     -H 'Content-Type: application/json' > run.sse
//   node scripts/summarize-sse.mjs run.sse

import fs from 'node:fs';

const ev = fs
  .readFileSync(process.argv[2], 'utf8')
  .split('\n\n')
  .filter((l) => l.startsWith('data:'))
  .map((l) => JSON.parse(l.slice(5)));
const by = (t) => ev.filter((e) => e.type === t).map((e) => e.data);

const plan = by('plan')[0];
if (plan) console.log('plan    ', plan.label, '→', plan.sections.map((s) => s.id).join(', '));
console.log('identity', JSON.stringify(by('identity')[0]));
const tools = by('log').filter((l) => /^(Searching|Reading|Mapping)/.test(l.text));
console.log(`tool log (${tools.length})`);
for (const l of tools) console.log('  ', l.text.slice(0, 110));
for (const l of by('log').filter((l) => l.level === 'think' && !/^(Analyzing|Extracting|Weighing)/.test(l.text))) {
  console.log('  agent:', l.text.slice(0, 150));
}
console.log('vitals  ', JSON.stringify(by('vitals')[0]));

const sources = by('sources').at(-1) || [];
const off = sources.filter((s) => s.offTarget);
console.log(`sources ${sources.length}, set aside ${off.length}`);
for (const s of off) console.log(`   x [${s.id}] ${s.title.slice(0, 60)} → ${s.about}`);

// Sections are emitted twice (draft, then cross-examined); keep the last.
const sections = [...new Map(by('section').map((s) => [s.id, s])).values()];
const mark = { supported: '✓', overstated: '~', unsupported: '✗', wrong_entity: '⊘' };
for (const s of sections) {
  console.log(`-- ${s.title}`);
  for (const b of s.bullets) {
    console.log(`   ${mark[b.ruling] || '·'} ${b.text.slice(0, 150)} ${JSON.stringify(b.sources)}`);
    if (b.original) console.log(`       was: ${b.original.slice(0, 140)}`);
    if (b.ruling && b.ruling !== 'supported') console.log(`       why: ${b.reason}`);
  }
}
const v = by('verdict')[0] || {};
console.log(`verdict  ${v.decision} · confidence ${v.confidence}\n  ${v.verdict}\n  ${v.rationale}`);
for (const f of v.redFlags || []) console.log(`  flag: ${f.text} ${JSON.stringify(f.sources)}`);
for (const q of v.askThem || []) console.log(`  ask:  ${q}`);

const cost = by('cost')[0];
if (cost) {
  console.log(`cost    $${cost.usd.toFixed(4)} over ${cost.calls} calls, Tavily ${cost.tavilyCredits} credits`);
  for (const [model, v] of Object.entries(cost.byModel)) {
    console.log(`  ${model.padEnd(40)} ${v.calls} calls, in ${v.inTok}, out ${v.outTok}, $${v.usd.toFixed(4)}`);
  }
}
const warns = by('log').filter((l) => l.level === 'warn');
if (warns.length) console.log('warnings', warns.map((w) => w.text));
if (by('error').length) console.log('errors', JSON.stringify(by('error')));
