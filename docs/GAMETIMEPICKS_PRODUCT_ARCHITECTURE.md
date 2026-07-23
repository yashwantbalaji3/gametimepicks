# GameTimePicks — Product Architecture (Target IA + State Model)

_Date: 2026-07-23. Scope: the **target** information architecture and per-route state model. This is a
design target, **not** a launch instruction — nothing here says "ship it tonight." Every claim is anchored to
an artifact, route, registry, or workflow that was read while writing this doc; citations are repository-relative
paths. **No code or data is changed by this document. Money is frozen** — `portfolio.json`, Bank Builder,
Moonshot, and Mr. Dub are out of scope and untouched (money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14,
exposure $0, modeling gate BLOCKED)._

Ground-truth sources:
`docs/MULTI_SPORT_CAPABILITY_AUDIT.md`, `docs/SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md`,
`docs/MLB_RESEARCH_TIMESTAMP_INCIDENT.md`, `docs/PUBLIC_BETA_LAUNCH_AUDIT.md`,
`docs/PUBLIC_BETA_DAILY_OPERATIONS.md`, `docs/PRODUCT_ARCHITECTURE_TARGET_STATE.md`,
`docs/CURRENT_ROUTE_INVENTORY.md`, `app/src/components/nav.tsx`, `app/src/lib/sports-coverage.ts`,
`app/src/lib/product-status.ts`, `app/src/lib/nav-active-route.ts`.

---

## 0. The one hard rule (read this first)

**A route becomes a public nav item ONLY when its data is real AND its honesty gate is met. Everything else is
internal-only or clearly labeled "coming soon / not yet available." We never add a misleading empty public tab.**

Corollaries:

1. An empty or stale public tab that implies coverage it does not have is a **defect**, not a placeholder. If a
   sport/section has no live data + no passing honesty gate, it is either (a) an honestly-labeled "coming soon"
   card **inside a directory**, (b) an archive-labeled surface, or (c) internal-only. It never gets its own live
   top-level tab.
2. The **"Markets" (event / prediction-market) section is UNSUPPORTED today** (`SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md`
   §3). It stays **internal-only** until an event-intelligence engine exists. It appears in this target IA as a
   planned shape, gated behind the build in `DOC 2 → P1.2`, never as a public nav item before that.
3. **No superiority language, anywhere.** Allowed frame: "simulation-powered," "10,000-run," "market comparison,"
   "model gap," "public beta," "not market-proven." Forbidden: "edge," "EV," "value," "lock," "best bet,"
   "beat the market," "profitable," "guaranteed" (`PUBLIC_BETA_LAUNCH_AUDIT.md` H2–H3, M7, L2).
4. **Money is frozen.** No item in this IA reads, writes, or reframes `portfolio.json` / Bank Builder / Moonshot.

---

## 1. Capability tiers (vocabulary)

Extends the classification used in `MULTI_SPORT_CAPABILITY_AUDIT.md`. Every route below is assigned exactly one.

| Tier | Meaning | Default visibility |
|---|---|---|
| **PRODUCTION_READY** | Real current data end-to-end + active automation. The underlying engine is sound. | Public (framed public beta) |
| **PUBLIC_BETA_CAPABLE** | Meets the honesty gate to ship publicly under the "public beta" frame; no superiority claim. | Public nav item |
| **RESEARCH_ONLY** | Real internal pipeline exists but fail-closes (unvalidated / no backtest). | Internal, or public but clearly experimental + gated; **never in product cards** |
| **HISTORICAL_ONLY** | Real past data, no current season. | Archive-labeled, reachable but not an active nav item |
| **SCAFFOLD_ONLY** | Route/tabs exist, no live data pipeline. | "Coming soon / provider pending," honestly empty |
| **UNSUPPORTED** | Nothing built (no schema/route/data/settlement). | Internal-only at most; not a public route |

Note on MLB: its **engine/pipeline is PRODUCTION_READY** (`MULTI_SPORT_CAPABILITY_AUDIT.md` §MLB), but its
**public product is deliberately framed PUBLIC_BETA_CAPABLE** — modeled markets are recorded as NOT market-beating
(`app/src/lib/mlb/model-calibration-status.ts`). Both labels are true and intentional.

### Route-visibility states (the state model's outer layer)

