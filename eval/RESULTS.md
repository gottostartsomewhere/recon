# Evaluation

20 of 20 counterparty checks completed, run on 2026-09-28 against live
NVIDIA Nemotron models on Nebius Token Factory and live Tavily search. Cases are in
[cases.json](cases.json); every number below comes from [results.json](results.json), which
`node scripts/eval.mjs` regenerates.

## What cross-examination caught

The drafting model (Nemotron Nano) wrote 431 claims, every one citing a source it was shown.
Nemotron Ultra then re-read the cited pages and ruled on each one:

| Ruling | Claims | Share |
|---|---|---|
| Held up | 247 | 57% |
| Corrected (the source supports a narrower claim) | 151 | 35% |
| Struck: the source does not say it | 23 | 5% |
| Struck: about a different organisation, or not about the subject | 9 | 2% |
| Struck: cited nothing | 1 | 0% |

So 43% of cited, fluent, plausible claims would have reached the reader
wrong or overstated without the second pass. Before drafting, screening had already set aside
137 of 837 exhibits (16%) as pages about other organisations.

These rulings are the judge model's, not a human audit, so read them as what the pipeline
catches rather than as ground truth. [corrections-sample.md](corrections-sample.md) reads 26 of
the corrections one by one to separate material ones from nitpicks.

## Known-bad counterparties

- **Byju's** (client): stop, payment defaults and insolvency proceedings
- **Builder.ai** (client): stop, collapsed into insolvency in 2025
- **Wirecard** (partner): stop, collapsed in a 2020 accounting fraud

## Cost and speed

Median check: 62 s, $0.061 in Nemotron inference and 9.5 Tavily credits.
The whole run of 20 checks cost $1.20 in inference.

Decisions: 4 proceed, 13 caution, 3 stop.

## Every check

| Company | Intent | Decision | Conf | Claims | Held | Corrected | Struck | Set aside | Time | Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| Byju's | client | stop | 77 | 24 | 14 | 9 | 1 | 6/43 | 72s | $0.071 |
| Builder.ai | client | stop | 53 | 13 | 7 | 4 | 2 | 36/53 | 51s | $0.038 |
| WeWork | client | caution | 46 | 24 | 9 | 7 | 8 | 0/51 | 69s | $0.060 |
| Paytm | client | caution | 80 | 23 | 15 | 7 | 1 | 11/56 | 60s | $0.061 |
| Toptal | vendor | proceed | 73 | 24 | 12 | 11 | 1 | 1/42 | 64s | $0.071 |
| Deel | vendor | caution | 79 | 24 | 14 | 10 | 0 | 3/39 | 59s | $0.060 |
| Zoho | vendor | caution | 81 | 24 | 15 | 9 | 0 | 5/48 | 78s | $0.073 |
| Razorpay | vendor | caution | 81 | 24 | 16 | 7 | 1 | 0/39 | 55s | $0.058 |
| Ramp | vendor | caution | 76 | 17 | 9 | 8 | 0 | 9/38 | 51s | $0.048 |
| Stripe | partner | proceed | 76 | 25 | 15 | 8 | 2 | 0/32 | 55s | $0.065 |
| Wirecard | partner | stop | 67 | 24 | 9 | 14 | 1 | 2/38 | 68s | $0.070 |
| Rippling | partner | caution | 80 | 22 | 14 | 7 | 1 | 5/48 | 68s | $0.070 |
| Crossover | employer | proceed | 53 | 15 | 9 | 3 | 3 | 24/46 | 88s | $0.041 |
| Turing | employer | caution | 62 | 21 | 10 | 6 | 5 | 6/42 | 66s | $0.056 |
| Mercor | employer | proceed | 73 | 20 | 11 | 7 | 2 | 0/41 | 68s | $0.068 |
| Revature | employer | caution | 69 | 14 | 9 | 4 | 1 | 6/31 | 57s | $0.037 |
| Scale AI | employer | caution | 77 | 24 | 15 | 7 | 2 | 0/33 | 53s | $0.056 |
| Notion | general | caution | 74 | 27 | 14 | 12 | 1 | 0/42 | 65s | $0.080 |
| Mercury | general | caution | 61 | 15 | 8 | 7 | 0 | 23/43 | 50s | $0.051 |
| Freshworks | general | caution | 89 | 27 | 22 | 4 | 1 | 0/32 | 50s | $0.064 |

