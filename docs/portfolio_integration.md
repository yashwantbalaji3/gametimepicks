# Portfolio Integration — yashwantbalaji.com

Copy and structure for integrating GametimePicks into the main portfolio
site. Drop-in ready when you're ready to add a fourth project card and
optional case-study page.

---

## A. Project card copy for yashwantbalaji.com

Use this on the main portfolio's projects rail (alongside Gametime Vault,
Jersey Supply, and Hothand).

**Title**

> GametimePicks — Sports Prop Analytics Lab

**Subtitle**

> Real NBA data + model-board interface

**Description (long)**

> An educational sports analytics project that compares player prop model
> projections against market lines, surfaces transparent model leans with
> one-sentence reasoning, and tracks results over time. End-to-end build:
> Python pipeline with multi-source provider abstraction, explainable
> projection model, Next.js frontend with strict static export.

**Description (short, for cards with tight space)**

> Educational sports analytics product comparing model projections to
> sportsbook lines for NBA player props, with public tracked results.

**Skill chips**

- NBA data pipeline
- Model board
- Implied probability
- Edge tracking
- Next.js + Python

**Optional extra chips if there's room**

- TypeScript
- Provider abstraction
- Calibration

**Primary CTA**

```
Launch GametimePicks  →
https://gametimepicks.yashwantbalaji.com
```

**Secondary CTA**

```
View methodology  →
https://gametimepicks.yashwantbalaji.com/methodology
```

**Color accent for the card**

Use `lime` (`#A3E635`) — matches the GametimePicks accent color for visual
consistency between the portfolio card and the live site.

## B. Full case-study outline

If you decide to build a dedicated case-study page at
`yashwantbalaji.com/gametimepicks`, this is the structure.

### Hero section

- **Project name:** GametimePicks
- **Tagline:** Sports prop analytics lab
- **Subtitle:** Educational analytics product comparing model projections
  against sportsbook lines for NBA player props
- **Two CTAs:** "Launch the live app" + "View on GitHub"
- **Lime accent** consistent with the live site

### 1 · Problem

> The sports prop analytics space is dominated by paid-tipster services
> that sell certainty. Subscription "lock pick" services, paid Discord
> servers, and tout sites monetize the appearance of edge while
> disclosing little about methodology. Users get marketing-grade
> language and almost no information about how predictions are produced
> or how the predictor has performed.

### 2 · Product thesis

> A useful sports analytics product earns trust by being legible, not by
> being confident. GametimePicks shows the work, tracks every result,
> discloses limitations, and is framed explicitly as an educational
> analytics project.

### 3 · Data

Show the provider system as a small diagram or table. Three Tier-1
providers fully implemented (nba_api, The Odds API, demo). Four Tier-2/3
scaffolded with the same interface. Failover is automatic via registry.

Compliance bullet points: official APIs only, all keys via environment
variables, no scraping of sportsbook websites, no reverse-engineered
mobile-app endpoints.

### 4 · Method

Diagram or formula block:

```
projection = 0.45·last5 + 0.35·last10 + 0.20·season + 0.30·(split − base)
P(over)    = 1 − Φ((line − projection) / σ)
edge_pp    = (P_model − P_implied) × 100
```

Three-line explainer about confidence-tier gating by edge magnitude AND
recent-games sample size.

### 5 · Model board

Screenshot of the `/board` page with the filter bar visible. Caption
something like:

> Model leans sorted by edge. Filter by market, confidence tier, edge
> threshold, or team. Each card shows the projection, edge, implied
> probability, and a one-sentence reason.

### 6 · Results tracking

Screenshot of the `/results` page. Caption:

> Every settled lean is logged publicly. Hit rate is broken down by
> market and confidence tier. Calibration scatter compares predicted vs.
> actual probability — the more buckets sit on the y=x line, the better
> calibrated the model.

### 7 · Responsible-use note

A clear callout box, lime-bordered:

> GametimePicks is an educational analytics project. Not betting advice.
> No guarantees. Past performance does not predict future results.
> Use responsibly.

### 8 · What I learned

Pull 2-3 items from `docs/project_brief.md` "What I learned" section.
Pick the ones most relevant to the audience reading the case study.

### 9 · Links

```
Live site:     https://gametimepicks.yashwantbalaji.com
GitHub:        https://github.com/<your-username>/gametimepicks
Methodology:   https://gametimepicks.yashwantbalaji.com/methodology
Results:       https://gametimepicks.yashwantbalaji.com/results
```

## C. Suggested link structure

**Primary (always live):**

```
Main portfolio card →
https://gametimepicks.yashwantbalaji.com
```

The portfolio card links straight to the live app. This is the most
important link. Recruiters click it from the portfolio and they're in
the product within one click.

**Secondary (optional, future):**

```
Case-study page →
https://yashwantbalaji.com/gametimepicks
```

The case-study page is a writing piece for people who want context before
clicking through. Not strictly required for v1 — the live app's own pages
(methodology, responsible-use) are already a case study.

**Tertiary (always available):**

```
GitHub →
https://github.com/<your-username>/gametimepicks
```

For technical readers who want to read the code.

## D. Homepage announcement copy

When you push the project live and want to surface it on the homepage:

> **New project: GametimePicks** — a sports prop analytics lab built
> with real NBA data, model projections, and transparent edge tracking.

Or shorter:

> **Just shipped:** GametimePicks, a transparent sports prop analytics
> lab. NBA player props, model leans with reasoning, public tracked
> results.

Or longest:

> **New project — GametimePicks.** An educational sports analytics
> product that compares model projections against sportsbook lines for
> NBA player props, surfaces transparent model leans with explanations,
> and tracks every result publicly. Built end-to-end: Python pipeline,
> provider abstraction, Next.js frontend. Not betting advice — educational
> analytics.

## E. Optional — homepage hero rotation

If your portfolio homepage shows a rotating hero project banner, here's
the rotation copy:

```
Rotation 1
─────────
GametimePicks
Sports prop analytics lab.
NBA player props · model board · tracked results
[Launch →]

Rotation 2
─────────
Hothand
Sports card market signal engine.
[…]

Rotation 3
─────────
Jersey Supply
Discord-driven streetwear drop tracker.
[…]
```

(Adjust based on existing homepage hero structure when you integrate.)