| Visibility | Definition | Promotion gate |
|---|---|---|
| `PUBLIC_NAV` | In the primary/secondary nav spine. | Tier ∈ {PRODUCTION_READY, PUBLIC_BETA_CAPABLE} **and** honesty gate passes. |
| `PUBLIC_UNLINKED` | Reachable by URL, not in nav (power-user / deep link). | Real content, honest, but not promoted. |
| `COMING_SOON` | Rendered as a labeled placeholder inside a directory. | SCAFFOLD_ONLY / provider-pending. Never claims data it lacks. |
| `ARCHIVE` | Historical, past-tense, fail-closed freshness. | HISTORICAL_ONLY. |
| `INTERNAL_ONLY` | Not exported to the public build, or `noindex` + pruned. | RESEARCH_ONLY / UNSUPPORTED. |

The static export prunes internal routes/data from `out/` (`PUBLIC_BETA_DAILY_OPERATIONS.md` "Failed build").
**`noindex` is not privacy on a static host** (`CURRENT_ROUTE_INVENTORY.md` RED row) — INTERNAL_ONLY routes must
be excluded from the export, not merely `noindex`.

---

## 2. Target top-level IA (the public spine)

```
Today · Sports · Simulations · Results · Research · Methodology · Responsible Use
        │
        └─ Sports = directory → MLB (live) · NBA (archive/off-season) · NHL · Soccer · Cricket (coming soon) · UFC (experimental, gated)

Flagship Picks (paper, money-frozen, founder-owned — placement UNCHANGED by this restructure):
        Bank Builder · Moonshot · Daily Dashboard (Mr. Dub)

Internal-only (NOT public nav until their engine + gate exists — see DOC 2):
        Markets → Trending · Player Movement · Coaching · Awards · Draft · Tournament Futures · Resolved
```

Why this shape:

- **Simulations is the product topic**, not the sport tabs (`PRODUCT_ARCHITECTURE_TARGET_STATE.md` "Three pillars").
- **Sports is a directory**, so exactly one live sport (MLB) can sit under it without every dead sport getting a
  misleading live tab — the honest per-sport state lives in the directory (`app/src/lib/sports-coverage.ts`).
- **Markets is drawn but not wired.** It is the planned home for event/prediction contracts, kept internal until
  the evidence warehouse + models exist. Showing it now would violate the hard rule.
- **Flagship Picks stays where it is.** Bank Builder / Moonshot / Daily Dashboard are money-frozen and founder-owned;
  this IA does not move, merge, or relabel them. They remain in the current spine (`app/src/components/nav.tsx`).

---

## 3. Per-route architecture

Columns: **Tier · Visibility · Data source · Empty state · Coming-soon behavior · Activation criteria.**
"Activation criteria" = the exact condition that promotes the route to `PUBLIC_NAV` (or, for internal routes,
to "may be built / may publish").

### 3.1 Today

