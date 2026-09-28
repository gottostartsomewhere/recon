// The Recon counterparty investigator.
//
// Flow (each step streams events to the client via `emit`):
//   1. IDENTIFY    — one search + Nano: which organisation exactly, its official
//                    domain, and similarly named ones to keep out of the file
//   2. SWEEP       — one parallel search per section the user's intent calls for
//   3. INVESTIGATE — Nemotron Super runs a tool loop (search / read / map_site)
//                    over Tavily to fill the gaps the sweep left, then screens
//                    out every exhibit about a different organisation
//   4. DRAFT       — Nano writes each section, citing only what it was shown
//   5. CROSS-EXAMINE — Ultra re-reads every cited page and rules on each claim;
//                    unsupported and wrong-entity claims are struck
//   6. VERDICT     — Ultra decides from surviving claims only; confidence is
//                    computed from what survived, not self-reported

import { llm, safeJson, tavilySearch, tavilyExtract, tavilyMap } from './providers.js';
import { resolveIntent } from './intents.js';

// The investigator's budget. Every tool call is a Tavily request, so this is
// what bounds both latency and credits for a single check.
const MAX_TURNS = 4;
const MAX_TOOL_CALLS = 10;
const MAX_CALLS_PER_SECTION = 2;

export async function runResearch(query, emit, { intent: intentId, meter } = {}) {
  const entity = (query || '').trim();
  if (!entity) throw new Error('Empty query');
  const intent = resolveIntent(intentId);
  const ledger = new Ledger(emit);

  emit('status', { phase: 'planning', label: 'Planning research' });
  emit('log', { level: 'info', text: `Target acquired · "${entity}" · ${intent.label}` });
  emit('plan', {
    intent: intent.id,
    label: intent.label,
    sections: intent.sections.map(({ id, title }) => ({ id, title })),
  });

  // ── 1. IDENTIFY ──────────────────────────────────────────────
  emit('log', { level: 'info', text: 'Establishing identity…' });
  const identity = await identify(entity, ledger, emit);
  emit('identity', identity);
  if (identity.lookalikes.length) {
    emit('log', { level: 'info', text: `Excluding look-alikes · ${identity.lookalikes.join(', ')}` });
  }

  // ── 2. SWEEP (parallel) ──────────────────────────────────────
  emit('status', { phase: 'searching', label: 'Searching the open web' });
  await Promise.all(
    intent.sections.map((sec) =>
      ledger.search(sec.seed(identity.name), sec.id, { maxResults: 5, ...sec.search }).catch((e) => {
        emit('log', { level: 'warn', text: `Search failed · ${sec.title}: ${e.message}` });
      })
    )
  );
  ledger.publish();

  // ── 3. INVESTIGATE ───────────────────────────────────────────
  await investigate(identity, intent, ledger, emit);
  await screenSources(identity, ledger, emit);
  ledger.publish();

  emit('log', { level: 'think', text: 'Extracting key facts…' });
  const vitals = await synthVitals(identity, ledger.onTarget());
  if (vitals) emit('vitals', vitals);

  // ── 4. DRAFT (sequential for the build-up effect) ────────────
  emit('status', { phase: 'analyzing', label: 'Synthesizing dossier' });
  const drafts = [];
  for (const sec of intent.sections) {
    emit('log', { level: 'think', text: `Analyzing · ${sec.title}` });
    const section = await synthSection(identity, intent, sec, ledger.forSection(sec.id), emit);
    emit('section', section);
    drafts.push(section);
  }

  // ── 5. CROSS-EXAMINE (parallel) ──────────────────────────────
  // A citation shows where a claim came from, not that the source says it or
  // that it is about the right organisation. Ultra re-reads every cited page.
  emit('status', { phase: 'verifying', label: 'Cross-examining claims' });
  const sections = await Promise.all(drafts.map((sec) => crossExamine(identity, sec, ledger, emit)));
  for (const sec of sections) emit('section', sec);

  // ── 6. VERDICT ───────────────────────────────────────────────
  emit('status', { phase: 'verdict', label: 'Forming verdict' });
  emit('log', { level: 'think', text: 'Weighing evidence & forming the bottom line…' });
  const standing = sections.flatMap((sec) =>
    sec.bullets.filter((b) => b.sources.length && !isStruck(b)).map((b) => ({ section: sec.title, ...b }))
  );
  const verdict = await synthVerdict(identity, intent, standing, ledger.onTarget().length);
  emit('verdict', { ...verdict, ...scoreConfidence(sections, ledger) });

  if (meter) emit('cost', meter);
  emit('status', { phase: 'done', label: 'Dossier complete' });
  emit('done', { sources: ledger.sources.length });
}

