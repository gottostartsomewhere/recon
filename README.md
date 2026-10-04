<div align="center">

# ◎ RECON

**Name the other party. Get the file.**

Counterparty checks that cross-examine their own claims before you see them.
Built on NVIDIA Nemotron, served by Nebius Token Factory, researched through Tavily.

### [Try it live](https://recon-ckfe.onrender.com/) · [Eval results](eval/RESULTS.md) · [What changed since August](CHANGES.md)

<sub>Free host: if it has been idle, the first load takes about 50 seconds to wake. Live checks are capped at 15 a day because each one runs on paid inference; past that you get a recorded live run.</sub>

</div>

---

## The problem

Before you take someone on as a client, hire a vendor, sign a partnership or accept a job
offer, you look them up. The people who most need that check have nobody to do it for them: a
freelancer deciding whether a new client will pay, a small agency choosing a vendor, someone
weighing a remote job offer. Job scam losses reported to the FTC went from $90 million in 2020 to
$501 million in 2024 ([FTC](https://consumer.ftc.gov/all-scams/job-scams)).

AI research tools make the lookup faster, and they fail in a specific way:
every sentence comes with a citation, and a good share of those citations do not say what the
sentence says, or are about a different company with the same name.

That happened to this project. An earlier version of Recon told me to stop dealing with
Crossover, a remote-hiring company, because "its recruiting operation is a scam", at 85%
confidence. Every claim was cited. The funding round was Crossover Markets, a crypto exchange.
The software release was CodeWeavers' CrossOver. The CEO ran Crossover Health. And the scam
reports were about scammers impersonating Crossover, not about Crossover.

A citation is not a check. Recon is built around that.

## What it does

You name an organisation and say what you are about to do with it:

| I am about to | Recon investigates |
|---|---|
| Take them on as a client | Identity, payment behaviour, financial health, legal, reputation |
| Hire them as a vendor | Identity, delivery track record, reputation, legal, financial health |
| Partner with them | Identity, ownership and leadership, track record with partners, legal, financial health |
| Accept their job offer | Identity, recruiting legitimacy, life as an employee, financial health, recent news |
| Just look them up | Identity, what they do, financial health, legal, reputation, recent news |

An investigator agent gathers evidence, a small model drafts the file, and a much larger model
then re-reads every page the draft cites and rules on every claim: **held**, **corrected**, or
**struck**. You watch it happen. Drafts appear dimmed, claims that hold up brighten, and struck
claims get a redaction bar that lifts to a strike-through with the judge's reason underneath.

The file ends in a decision (**proceed**, **caution** or **stop**) made only from the claims
that survived, the red flags behind it, and the questions to ask the other party before you commit.

## Results

From a [20-company eval](eval/RESULTS.md) across all five intents, run against live models:

- The drafting model wrote **431 claims, every one citing a source it had been shown**.
  Cross-examination let **57%** stand, **corrected 35%** and **struck 8%**. So roughly two in five
  cited, fluent, plausible claims would have reached the reader wrong or overstated.
- Corrections are not all nitpicks. In a [read-through of 26 of them](eval/corrections-sample.md),
  17 changed something you would act on: Mercor's Series C put in 2023 instead of 2025, "300,000
  customers" where the source says 200,000, a Deel client the source never mentions, one Reddit
  post written up as "Reddit users".
- **All three known-bad counterparties got STOP**: Byju's (payment defaults), Builder.ai
  (insolvency) and Wirecard (the 2020 fraud).
- Screening set aside **137 of 837 pages** as being about other organisations before anything
  was drafted.
- A median check takes **62 seconds** and costs **$0.06** in inference plus about 10 Tavily
  credits. The whole 20-check eval cost $1.20.

The rulings are the judge model's, not a human audit, so treat them as what the pipeline catches,
not as ground truth.

## How it works

```
  INTAKE            RECON                        CROSS-EXAM                  VERDICT
  Super resolves    Tavily sweep, then Super     Nano drafts each section;   Ultra decides from
  the organisation  investigates with tool       Ultra re-reads every cited  surviving claims;
  and look-alikes   calls; off-target pages      page and rules on every     confidence is
                    are set aside                claim                       computed, not asked for
```

| Step | Model | What happens |
|---|---|---|
| Identify | Nemotron 3 Super | Searches the name and separates the subject's own aliases ("Crossover for Work") from different organisations ("CrossOver by CodeWeavers") |
| Sweep | Tavily search | One search per question the intent asks |
| Investigate | Nemotron 3 Super, tool calling | Fills gaps with `search`, `read` (full page) and `map_site`; 10 calls at most, 2 per section, enforced in code |
| Screen | Nemotron 3 Super | Sets aside pages about similarly named organisations and generic articles; never the subject's own domain |
| Draft | Nemotron 3 Nano | Writes each section from its sources only; every claim must cite an id it was shown |
| Cross-examine | Nemotron 3 Ultra, reasoning on | Reads each claim next to the text of the pages it cites and rules supported, overstated (with a correction), unsupported, or wrong entity |
| Verdict | Nemotron 3 Ultra | Proceed, caution or stop, red flags, questions to ask; sees only surviving claims |

**Confidence** is the share of claims that held, times how many questions have evidence, times
how many independent sites stand behind them. The model never grades itself. It used to, and
reported 85 on a file that was mostly about the wrong company.

## How it uses NVIDIA Nemotron and Nebius Token Factory

Every model call goes to Nemotron on [Nebius Token Factory](https://tokenfactory.nebius.com)
through its OpenAI-compatible API ([`server/providers.js`](server/providers.js)).

- **Three tiers, matched to the work.** Nano handles the many small extraction and drafting calls,
  Super drives the tool loop and screening, Ultra does the judging. Across the eval, Nano made 116
  calls for 2% of the cost and Ultra made 116 for 86% of it, almost all in reasoning tokens spent
  checking claims. That is where the money should go.
- **Reasoning is switched per call** with `chat_template_kwargs.enable_thinking`: off for
  extraction, where it only adds latency, on for the judge. Reasoning arrives in its own field and
  never reaches a JSON parser.
- **Tool calling, JSON mode and JSON schema** were checked on all three tiers before anything was
  built on them ([`scripts/probe.mjs`](scripts/probe.mjs)).
- **Model ids are resolved against `/v1/models`** at startup, and each tier is a fallback chain,
  because the previous inference provider retired this app's model without notice.
- **A latency circuit breaker.** Serverless endpoints queue under load; Nano once took 12 seconds
  to return `{"ok":true}` and recovered a minute later. A call that overruns its tier's limit
  benches that model for two minutes and falls down the chain (Nano, then Lightning, then Super).
- **Exact per-check cost.** Token Factory publishes per-token prices, so every check reports what
  it cost by model, shown at the bottom of each file.

Where Token Factory sped up the work:

- **Switching providers took one file.** The API is OpenAI-compatible, so moving off the previous
  provider meant rewriting [`server/providers.js`](server/providers.js) and nothing else.
- **One key, three sizes.** All three Nemotron tiers sit behind one endpoint, so trying a different
  model for a stage is an environment variable (`NEMOTRON_FAST`, `NEMOTRON_AGENT`,
  `NEMOTRON_JUDGE`), not a new integration.
- **Capabilities checked in one run.** The probe script tests every tier for the thinking toggle,
  JSON mode, JSON schema and tool calling, and costs under a cent.
- **Cheap enough to measure.** The 20-company eval made 345 model calls, three checks at a time,
  for $1.20, with no rate-limit errors, timeouts or fallbacks.
- **Nothing to host.** No GPUs to provision and no models to deploy: the app runs on a free Render
  instance and Token Factory does all the inference. It is the only Nebius service Recon uses.

## How it uses Tavily

Tavily is how the agent sees the web ([`server/providers.js`](server/providers.js),
[`server/agent.js`](server/agent.js)).

- **A sweep shaped by the decision.** Each check opens with one search per question the intent
  calls for, and each is seeded for that question: "unpaid invoices late payment freelancers"
  when you are taking on a client, "recruitment scam fake job offer" when you are weighing a job
  offer ([`server/intents.js`](server/intents.js)). Recent developments use the `news` topic
  with a one-year `time_range`.
- **Three tools for the investigator.** Super calls `search`; `read`, which is **extract** with a
  focus query and `chunks_per_source: 3`, so a long filing or terms page comes back as the parts
  that matter; and `map_site`, which is **map** at depth 1, to find the company's own about,
  legal and careers pages.
- **Full text feeds the judge.** A page read in full gives the drafter more than a snippet, and
  it is what Ultra reads when it rules on a claim that cites it.
- **Names are not organisations.** Search matches names, so 137 of the 837 pages in the eval
  were about someone else (CodeWeavers' CrossOver in a Crossover file, the Alan Turing Institute
  in a Turing file). Super screens them out before anything is drafted.
- **Metered.** Every request sets `include_usage`, and each file reports its credits next to its
  inference cost.

Across the 20-company eval that came to 177 searches, 16 full-page reads and 9 site maps: 195
credits, about 10 a check. The full-page reads reached primary sources such as UK Companies
House, SEC EDGAR filings and companies' own legal pages.

## Run it locally

```bash
git clone https://github.com/gottostartsomewhere/recon.git && cd recon
npm install
npm run dev          # http://localhost:5173; the sample file works with no keys
```

For live checks, add two keys:

```bash
cp .env.example .env
# NEBIUS_API_KEY  → https://tokenfactory.nebius.com
# TAVILY_API_KEY  → https://app.tavily.com
```

Useful scripts:

| Command | What it does |
|---|---|
| `node scripts/probe.mjs` | Checks what each Nemotron tier supports on your key (costs under a cent) |
| `node scripts/check.mjs "Deel" vendor` | Runs one live check against a local server and prints the rulings |
| `node scripts/eval.mjs 8787 3` | Runs the 20-company eval; add `--reuse` to re-score saved runs for free |
| `node scripts/make-demo.mjs runs/<file>.sse` | Turns a saved live run into the sample file |

## Deploy

One service serves the API and the built frontend. [`render.yaml`](render.yaml) deploys it on
Render's free tier; set `NEBIUS_API_KEY` and `TAVILY_API_KEY` in the dashboard.
`LIVE_CHECKS_PER_DAY` and `LIVE_CHECKS_PER_IP` cap live checks (15 and 3 in the blueprint, 0 for
sample only); past the cap a visitor gets the recorded sample with a note saying why. If a
provider refuses the account (a bad key, no balance), the check switches to the sample with a
note and live checks pause for ten minutes, instead of filing a report built from error messages.
A [GitHub Actions workflow](.github/workflows/keep-alive.yml) pings `/api/health` every five
minutes so the free instance doesn't fall asleep between visitors.

## Limits

- Evidence is the open web. Recon does not query paid company registries or court databases, so
  a thin web footprint gives a thin file, and the file says so.
- The judge checks claims against their sources, not against the world. If a source is wrong,
  a claim that faithfully repeats it will hold.
- Decisions near a threshold can flip between runs: Crossover got caution in one run and proceed
  in another.
- This is research support, not legal or financial advice.

## Stack

Vite and React on the front, Node and Express on the back, streaming each step to the browser over
server-sent events. NVIDIA Nemotron 3 Nano, Super and Ultra on Nebius Token Factory. Tavily search,
extract and map. No database.

## License

MIT, see [LICENSE](LICENSE).