## Struck claims, with the judge's reasons

- **Byju's**, Financial Health (unsupported): "Byju's reported over 150 million registered students as of April 2023, though its unaudited FY22 revenue was significantly lower than earlier claimed Rs 10,000 crore."
  Source 18 shows the unaudited FY22 revenue claim was Rs 10,000 crore, while audited revenue is Rs 3,569 crore; the claim incorrectly states unaudited revenue was lower than the earlier claimed Rs 10,000 crore.
- **Builder.ai**, Identity & Legitimacy (unsupported): "Builder.ai was incorporated as Engineer.AI Global Limited on 5 October 2017 with company number 10998363 and registered office at 15 Westferry Circus, Canary Wharf, London, United Kingdom (E14 4HD) (source: 32)"
  Source 32 only shows Engineer.AI Global Limited incorporation details; it does not mention Builder.ai or link the two entities.
- **Builder.ai**, Identity & Legitimacy (unsupported): "The company was founded by Sachin Dev Duggal (and Saurabh Dhoot per FAQ) and originally operated under the name Engineer.ai Corporation before rebranding to Builder.ai in 2019 (source: 21)"
  Source 21 states Builder.ai was started in 2016 by Duggal and Dhoot but does not mention Engineer.ai Corporation or a 2019 rebranding.
- **WeWork**, Payment Behaviour (wrong entity): "54% of freelancers have experienced delayed payments from clients, with 20% reporting they could not cover basic living costs such as rent and bills as a direct result of late payments [27]"
  The cited source is an Instagram post from IPSE about freelancers generally, not about WeWork's payment behavior.
- **WeWork**, Payment Behaviour (wrong entity): "Late payments can lead to unpaid bills, missed rent, and financial risk for self‑employed individuals after work has been delivered [27]"
  The cited source discusses late payments' impact on self-employed individuals generally, not WeWork specifically.
- **WeWork**, Payment Behaviour (wrong entity): "A 2023 survey found that 55% of B2B invoiced sales in the U.S. are overdue, and 86% of businesses report up to 30% of monthly invoiced sales are overdue, indicating widespread payment delays [41]"
  The cited source is a general B2B payment delay statistics compilation from The Kaplan Group, not about WeWork.
- **WeWork**, Payment Behaviour (wrong entity): "Late payments affect cash flow, confidence, and stability for freelancers and self‑employed professionals [27]"
  The cited source describes effects of late payments on freelancers broadly, not WeWork's payment practices.
- **WeWork**, Payment Behaviour (wrong entity): "Late payment disputes and unpaid invoices are common in B2B relationships, with many businesses experiencing overdue invoices that can reach up to 30% of monthly sales [41]"
  The cited source provides general B2B payment statistics, not data specific to WeWork.
- **WeWork**, Legal & Regulatory (unsupported): "On November 4, 2023, former WeWork employee Natalie Sojka filed a lawsuit in San Francisco County Superior Court alleging that Adam Neumann, SoftBank, and the WeWork board breached fiduciary duties to minority shareholders by arranging a self-interested transaction, seeking class-action status."
  Source 23 indicates the lawsuit was filed on November 4, 2019 (article date), not 2023.
- **WeWork**, Reputation & Complaints (unsupported): "Reddit discussions indicate mixed experiences among current and former WeWork users, though specific details are sparse and not directly attributable to formal complaint channels [13]"
  The cited Reddit source provides only a thread title with no content, so no experiences are indicated.