// Every page the investigation touches, numbered once, and filed under each
// section it was found for. Ids are what the dossier cites.
class Ledger {
  constructor(emit) {
    this.emit = emit;
    this.sources = [];
    this.byUrl = new Map();
    this.sections = new Map();
  }

  add(r, section) {
    if (!r.url) return null;
    let s = this.byUrl.get(r.url);
    if (!s) {
      s = {
        id: this.sources.length + 1,
        title: r.title || titleFromUrl(r.url),
        url: r.url,
        domain: domainOf(r.url),
        content: r.content || '',
        full: '',
        published: r.published || null,
      };
      this.sources.push(s);
      this.byUrl.set(r.url, s);
    }
    if (section) {
      if (!this.sections.has(section)) this.sections.set(section, new Set());
      this.sections.get(section).add(s.id);
    }
    return s;
  }

  async search(query, section, opts) {
    this.emit('log', { level: 'search', text: `Searching · ${query}` });
    const results = await tavilySearch(query, opts);
    const added = results.map((r) => this.add(r, section)).filter(Boolean);
    this.emit('log', { level: 'read', text: `Read ${added.length} sources · ${section}` });
    return added;
  }

  async read({ sourceId, url }, section, focus) {
    const known = sourceId ? this.sources.find((s) => s.id === Number(sourceId)) : null;
    const target = known?.url || url;
    if (!target) throw new Error('read needs a source_id or url');
    this.emit('log', { level: 'read', text: `Reading · ${domainOf(target)}${pathOf(target)}` });
    const [page] = await tavilyExtract(target, { query: focus });
    if (!page?.content) throw new Error('page could not be read');
    const s = known || this.add({ url: target }, section);
    if (section) this.add({ url: s.url }, section);
    s.full = page.content;
    return s;
  }

  async map(url) {
    this.emit('log', { level: 'search', text: `Mapping site · ${domainOf(url)}` });
    return tavilyMap(url);
  }

  forSection(id) {
    return [...(this.sections.get(id) || [])].map((sid) => this.sources[sid - 1]).filter((s) => s && !s.offTarget);
  }

  onTarget() {
    return this.sources.filter((s) => !s.offTarget);
  }

  // The source list minus bulky text, so the UI can render citations.
  publish() {
    this.emit(
      'sources',
      this.sources.map(({ content, full, ...s }) => s)
    );
  }
}

