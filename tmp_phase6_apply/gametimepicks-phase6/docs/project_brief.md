# Project Brief — GametimePicks

A reference document covering the why, what, and how of GametimePicks.
Used for: portfolio case studies, recruiter conversations, interview
preparation, and writing about the project later.

---

## Problem

The sports prop analytics space is dominated by paid-tipster services that
sell certainty. Subscription "lock pick" services, paid Discord servers,
and tout sites monetize the appearance of edge while disclosing little
about methodology. Users get marketing-grade language and almost no
information about how predictions are produced or how the predictor has
performed.

There's a different version of the same product that doesn't exist as a
mass-market offering: an analytics surface that's transparent about its
methodology, its limitations, and its track record. That gap — between
the entertainment-product version of sports analytics and the
research-product version — is the opening this project addresses.

## Product thesis

A useful sports analytics product earns trust by being legible, not by
being confident. GametimePicks is built around four principles:

1. **Show the work.** Every model lean is published with the projection,
   the line, the implied probability, the model probability, and a
   one-sentence reason. Methodology page documents the formulas.
2. **Track every result.** Hit rate, breakdown by market and confidence
   tier, calibration scatter — all public. Past performance does not
   guarantee future results, and the page says so.
3. **Disclose limitations.** No injury adjustment yet. No back-to-back
   modeling. Lines move. The model has not been validated to be
   profitable. All of this is on the methodology page.
4. **Educational framing.** This is a portfolio analytics project, not
   a tipster service. No paid tier, no subscription, no affiliate links
   to sportsbooks.

## Target users

- **Recruiters and hiring managers** evaluating end-to-end product
  engineering capability — pipeline, model, frontend, deployment.
- **People in the sports analytics space** evaluating the methodology and
  considering whether the approach is sound.
- **Sports fans** who are curious about how prop predictions are produced
  and want to see one in the open.

## Data sources

GametimePicks uses a multi-source provider system. Each provider implements
a common interface; the registry handles failover.

| Tier | Provider | Status | Use |
|---|---|---|---|
| 1 | nba_api | Full | Primary NBA stats — schedule, game logs, rosters, box scores |
| 1 | The Odds API | Full | Primary odds — player props from major US sportsbooks |
| 1 | demo | Full | Bundled offline fallback — guaranteed to render |
| 2 | balldontlie | Scaffold | NBA fallback if NBA.com is rate-limited |
| 2 | sportsdata | Scaffold | Commercial NBA + odds option |
| 2 | opticodds | Scaffold | Compliant theScore / broader sportsbook coverage |
| 3 | espn | Scaffold | Public schedule fallback |

Compliance: official APIs only, all keys via environment variables, no
scraping of sportsbook websites or reverse-engineered mobile-app endpoints.

## Model approach

The model is intentionally explainable. No deep learning, no black boxes.

```
projection = 0.45·last5 + 0.35·last10 + 0.20·season
           + 0.30 · (split_avg − base)        # home/away adjustment

P(over) = 1 − Φ ( (line − projection) / σ )   # σ from recent dispersion

p_implied = de-vig(american_odds_to_prob(over), american_odds_to_prob(under))

edge_pp = (P_model − P_implied) × 100
```

**Confidence tiers** are gated by edge magnitude AND data-quality:

- **High** — edge ≥ 5pp AND ≥ 8 recent games of data
- **Medium** — edge ≥ 2.5pp AND ≥ 5 recent games
- **No Play** — anything below the medium threshold

The dispersion floor in `build_features.py` is calibrated to realistic NBA
per-game variance (6.0 / 3.0 / 2.5 for PTS / REB / AST). Without these
floors a tightly-clustered short window produces unreasonably tight σ and
the model overstates probability.

## Pages

