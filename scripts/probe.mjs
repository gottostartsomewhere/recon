// Checks what each Nemotron tier on Token Factory actually supports before
// the agent depends on it: the thinking toggle, JSON mode, JSON schema, and
// tool calling. Costs well under a cent.
//
//   node scripts/probe.mjs

import 'dotenv/config';
import { TIERS, resolveTier } from '../server/providers.js';

const URL_BASE = (process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/+$/, '');
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` };

if (!process.env.NEBIUS_API_KEY) {
  console.error('NEBIUS_API_KEY is not set in .env');
  process.exit(1);
}

const models = await fetch(`${URL_BASE}/models`, { headers }).then((r) => r.json()).catch((e) => ({ error: e.message }));
const nvidia = (models.data || []).map((m) => m.id).filter((id) => /nemotron|nvidia/i.test(id));
console.log(`\nNVIDIA models listed (${nvidia.length}):\n  ${nvidia.join('\n  ') || JSON.stringify(models).slice(0, 300)}\n`);

const ask = [{ role: 'user', content: 'Return JSON {"capital": string} for France.' }];
const tool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
};

const cases = {
  'default (thinking?)': { messages: ask },
  'enable_thinking:false': { messages: ask, chat_template_kwargs: { enable_thinking: false } },
  json_object: { messages: ask, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false } },
  json_schema: {
    messages: ask,
    chat_template_kwargs: { enable_thinking: false },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'answer',
        schema: { type: 'object', properties: { capital: { type: 'string' } }, required: ['capital'] },
      },
    },
  },
  tool_call: {
    messages: [{ role: 'user', content: 'Find the current CEO of Stripe. Use the search tool.' }],
    tools: [tool],
    tool_choice: 'auto',
    chat_template_kwargs: { enable_thinking: false },
  },
};

for (const tier of Object.keys(TIERS)) {
  const [model] = await resolveTier(tier);
  console.log(`── ${tier} → ${model}`);
  for (const [name, extra] of Object.entries(cases)) {
    const t0 = Date.now();
    const res = await fetch(`${URL_BASE}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 800, ...extra }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      console.log(`   ${name.padEnd(22)} FAIL ${res.status} ${(await res.text()).slice(0, 140)}`);
      continue;
    }
    const d = await res.json();
    const msg = d.choices?.[0]?.message || {};
    const content = String(msg.content || '');
    const notes = [
      `${ms}ms`,
      `in ${d.usage?.prompt_tokens} / out ${d.usage?.completion_tokens}`,
      msg.reasoning_content || msg.reasoning ? 'reasoning field' : '',
      /<think>|<\/think>/.test(content) ? 'inline <think>' : '',
      msg.tool_calls?.length ? `tool_call ${msg.tool_calls[0].function?.name}(${msg.tool_calls[0].function?.arguments})` : '',
    ].filter(Boolean);
    console.log(`   ${name.padEnd(22)} ok   ${notes.join(' · ')}`);
    console.log(`   ${''.padEnd(22)}      ${content.replace(/\s+/g, ' ').slice(0, 110)}`);
  }
  console.log();
}