async function identify(entity, ledger, emit) {
  const identity = { name: entity, type: 'unknown', summary: `Research target: ${entity}`, domain: '', aliases: [], lookalikes: [] };
  try {
    const hits = await ledger.search(`${entity} official website company`, 'identity', { maxResults: 10 });
    const context = hits.map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.content.slice(0, 400)}`).join('\n\n');
    const p = await llm(
      [
        { role: 'system', content: 'You are a due-diligence analyst resolving which organisation a user means. Respond ONLY with strict JSON.' },
        {
          role: 'user',
          content:
            `The user typed: "${entity}".\n\nSEARCH RESULTS:\n${context}\n\n` +
            `Identify the single organisation they most likely mean. Then separate two lists, because mixing ` +
            `them up is the most damaging error a check can make:\n` +
            `- aliases: other names that belong to the SAME organisation (legal name, former names, brand or ` +
            `product names, "X for Work", "X Labs, Inc.").\n` +
            `- lookalikes: DIFFERENT organisations or products in these results whose name resembles "${entity}", ` +
            `each with what it is. A web page about the subject (its LinkedIn, Crunchbase, reviews) is not a lookalike.\n` +
            `Return JSON: {"name": common name, "legalName": registered name if shown else "", ` +
            `"type": "company|person|product|other", "domain": official website domain if shown else "", ` +
            `"summary": one plain-English sentence, "aliases": [names], ` +
            `"lookalikes": [{"name": name, "what": what that other organisation or product is, in a few words}]}.`,
        },
      ],
      { tier: 'agent', json: true, temperature: 0.1 }
    );
    if (p?.name) {
      identity.name = String(p.name);
      identity.legalName = p.legalName || '';
      identity.type = p.type || 'unknown';
      identity.domain = String(p.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      identity.summary = p.summary || identity.summary;
      const own = new Set(
        [identity.name, identity.legalName, ...(Array.isArray(p.aliases) ? p.aliases : [])]
          .map((a) => String(a || '').toLowerCase().trim())
          .filter(Boolean)
      );
      identity.aliases = [...own].filter((a) => a !== identity.name.toLowerCase()).slice(0, 6);
      // A lookalike must say what it is, and must not be one of the subject's
      // own names; that is what separates another company from a page about this one.
      identity.lookalikes = (Array.isArray(p.lookalikes) ? p.lookalikes : [])
        .filter((l) => l?.name && l?.what && !own.has(String(l.name).toLowerCase().trim()))
        .map((l) => `${l.name} (${l.what})`)
        .slice(0, 8);
    }
  } catch (e) {
    emit('log', { level: 'warn', text: `Identity check unavailable (${e.message}); using the name as typed.` });
  }
  return identity;
}

function subjectLine(identity) {
  const who = identity.legalName ? `${identity.name} (${identity.legalName})` : identity.name;
  // What the subject does is how a reader notices that a healthcare merger
  // does not belong in a recruiter's file, so it travels with the name.
  const site = `${identity.domain ? `, official site ${identity.domain}` : ''}${identity.type !== 'unknown' ? `: ${identity.summary.replace(/\.\s*$/, '')}` : ''}`;
  const aka = identity.aliases?.length ? ` Also known as: ${identity.aliases.join('; ')}.` : '';
  const not = identity.lookalikes.length
    ? ` Different organisations with similar names, which must be ignored: ${identity.lookalikes.join('; ')}.`
    : '';
  return `The subject is ${who}${site}.${aka}${not}`;
}

// ── Investigator ─────────────────────────────────────────────────
function investigatorTools(sectionIds) {
  const section = { type: 'string', enum: sectionIds, description: 'Which section this evidence is for' };
  return [
    {
      type: 'function',
      function: {
        name: 'search',
        description:
          'Web search. Write a specific query that names the subject and the fact you need. Results are filed under the given section.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            section,
            recent: { type: 'boolean', description: 'Only news from the last twelve months' },
          },
          required: ['query', 'section'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read',
        description:
          'Read the full text of a page: an exhibit already found (by source_id) or any URL, such as one from map_site. ' +
          'Use it when a snippet hints at an important fact but cuts off.',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'integer' },
            url: { type: 'string' },
            section,
            focus: { type: 'string', description: 'What to look for on the page' },
          },
          required: ['section', 'focus'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'map_site',
        description:
          "List pages on the subject's own website, to find about, team, legal, careers or contact pages. Use at most once.",
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'finish',
        description: 'Call when every section has solid evidence, or more searching would not change the picture.',
        parameters: { type: 'object', properties: { gaps: { type: 'string', description: 'What is still unknown' } } },
      },
    },
  ];
}

function ledgerView(intent, ledger) {
  return intent.sections
    .map((sec) => {
      const found = ledger.forSection(sec.id);
      const lines = found.length
        ? found.map((s) => `  [${s.id}] ${s.title} (${s.domain}) ${s.content.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n')
        : '  (nothing yet)';
      return `## ${sec.id}: ${sec.title}\nGoal: ${sec.goal}\nExhibits:\n${lines}`;
    })
    .join('\n\n');
}