| Route | Purpose |
|---|---|
| `/` | Hero, KPI strip, three-step explainer, demo banner |
| `/board` | Today's leans with filter bar (market, confidence, edge, team, sort), schedule strip, prop cards |
| `/trends` | Per-player rolling averages, splits, recent games, sparklines, search + market toggle |
| `/results` | Hit rate KPIs, breakdowns by market and confidence, calibration scatter, recent settled |
| `/methodology` | Flow diagram, five formula blocks, data-source explanation, limitations, demo/live/hybrid explainer |
| `/responsible-use` | 9 disclosure blocks: not betting advice, no guarantees, lines move, age restrictions, no automation, follow local laws, no parlays in v1, etc. |

A persistent disclaimer banner ("Educational analytics · Not betting advice")
renders above the nav on every page.

A Data Source badge on the Model Board and Methodology pages exposes the
current data mode (Demo / Live / Hybrid), the active NBA source, the active
odds source, and the timestamp of the last pipeline run.

## Responsible-use framing

GametimePicks is presented as an educational analytics project, not a
betting product. The framing decisions:

- **Language** — "Model Lean" not "Pick", "Tracked Result" not "Win
  Guarantee", "edge" and "implied probability" instead of "value" and
  "vig-adjusted ROI"
- **Forbidden vocabulary** — no "lock", no "guaranteed", no "free money",
  no "smash", no "can't miss", no "beat the books", no "premium picks",
  no "subscription", no "sure thing", no "profit guaranteed"
- **No automation** — no bet placement, no API hand-off, no wallet
  integration
- **No monetization** — no paid tier, no Discord, no affiliate links to
  sportsbooks
- **Disclosure on every page** — persistent banner + Responsible Use page
  + Methodology limitations section

## Limitations

Honest enumeration of what the v1 model does not do:

1. No injury or starting-lineup adjustment — late scratches change inputs
2. No rest / back-to-back / travel adjustment
3. No pace adjustment (planned)
4. No matchup-specific defensive context beyond simple position averages
5. Lines move; the board is a snapshot in time
6. ROI not calculated (would require careful vig accounting)
7. Settlement framework is in place but `gameId` is not yet wired onto
   leans, so settle_results.py is a placeholder until Batch / Phase 5

## What I learned

**Product engineering**

- Splitting server pages from client interactive components in Next.js
  App Router (server reads JSON via `fs`, passes to client components for
  filter state) is the right pattern for static-export sites with rich
  interactivity.
- Strict TypeScript types as the contract between Python pipeline and
  Next.js frontend is a force multiplier — when the JSON shape changes,
  the build fails until the type matches.

**Data engineering**

- Multi-source provider abstractions are worth the upfront cost for
  failover hygiene, even when only two of seven providers are fully
  implemented. The scaffolds make the architecture visible without
  committing to seven live integrations.
- Demo-mode-as-default flips the question from "does this work in
  production" to "does this work without anything." Anything that breaks
  the demo path breaks the whole experience for previewers and recruiters.

**Modeling**

- Dispersion floors matter more than weight-tuning for explainable
  models. A tight σ on a small sample produces wild-looking edges that
  don't generalize.
- Confidence-tier gating by sample size (not just edge magnitude) is a
  cheap, honest signal-quality check.

**Responsible-use design**

- Aggressive disclaimer language at the page level looks honest but reads
  preachy. A persistent quiet banner above the nav does the same job
  without competing with the content.
- Forbidden-vocabulary audits during cleanup are useful — easy to slip
  into casual hype phrasing during writing.

## Resume bullets

> **GametimePicks — Sports Prop Analytics Lab.** Built a multi-source NBA
> player-prop analytics product end-to-end: Python pipeline (provider
> abstraction layer, registry-based failover, TTL caching) feeding a
> Next.js 14 / TypeScript frontend with strict static export. Implemented
> projection model, two-sided odds de-vigging, sample-size-gated
> confidence tiers, and calibration tracking. Live at
> gametimepicks.yashwantbalaji.com.

> **Designed for transparency over performance claims.** Persistent
> disclaimer banner, methodology page with formulas, results page with
> calibration scatter, and a clearly-labeled demo/live/hybrid mode
> indicator. No paid tier, no subscription, no affiliate sportsbook
> links — explicitly framed as an educational analytics project.

