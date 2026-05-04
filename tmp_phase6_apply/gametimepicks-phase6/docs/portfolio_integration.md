# Portfolio Integration — yashwantbalaji.com

Drop-in copy and structure for adding GametimePicks as a project card and
(later) a case-study page on the main portfolio site.

---

## A. Project card copy for yashwantbalaji.com

For the projects rail (alongside Gametime Vault, Jersey Supply, and
Hothand). Use this exactly.

**Title**

> GametimePicks — Sports Prop Analytics Lab

**Subtitle**

> Model-board interface for NBA player props

**Description**

> An educational sports analytics project that uses a Python data pipeline
> and Next.js interface to compare model projections, market lines,
> implied probability, and edge in a transparent daily board format.

**Skill chips**

- Next.js
- Python pipeline
- NBA data
- model board
- edge tracking
- responsible analytics

**Primary CTA**

```
Launch Project  →  https://gametimepicks.yashwantbalaji.com/
```

**Secondary CTA**

```
View Methodology  →  https://gametimepicks.yashwantbalaji.com/methodology
```

**Accent color**

`lime (#A3E635)` — matches the GametimePicks site accent for visual
consistency between the portfolio card and the live destination.

**Status indicator** *(optional, if your card supports it)*

`Live · Demo`

## B. Case-study page outline

For a future page at `yashwantbalaji.com/gametimepicks`. Sections:

### 1 · Problem

The sports prop analytics space is dominated by paid-tipster services
that sell certainty. Subscription "lock pick" services and tout sites
monetize the appearance of edge while disclosing little about
methodology. Users get marketing-grade language and almost no
information about how predictions are produced.

### 2 · Product idea

A useful sports analytics product earns trust by being legible, not by
being confident. GametimePicks shows the work, tracks every result,
discloses limitations, and is framed explicitly as an educational
analytics project.

### 3 · Current version

A live demo foundation:

- Pipeline + provider architecture deployed
- Model board interface deployed
- Six pages live: Home, Model Board, Player Trends, Results,
  Methodology, Responsible Use
- Running on bundled demo data while the real-data validation is the
  next milestone

### 4 · Technical architecture

Python pipeline → JSON data contract → Next.js frontend. Multi-source
provider abstraction (nba_api + The Odds API + demo, with four more
scaffolded). Strict TypeScript types as the contract between pipeline
and frontend. Static export deployed to Vercel.

### 5 · Model board

Show the `/board` page screenshot. Caption:

> Model leans sorted by edge. Filter by market, confidence tier, edge
> threshold, or team. Each card shows the projection, edge, implied
> probability, and a one-sentence reason. Demo snapshot — sample data,
> not tonight's slate.

### 6 · Demo data disclaimer

A clear callout. The site is currently in demo mode. The architecture
is real. The data flowing through it is sample data while the next
milestone (real-data validation) is in progress.

### 7 · Responsible-use framing

GametimePicks is presented as an educational analytics project, not a
betting product:

- Persistent disclaimer banner on every page
- Methodology page documents the formulas and limitations openly
- Results page is clearly labeled "sample" while the model isn't
  validated yet
- No paid tier, no Discord, no affiliate links
- Vocabulary disciplined to "model lean," "edge," "implied
  probability" — not "lock," "sure thing," or "guaranteed"

### 8 · Next steps

Pulled from the roadmap:

- Validate real NBA data feed via `nba_api` end-to-end
- Add Odds API key + run pipeline in live mode
- Iterate on the projection model with real data
- Wire `gameId` onto leans for proper settlement
- Scheduled daily refresh via GitHub Actions
- Model backtesting once historical pipeline is in place

### 9 · What I learned

Pull 2-3 items from `docs/project_brief.md` "What I learned" section.
Pick the items most relevant to whoever's reading the case study.

### 10 · Links

```
Live site:    https://gametimepicks.yashwantbalaji.com
Repo:         https://github.com/yashwantbalaji3/gametimepicks
Methodology:  https://gametimepicks.yashwantbalaji.com/methodology
Results:      https://gametimepicks.yashwantbalaji.com/results
```

## C. Suggested link structure

**Primary (always live):**

```
Main portfolio card →
https://gametimepicks.yashwantbalaji.com/
```

This is the most important link. Recruiters click it from the portfolio
and they're in the product within one click.

**Secondary (optional, future):**

```
Case-study page →
https://yashwantbalaji.com/gametimepicks
```

Not strictly required for v1 — the live app's own pages already double
as a case study.

**Tertiary:**

```
Source →
https://github.com/yashwantbalaji3/gametimepicks
```

For technical readers.

## D. Homepage announcement copy *(use only when ready)*

Three lengths, all consistent with the site's framing:

**Long:**

> **GametimePicks** — an educational sports prop analytics project. A
> Python pipeline + Next.js interface that compares model projections
> against sportsbook lines for NBA player props, surfaces transparent
> model leans with explanations, and tracks every result publicly. v1
> live as a demo foundation; real-data validation is the next milestone.

**Medium:**

> **GametimePicks** — an educational sports analytics project. Pipeline
> + model board interface for NBA player props, framed around
> transparency, not performance claims.

**Short:**

> **GametimePicks** — sports prop analytics lab. Model board, demo
> foundation live.