async function investigate(identity, intent, ledger, emit) {
  const sectionIds = intent.sections.map((s) => s.id);
  const tools = investigatorTools(sectionIds);
  const messages = [
    {
      role: 'system',
      content:
        `You are the lead investigator on a counterparty check. The user is about to ${intent.action}. ` +
        `${subjectLine(identity)} ` +
        `Your only job is to gather evidence with tool calls; do not write the report. The first sweep of searches ` +
        `is below. Find what is missing or thin, and chase anything that looks like a red flag until it is confirmed ` +
        `or ruled out. Prefer primary sources: registries, court records, regulators, the subject's own site, reputable press. ` +
        `Spread the effort: every section with fewer than three exhibits about the subject gets a call before you ` +
        `go deeper on any one section, and if two searches for the same fact come back empty, move on. ` +
        `You may spend ${MAX_TOOL_CALLS} tool calls in total. Make independent calls in parallel. Call finish when done.`,
    },
    { role: 'user', content: `EVIDENCE SO FAR:\n\n${ledgerView(intent, ledger)}\n\nWhat is missing? Call tools.` },
  ];

  emit('status', { phase: 'searching', label: 'Investigating' });
  let spent = 0;
  // Asked to spread its effort, Super still spent a whole budget hunting one
  // registry number, so the spread is enforced here rather than requested.
  const perSection = Object.fromEntries(sectionIds.map((id) => [id, 0]));
  const thinnest = () =>
    sectionIds
      .filter((id) => perSection[id] < MAX_CALLS_PER_SECTION)
      .sort((a, b) => ledger.forSection(a).length - ledger.forSection(b).length)
      .slice(0, 3)
      .join(', ');
  for (let turn = 0; turn < MAX_TURNS && spent < MAX_TOOL_CALLS; turn++) {
    let msg;
    try {
      msg = await llm(messages, { tier: 'agent', tools, temperature: 0.2 });
    } catch (e) {
      emit('log', { level: 'warn', text: `Investigator unavailable (${e.message}); filing with the sweep alone.` });
      return;
    }
    const calls = msg.tool_calls || [];
    if (msg.content) emit('log', { level: 'think', text: msg.content.replace(/\s+/g, ' ').slice(0, 160) });
    if (calls.length === 0) return;

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    let finished = false;
    const results = await Promise.all(
      calls.map(async (call) => {
        const name = call.function?.name;
        const args = safeJson(call.function?.arguments) || {};
        if (name === 'finish') {
          finished = true;
          if (args.gaps) emit('log', { level: 'info', text: `Investigator done · gaps: ${String(args.gaps).slice(0, 140)}` });
          return 'Noted.';
        }
        if (spent >= MAX_TOOL_CALLS) return 'Budget exhausted; call finish.';
        const section = sectionIds.includes(args.section) ? args.section : sectionIds[0];
        if (name !== 'map_site' && perSection[section] >= MAX_CALLS_PER_SECTION) {
          return `Not run: ${section} has had its share of the budget. Work on the thinnest sections instead: ${thinnest()}.`;
        }
        spent += 1;
        if (name !== 'map_site') perSection[section] += 1;
        try {
          return await runTool(name, args, section, ledger, identity);
        } catch (e) {
          emit('log', { level: 'warn', text: `${name} failed: ${e.message}` });
          return `Error: ${e.message}`;
        }
      })
    );
    calls.forEach((call, i) => messages.push({ role: 'tool', tool_call_id: call.id, content: results[i] }));
    ledger.publish();
    if (finished) return;
  }
}

