// Runs every case in eval/cases.json against a local server, saves each event
// stream under runs/eval/, and writes eval/results.json and eval/RESULTS.md.
//
//   PORT=8799 node server/index.js        (in another terminal)
//   node scripts/eval.mjs 8799 3          (port, parallel checks)
//   node scripts/eval.mjs 8799 3 --reuse  (re-score saved runs, no API calls)

import fs from 'node:fs';

const args = process.argv.slice(2);
const reuse = args.includes('--reuse');
const [port = 8787, concurrency = 3] = args.filter((a) => !a.startsWith('--'));
const cases = JSON.parse(fs.readFileSync('eval/cases.json', 'utf8'));
fs.mkdirSync('runs/eval', { recursive: true });

const slug = (c) => `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.intent}`;

async function runCase(c) {
  const file = `runs/eval/${slug(c)}.sse`;
  if (reuse && fs.existsSync(file)) return parse(fs.readFileSync(file, 'utf8'));
  const t0 = Date.now();
  const res = await fetch(`http://localhost:${port}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: c.name, intent: c.intent }),
  });
  const body = await res.text();
  const seconds = (Date.now() - t0) / 1000;
  // An SSE comment line carries the wall-clock time; event parsers skip it.
  const text = `: seconds=${seconds.toFixed(1)}\n\n${body}`;
  fs.writeFileSync(file, text);
  console.log(`${c.name} / ${c.intent}: ${seconds.toFixed(0)}s`);
  return parse(text);
}

function parse(text) {
  const seconds = Number(text.match(/^: seconds=([\d.]+)/)?.[1]) || null;
  const events = text
    .split('\n\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => JSON.parse(l.slice(5)));
  return { seconds, events };
}

const isStruck = (b) => b.ruling === 'unsupported' || b.ruling === 'wrong_entity';

function measure(c, { seconds, events }) {
  const by = (t) => events.filter((e) => e.type === t).map((e) => e.data);
  // Sections arrive twice (draft, then cross-examined); the last copy is final.
  const sections = [...new Map(by('section').map((s) => [s.id, s])).values()];
  const claims = sections.flatMap((s) => s.bullets.map((b) => ({ ...b, section: s.title }))).filter((b) => !b.meta);
  const count = (r) => claims.filter((b) => b.ruling === r).length;
  const sources = by('sources').at(-1) || [];
  const verdict = by('verdict')[0] || {};
  const cost = by('cost')[0] || {};
  const tools = by('log').filter((l) => /^(Searching|Reading|Mapping)/.test(l.text));
  const identity = by('identity')[0] || {};
  const tiers = {};
  for (const [model, v] of Object.entries(cost.byModel || {})) {
    const tier = (model.match(/nano|lightning|super|ultra/i)?.[0] || model).toLowerCase();
    tiers[tier] = (tiers[tier] || 0) + v.calls;
  }

  return {
    name: c.name,
    intent: c.intent,
    note: c.note || '',
    resolvedAs: identity.name || '',
    lookalikes: identity.lookalikes || [],
    error: by('error')[0]?.message || null,
    seconds,
    usd: cost.usd ?? null,
    tavilyCredits: cost.tavilyCredits ?? null,
    llmCalls: tiers,
    tavilyRequests: tools.length,
    sources: sources.length,
    setAside: sources.filter((s) => s.offTarget).length,
    claims: claims.length,
    held: count('supported'),
    corrected: count('overstated'),
    unsupported: claims.filter((b) => b.ruling === 'unsupported' && b.reason !== 'Cites no source.').length,
    uncited: claims.filter((b) => b.reason === 'Cites no source.').length,
    wrongEntity: count('wrong_entity'),
    sectionsCovered: verdict.basis?.covered ?? null,
    sectionsTotal: verdict.basis?.sections ?? sections.length,
    decision: verdict.decision || null,
    confidence: verdict.confidence ?? null,
    redFlags: (verdict.redFlags || []).map((f) => f.text),
    struck: claims.filter(isStruck).map((b) => ({ section: b.section, ruling: b.ruling, claim: b.text, reason: b.reason })),
    correctedExamples: claims
      .filter((b) => b.ruling === 'overstated' && b.original)
      .map((b) => ({ section: b.section, filed: b.original, corrected: b.text, reason: b.reason })),
  };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = measure(items[i], await fn(items[i]));
        } catch (e) {
          out[i] = { name: items[i].name, intent: items[i].intent, error: e.message };
          console.log(`${items[i].name}: failed (${e.message})`);
        }
      }
    })
  );
  return out;
}

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : 'n/a');

const results = await pool(cases, Number(concurrency), runCase);
const ok = results.filter((r) => !r.error && r.claims > 0);

const totals = {
  checks: results.length,
  completed: ok.length,
  claims: sum(ok.map((r) => r.claims)),
  held: sum(ok.map((r) => r.held)),
  corrected: sum(ok.map((r) => r.corrected)),
  unsupported: sum(ok.map((r) => r.unsupported)),
  uncited: sum(ok.map((r) => r.uncited)),
  wrongEntity: sum(ok.map((r) => r.wrongEntity)),
  sources: sum(ok.map((r) => r.sources)),
  setAside: sum(ok.map((r) => r.setAside)),
  medianSeconds: median(ok.map((r) => r.seconds)),
  medianUsd: median(ok.map((r) => r.usd)),
  totalUsd: sum(ok.map((r) => r.usd)),
  medianTavilyCredits: median(ok.map((r) => r.tavilyCredits)),
  decisions: Object.fromEntries(['proceed', 'caution', 'stop'].map((d) => [d, ok.filter((r) => r.decision === d).length])),
};
totals.struck = totals.unsupported + totals.uncited + totals.wrongEntity;

fs.writeFileSync('eval/results.json', JSON.stringify({ ranAt: new Date().toISOString(), totals, results }, null, 2));

const knownBad = ok.filter((r) => /known-bad/.test(r.note));
const row = (r) =>
  r.error && !r.claims
    ? `| ${r.name} | ${r.intent} | failed: ${r.error} | | | | | | | | |`
    : `| ${r.name} | ${r.intent} | ${r.decision} | ${r.confidence} | ${r.claims} | ${r.held} | ${r.corrected} | ${
        r.unsupported + r.uncited + r.wrongEntity
      } | ${r.setAside}/${r.sources} | ${r.seconds?.toFixed(0) ?? '?'}s | $${r.usd?.toFixed(3) ?? '?'} |`;

const md = `# Evaluation

${totals.completed} of ${totals.checks} counterparty checks completed, run on ${new Date().toISOString().slice(0, 10)} against live
NVIDIA Nemotron models on Nebius Token Factory and live Tavily search. Cases are in
[cases.json](cases.json); every number below comes from [results.json](results.json), which
\`node scripts/eval.mjs\` regenerates.

## What cross-examination caught

The drafting model (Nemotron Nano) wrote ${totals.claims} claims, every one citing a source it was shown.
Nemotron Ultra then re-read the cited pages and ruled on each one:

| Ruling | Claims | Share |
|---|---|---|
| Held up | ${totals.held} | ${pct(totals.held, totals.claims)} |
| Corrected (the source supports a narrower claim) | ${totals.corrected} | ${pct(totals.corrected, totals.claims)} |
| Struck: the source does not say it | ${totals.unsupported} | ${pct(totals.unsupported, totals.claims)} |
| Struck: about a different organisation, or not about the subject | ${totals.wrongEntity} | ${pct(totals.wrongEntity, totals.claims)} |
| Struck: cited nothing | ${totals.uncited} | ${pct(totals.uncited, totals.claims)} |

So ${pct(totals.corrected + totals.struck, totals.claims)} of cited, fluent, plausible claims would have reached the reader
wrong or overstated without the second pass. Before drafting, screening had already set aside
${totals.setAside} of ${totals.sources} exhibits (${pct(totals.setAside, totals.sources)}) as pages about other organisations.

These rulings are the judge model's, not a human audit, so read them as what the pipeline
catches rather than as ground truth. [corrections-sample.md](corrections-sample.md) reads 26 of
the corrections one by one to separate material ones from nitpicks.

## Known-bad counterparties

${knownBad.map((r) => `- **${r.name}** (${r.intent}): ${r.decision}, ${r.note.replace('known-bad: ', '')}`).join('\n')}

## Cost and speed

Median check: ${totals.medianSeconds?.toFixed(0)} s, $${totals.medianUsd?.toFixed(3)} in Nemotron inference and ${totals.medianTavilyCredits} Tavily credits.
The whole run of ${totals.completed} checks cost $${totals.totalUsd.toFixed(2)} in inference.

Decisions: ${totals.decisions.proceed} proceed, ${totals.decisions.caution} caution, ${totals.decisions.stop} stop.

## Every check

| Company | Intent | Decision | Conf | Claims | Held | Corrected | Struck | Set aside | Time | Cost |
|---|---|---|---|---|---|---|---|---|---|---|
${results.map(row).join('\n')}

## Struck claims, with the judge's reasons

${ok
  .flatMap((r) => r.struck.filter((s) => s.reason !== 'Cites no source.').map((s) => ({ ...s, name: r.name })))
  .map((s) => `- **${s.name}**, ${s.section} (${s.ruling === 'wrong_entity' ? 'wrong entity' : 'unsupported'}): "${s.claim}"\n  ${s.reason}`)
  .join('\n')}
`;
fs.writeFileSync('eval/RESULTS.md', md);
console.log(JSON.stringify(totals, null, 2));
