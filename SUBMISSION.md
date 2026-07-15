# Devpost Submission — Recon

*Copy these fields into the Devpost submission form.*

---

**Project name:** Recon

**Tagline:** Name a target. Get the file. — an AI analyst that assembles a cited intelligence dossier on any company in seconds.

**Live demo:** https://recon-ckfe.onrender.com/

**Repo:** https://github.com/gottostartsomewhere/recon

**Built with:** react, vite, node.js, express, groq, tavily, server-sent-events, llama-3.3

---

## Inspiration

AI research tools have a trust problem: they hand you a confident wall of text with no way to check it. Meanwhile, real analysts — in finance, journalism, due diligence — work from *sources*. We wanted a tool that researches like an analyst, not a chatbot: it goes and reads the open web, and every single claim it makes is tagged to the exact source it came from.

## What it does

You type a company, product, or ticker. Recon dispatches an AI agent that searches the live web, reads primary sources, and assembles a structured **intelligence dossier** in front of you:

- **Key Facts** — CEO, HQ, founded, employees, sector, ticker, market cap / valuation.
- **Seven sourced sections** — What They Do, Leadership, Traction & Funding, Financials & Stock, Competitive Landscape, Risks & Red Flags, and Recent Developments.
- **An Analyst Assessment** — a bottom-line verdict stamped with a confidence score.
- **Citations on every bullet**, with all sources listed as numbered exhibits.

It runs out of the box in a scripted Sample mode, and flips to live research with two free API keys.

## How we built it

- **Frontend:** Vite + React. The agent's progress and each finished section stream into the UI over Server-Sent Events, so you watch the dossier assemble — loading sections appear as redaction bars that "declassify" into text.
- **Backend:** A Node/Express server runs the agent loop: identify the target → run seven web searches in parallel → extract structured key facts → synthesize each section constrained to the retrieved sources (citing source IDs) → weigh everything into a verdict + confidence score.
- **Models & data:** Groq (Llama 3.3 70B) for fast, free inference; Tavily for web search that returns page content for grounding. Zero paid APIs, no database.

## Challenges we ran into

- **Grounding without hallucination** — every section prompt is constrained to only the retrieved sources and must cite the IDs it used.
- **Free-tier rate limits** — nine LLM calls per run tripped Groq's tokens-per-minute cap, so we added retry-with-backoff and trimmed per-call context.
- **Design** — we deliberately avoided the generic "dark dashboard + neon accent" AI look, landing on a declassified case-file aesthetic (typewriter + serif, amber-on-charcoal, redaction reveals).

## Accomplishments we're proud of

A genuinely useful research tool that's fully sourced, runs on $0 of infrastructure, and *looks* like nothing else in the pool.

## What we learned

Streaming the agent's reasoning makes AI feel trustworthy — showing the work matters as much as the answer.

## What's next

- Export dossiers to PDF and shareable links.
- People and market/sector targets, not just companies.
- Live pricing/financials via a markets API.