async function runTool(name, args, section, ledger, identity) {
  if (name === 'search') {
    const found = await ledger.search(String(args.query || identity.name), section, {
      maxResults: 5,
      ...(args.recent && { topic: 'news', timeRange: 'year' }),
    });
    if (found.length === 0) return 'No results.';
    return found.map((s) => `[${s.id}] ${s.title} (${s.domain}${s.published ? `, ${s.published}` : ''}) ${s.content.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
  }
  if (name === 'read') {
    const s = await ledger.read({ sourceId: args.source_id, url: args.url }, section, String(args.focus || ''));
    return `[${s.id}] ${s.title} (${s.domain})\n${s.full.replace(/\s+/g, ' ').slice(0, 1500)}`;
  }
  if (name === 'map_site') {
    const url = String(args.url || identity.domain || '');
    if (!url) return 'No official site known.';
    const pages = await ledger.map(url.startsWith('http') ? url : `https://${url}`);
    return pages.slice(0, 40).join('\n') || 'No pages found.';
  }
  return `Unknown tool ${name}.`;
}

// Search engines match names, not organisations. Before anything is written,
// set aside every exhibit about someone else, so a crypto exchange's funding
// round never lands in a recruiter's file.
async function screenSources(identity, ledger, emit) {
  const list = ledger.sources
    .map((s) => `[${s.id}] ${s.title} (${s.url})\n${(s.full || s.content).replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n\n');
  emit('log', { level: 'think', text: 'Screening exhibits for look-alike organisations…' });
  try {
    const out = await llm(
      [
        {
          role: 'system',
          content: 'You screen research sources for a due-diligence file, keeping out anything about the wrong organisation. Respond ONLY with strict JSON.',
        },
        {
          role: 'user',
          content:
            `${subjectLine(identity)}\n\nSOURCES:\n${list}\n\n` +
            `List every source that is NOT about the subject: pages about a different organisation, product or ` +
            `person that shares or resembles the name (a page about a company in a different line of business ` +
            `from the subject's description is almost always one), and general articles or guides that never mention the ` +
            `subject (industry news, how-to pages, statistics). Pages under any of the subject's names or aliases ` +
            `ARE about the subject. Keep a source if it makes any specific statement about the subject, including ` +
            `negative ones. When unsure, keep it. ` +
            `Return JSON {"offTarget":[{"id": source id, "about": what it is actually about, in a few words}]}.`,
        },
      ],
      { tier: 'agent', json: true, temperature: 0 }
    );
    const own = identity.domain.toLowerCase();
    const off = (Array.isArray(out?.offTarget) ? out.offTarget : []).filter((o) => {
      const s = ledger.sources[Number(o?.id) - 1];
      // The subject's own site is never someone else's page.
      return s && !(own && (s.domain === own || s.domain.endsWith(`.${own}`)));
    });
    // Screening that discards most of the file has misread who the subject is;
    // trust cross-examination instead of emptying the dossier.
    if (off.length > 0.7 * ledger.sources.length) {
      emit('log', {
        level: 'warn',
        text: `Screening flagged ${off.length} of ${ledger.sources.length} exhibits; ignoring it and relying on cross-examination.`,
      });
      return;
    }
    for (const o of off) {
      const s = ledger.sources[Number(o.id) - 1];
      s.offTarget = true;
      s.about = String(o.about || '');
    }
    if (off.length) {
      emit('log', {
        level: 'info',
        text: `Set aside ${off.length} exhibits about others · ${off.slice(0, 4).map((o) => o.about).join('; ')}`,
      });
    }
  } catch (e) {
    emit('log', { level: 'warn', text: `Screening unavailable (${e.message}); cross-examination will catch mix-ups.` });
  }
}

