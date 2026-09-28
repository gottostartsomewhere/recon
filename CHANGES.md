# What changed during the submission period

Recon existed before the Nebius x NVIDIA Global AI Hackathon. It was built for the Build Beyond
Hackathon in July and August 2026, and its last commit before this hackathon is
[`20fd1a9`](https://github.com/gottostartsomewhere/recon/commit/20fd1a9) on 21 August 2026. The
submission period opened on 26 August. That version is tagged
[`build-beyond`](https://github.com/gottostartsomewhere/recon/tree/build-beyond), and everything
since is in [this comparison](https://github.com/gottostartsomewhere/recon/compare/build-beyond...main).

## What it was on 21 August

A company research dossier. One LLM call identified the company, seven fixed web searches ran in
parallel, one call per section wrote seven fixed investor sections (overview, leadership,
traction, financials, landscape, risks, news), and a final call wrote a verdict with a confidence
score the model gave itself. Inference ran on Groq (`openai/gpt-oss-120b`). Every claim cited a
source, and nothing checked whether the source said it.

## What it is now

**A different product.** Recon is now a counterparty check: you say what you are about to do with
an organisation (take them on as a client, hire them as a vendor, partner, accept their job offer,
or just look them up), and that decides the questions. The investor sections are gone.

**New inference layer.** Groq is removed. All inference runs on NVIDIA Nemotron 3 Nano, Super
and Ultra on Nebius Token Factory, routed by the kind of work, with reasoning toggled per call,
model ids resolved against the live catalogue, fallback chains per tier, a latency circuit
breaker, and a per-check cost meter.

**New pipeline.** Every stage after the first search is new:

- Identity resolution that separates the subject's own aliases from different, similarly named
  organisations.
- An investigator agent on Nemotron Super that uses tool calling over Tavily search, extract and
  map, with a budget enforced in code.
- Screening that sets aside pages about other organisations before anything is drafted.
- **Cross-examination**: Nemotron Ultra re-reads every cited page and rules on every claim, and
  unsupported, wrong-entity and uncited claims are struck.
- A verdict drawn only from surviving claims (proceed, caution or stop, red flags, questions to
  ask), and a confidence score computed from what survived instead of self-reported.

**New interface.** An intent picker on the intake; sections that follow the chosen intent;
rulings shown on every claim as they arrive (drafts dim, held claims brighten, struck claims get a
redaction bar that lifts to a strike-through with the reason, corrections expand to show what was
filed); a decision stamp with the counts behind it; red flags and questions to ask; a list of
pages set aside and why; the cost of each check. The landing page was rewritten around the
problem this solves.

**New tooling.** A capability probe for Token Factory, a single-check runner, a 20-company eval
with written results, a recorder that turns a real run into the sample file (which used to be a
hand-written script), and a daily cap on live checks for the public deploy.

## What carried over

The Vite and React front end and its "case file" visual language (typewriter labels, serif prose,
redaction bars, the stamp), the Express server that streams events to the browser, Tavily as the
search provider, and the rule that every claim must cite a source it was shown.
