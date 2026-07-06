# GameTime Picks

> A **paper-only sports analytics** product. GameTime Picks ranks model-qualified picks, runs two
> educational paper-bankroll products (Bank Builder and Moonshot), and tracks every result against
> **official settlement** — transparently, with no real-money wagering.

**Live →** [gametime-picks.vercel.app](https://gametime-picks.vercel.app/)

> ⚠️ **Educational analytics only. No real-money betting. No guarantees.** Every product is paper —
> no wagers are placed and no money is at stake. Picks are model output, not advice. Records are the
> real settled outcomes; a losing day is shown as a losing day.

---

## What it is

A Python data pipeline + a Next.js (static-export) site that:

1. pulls **real odds** (the-odds-api) and **official results** (API-Football / MLB Stats API),
2. builds de-vigged model probabilities and ranks picks by **settled market reliability × model
   probability + edge — never by payout**,
3. runs paper products off a single $100 → (currently) ~$19K educational bankroll, and
4. settles everything from **official results only** — pending is never counted as a loss, and canonical
   money moves *only* through official settlement.

The models are intentionally explainable (no black boxes) so every projection is auditable.

## Flagship products (all paper-only)

| Product | Route | What it is |
|---|---|---|
| **Bank Builder** | `/bank-builder` | The core ladder: grow a $100 seed step-by-step on 2–3 leg team/game-market cards. A **7-step profit-locking ladder (v2.1)** is shown as a preview; live settlement runs the v1 full-roll ladder. |
| **Moonshot** | `/moonshot` | A separate, higher-variance 3-step longshot ladder ($25 → $1,500), grouped by game, team markets preferred. |
| **Model Top 10** | Home · `/today` · `/picks` | The cross-sport daily board — best model-qualified picks with a reason + risk + source on each. |
| **World Cup board** | `/world-cup` · `/world-cup/round-of-32` | The knockout board with de-vigged team-market model reads and forward games. |
| **World Cup Specials** | `/world-cup-specials` | Structured WC longshot tiers (no forced tier). |
| **MLB board** | `/mlb` | Real MLB odds + player props (the post-World-Cup sport focus). |
| **Mr. Dub** | `/mr-dub` | The canonical paper-bankroll ledger — the full settled journey, reconciled. |
| **Results** | `/results` | Settled-only truth: records, not a live scoreboard. |
| **Methodology** | `/methodology` | How the math, the ladders, and the market-reliability weights work — in plain English. |
| **Ops** *(internal)* | `/ops` | A read-only admin dashboard (money, slate, product readiness, daily checklist). Not in nav; `noindex`. |

*Homer Nukes (an MLB home-run product) is **retired** — its route is a retired landing.*

## The settlement-discipline moat

Records are honest because settlement is strict:

- **Official results only** — WC from API-Football, MLB from the MLB Stats API. Nothing is estimated.
- **Canonical money changes only through official settlement.** Every other script (refresh, activate,
  status) is md5-guarded against moving `portfolio.json` / `banked-ladders.json`.
- **Pending is not a loss** — a game in progress stays honestly pending until it's final.
- **No forced cards** — when the slate can't field a strong pick, the product shows a no-play with a reason.
- **No fabrication** — odds, scores, props, assets, hit-rates, and EV are real or a deterministic fallback.

Money integrity is enforced by gates (`verify-money-integrity` · `forensic-money-audit` · `health-check`)
that must pass before any deploy.

## Responsible framing

This is an analytics/education product, not a sportsbook. The design is casino/sportsbook-*inspired*, but
the copy never promises profit, never implies real-money wagering, and never uses guarantee language.
A disclaimer and responsible-use note appear across the site.

## Tech stack

- **Frontend:** Next.js (App Router, `output: export` static site) + TypeScript + Tailwind, deployed on Vercel.
- **Pipeline:** Python (odds/results ingestion, projections, board + props builders, settlement).
- **Data:** committed JSON artifacts under `app/public/data/` (the site reads them at build; time-dependent
  state re-derives client-side so a static export never shows a stale clock).
- **Automation:** GitHub Actions (nightly settle, daily lifecycle, scheduled rebuild). See `docs/OWNER_ACTIONS.md`.

## Local setup

```bash
# 1. Frontend
cd app && npm install
npm run dev            # http://localhost:3000

# 2. Pipeline (creates a virtualenv on first run)
cd .. && bash scripts/run_pipeline.sh    # or python -m pipeline...

# 3. Real data (optional): add keys to .env at the repo root
#    ODDS_API_KEY=<the-odds-api key>   API_FOOTBALL_KEY=<api-football key>
python3 -m pipeline.check_odds_key        # verify the odds key (FREE — never prints the key)
```

## Daily ops (summary)

The daily loop is one command or a stepped chain (see `docs/DAILY_CLAUDE_RUNBOOK.md`):

```bash
# Refresh today's products (real odds; md5-guards money; fail-closed credit-floor guard)
bash scripts/refresh_daily_products.sh --date <YYYY-MM-DD>

# Settle a finished slate (official results only; dry-run first, then --apply)
bash scripts/settle_soccer_day.sh --date <YYYY-MM-DD> [--apply]

# The one-command cycle: settle → gate → generate → gate → deploy → smoke
bash scripts/roll_to_next_day.sh --apply
```

**Gates (definition of done):** `tsc` · full tests · `npm run build` · money-integrity · forensic ·
health · production smoke 9/9. Never deploy red.

The operating model — running the product with Claude as the team — is documented in
`docs/CLAUDE_TEAM_OPERATING_SYSTEM.md`, `docs/CLAUDE_TOOL_USAGE_GUIDE.md`, and `docs/CEO_DAILY_WORKFLOW.md`.

## Status

**Pre-launch hardening for a July-10 soft launch.** The flagship products are live and running on real
odds + official settlement; the daily automation is being hardened (credit-floor guard, owner secrets,
scheduled rebuild). Model tuning and live LADDER_V2 money settlement are intentionally out of scope until
each is fully proven. See `docs/JULY_10_GO_NO_GO.md`.

## License / disclaimer

Educational and paper-only. Not betting advice. Not a sportsbook. No wagers are placed and no money is at
stake. Sports data belongs to its respective providers.