// ── Writing ─────────────────────────────────────────────────────
async function synthSection(identity, intent, sec, secSources, emit) {
  if (secSources.length === 0) {
    return {
      id: sec.id,
      title: sec.title,
      bullets: [{ text: 'No reliable sources surfaced for this section.', sources: [], meta: true }],
    };
  }
  // Pages the investigator read in full carry more text than search snippets.
  const context = secSources
    .slice(0, 12)
    .map((s) => `[${s.id}] ${s.title} (${s.domain})\n${(s.full || s.content || '').replace(/\s+/g, ' ').slice(0, s.full ? 1500 : 700)}`)
    .join('\n\n');

  // Models know well-known companies from pretraining and will happily write a
  // fluent, uncited overview from memory. That is exactly what this product
  // claims not to do, so name the legal ids and refuse anything outside them.
  const allowedIds = secSources.slice(0, 12).map((s) => s.id);
  const allowed = new Set(allowedIds);

  try {
    const out = await llm(
      [
        {
          role: 'system',
          content:
            'You are a careful due-diligence analyst. Use ONLY the provided sources. ' +
            'You are forbidden from using anything you know about the entity from memory: if a fact ' +
            'is not stated in the sources below, it does not go in the dossier. Every bullet must cite ' +
            'the source id(s) it came from. Be concrete: names, numbers, dates. Respond ONLY with strict JSON.',
        },
        {
          role: 'user',
          content:
            `The user is about to ${intent.action}. ${subjectLine(identity)}\n` +
            `Section: ${sec.title}\nWhat this section must establish: ${sec.goal}\n\nSOURCES:\n${context}\n\n` +
            `Return JSON: {"bullets":[{"text": concise factual sentence, "sources": [source ids used]}]}. ` +
            `3-5 bullets, most decision-relevant first. ` +
            `Skip any source that is about a different organisation. ` +
            `The ONLY valid source ids are: ${allowedIds.join(', ')}. ` +
            `Every bullet MUST cite at least one of them, and cite the id shown in brackets above, ` +
            `not the position in the list. Drop any claim you cannot attribute to one of these sources. ` +
            `If sources are thin or conflict, say so honestly in a bullet and cite what you do have. Never invent facts.`,
        },
      ],
      { tier: 'fast', json: true, temperature: 0.25 }
    );
    let bullets = Array.isArray(out?.bullets) ? out.bullets : [];
    bullets = bullets
      .filter((b) => b && b.text)
      .map((b) => ({
        text: String(b.text),
        // Keep only ids actually shown to the model for this section, which
        // drops positional and invented ids.
        sources: sourceIds(b.sources ?? b.source).filter((n) => allowed.has(n)),
      }));
    if (bullets.length === 0) {
      bullets = [{ text: 'Analysis produced no structured findings for this section.', sources: [], meta: true }];
    }
    return { id: sec.id, title: sec.title, bullets };
  } catch (e) {
    emit('log', { level: 'warn', text: `Analysis failed · ${sec.title}: ${e.message}` });
    return {
      id: sec.id,
      title: sec.title,
      bullets: [{ text: `Could not synthesize this section (${e.message}).`, sources: [], meta: true }],
    };
  }
}