## LinkedIn launch post (draft)

> New project I shipped: **GametimePicks**, an educational sports prop
> analytics lab.
>
> It compares model projections against sportsbook lines for NBA player
> props (PTS / REB / AST), surfaces transparent model leans with
> explanations, and tracks every result publicly. Built end-to-end with
> a Python pipeline and a Next.js frontend.
>
> Why I built this: most sports analytics products in this space sell
> certainty. I wanted to see what the same product looks like when it
> shows the methodology, publishes its limitations, and tracks every
> outcome publicly.
>
> The interesting engineering: a multi-source provider abstraction layer
> with registry-based failover (nba_api → demo for stats, The Odds API
> → demo for odds), a sample-size-gated confidence model, and a static
> Next.js frontend that renders the same UI in demo or live mode.
>
> Not betting advice. Educational analytics. No guarantees. Live at:
> gametimepicks.yashwantbalaji.com
>
> #SportsAnalytics #DataEngineering #NextJS #Python

## Interview talking points

A short list of stories you can pull from when interviewing about this
project.

1. **"Why did you build the provider abstraction with four scaffolded
   providers instead of just implementing nba_api?"**
   — Because the architecture is the deliverable. Showing the failover
   pattern is more honest than showing five live integrations that I'd
   have to maintain. Each scaffold is a one-file commitment when I want
   to add it; the registry already knows about it.

2. **"How does the dispersion floor work and why does it matter?"**
   — In the score model, σ comes from the player's recent game variance.
   With only 5 demo games clustered tightly, σ would shrink to 2 PTS and
   the normal CDF would produce 85%-probable props. Real NBA per-game
   variance is closer to 6 PTS for scorers, so I floored σ at 6/3/2.5
   for PTS/REB/AST. This caps demo edges at realistic levels and protects
   real-data edges from small-sample degeneracy.

3. **"What does demo mode buy you?"**
   — Three things. (1) The deployment can be previewed by anyone without
   API keys. (2) The frontend never breaks — if every external provider
   fails, demo takes over and the UI shows "Demo" mode honestly. (3)
   Local development doesn't burn the 500-req/month free tier on every
   restart.

4. **"How would you scale this beyond NBA?"**
   — Same provider pattern. Add a `WNBADataProvider` interface that
   matches the NBA one (schedule, game logs, rosters), wire WNBA-specific
   provider implementations, and the rest of the pipeline doesn't change.
   The model itself is sport-agnostic — it operates on `(player_id,
   market, line, odds, recent_logs)` tuples.

5. **"What would you do differently?"**
   — Wire `gameId` onto leans from the start instead of trying to
   reconstruct settlement by date+player_id. Also, settlement is a real
   game I left as a placeholder; the framework is built, but the actual
   wiring needs to happen before claiming a real track record. ROI also
   deserves to exist eventually, but only after the methodology supports
   it without misleading anyone.

6. **"Why static export instead of SSR?"**
   — The JSON files are produced once a day by an offline pipeline.
   There's no per-request data. Static export is dramatically faster and
   cheaper to host, the failure mode is "the page is stale" not "the page
   500s", and Vercel handles it natively.

## Website case-study copy

A two-paragraph version for the case-study page on yashwantbalaji.com:

> **GametimePicks** is an educational sports prop analytics lab. It
> compares model projections against sportsbook lines for NBA player
> props, surfaces transparent model leans with one-sentence explanations,
> and tracks every result publicly. Real NBA player and team data via
> nba_api; live sportsbook odds via The Odds API; bundled demo data so
> the deployment renders even without API keys.
>
> The project is intentionally end-to-end: a Python pipeline with a
> multi-source provider abstraction (registry-based failover, TTL
> caching, normalized data shapes), an explainable projection model with
> two-sided odds de-vigging and sample-size-gated confidence tiers, and a
> Next.js 14 / TypeScript frontend with strict static export. Designed
> around transparency over performance claims — methodology page with
> formulas, results page with a calibration scatter, persistent
> disclaimer banner. Not betting advice; educational analytics.
