<div align="center">

# ◎ RECON

**Name a target. Get the file.**

An AI analyst that runs open-source reconnaissance across the live web and returns a
cited, investor-grade **intelligence dossier** on any company — in seconds.

*Built for the [Build Beyond Hackathon](https://build-beyond-hackathon.devpost.com/).*

</div>

---

## What it is

Most "AI research" tools hand you a wall of unsourced text and hope you trust it. **Recon** works like an intelligence analyst instead: you name a target, and it dispatches an agent to search the open web, read primary sources, and assemble a structured **case file** where **every claim is tagged to the exact source it came from** — ending with a bottom-line verdict and a confidence score.

- **Type a company, product, or ticker** → watch the file assemble live.
- **Key Facts** — CEO, HQ, founded, employees, sector, ticker, market cap / valuation.
- **Seven sourced sections** — What They Do · Leadership · Traction & Funding · Financials & Stock · Competitive Landscape · Risks & Red Flags · Recent Developments.
- **Analyst Assessment** — a synthesized verdict stamped with a confidence rating.
- **Every bullet cites its evidence.** Sources are listed as numbered exhibits.

Runs out of the box in **Sample mode** (a scripted demo dossier, no keys needed); drop in two free API keys for **live** reconnaissance on anything.

## How it works

```
  ┌─ INTAKE ──────┐   ┌─ RECON ───────┐   ┌─ SYNTHESIS ─────┐   ┌─ ASSESSMENT ──┐
  │ identify the  │ → │ parallel web  │ → │ per-section LLM │ → │ verdict +     │
  │ target (LLM)  │   │ search / read │   │ synthesis, each │   │ confidence    │
  │               │   │ (7 queries)   │   │ cites its refs  │   │ score (LLM)   │
  └───────────────┘   └───────────────┘   └─────────────────┘   └───────────────┘
        every step streams to the browser over Server-Sent Events (SSE)
```

1. **Intake** — one LLM call identifies the entity and its type.
2. **Recon** — seven targeted web searches run in parallel; results are de-duplicated into a numbered source pool.
3. **Vitals** — an extraction pass pulls structured key facts (CEO, ticker, market cap…).
4. **Synthesis** — each section is written by an LLM constrained to the retrieved sources, citing the source IDs it used.
5. **Assessment** — a final pass weighs the findings into a verdict + confidence score.

The frontend renders it as a live-assembling dossier, with loading sections shown as **redaction bars that declassify into text**.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Vite + React** | Fast, streams events into a live UI |
| Backend | **Node + Express** (SSE) | Holds keys, streams the agent's steps |
| LLM | **Groq** (`llama-3.3-70b-versatile`) | Free tier, extremely fast inference |
| Search | **Tavily** | Free tier, returns page *content* for grounding |

No paid APIs. No database. Two free keys (no credit card) and it runs live.

## Run it locally

```bash
git clone <your-repo-url> recon && cd recon
npm install
npm run dev          # → http://localhost:5173  (Sample mode works with no keys)
```

For **live** research, add two free keys (no card required):

```bash
cp .env.example .env
# GROQ_API_KEY  → https://console.groq.com/keys
# TAVILY_API_KEY → https://app.tavily.com
```

Restart, and the badge flips **SAMPLE → LIVE** — now research any company for real.

## Deploy

One service serves both the API and the built frontend. On [Render](https://render.com) (free tier):

- **Build:** `npm install && npm run build`
- **Start:** `node server/index.js`
- **Env:** set `GROQ_API_KEY` and `TAVILY_API_KEY`

A ready-to-use [`render.yaml`](./render.yaml) is included for one-click Blueprint deploys.

## License

MIT — see [LICENSE](./LICENSE).
