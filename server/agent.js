// The Recon research agent.
//
// Flow (each step streams events to the client via `emit`):
//   1. IDENTIFY  — one LLM call to pin down what the entity is + a plan
//   2. SEARCH    — parallel web searches, one per dossier section
//   3. SYNTHESIZE— per-section LLM calls that cite the sources they used
//   4. VERDICT   — a final LLM call: bottom line + confidence score

import { groqChat, tavilySearch } from './providers.js';

const SECTIONS = [
  {
    id: 'overview',
    title: 'What They Do',
    query: (e) => `${e} company overview products services business model`,
  },
  {
    id: 'leadership',
    title: 'Leadership',
    query: (e) => `${e} CEO founders executives leadership management team board`,
  },
  {
    id: 'traction',
    title: 'Traction & Funding',
    query: (e) => `${e} funding rounds investors valuation employees users growth`,
  },
  {
    id: 'financials',
    title: 'Financials & Stock',
    query: (e) => `${e} stock price ticker market cap revenue earnings financial results annual report`,
  },
  {
    id: 'landscape',
    title: 'Competitive Landscape',
    query: (e) => `${e} main competitors alternatives market position`,
  },
  {
    id: 'risks',
    title: 'Risks & Red Flags',
    query: (e) => `${e} risks controversy lawsuit criticism regulatory concerns`,
  },
  {
    id: 'signals',
    title: 'Recent Developments',
    query: (e) => `${e} latest news recent developments 2026 announcement`,
  },
];

export async function runResearch(query, emit) {
  const entity = (query || '').trim();
  if (!entity) throw new Error('Empty query');

  emit('status', { phase: 'planning', label: 'Planning research' });
  emit('log', { level: 'info', text: `Target acquired · "${entity}"` });

  // ── 1. IDENTIFY ──────────────────────────────────────────────
  let identity = { name: entity, type: 'unknown', summary: `Research target: ${entity}` };
  try {
    emit('log', { level: 'info', text: 'Establishing identity & research plan…' });
    const p = await groqChat(
      [
        { role: 'system', content: 'You are a due-diligence research analyst. Respond ONLY with strict JSON.' },
        {
          role: 'user',
          content:
            `Identify this entity for an intelligence dossier: "${entity}".\n` +
            `Return JSON: {"name": string, "type": "company|product|person|other", "summary": one plain-English sentence describing it}. Make your best guess if unsure.`,
        },
      ],
      { json: true, temperature: 0.2 }
    );
    if (p && p.name) {
      identity = { name: String(p.name), type: p.type || 'unknown', summary: p.summary || identity.summary };
    }
  } catch (e) {
    emit('log', { level: 'warn', text: `Planner unavailable (${e.message}); using defaults.` });
  }
  emit('identity', identity);

  // ── 2. SEARCH (parallel) ─────────────────────────────────────
  emit('status', { phase: 'searching', label: 'Searching the open web' });

  const sources = [];
  const byUrl = new Map();
  const addSource = (r) => {
    if (!r.url) return null;
    if (byUrl.has(r.url)) return byUrl.get(r.url);
    const s = {
      id: sources.length + 1,
      title: r.title || r.url,
      url: r.url,
      content: r.content || '',
      domain: domainOf(r.url),
    };
    sources.push(s);
    byUrl.set(r.url, s);
    return s;
  };

  const sectionSourceIds = {};
  await Promise.all(
    SECTIONS.map(async (sec) => {
      try {
        emit('log', { level: 'search', text: `Searching · ${sec.title}` });
        const results = await tavilySearch(sec.query(identity.name), { maxResults: 5 });
        sectionSourceIds[sec.id] = results.map((r) => addSource(r)?.id).filter(Boolean);
        emit('log', { level: 'read', text: `Read ${results.length} sources · ${sec.title}` });
      } catch (e) {
        sectionSourceIds[sec.id] = [];
        emit('log', { level: 'warn', text: `Search failed · ${sec.title}: ${e.message}` });
      }
    })
  );

  // Ship the source list (minus bulky content) so the UI can render citations.
  emit('sources', sources.map(({ content, ...s }) => s));

  // ── Extract structured vitals (CEO, HQ, ticker, market cap…) ─
  emit('log', { level: 'think', text: 'Extracting key facts…' });
  const vitals = await synthVitals(identity, sources);
  if (vitals) emit('vitals', vitals);

  // ── 3. SYNTHESIZE (sequential for the build-up effect) ───────
  emit('status', { phase: 'analyzing', label: 'Synthesizing dossier' });
  const allBullets = [];
  for (const sec of SECTIONS) {
    emit('log', { level: 'think', text: `Analyzing · ${sec.title}` });
    const secSources = (sectionSourceIds[sec.id] || [])
      .map((id) => sources.find((s) => s.id === id))
      .filter(Boolean);
    const section = await synthSection(identity, sec, secSources, emit);
    emit('section', section);
    for (const b of section.bullets) allBullets.push({ section: sec.title, ...b });
  }

  // ── 4. VERDICT ───────────────────────────────────────────────
  emit('status', { phase: 'verdict', label: 'Forming verdict' });
  emit('log', { level: 'think', text: 'Weighing evidence & forming the bottom line…' });
  const verdict = await synthVerdict(identity, allBullets, sources);
  emit('verdict', verdict);

  emit('status', { phase: 'done', label: 'Dossier complete' });
  emit('done', { sources: sources.length });
}