| Route | Tier | Visibility | Data source | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/today` (also owns `/`) | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | Freshest ingested MLB board `app/public/data/mlb/boards/<date>.json`; `SlateLivenessBanner` (real ET clock) | "No games today · next up …" honest banner; non-dated fallback (`PUBLIC_BETA_LAUNCH_AUDIT.md` M4) | n/a (already live) | Already met. Stays public while the daily health-check is HEALTHY (`PUBLIC_BETA_DAILY_OPERATIONS.md` step 1). |

Today is the default landing (`nav-active-route.ts`: home bucket owns `/` and `/today`). It shows **status**, not a
second homepage (`PRODUCT_ARCHITECTURE_TARGET_STATE.md`).

### 3.2 Sports (directory) + per-sport hubs

`/sports` is the **public directory**; the honest per-sport level comes from `app/src/lib/sports-coverage.ts`
(`full` / `projections` / `schedule` / `coming-soon`) and its `COVERAGE_BADGE`. Only sports whose tier is
PRODUCTION_READY/PUBLIC_BETA_CAPABLE render as a **live** destination; the rest render as archive or coming-soon
cards **within** the directory.

| Route | Tier | Visibility | Data source | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/sports` | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | `sports-coverage.ts` registry + `event-schedules.ts` | Directory always renders; per-card honest badges | Cards labeled per tier | Already met (directory is honest by construction). |
| `/mlb` (+ `/mlb/board`, `/mlb/parlays`, `/mlb/power`, `/mlb/results`) | PRODUCTION_READY → framed PUBLIC_BETA | PUBLIC_NAV | `mlb/boards`, `mlb/team-markets`, `mlb/player-props`, `mlb/game-simulations`, `mlb/results/settled_leans.jsonl` | Honest no-play / "latest slate · N days ago" | n/a | Met. Stays public while the **four slate artifacts** exist for the date (`mlb-slate-completeness-gate.mjs`) and health-check is HEALTHY. |
| `/nba` (+ board/parlays/power/results) | HISTORICAL_ONLY | ARCHIVE (public-unlinked hub) | root `boards/<date>.json` (empty `ScheduleUnavailable` since 2026-06-13 Finals); `nba/team_projections` (stale) | "Between slates / off-season" | Directory card: "returns October" | Promote to PUBLIC_NAV only when the season resumes AND live boards flow again AND the four-artifact equivalent is met. Registry `level:"full"` is **aspirational** today (`MULTI_SPORT_CAPABILITY_AUDIT.md` §NBA). |
| `/nhl` (+ board/parlays/power/results) | SCAFFOLD_ONLY | COMING_SOON | `nhl/schedule/*` (stale to 2026-05-24), free NHL API; no odds/projection pipeline | Self-declared "honestly empty… we do not fabricate" | Directory card: "schedule only" | Needs a real odds + projection + settlement pipeline (none exists) before it is anything but schedule-only. |
| `/ipl` (+ board/parlays/power/results); Cricket | SCAFFOLD_ONLY | COMING_SOON | `ipl/schedule/*` (stale to 2026-05-24) ESPN; orphaned `cricket/boards/2026-05-26.json` (no route) | "provider pending… do not fabricate" | Directory card: "schedule only" | Needs a stable per-player stats source + projections. The orphaned cricket board must NOT get a route until it is current + modeled. |
| Soccer non-WC (EPL / UCL / MLS) | SCAFFOLD_ONLY | COMING_SOON | MLS snapshot baked in `event-schedules.ts`; internal FIFA/Poisson engine `data/internal/world-cup/projection-engine/*` (unvalidated, N insufficient) | No `/soccer` route; schedule only via `/events` | Directory card: EPL "coming soon," MLS "schedule only" | Public soccer product requires a **validated** projection engine (currently research-only) + live fixtures + odds. |
| `/ufc` | RESEARCH_ONLY | PUBLIC_UNLINKED (experimental, gated) | `ufc/schedule-latest.json`, `ufc/odds-latest.json` (h2h), 2,695-fighter DB, v1/v2 engine; `readiness-latest.json` `projectionsReady:false` (fail-closed) | Fight card + gated projections ("data-gated until … a backtest") | Directory card: "experimental" | Promote only after a **leakage-safe historical backtest** clears (today 0/150 clean rows, `backtestReady:false`). **Never in product cards** until validated. See DOC 2 → P1.1. |
| `/world-cup` (+ groups/round-of-32/schedule/team/teams) | HISTORICAL_ONLY | ARCHIVE | `world-cup/settlement/*` (newest real 2026-07-07); `projections/latest.json` `matchCount:0` | Fail-closed freshness → never reads "live today" | Not a coming-soon; it is **done** | Stays ARCHIVE permanently. Enforced by `world-cup-closeout.test.mjs`. Excluded from `sports-coverage.ts` + nav by design. |
| `/events` | PUBLIC_BETA_CAPABLE | PUBLIC_UNLINKED | ESPN scoreboard snapshots (WNBA/UFC/WC), attributed inline | Schedule-only; states "no odds, no projections, no parlays, no picks" | Is itself the coming-soon surface | Met as a schedule hub. It is NOT an event-market surface (`SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md` row 9). |

WNBA = HISTORICAL_ONLY (stale baked snapshot, `event-schedules.ts`), surfaced only via `/events`. NFL / NCAAB =
UNSUPPORTED (no data/route) — they do not appear anywhere public.

### 3.3 Simulations