- **WeWork**, Reputation & Complaints (unsupported): "WeWork’s financial history, including a failed 2019 IPO, massive losses, and subsequent bankruptcy restructuring, underscores governance and operational risks that have fueled negative public and investor sentiment [14]"
  The cited article snippet discusses governance lessons and an overambitious model but does not mention a failed 2019 IPO, massive losses, or bankruptcy restructuring.
- **Paytm**, Financial Health (unsupported): "In FY 2023, payment‑service revenue grew 44% to ₹4,930 crore, accounting for the majority of total revenue, while the company recorded an impairment charge of $27.2 million on its investments."
  Source 29 confirms payment-service revenue grew 44% to ₹4,930 crore but does not mention any impairment charge; the $27.2M impairment charge appears in source 27, not in the cited source.
- **Toptal**, Legal & Regulatory (unsupported): "Toptal sued Bloomberg L.P. in Delaware (C.A. No. N25C-01-266) for misappropriation of trade secrets and unfair competition, with a jury trial decided in July 2025."
  Source [39] describes a motion to dismiss decided in July 2025, not a jury trial, and does not specify the causes of action as misappropriation of trade secrets and unfair competition.
- **Razorpay**, Legal & Regulatory (unsupported): "Razorpay is involved in legal proceedings concerning compliance with RBI regulations and payment gateway obligations, though specific outcomes are not detailed in the provided sources."
  Source 20 describes Razorpay's RBI authorization and compliance features but does not mention any legal proceedings regarding RBI regulations or payment gateway obligations.
- **Stripe**, Ownership & Leadership (unsupported): "Stripe, Inc. is an American multinational financial services and SaaS company providing payment-processing software and APIs for e-commerce and mobile applications, founded in 2010 by brothers John and Patrick Collison."
  Source [26] does not describe Stripe as an American multinational financial services and SaaS company, nor does it state the founding year as 2010.
- **Stripe**, Track Record with Partners (unsupported): "Stripe may terminate a merchant relationship if a financial partner prohibits Stripe from processing transactions, even for transactions initiated before termination."
  Source [20] describes post-termination transaction completion, not termination due to financial partner prohibition.
- **Wirecard**, Financial Health (unsupported): "Former CEO Markus Braun and other executives were arrested and charged with fraud, embezzlement and market manipulation, confirming criminal liability for the accounting scandal."
  Source 23 snippet does not mention arrests or charges against Markus Braun or other executives.
- **Rippling**, Financial Health (unsupported): "Rippling's valuation of $16.8 billion is considered modest relative to its $1 billion ARR, placing it behind competitors like Deel ($17.3 billion valuation) and Gusto, which also crossed $1 billion ARR and is positioned for potential IPO or further fundraising."
  Sources 36 and 37 report competitor valuations and ARR figures but do not state that Rippling's valuation is modest relative to its $1B ARR, nor that it is behind Gusto (whose valuation is not given); the claim misrepresents the comparative positioning.
- **Crossover**, Recruiting Legitimacy (unsupported): "The company advertises six‑figure salaries and transparent requirements, but applicants must pay no upfront fees; any request for payment, hourly‑only offers, or crypto/cheque payments would indicate a scam rather than a legitimate offer"
  Cited sources (FTC general article and a critical LinkedIn post) do not state that Crossover advertises six‑figure salaries and transparent requirements, nor do they establish that hourly‑only offers or crypto payments are scam indicators for this company.
- **Crossover**, Life as an Employee (unsupported): "Some reviews describe the work environment negatively, though specific details are limited in the available sources."
  Source 18 is only a Quora question URL and title ('How is like to work at Crossover?') with no review content or negative descriptions provided.
- **Turing**, Recruiting Legitimacy (unsupported): "Turing.com is an AGI infrastructure company specializing in post‑training large language models for enterprise AI deployment, and it operates under the domain turing.com and the alias turing ai."
  Cited sources describe Turing as a talent platform for remote software engineers, not an AGI infrastructure company specializing in post-training LLMs.