async function synthVitals(identity, sources) {
  // Key facts (CEO, HQ, founding date) are often in later sources, so send a
  // wide digest; Nano's context makes this cheap.
  const digest = sources
    .map((s) => `[${s.id}] ${s.title} (${s.domain})\n${(s.full || s.content || '').replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n\n')
    .slice(0, 16000);
  try {
    const out = await llm(
      [
        {
          role: 'system',
          content:
            'You extract structured organisation facts from the provided sources ONLY. Respond ONLY with strict JSON. Use "Unknown" for any field the sources do not support — never guess.',
        },
        {
          role: 'user',
          content:
            `${subjectLine(identity)}\n\nSOURCES:\n${digest}\n\n` +
            `Return JSON with exactly these string keys: ` +
            `{"legalName","registration","founded","headquarters","ceo","employees","sector","ticker","website"}. ` +
            `"registration": incorporation jurisdiction and registration number if stated (e.g. "Delaware corporation", "CIN U72200KA2015PTC..."). ` +
            `"ticker": stock symbol like "NASDAQ: NVDA", or "Private" if not publicly traded. ` +
            `Ignore facts about the look-alike organisations. Keep values short (a few words). Use "Unknown" when unsupported.`,
        },
      ],
      { tier: 'fast', json: true, temperature: 0.1 }
    );
    return out && typeof out === 'object' ? out : null;
  } catch {
    return null;
  }
}

// ── Cross-examination ───────────────────────────────────────────
const RULINGS = new Set(['supported', 'overstated', 'unsupported', 'wrong_entity']);
const isStruck = (b) => b.ruling === 'unsupported' || b.ruling === 'wrong_entity';

// A claim with no citation never reaches the judge; it is struck outright.
const uncited = (b) => (b.meta ? b : { ...b, ruling: 'unsupported', reason: 'Cites no source.' });

async function crossExamine(identity, section, ledger, emit) {
  if (!section.bullets.some((b) => b.sources.length)) {
    return { ...section, bullets: section.bullets.map(uncited), examined: true };
  }
  const cited = [...new Set(section.bullets.flatMap((b) => b.sources))].map((id) => ledger.sources[id - 1]).filter(Boolean);
  const evidence = cited
    .map((s) => `[${s.id}] ${s.title} (${s.url})\n${(s.full || s.content).replace(/\s+/g, ' ').slice(0, 2000)}`)
    .join('\n\n');
  const claims = section.bullets
    .map((b, i) => `${i + 1}. ${b.text} [cites ${b.sources.join(', ') || 'nothing'}]`)
    .join('\n');

  emit('log', { level: 'think', text: `Cross-examining · ${section.title}` });
  try {
    const out = await llm(
      [
        {
          role: 'system',
          content:
            'You are an adversarial fact-checker reviewing a due-diligence file before it is signed. For each claim, ' +
            'read ONLY the sources it cites, and rule strictly: a claim is not supported because it sounds plausible ' +
            'or because you know it to be true. Respond ONLY with strict JSON.',
        },
        {
          role: 'user',
          content:
            `${subjectLine(identity)}\nSection: ${section.title}\n\nCITED SOURCES:\n${evidence}\n\nCLAIMS:\n${claims}\n\n` +
            `Rule on every numbered claim:\n` +
            `- "supported": the cited sources state it, and they are about this subject.\n` +
            `- "overstated": the sources support only a weaker or narrower version, e.g. one report written up as ` +
            `"multiple", an opinion written up as fact, scammers impersonating the subject written up as the subject's ` +
            `own conduct, or a general article applied to the subject. Give the corrected wording.\n` +
            `- "unsupported": the cited sources do not say it, contradict it, or it is placeholder or template text.\n` +
            `- "wrong_entity": the cited sources are about a different organisation, or the claim is not about ` +
            `this subject at all (a general article, an industry statistic, other companies' cases).\n` +
            `Return JSON {"rulings":[{"n": claim number, "ruling": one of the four, "reason": one short sentence, ` +
            `"corrected": corrected claim text, or "" unless overstated}]}.`,
        },
      ],
      { tier: 'judge', json: true, temperature: 0.1 }
    );
    const rulings = new Map((Array.isArray(out?.rulings) ? out.rulings : []).map((r) => [Number(r?.n), r]));
    const bullets = section.bullets.map((b, i) => {
      if (!b.sources.length) return uncited(b);
      const r = rulings.get(i + 1);
      if (!r || !RULINGS.has(r.ruling)) return { ...b, ruling: null };
      const ruled = { ...b, ruling: r.ruling, reason: String(r.reason || '') };
      if (r.ruling === 'overstated' && r.corrected) {
        ruled.original = b.text;
        ruled.text = String(r.corrected);
      }
      return ruled;
    });
    const struck = bullets.filter(isStruck).length;
    const softened = bullets.filter((b) => b.ruling === 'overstated').length;
    if (struck || softened) {
      emit('log', { level: 'info', text: `${section.title} · struck ${struck}, corrected ${softened}` });
    }
    return { ...section, bullets, examined: true };
  } catch (e) {
    emit('log', { level: 'warn', text: `Cross-examination failed · ${section.title}: ${e.message}` });
    return section;
  }
}