async function synthSection(identity, sec, secSources, emit) {
  if (secSources.length === 0) {
    return {
      id: sec.id,
      title: sec.title,
      bullets: [{ text: 'No reliable sources surfaced for this section.', sources: [] }],
    };
  }
  const context = secSources
    .map((s) => `[${s.id}] ${s.title} (${s.domain})\n${(s.content || '').slice(0, 700)}`)
    .join('\n\n');
  try {
    const out = await groqChat(
      [
        {
          role: 'system',
          content:
            'You are a sharp investment / due-diligence analyst. Use ONLY the provided sources. Every bullet must be grounded and cite the source id(s) it came from. Be concrete: names, numbers, dates. Respond ONLY with strict JSON.',
        },
        {
          role: 'user',
          content:
            `Entity: ${identity.name} (${identity.type})\nSection: ${sec.title}\n\nSOURCES:\n${context}\n\n` +
            `Return JSON: {"bullets":[{"text": concise factual sentence, "sources": [source ids used]}]}. ` +
            `3-5 bullets. If sources are thin or conflict, say so honestly in a bullet. Never invent facts.`,
        },
      ],
      { json: true, temperature: 0.25 }
    );
    let bullets = Array.isArray(out?.bullets) ? out.bullets : [];
    bullets = bullets
      .filter((b) => b && b.text)
      .map((b) => ({
        text: String(b.text),
        sources: Array.isArray(b.sources) ? b.sources.filter((n) => Number.isInteger(n)) : [],
      }));
    if (bullets.length === 0) {
      bullets = [{ text: 'Analysis produced no structured findings for this section.', sources: [] }];
    }
    return { id: sec.id, title: sec.title, bullets };
  } catch (e) {
    emit('log', { level: 'warn', text: `Analysis failed · ${sec.title}: ${e.message}` });
    return {
      id: sec.id,
      title: sec.title,
      bullets: [{ text: `Could not synthesize this section (${e.message}).`, sources: [] }],
    };
  }
}

async function synthVitals(identity, sources) {
  const digest = sources
    .map((s) => `[${s.id}] ${s.title} (${s.domain})\n${(s.content || '').slice(0, 350)}`)
    .join('\n\n')
    .slice(0, 5000);
  try {
    const out = await groqChat(
      [
        {
          role: 'system',
          content:
            'You extract structured company facts from the provided sources ONLY. Respond ONLY with strict JSON. Use "Unknown" for any field the sources do not support — never guess.',
        },
        {
          role: 'user',
          content:
            `Entity: ${identity.name}\n\nSOURCES:\n${digest}\n\n` +
            `Return JSON with exactly these string keys: ` +
            `{"founded","headquarters","ceo","employees","sector","ticker","marketCap","valuation","website"}. ` +
            `"ticker": stock symbol like "NASDAQ: NVDA", or "Private" if not publicly traded. ` +
            `"marketCap": only for public companies. "valuation": last known private valuation. ` +
            `Keep values short (a few words). Use "Unknown" when unsupported.`,
        },
      ],
      { json: true, temperature: 0.1 }
    );
    return out && typeof out === 'object' ? out : null;
  } catch {
    return null;
  }
}

async function synthVerdict(identity, allBullets, sources) {
  const digest = allBullets
    .map((b) => `- (${b.section}) ${b.text}`)
    .join('\n')
    .slice(0, 4000);
  try {
    const out = await groqChat(
      [
        {
          role: 'system',
          content:
            'You are a lead analyst writing the bottom line of a due-diligence dossier. Be balanced, specific, and decisive. Respond ONLY with strict JSON.',
        },
        {
          role: 'user',
          content:
            `Entity: ${identity.name}\nFindings:\n${digest}\n\n` +
            `Based ONLY on these findings and their source coverage (${sources.length} sources), return JSON: ` +
            `{"verdict": 2-3 sentence bottom line covering the core strength and the single biggest risk, ` +
            `"confidence": integer 0-100 for how well-sourced and consistent the findings are, ` +
            `"rationale": one sentence explaining the confidence score}.`,
        },
      ],
      { json: true, temperature: 0.3 }
    );
    return {
      verdict: out?.verdict || 'Insufficient evidence to form a confident bottom line.',
      confidence: clampInt(out?.confidence, 0, 100, 50),
      rationale: out?.rationale || '',
    };
  } catch (e) {
    return { verdict: `Could not synthesize a verdict (${e.message}).`, confidence: 0, rationale: '' };
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
