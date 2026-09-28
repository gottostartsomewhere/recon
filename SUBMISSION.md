# Devpost submission draft: Recon

Fields for the Nebius x NVIDIA Global AI Hackathon form. Edit freely before pasting.

---

**Project name:** Recon

**Tagline:** Counterparty checks that cross-examine their own claims before you see them.

**Track:** Best Apps and Agents

**Live demo:** https://recon-ckfe.onrender.com/

**Repo:** https://github.com/gottostartsomewhere/recon (MIT)

**Video:** (add the YouTube link)

**Built with:** nvidia-nemotron, nebius-token-factory, tavily, react, vite, node.js, express, server-sent-events

**Existed before the submission period?** Yes. See [CHANGES.md](CHANGES.md): the baseline is commit
`20fd1a9` from 21 August, and the pipeline, inference layer, product and interface were rebuilt
during the submission period.

---

## What it does

Before you take someone on as a client, hire a vendor, sign a partnership or accept a job offer,
you look them up. Recon does that lookup as an investigation. You name the organisation and say
what you are about to do, and an agent built on NVIDIA Nemotron gathers evidence from the live
web, drafts a file, and then has a much larger Nemotron model re-read every page the draft cites
and rule on every claim: held, corrected, or struck. The file ends in proceed, caution or stop,
decided only from the claims that survived, with red flags and the questions to ask the other
party first.

## Why

AI research tools cite a source for every sentence, and that looks like rigour. It is not. In
testing, an earlier version of Recon told me to walk away from a remote-hiring company because
"its recruiting operation is a scam", at 85% confidence, with every claim cited. Most of the file
was about three other companies that share the name, and the scam reports were about people
impersonating it. Across a 20-company eval, 43% of cited claims written by the drafting model were
corrected or struck once a judge model read the pages they cited.

## How it works

1. **Identify** (Nemotron 3 Super): resolves which organisation you mean and which similarly named
   ones to keep out.
2. **Investigate** (Nemotron 3 Super with tool calling, Tavily search, extract and map): a sweep
   of searches for the questions your intent calls for, then an agent loop that fills the gaps,
   capped at 10 tool calls and 2 per question.
3. **Screen** (Super): sets aside pages about other organisations. In the eval that was 137 of
   837 pages.
4. **Draft** (Nemotron 3 Nano): each section from its sources only, every claim citing a source id.
5. **Cross-examine** (Nemotron 3 Ultra, reasoning on): re-reads each cited page and rules on each claim.
6. **Verdict** (Ultra): proceed, caution or stop from surviving claims; confidence is computed
   from what survived, not asked of the model.

Every step streams to the browser, so you watch drafts dim, held claims brighten and struck claims
disappear under a redaction bar that lifts to a strike-through with the reason.

## How we used Nemotron and Token Factory

Three Nemotron tiers matched to the work: Nano for the many small drafting and extraction calls
(2% of cost), Super for the tool loop and screening, Ultra for judging (86% of cost, almost all
reasoning tokens spent checking claims). Reasoning is toggled per call with
`chat_template_kwargs.enable_thinking`. Tool calling, JSON mode and JSON schema were verified on
all three tiers with a probe script before the pipeline was built on them. Model ids are resolved
against `/v1/models`, each tier has a fallback chain, and a latency circuit breaker benches a
congested model for two minutes. Token Factory's OpenAI-compatible API made the move off the old
provider a single-file change, and its published per-token prices let every check report its
exact cost: a median of $0.06.

## Results

20 live checks across five intents: 431 cited claims drafted, 57% held, 35% corrected, 8% struck.
In a read-through of 26 corrections, 17 were material (wrong years, inflated counts, a client the
source never mentions). All three known-bad counterparties in the set (Byju's, Builder.ai,
Wirecard) got STOP. Median check: 62 seconds, $0.06. Full results in `eval/RESULTS.md`.

## Challenges

- Getting Super to spread its tool budget. Asked to, it still spent every call hunting one
  registry number, so the per-question cap is enforced in code.
- Entity resolution. The first version of screening threw out 43 of 44 pages, including the
  company's own site, because it listed the company's former name as a look-alike. Aliases and
  look-alikes are now separate lists, the subject's domain can never be screened out, and
  screening that discards most of a file is ignored.
- Serverless latency spikes, solved with per-tier timeouts and fallback.
- Keeping a public demo from spending unlimited credit: a daily cap and a per-visitor cap on live
  checks, falling back to a recorded live run.

## What's next

Paid registry and court-record sources for the identity and legal questions, saved files you can
share with a partner or client, and re-checks that tell you what changed since the last time.

---

## Feedback on Nebius Token Factory and NVIDIA Nemotron (draft)

Things we hit while building, in the order they cost us time:

1. **The docs disagree on the base URL.** The quickstart uses `api.tokenfactory.nebius.com/v1`;
   the cookbook's Nemotron page uses `api.tokenfactory.us-central1.nebius.com/v1`. It is not
   clear whether both are supported or which is preferred.
2. **Model ids are case-sensitive and the docs spell them differently**
   (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` on the model page, `nvidia/nvidia-nemotron-3-nano-30b-a3b`
   in the cookbook). We ended up resolving ids against `/v1/models` at startup.
3. **Nothing documents Nemotron's reasoning controls.** We found by probing that
   `chat_template_kwargs.enable_thinking` works on all three tiers and that reasoning comes back in
   a separate field. That is the single most useful knob for cost and latency and deserves a page.
4. **The model catalogue is client-rendered,** so tools and agents fetching it get an empty page,
   and the "list of models" docs example only shows Llama. A static list with ids, prices, context
   length and capability flags (tools, JSON mode, reasoning) would save every builder a probe script.
5. **Which models support tool calling and JSON schema is not listed.** The JSON docs pass a raw
   Pydantic schema as `json_schema`, which differs from the OpenAI `{name, schema}` shape; the
   OpenAI shape worked for us.
6. **Latency variance on Nano.** A trivial call normally took 0.4 to 0.6 seconds but once took
   12 seconds, then recovered within a minute. Rate-limit headers exist; something similar for
   queueing, or a status page, would let clients route around it instead of timing out.
7. **A reasoning budget parameter for Ultra** would help. Its reasoning tokens were 86% of our cost;
   a cap on thinking tokens per call would let us trade depth for cost explicitly.
8. **Billing clarity.** The statement shows a trial credit line equal to the consumption line,
   which makes it hard to tell whether any trial credit remains.

What worked well: Ultra as a strict judge is excellent. It caught a trial court written up as an
appellate one, an investor written up as a founder, and a lawsuit filing attributed to the wrong
party. The OpenAI-compatible API made the migration painless, and per-token pricing made exact
per-check costing straightforward.