// Confidence comes from what survived cross-examination, not from asking the
// model how sure it feels: the model reported 85 on a file that was mostly
// about the wrong company.
function scoreConfidence(sections, ledger) {
  const ruled = sections.flatMap((s) => s.bullets.filter((b) => b.ruling));
  const count = (r) => ruled.filter((b) => b.ruling === r).length;
  const supported = count('supported');
  const overstated = count('overstated');
  const struck = count('unsupported') + count('wrong_entity');
  const covered = sections.filter((s) => s.bullets.some((b) => b.ruling && !isStruck(b))).length;
  const domains = new Set(
    sections
      .flatMap((s) => s.bullets.filter((b) => b.ruling && !isStruck(b)).flatMap((b) => b.sources))
      .map((id) => ledger.sources[id - 1]?.domain)
      .filter(Boolean)
  );

  // Multiplied, not averaged, so no single strength can hide a hole: a file
  // whose few claims all hold up but covers one section in five stays low.
  const survival = ruled.length ? (supported + 0.5 * overstated) / ruled.length : 0;
  const coverage = sections.length ? covered / sections.length : 0;
  const diversity = Math.min(1, domains.size / 8);
  const confidence = Math.round(100 * survival * (0.4 + 0.6 * coverage) * (0.6 + 0.4 * diversity));

  return {
    confidence,
    rationale:
      `${supported} of ${ruled.length} claims held up under cross-examination` +
      `${overstated ? `, ${overstated} corrected` : ''}${struck ? `, ${struck} struck` : ''}; ` +
      `${covered} of ${sections.length} sections stand on evidence from ${domains.size} independent sites.`,
    basis: { claims: ruled.length, supported, overstated, struck, sections: sections.length, covered, domains: domains.size },
  };
}

const DECISIONS = new Set(['proceed', 'caution', 'stop']);

async function synthVerdict(identity, intent, standing, sourceCount) {
  const digest = standing
    .map((b) => `- (${b.section}) ${b.text} [${b.sources.join(', ')}]`)
    .join('\n')
    .slice(0, 9000);
  try {
    const out = await llm(
      [
        {
          role: 'system',
          content:
            'You are the lead analyst signing off a counterparty check. Be balanced, specific and decisive, ' +
            'and weigh evidence by how directly it bears on the decision in front of the user. "stop" is for ' +
            "evidence of the subject's own misconduct or inability to perform, not for scammers impersonating it, " +
            'ordinary product complaints, or lawsuits that any company its size carries. Respond ONLY with strict JSON.',
        },
        {
          role: 'user',
          content:
            `The user is about to ${intent.action}. ${subjectLine(identity)}\n\n` +
            `Findings that survived cross-examination (with source ids):\n${digest}\n\n` +
            `Based ONLY on these findings (${sourceCount} sources in the file), return JSON: ` +
            `{"decision": "proceed" | "caution" | "stop", ` +
            `"verdict": 2-3 sentence bottom line for this decision, naming the strongest reassurance and the biggest risk, ` +
            `"redFlags": [{"text": one sentence, "sources": [ids]}] (empty if none), ` +
            `"askThem": [2-4 specific questions to ask or documents to request from them before going ahead]}.`,
        },
      ],
      { tier: 'judge', json: true, temperature: 0.3 }
    );
    return {
      decision: DECISIONS.has(out?.decision) ? out.decision : 'caution',
      verdict: out?.verdict || 'Insufficient evidence to form a confident bottom line.',
      redFlags: Array.isArray(out?.redFlags)
        ? out.redFlags.filter((f) => f?.text).map((f) => ({ text: String(f.text), sources: sourceIds(f.sources) }))
        : [],
      askThem: Array.isArray(out?.askThem) ? out.askThem.map(String).slice(0, 4) : [],
    };
  } catch (e) {
    return { decision: 'caution', verdict: `Could not synthesize a verdict (${e.message}).`, redFlags: [], askThem: [] };
  }
}

// Models return citations as [3], ["3"], "3, 5", "[3]" or [{id: 3}]; read the
// integers out of whatever shape arrived.
function sourceIds(raw) {
  const ids = String(JSON.stringify(raw ?? '')).match(/\d+/g) || [];
  return [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function pathOf(url) {
  try {
    const p = new URL(url).pathname;
    return p === '/' ? '' : p;
  } catch {
    return '';
  }
}

function titleFromUrl(url) {
  return `${domainOf(url)}${pathOf(url)}`;
}