| Route | Tier | Visibility | Data source | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/simulate` (Simulation hub; `/games` aliases here) | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | `mlb/game-simulations/<date>.json` (`runCount`, `modelVersion`); `market-coverage.ts` matrix | Honest "no simulations today" no-op; per-market availability badges | Per-sport cards labeled by tier | Met for MLB. A sport's sim center goes live only when that sport is ≥ PUBLIC_BETA_CAPABLE. |
| `/games/[sport]/[gameId]` | PUBLIC_BETA_CAPABLE | PUBLIC_UNLINKED | per-game sim/report artifacts; `dynamicParams=false` + `notFound()` | MLB games show the generic "build your own" fallback (honest) | n/a | Per-game MLB card mapping is future work, not a defect (`PUBLIC_BETA_LAUNCH_AUDIT.md` L5). |
| `/projections`, `/board`, `/trends`, `/picks`, `/build`, `/parlay-lab`, `/parlays` | mixed | PUBLIC_UNLINKED / alias / retired | existing per-route data | honest empty / retired badge | n/a | Legacy surfaces. Keep reachable (compatibility), de-primary. `/trends` retired+noindex. |

Full-game score simulation is **market-implied, labelled experimental** — never served as a prediction of the score
(`PRODUCT_ARCHITECTURE_TARGET_STATE.md` per-sport). Simulations carry the methodology labels: independent /
market-anchored / market-implied / projection-only / experimental.

### 3.4 Markets (event / prediction contracts) — **INTERNAL-ONLY, NOT PUBLIC NAV**

**Status: UNSUPPORTED** across the board (`SPORTS_EVENT_MARKET_CAPABILITY_AUDIT.md` §3). There is no event-contract
schema, no news/evidence ingestion, no multi-outcome model, no resolution-rule storage, no event-price capture, and
no event-outcome settlement. The per-game prop simulator **cannot** be reused (different resolution source, binary
vs multi-outcome, box-score vs evidence-driven, same-day vs long-horizon — audit §5). This section is the **target
shape** of a future product; every sub-route below is `INTERNAL_ONLY` until the evidence warehouse + models are
built and pass an honesty gate.

| Sub-route (target) | Tier | Visibility | Data source (when built) | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/markets/trending` | UNSUPPORTED | INTERNAL_ONLY | event-price capture (Kalshi/Polymarket or internal) — **does not exist** | No public surface | Not shown publicly | Requires gap items 1–8 (audit §4): schema, ingestion, evidence timeline, multi-outcome model, entity registry, resolution engine, price capture, event settlement. |
| `/markets/player-movement` | UNSUPPORTED | INTERNAL_ONLY | news/beat-reporter ingestion (only manual `pipeline/manual_overrides/news_signals.json` exists) | — | — | Real (non-manual) evidence ingestion + entity registry for players/teams. |
| `/markets/coaching` | UNSUPPORTED | INTERNAL_ONLY | none (no coach/executive registry) | — | — | Entity registry extended to coaches/executives + resolution rules. |
| `/markets/awards` | UNSUPPORTED | INTERNAL_ONLY | none | — | — | Multi-outcome (N-way) probability model + evidence timeline. |
| `/markets/draft` | UNSUPPORTED | INTERNAL_ONLY | none | — | — | Entity registry for draft slots + resolution rules. |
| `/markets/tournament-futures` | UNSUPPORTED | INTERNAL_ONLY | de-vig proxies exist only for WC 90' results, explicitly "not an outright market" | — | — | True outright model, not a game-result proxy. |
| `/markets/resolved` | UNSUPPORTED | INTERNAL_ONLY | event-outcome settlement path — **does not exist** | — | — | News-/rule-resolved settlement (not box-score `gamePk` join). |

**Hard rule restated for this section:** none of `/markets/*` may be added to public nav, exported to `out/`, or
linked from any public page until (a) the evidence warehouse exists, (b) a multi-outcome model is validated
out-of-sample, and (c) an honesty gate equivalent to the MLB research gate passes. Until then it is a **research
warehouse with no public surface** (DOC 2 → P1.2).

### 3.5 Results

