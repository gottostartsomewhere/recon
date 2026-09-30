// Thin wrappers over the two services Recon depends on:
//   - Nebius Token Factory (NVIDIA Nemotron models, OpenAI-compatible REST)
//   - Tavily (web search that returns page *content*, ideal for grounding)

import { AsyncLocalStorage } from 'node:async_hooks';

const NEBIUS_URL = (process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/+$/, '');
const TAVILY_URL = 'https://api.tavily.com';

export function hasKeys() {
  return {
    nebius: !!process.env.NEBIUS_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A provider that turns the account away (bad key, no balance, plan used up)
// will turn every later call away too, so this ends a check instead of
// letting each stage degrade around it.
export class ProviderDown extends Error {
  constructor(provider, status, detail = '') {
    const who = provider === 'tavily' ? 'Tavily' : 'Token Factory';
    super(`${who} ${status}${detail ? `: ${String(detail).slice(0, 180)}` : ''}`);
    this.name = 'ProviderDown';
    this.provider = provider;
    this.status = status;
  }
}

// Work is routed by how much thinking it needs, not sent to one model:
//   fast  - Nano: identity, vitals, first-draft sections. Many small calls.
//   agent - Super: drives the investigation loop and picks the next tool call.
//   judge - Ultra: cross-examines claims against sources and signs the verdict.
// Each tier is a chain. The first id the catalogue actually lists wins, so a
// renamed or retired model degrades the dossier instead of emptying it (Groq
// did exactly that to this app in August).
export const TIERS = {
  fast: [
    process.env.NEMOTRON_FAST || 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
    'nvidia/Nemotron-3_5-Lightning',
    'nvidia/nemotron-3-super-120b-a12b',
  ],
  agent: [process.env.NEMOTRON_AGENT || 'nvidia/nemotron-3-super-120b-a12b', 'nvidia/Nemotron-3-Ultra-550b-a55b'],
  judge: [process.env.NEMOTRON_JUDGE || 'nvidia/Nemotron-3-Ultra-550b-a55b', 'nvidia/nemotron-3-super-120b-a12b'],
};

// Nemotron 3 reasons before answering by default. Extraction does not need it
// and pays for it in latency, so only the judge thinks unless told otherwise.
const THINK_DEFAULT = { fast: false, agent: false, judge: true };

// Serverless endpoints queue under load: Nano once took 12s to return
// {"ok":true} and recovered a minute later. A call that overruns its tier's
// limit benches that model for a while and moves down the chain, so one
// congested endpoint slows a single call instead of the whole check.
const TIMEOUT_MS = { fast: 12000, agent: 30000, judge: 120000 };
const BENCH_MS = 2 * 60 * 1000;
const benched = new Map(); // model id → time it may be tried again

function available(chain) {
  const now = Date.now();
  const ready = chain.filter((m) => !(benched.get(m) > now));
  return ready.length ? ready : chain;
}

// USD per 1M tokens [input, output], from the Token Factory model pages (Sept 2026).
const PRICES = [
  [/ultra/i, 1.0, 3.0],
  [/super/i, 0.3, 0.9],
  [/nano|lightning/i, 0.06, 0.24],
];

// ── Cost meter ─────────────────────────────────────────────────
// Each research run gets its own meter through AsyncLocalStorage, so parallel
// requests never share a bill and no call site has to thread it through.
const meterStore = new AsyncLocalStorage();

export function newMeter() {
  return { calls: 0, inTok: 0, outTok: 0, usd: 0, byModel: {}, tavilyCredits: 0 };
}

export function withMeter(meter, fn) {
  return meterStore.run(meter, fn);
}

function record(model, usage) {
  const m = meterStore.getStore();
  if (!m || !usage) return;
  const inTok = usage.prompt_tokens || 0;
  const outTok = usage.completion_tokens || 0;
  const [, pin = 0, pout = 0] = PRICES.find(([re]) => re.test(model)) || [];
  const usd = (inTok * pin + outTok * pout) / 1e6;
  for (const b of [m, (m.byModel[model] ||= { calls: 0, inTok: 0, outTok: 0, usd: 0 })]) {
    b.calls += 1;
    b.inTok += inTok;
    b.outTok += outTok;
    b.usd += usd;
  }
}

// ── Model catalogue ────────────────────────────────────────────
// Token Factory ids are case-sensitive and the docs disagree on casing, so
// match configured ids against /models case-insensitively and use its spelling.
let catalogue;
function listModels() {
  if (!catalogue) {
    catalogue = fetch(`${NEBIUS_URL}/models`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => new Map((d.data || []).map((m) => [m.id.toLowerCase(), m.id])))
      .catch((e) => {
        console.warn(`[recon] could not list Token Factory models (${e.message}); using configured ids`);
        catalogue = undefined; // try again on the next call
        return null;
      });
  }
  return catalogue;
}

export async function resolveTier(tier) {
  const wanted = [...new Set(TIERS[tier] || [tier])];
  const known = await listModels();
  if (!known) return wanted;
  const found = wanted.map((id) => known.get(id.toLowerCase())).filter(Boolean);
  return found.length ? found : wanted;
}

function auth() {
  return { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` };
}

// Reasoning can arrive inline as <think>…</think>; never let it reach a parser.
function stripThinking(text) {
  let t = String(text || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const close = t.lastIndexOf('</think>');
  if (close >= 0) t = t.slice(close + 8);
  return t.trim();
}

// Some deployments reject parameters they do not know. Once one does, stop
// sending that parameter for the rest of the process.
let templateKwargsRejected = false;

// Chat completion on a tier. Returns parsed JSON when `json`, the raw assistant
// message when `tools` are given, and plain text otherwise.
export async function llm(
  messages,
  { tier = 'fast', json = false, temperature = 0.3, think, tools, toolChoice, maxTokens, retries = 4, timeoutMs } = {}
) {
  if (!process.env.NEBIUS_API_KEY) throw new Error('NEBIUS_API_KEY not set');

  const chain = available(await resolveTier(tier));
  let rung = 0;
  const thinking = think ?? THINK_DEFAULT[tier] ?? false;
  const timeout = timeoutMs ?? TIMEOUT_MS[tier] ?? 60000;

  const body = { model: chain[0], messages, temperature };
  if (json) body.response_format = { type: 'json_object' };
  if (tools) {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }
  if (maxTokens) body.max_tokens = maxTokens;
  if (!templateKwargsRejected) body.chat_template_kwargs = { enable_thinking: thinking };

  for (let attempt = 0; ; attempt++) {
    let res;
    let data;
    try {
      res = await fetch(`${NEBIUS_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      // Read the body under the same deadline; a stalled stream is as slow as a stalled start.
      if (res.ok) data = await res.json();
    } catch (e) {
      if (e.name !== 'TimeoutError' && e.name !== 'AbortError') throw e;
      benched.set(body.model, Date.now() + BENCH_MS);
      if (rung < chain.length - 1) {
        rung += 1;
        body.model = chain[rung];
        console.warn(`[recon] "${chain[rung - 1]}" took over ${timeout / 1000}s, benched; using "${chain[rung]}"`);
        continue;
      }
      throw new Error(`Token Factory timed out after ${timeout / 1000}s on ${body.model}`);
    }

    if (res.status === 429 && attempt < retries) {
      const ra = parseFloat(res.headers.get('retry-after')) || 0;
      const wait = Math.min(ra > 0 ? ra : 2 * (attempt + 1), 20);
      await sleep(wait * 1000 + 300);
      continue;
    }

    // An overloaded endpoint usually recovers within seconds; retry briefly,
    // then try the next model in the chain.
    if (res.status >= 500) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (rung < chain.length - 1) {
        rung += 1;
        body.model = chain[rung];
        console.warn(`[recon] "${chain[rung - 1]}" answered ${res.status}, falling back to "${chain[rung]}"`);
        continue;
      }
    }

    if (res.status === 401 || res.status === 402) {
      throw new ProviderDown('nebius', res.status, await res.text().catch(() => ''));
    }

    // 403 may be one model closed to this account, so walk the chain before
    // concluding the whole account is refused.
    if (res.status === 400 || res.status === 403 || res.status === 404) {
      const t = await res.text().catch(() => '');
      if (body.chat_template_kwargs && /chat_template_kwargs|enable_thinking/i.test(t)) {
        templateKwargsRejected = true;
        delete body.chat_template_kwargs;
        continue;
      }
      if (rung < chain.length - 1) {
        rung += 1;
        body.model = chain[rung];
        console.warn(`[recon] "${chain[rung - 1]}" answered ${res.status}, falling back to "${chain[rung]}"`);
        continue;
      }
      if (res.status === 403) throw new ProviderDown('nebius', 403, t);
      throw new Error(`Token Factory ${res.status}: ${t.slice(0, 180)}`);
    }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Token Factory ${res.status}: ${t.slice(0, 180)}`);
    }

    record(data.model || body.model, data.usage);
    const msg = data.choices?.[0]?.message || {};
    if (tools) return { ...msg, content: stripThinking(msg.content), model: data.model || body.model };
    const content = stripThinking(msg.content);
    return json ? safeJson(content) : content;
  }
}

// ── Tavily ─────────────────────────────────────────────────────
// `estimate` is the documented credit price, used when a response carries no
// usage block, so the meter never silently reads zero.
async function tavily(path, payload, estimate) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY not set');

  const res = await fetch(`${TAVILY_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...payload, include_usage: true }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    // 401 and 403 are a bad key; 432 and 433 mean the plan's or pay-as-you-go credits are used up.
    if ([401, 403, 432, 433].includes(res.status)) throw new ProviderDown('tavily', res.status, t);
    throw new Error(`Tavily ${path} ${res.status}: ${t.slice(0, 180)}`);
  }
  const data = await res.json();
  const m = meterStore.getStore();
  if (m) m.tavilyCredits += Number(data.usage?.credits ?? estimate) || 0;
  return data;
}

export async function tavilySearch(query, { maxResults = 5, topic, timeRange } = {}) {
  const data = await tavily(
    'search',
    {
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
      ...(topic && { topic }),
      ...(timeRange && { time_range: timeRange }),
    },
    1
  );
  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    published: r.published_date || null,
  }));
}

// Full page text. With `query`, Tavily returns only the chunks most relevant to
// it, which keeps a long terms page or annual report inside a prompt budget.
export async function tavilyExtract(urls, { query } = {}) {
  const list = [].concat(urls);
  const data = await tavily(
    'extract',
    { urls: list, extract_depth: 'basic', format: 'text', ...(query && { query, chunks_per_source: 3 }) },
    Math.ceil(list.length / 5)
  );
  return (data.results || []).map((r) => ({ url: r.url, content: r.raw_content || '' }));
}

// Page URLs on one site, for finding about / team / legal / careers pages.
export async function tavilyMap(url, { limit = 40 } = {}) {
  const data = await tavily('map', { url, max_depth: 1, limit, allow_external: false }, Math.ceil(limit / 10));
  return data.results || [];
}

// LLMs occasionally wrap JSON in prose or code fences — recover gracefully.
export function safeJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* give up */
    }
  }
  return null;
}