- **Turing**, Recruiting Legitimacy (wrong entity): "The FBI’s Internet Crime Complaint Center reported over $367 million lost to job scams in 2023, illustrating the prevalence of recruitment fraud that can involve AI‑generated postings and deepfake recruiter interactions."
  Claim cites general FBI job-scam statistics from a Gem article, not information about Turing.
- **Turing**, Life as an Employee (unsupported): "Glassdoor reviews indicate a 3.0/5 overall rating based on 300+ employee reviews, with 61% of employees recommending Turing to a friend."
  The 3.0/5 rating and 300+ reviews are from AmbitionBox (source 29), not Glassdoor; source 32 does not mention a 3.0/5 overall rating.
- **Turing**, Recent Developments (wrong entity): "In September 2023, Turing’s cryptanalyst Jack Willis used Anthropic’s Claude Opus 5 model to break an unsolved Enigma message, highlighting recent AI‑driven breakthroughs."
  Source [12] discusses historical Alan Turing and cryptanalysts breaking Enigma messages in 2026, not the company Turing; Jack Willis is not identified as Turing's employee and the date is 2026 not 2023.
- **Turing**, Recent Developments (unsupported): "The company’s leadership has not announced any recent layoffs, shutdowns, or investigations, but no leadership changes have been reported in the provided sources."
  Sources [11] and [12] do not mention layoffs, shutdowns, investigations, or leadership changes; the claim asserts facts not addressed in the cited sources.
- **Mercor**, Identity & Legitimacy (unsupported): "Mercor reports approximately 300 employees (as of 2025) and serves major AI labs and enterprises such as OpenAI and Anthropic, with a reported annual recurring revenue approaching $450 million in late 2025."
  Cited sources 1 and 11 do not mention ARR approaching $450M in late 2025; source 11 reports ARR $2B gross in June 2026.
- **Mercor**, Recruiting Legitimacy (unsupported): "Mercor's official careers page is listed on its main domain mercor.com, indicating a legitimate recruitment channel."
  Source 28 discusses Philippine recruitment fraud law and general red flags; it does not mention Mercor, mercor.com, or any careers page.
- **Revature**, Recent Developments (unsupported): "Revature partnered with IIT Gandhinagar and BITS Pilani to advance AI research and education through MoUs with the Indian AI Research Organisation (IAIRO) (thehindu.com)"
  Source 23 states IIT Gandhinagar and BITS Pilani signed MoUs with IAIRO, not that Revature partnered with them.
- **Scale AI**, Life as an Employee (unsupported): "One anonymous Glassdoor review suggests Scale AI may have issues with pay and culture despite a 10% improvement in compensation ratings over the last 12 months."
  Source [18] only mentions the aggregate compensation rating of 3.8 and a 10% improvement; it does not include any specific review suggesting issues with pay and culture.
- **Scale AI**, Recent Developments (wrong entity): "In June 2026 IBM and Google Cloud announced a strategic partnership aimed at helping enterprises scale AI into production, leveraging IBM Consulting Advantage and Google Cloud's Gemini models."
  The claim and cited source 25 concern IBM and Google Cloud, not Scale AI, the subject of this file.
- **Notion**, Legal & Regulatory (wrong entity): "Regulatory scrutiny and sanctions for AI-related misconduct in court filings have intensified, with cases involving Notion Labs, Inc. reflecting broader industry trends."
  Source [23] discusses general AI-related sanctions in court filings and does not mention Notion Labs, Inc.; the patent case in [22] is unrelated to AI misconduct.
- **Freshworks**, Financial Health (unsupported): "Financial metrics from Simply Wall St show declining earnings trends and negative earnings per share in recent quarters, underscoring ongoing profitability pressure."
  Source 23 shows positive earnings in the most recent quarters (Q1 and Q2 2026) and does not provide earnings per share; the claim of declining earnings trends and negative EPS is contradicted by the data.