| Route | Tier | Visibility | Data source | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/results` (Trust Center) | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | `portfolio.json` (official 19-14, $0 exposure); `mlb/results/comparison_report_<date>.json` (neutral single-date) | "pending ≠ loss"; sample-size disclaimers | n/a | Met. |
| `/results/model-audit`, `/results/mlb`, `/results/date/[date]`, `/results/parlays` | PUBLIC_BETA_CAPABLE | PUBLIC_UNLINKED | settled artifacts | honest empty | n/a | Met (reachable, de-primary). Model audit lives under Learn per nav active-state. |
| `/results/nba`, `/results/nhl`, `/results/ipl` | HISTORICAL_ONLY / SCAFFOLD_ONLY | PUBLIC_UNLINKED | per-sport settled/empty | honest empty | n/a | Dup URLs; keep honest, do not promote. |
| `/mr-dub` (Daily Dashboard) | PUBLIC_BETA_CAPABLE | PUBLIC_NAV (Flagship cluster) | `portfolio.json` derived ledger | settled dashboard | n/a | **Money-frozen; founder-owned; unchanged.** |

**The four record families are never combined** (`PUBLIC_BETA_DAILY_OPERATIONS.md`): official paper record
(public), public simulation projection accuracy (public, neutral), research observation settlement (internal),
market-baseline benchmark (internal). Guarded by `record-family-separation.test.mjs`.

### 3.6 Research

| Route | Tier | Visibility | Data source | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/research` (public status page) | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | Milestone list (progress framing, not raw gate math) | Milestones render; "next milestone: 30 qualifying dates" | n/a | Met. Shows **progress**, never the raw `BLOCKED` / `1/30` / `INSUFFICIENT` internals (`PUBLIC_BETA_LAUNCH_AUDIT.md` L3). |
| Internal research warehouse (`data/internal/mlb/pregame-archive/*`) | RESEARCH_ONLY | INTERNAL_ONLY | pregame captures, settlement joins, observation-quality, benchmark | — | — | Stays internal. Public modeling claims require the modeling gate to move off BLOCKED (today 1/30 dates). See DOC 2 → P0. |

### 3.7 Methodology · Responsible Use · Learn · About · Market Guide

| Route | Tier | Visibility | Data source | Empty state | Coming-soon | Activation criteria |
|---|---|---|---|---|---|---|
| `/methodology` | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | static content; per-page metadata (`PUBLIC_BETA_LAUNCH_AUDIT.md` M1) | n/a | n/a | Met. Must keep the simulation-label glossary + WC-archived past tense. |
| `/responsible-use` | PUBLIC_BETA_CAPABLE | PUBLIC_NAV | static | n/a | n/a | Met. Paper-only, educational framing. |
| `/learn` | PUBLIC_BETA_CAPABLE | PUBLIC_NAV (folds under "How It Works") | static education hub | n/a | n/a | Met (MLB-first; WC last + "Archived"). |
| `/about` | PUBLIC_BETA_CAPABLE | PUBLIC_UNLINKED | static | n/a | n/a | Met. |
| `/market-guide` | PUBLIC_BETA_CAPABLE | PUBLIC_UNLINKED | betting-term glossary (NOT an event-market surface) | n/a | n/a | Met. Rename risk: keep it clearly a glossary, not "Markets." |

### 3.8 Flagship Picks (paper, money-frozen — placement UNCHANGED)

| Route | Tier | Visibility | Note |
|---|---|---|---|
| `/bank-builder` | PUBLIC_BETA_CAPABLE (paper) | PUBLIC_NAV | Money-frozen. Derives no-play honestly. **Out of scope for this restructure.** |
| `/moonshot` | PUBLIC_BETA_CAPABLE (paper) | PUBLIC_NAV | Money-frozen. Longshot paper lane. **Out of scope.** |
| `/picks`, `/build` | PUBLIC_BETA_CAPABLE | PUBLIC_NAV / secondary | Paper builders. `UFC + settlement-blocked markets excluded` by `market-coverage.isProductEligible`. |

### 3.9 Internal / retired surfaces

| Route | Disposition |
|---|---|
| `/ops` | INTERNAL_ONLY. Must be **excluded from the export**, not just `noindex` (`CURRENT_ROUTE_INVENTORY.md` RED). |
| `/preview/june20` | INTERNAL_ONLY. Stale review build — exclude from build. |
| `/homer-nukes`, `/trends`, `/world-cup-specials` | Retired landings (retired badge, noindex). Keep as honest retired pages; never re-promote. |

---

## 4. Per-route state model

Two independent axes drive every route's rendering. Reuse the existing vocabulary — do **not** invent a parallel one.

1. **Route visibility** (§1): `PUBLIC_NAV → PUBLIC_UNLINKED → COMING_SOON → ARCHIVE → INTERNAL_ONLY`.
   Owns whether the route is promoted, deep-linked, placeholdered, archived, or hidden.
2. **Content status** — the daily lifecycle, already modeled by `app/src/lib/product-status.ts`
   (16 states incl. `pregame`, `in_progress`, `awaiting_settlement`, `awaiting_refresh`, `no_qualified_play`,
   `market_pending`, `market_unavailable`, `settled`, `stale`, `retired`). This is what the per-card badges show.

