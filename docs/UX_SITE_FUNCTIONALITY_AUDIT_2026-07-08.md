# Site Functionality Audit + Simulator UX Upgrade Plan — 2026-07-08

**Context:** July-8 MLB slate + deterministic simulation are live, but the site reads as a maze of internal products rather than a simple "pick a game → simulate → see picks" experience. This audits every user-facing surface and proposes a simulation-first simplification. Paper-only / educational positioning is preserved throughout. No canonical money changes (md5 `affe6b21071f2b3be96bb2774eb347c3`, 19-14, $0 exposure).

Inspiration is the *product pattern* of simple game-simulation sites only — no copying of any competitor's branding, assets, layout, or text.

---

## Phase 1 — Full tab/functionality audit

The app ships **30+ top-level routes** but only **11 appear in nav** (7 primary + 4 secondary). Many routes are legacy or off-season and should not be user-facing.

### Primary nav (in the header today)

| Route | User purpose today | Data source | User-friendly? | Jargon / issues | Overlap | Recommendation | New label | CTA | Risk | Effort |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Front door: hero + Game Lab band + Today command center | portfolio/daily-portfolio + buildAllGameDetails | Partial — dense, no simulate CTA | "Game Lab", "Mr. Dub", bankroll jargon | overlaps `/today` heavily | **rebuild-lite** (add Simulate hero) | Home | **Simulate Today's Games** | med | med |
| `/today` | The full "today" command center (products, what's-live) | daily-portfolio, products | Low — very dense, internal | duplicates the homepage body | duplicates `/` | **merge into `/`** (or hide) | Today's Picks | View picks | med | med |
| `/games` | Multi-sport board → per-game model report | buildAllGameDetails | Partial — reads as "reports", not "simulate" | "Game Lab" | is the real simulate lobby | **rename + reframe** | **Simulate** | Generate Simulation | low | low |
| `/games/mlb/…` | Per-game report + Generate Simulation | game-detail + game-simulations | Partial — sim is BELOW the dense report | too technical up top | — | **reorder** (sim on top) | Game Simulation | Generate Simulation | low | low |
| `/games/world-cup/…` | Per-game WC model report (odds-only) | worldCupDetails | Partial | odds-only caveats fine | — | keep; add "sim not available" | Game Report | — | low | low |
| `/mlb` | MLB hub (board, props, results honesty) | mlb board | OK | some jargon | overlaps `/games` MLB filter | **keep, secondary** | MLB | Simulate MLB | low | low |
| `/world-cup` | WC hub (knockout board, groups) | WC projections | OK | — | overlaps `/games` WC filter | keep, secondary | World Cup | — | low | low |
| `/bank-builder` | The $100→$10K paper ladder (flagship) | ladder + ledger | Good | "ladder challenge" needs 1-liner | — | **keep** | Bank Builder | See the climb | low | low |
| `/mr-dub` | Daily paper portfolio / full track record | mr-dub artifacts | Low for public — internal name | "Mr. Dub" is opaque | overlaps `/results` + `/today` | **rename or hide** | Daily Dashboard (or hide) | — | med | low |
| `/learn` | How it works | static | Good | — | — | keep | How It Works | — | low | — |

### Secondary nav

| Route | Purpose | User-friendly? | Recommendation | New label |
|---|---|---|---|---|
| `/moonshot` | High-variance longshot paper lane | Low (jargon; often no-play) | **hide until active** | Longshot Lab |
| `/world-cup-specials` | WC-only longshot paper cards | Low | **rename**, group under Soccer | Soccer Specials |
| `/picks` | Parlay Lab (paper-only build-a-pick) | Low ("Parlay Lab" jargon) | **rename** | Build-a-Pick |
| `/results` | Settled hit-rate / track record | Good | **keep, promote** | Results |

### Not in nav — legacy / off-season / internal (should stay hidden or be removed later, owner approval)

`/ops` (admin — keep hidden), `/homer-nukes` (retired → landing only), `/ipl` `/nba` `/nhl` `/ufc` (off-season, empty states), `/board` `/build` `/events` `/parlays` `/projections` `/sports` `/trends` `/methodology` `/preview` `/about` `/responsible-use` `/top-10` (mostly legacy/duplicative or utility). **Recommendation:** confirm which are reachable and prune from any stray links in a later owner-approved pass; none should be in the primary user nav.

**Headline finding:** 11 nav tabs + 30 routes is too many. The user-facing set should be ~5 primary tabs, simulation-first.

---

## Phase 2 — Proposed simplified IA / navigation

### Primary user nav (target: 5 tabs)
1. **Home** (`/`) — Simulate-first hero.
2. **Simulate** (`/games`, alias `/simulate`) — the game lobby.
3. **Today's Picks** (`/today` merged into home, or kept as the picks view).
4. **Results** (`/results`).
5. **Bank Builder** (`/bank-builder`).

### Secondary / "More" (de-emphasized, behind a menu)
- MLB, World Cup (sport hubs) — or fold into the Simulate lobby's sport filter.
- Build-a-Pick (`/picks`), Soccer Specials (`/world-cup-specials`), Longshot Lab (`/moonshot`, only when active).
- How It Works (`/learn`).

### Internal / admin (never in public nav)
- Daily Dashboard (`/mr-dub`), Ops (`/ops`), admin/status, raw product ledgers, `/methodology`, legacy sport/utility routes.

### Label cleanup (user-facing)
| Internal | User-facing |
|---|---|
| Game Lab | **Simulate** / Game Simulation |
| Mr. Dub | **Daily Dashboard** (or hide from public nav) |
| Bank Builder | keep — subtitle "the $100 → $10K ladder challenge" |
| Moonshot | **Longshot Lab** (hide until active) |
| Parlay Lab | **Build-a-Pick** |
| WC Specials | **Soccer Specials** |
| Top 10 | **Top Model Picks** |

*No UI nav changes are made in this doc phase beyond what Phase 5 explicitly implements (safe label/CTA tweaks only) — a full nav re-org needs owner approval.*

---

## Phase 3 — Simulator readiness audit

Audited from code (`game-detail-page.tsx`, `game-simulation-runner.tsx`, `games-experience.tsx`, homepage) + built HTML.

| # | Check | Finding |
|---|---|---|
| 1 | Where is the Generate Simulation CTA? | On MLB game detail — but **rendered AFTER the dense `MlbGameLabReport`** (line 615, below line 610). Too low. |
| 2 | Findable from homepage quickly? | **No.** Homepage has an "Open Game Lab →" band but **no "Simulate" CTA**. |
| 3 | Does `/games` say "simulate"? | **No** — titled "Game Lab", copy is "browse… open a model report". |
| 4 | Detail feels like a simulator or a report? | **A report.** Hero → dense report → sim runner near the bottom. |
| 5 | Animation visible/satisfying? | Exists (6-step reveal) but buried; button is modest. |
| 6 | Picks revealed clearly after click? | Yes, but competes with the report above it. |
| 7 | Unavailable/stale states clear? | Yes ("Simulation not yet available"; stale banner) — honest. |
| 8 | Mobile layout? | Functional; the sim card being low hurts mobile most (long scroll). |
| 9 | Simulator hidden too low? | **Yes — the #1 issue.** |
| 10 | Route naming intuitive? | "Game Lab" is jargon; `/simulate` would be clearer. |
| 11 | Copy too technical? | Somewhat — "model-vs-market", "gates" up top before the fun part. |
| 12 | "Same output for every user" clear? | Present in the reveal, but not before the click. |
| 13 | Enough visual drama? | Partial — loading stages exist; final panel + pick cards + risk badges present; distribution/volatility visual is minimal. |
| 14 | "1,000-run" visible + honest? | Yes, gated on real `runCount` — honest. |
| 15 | Unsupported modules too prominent? | Slightly — "not generated" list can read as emptiness; should be de-emphasized. |

**Verdict:** the simulator is *functionally* ready and honest, but *experientially* buried. The fix is placement + prominence + entry points, not new data.

---

## Phase 4 — Simulator-first UX upgrade plan

**Flow:** land → "Simulate Today's Games" → pick sport → pick game → Generate Simulation → visual reveal → picks + risk + no-play context → jump to details/results.

### Modules
1. **Homepage simulator hero** — headline "Simulate today's games", one-line explainer, a primary CTA to the lobby, and (reusing existing data) a few featured simulation-ready games linking straight into the game sim.
2. **`/games` → Simulate lobby** — reframe heading to "Simulate Games / Pick a game to run the model simulation"; add a **"Simulation Ready"** badge on cards whose artifact exists, "Pending data" otherwise; CTA "Generate Simulation" (→ detail) alongside "View report".
3. **Game simulation page** — move the **Generate Simulation card ABOVE** the dense `MlbGameLabReport`; larger button; keep the 6-step animation + final "Simulation Complete" panel + top pick cards + risk badges + freshness/model-version note; collapse the dense analytics below.
4. **Results tie-in (later)** — after games settle, compare simulated picks vs actual + calibration notes (per the validation plan), with small-sample discipline. Not built today.

### Honesty guardrails (unchanged)
"Precomputed for this game", "Same output for every user", "Paper-only", "1,000-run" only when `runCount` is a positive int; no Monte Carlo; no xG/corners/cards/first-scorer; unsupported modules stay quiet.

---

## Phase 5 (implemented today) — low-risk simulator-first improvements
See the commit `feat: make simulator the primary game experience`. Scope: homepage Simulate CTA, `/games` reframed to "Simulate Games" + Simulation-Ready badges, sim runner moved above the dense report + visually strengthened. No page removed, no data generated, no money touched. Details in the final report section of the session.
