// Thin wrappers over the two free services Recon depends on:
//   - Groq   (LLM inference, OpenAI-compatible REST)
//   - Tavily (web search that returns page *content*, ideal for grounding)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TAVILY_URL = 'https://api.tavily.com/search';

export function hasKeys() {
  return {
    groq: !!process.env.GROQ_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq retires hosted models without much notice — llama-3.3-70b-versatile
// vanished from under this app and every call started answering 404. Keep a
// chain so one retirement degrades the dossier instead of emptying it.
const MODEL_PRIMARY = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || 'openai/gpt-oss-20b';

// gpt-oss models burn completion tokens on hidden reasoning before answering.
// This work is extraction and grounded summary, not deduction, so the extra
// thinking mostly costs latency and free-tier token quota. Only these models
// accept the parameter, so never send it to anything else.
const REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT || 'low';
function applyEffort(body) {
  if (REASONING_EFFORT && /gpt-oss/.test(body.model)) {
    body.reasoning_effort = REASONING_EFFORT;
  } else {
    delete body.reasoning_effort;
  }
}

export async function groqChat(messages, { json = false, temperature = 0.3, model, retries = 4 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  // An explicit model argument opts out of the fallback chain.
  const chain = model
    ? [model]
    : [MODEL_PRIMARY, MODEL_FALLBACK].filter((m, i, all) => m && all.indexOf(m) === i);
  let rung = 0;

  const body = { model: chain[0], messages, temperature };
  if (json) body.response_format = { type: 'json_object' };
  applyEffort(body);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });

    // Free-tier tokens-per-minute limits are common — back off and retry.
    if (res.status === 429 && attempt < retries) {
      const ra = parseFloat(res.headers.get('retry-after')) || 0;
      const wait = Math.min(ra > 0 ? ra : 2 * (attempt + 1), 12);
      await sleep(wait * 1000 + 300);
      continue;
    }

    // A retired or unavailable model answers 404 (and sometimes 400). Drop to
    // the next rung rather than failing the section outright.
    if ((res.status === 404 || res.status === 400) && rung < chain.length - 1) {
      rung += 1;
      body.model = chain[rung];
      applyEffort(body); // the new rung may not accept the parameter
      console.warn(`[recon] groq model "${chain[rung - 1]}" unavailable, falling back to "${chain[rung]}"`);
      continue;
    }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Groq ${res.status}: ${t.slice(0, 180)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return json ? safeJson(content) : content;
  }
}

export async function tavilySearch(query, { maxResults = 5 } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY not set');

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: maxResults,
      search_depth: 'basic',
      include_answer: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Tavily ${res.status}: ${t.slice(0, 180)}`);
  }
  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
  }));
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
