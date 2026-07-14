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

export async function groqChat(messages, { json = false, temperature = 0.3, model, retries = 4 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const body = {
    model: model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    messages,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };

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