Promotion (SCAFFOLD/RESEARCH/HISTORICAL → PUBLIC_NAV) is a **one-way gate keyed on evidence**:

```
COMING_SOON ──(live data pipeline + honesty gate)──▶ PUBLIC_NAV
RESEARCH_ONLY ──(out-of-sample validation + gate)──▶ PUBLIC_UNLINKED (experimental) ──▶ PUBLIC_NAV
HISTORICAL_ONLY ──(season returns + live data)─────▶ PUBLIC_NAV
UNSUPPORTED ──(engine built + gate)────────────────▶ INTERNAL_ONLY ──▶ (future) PUBLIC
```

Demotion is automatic and honest: if a sport's live data goes stale, its content status flips to `stale` /
`awaiting_refresh` and the freshness banner tells the truth (`FreshnessBadge`, real browser ET clock) — the route
is not silently left looking live.

---

## 5. Empty-state & coming-soon standard (one pattern for all)

Every non-live surface uses the same honest pattern (already the house style — `/nhl`, `/ipl`, `/events`,
`/research`):

- **State the truth in plain English.** "Schedule only — no model projections or parlays yet." / "No games today ·
  next up …" / "Experimental — data-gated until a backtest is connected."
- **Attribute the data** you do show (source name + snapshot date + link), and show **nothing** you cannot attribute.
- **Never fabricate** a projection, price, or pick to fill a gap. A missing market renders `market_unavailable` /
  `market_pending`, not a made-up number.
- **Coming-soon lives inside a directory**, never as its own live top-level tab.
- **Archive is past-tense + fail-closed** so a finished season never reads "live today."
- **Progress, not internals.** Public research/coming-soon copy shows milestones, never raw `BLOCKED` / `1/30` /
  `INSUFFICIENT` gate math.

---

## 6. Existing-route disposition (every current route accounted for)

| Current route | Target home | Visibility | Change |
|---|---|---|---|
| `/`, `/today` | Today | PUBLIC_NAV | keep |
| `/mlb` (+board/parlays/power/results) | Sports → MLB | PUBLIC_NAV | keep |
| `/nba`,`/nhl`,`/ipl` (+subs), `/board` | Sports (archive / coming-soon) | ARCHIVE / COMING_SOON | keep, honest labels |
| `/ufc` | Sports → UFC (experimental) | PUBLIC_UNLINKED | keep gated; never in product cards |
| `/world-cup` (+subs), `/world-cup-specials` | Archive | ARCHIVE / retired | keep, enforced by test |
| `/events` | Sports (schedule hub) | PUBLIC_UNLINKED | keep |
| `/simulate`, `/games`, `/games/[sport]/[gameId]` | Simulations | PUBLIC_NAV / unlinked | keep; `/games`→`/simulate` alias |
| `/projections`, `/picks`, `/build`, `/parlay-lab`, `/parlays`, `/trends` | Simulations / Flagship / legacy | PUBLIC_UNLINKED / retired | de-primary; keep reachable |
| `/bank-builder`, `/moonshot`, `/mr-dub` | Flagship Picks | PUBLIC_NAV | **money-frozen, unchanged** |
| `/results` (+model-audit/mlb/date/parlays/nba/nhl/ipl) | Results | PUBLIC_NAV / unlinked | keep; Trust Center |
| `/research` | Research | PUBLIC_NAV | keep |
| `/methodology`, `/responsible-use`, `/learn`, `/about`, `/market-guide` | Methodology / Responsible Use / Learn | PUBLIC_NAV / unlinked | keep |
| `/ops`, `/preview/june20` | Internal | INTERNAL_ONLY | **exclude from export** |
| `/markets/*` | Markets (future) | INTERNAL_ONLY | **does not exist yet — do not create public** |

---

## 7. Guardrails that keep this IA honest (already in the repo)

- `sports-coverage.ts` — single source of truth for per-sport level; forbids "full" without a real pipeline.
- `product-status.ts` — one status vocabulary for every card.
- `world-cup-closeout.test.mjs` — WC stays archive-only.
- `record-family-separation.test.mjs` — the four record families never merge.
- `public-beta-safety.test.mjs` + the forbidden-vocab scan — no superiority language ships.
- `mlb-research-integration.yml` — the research warehouse must be clean (PASS/EMPTY, 0 hard violations) or the job
  fails loudly (see DOC 2 → P0).

**Every new promotion to PUBLIC_NAV must add or extend one of these guards before it ships.**
