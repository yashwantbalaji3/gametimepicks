# Full Site Restructure Audit + Flagship Product IA Plan (2026-07-08)

**This is a planning document.** It audits the site page-by-page, identifies the flagship product suite, and proposes a cleaner information architecture. **No product code is changed by this mission** — the implementation happens in a follow-up prompt built on this plan. Paper-only / educational framing is preserved throughout; canonical money is untouched.

---

## Phase 0 — Precheck (verified 2026-07-08)

| Item | Value |
|---|---|
| Branch / HEAD | `june30-reset` @ `d9d2f289` (local; ahead of origin by docs-only commits: social pack + this audit) |
| origin/main · origin/june30-reset | `cfacf5f2` (in sync with each other) |
| git status | clean (only pre-existing untracked HANDOFF/SESSION cruft) |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✓ matches expected |
| Canonical money | record **19-14** · bankroll **$19,065.40** · crown **$20,465.40** · drawdown **$1,400** ✓ |
| Open exposure | **$0** (Bank Builder no-play/awaiting Step 3; Moonshot no-play) |
| July-8 MLB simulator artifact | live (15 games, 1,000-run, model mlb-2026.07) |
| `/simulate` | live ✓ |
| Prod route smoke | `/` `/simulate` `/today` `/bank-builder` `/results` `/games` `/games/mlb/tor-vs-sf-2026-07-08` `/ops` → **all 200** |

**Current nav surfaces (three, and they disagree — see finding N1):**
- **Desktop top nav** (`nav.tsx`): Simulate · Today's Picks · Results · Bank Builder ‖ Game Reports · MLB · World Cup · Build-a-Pick · Soccer Specials · Moonshot · Track Record · How It Works
- **Desktop command rail** (`command-rail.tsx`, lg+, 17 items / 5 groups): **Simulate** · **Today** (Today's Picks · Game Reports · Build-a-Pick · Build) · **Bankroll** (Bank Builder · Moonshot · Soccer Specials · Track Record · Results) · **Sports** (World Cup · MLB · NBA · UFC) · **Learn** (How It Works · Methodology · About)
- **Mobile bottom nav** (`nav-active-route.ts`, 7 items): Today · Simulate · Parlay Lab · Build · Bank · Moonshot · Mr. Dub

**Current footer** (`footer.tsx`): Sports (MLB · World Cup · NBA ·off-season · NHL ·provider-pending) · Product (Parlay Lab → /parlay-lab · Results · Deep-dive track record) · About (How the model works → /methodology · Responsible use). Tagline + About copy are **NBA-centric and stale** (finding N2).

**Current homepage** (`/` = `page.tsx`): `HomeHero` (30-sec clarity + $100→~$19K story) → `GameLabHomeBand` (MLB + World Cup game reports) → the **entire `/today` page** rendered below. So `/` and `/today` are near-duplicates (finding N3).

**Top cross-surface findings (detail in Phase 1):**
- **N1 — Nav inconsistency:** the three nav surfaces list different items, in different orders, under different labels. `/picks` is "Build-a-Pick" (top/rail) but "Parlay Lab" (mobile/footer); `/mr-dub` is "Track Record" (top/rail) but "Mr. Dub" (mobile). This is the single biggest driver of the "jumbled" feel.
- **N2 — Stale identity copy:** footer still says "Transparent **NBA** player-prop analytics" / "model projections … for **NBA** player props." The product is now simulation-first and multi-sport.
- **N3 — Home ≈ Today:** the root route wraps the full Today page, so the two most prominent entry points show ~90% the same content.
- **N4 — Trust surface split:** `/results` (parlay-first track record), `/mr-dub` (portfolio dashboard, "Track Record"), and `/results/parlays` (saved-slip history) all claim the "receipts/record" job.
- **N5 — Parlay surface tangle:** `/picks` is canonical (metadata "Parlay Lab"); `/parlays` + `/parlay-lab` redirect to it; but `/nba/parlays` re-exports the *same* Parlay Lab page, and `/mlb|/nhl|/ipl /parlays` are honest placeholders pointing at `/nba/parlays`.
- **N6 — Per-sport sub-route sprawl:** `board · parlays · power · results` × {mlb, nba, nhl, ipl} ≈ 20 routes, most of which are placeholders (all four `power` boards are empty; NHL/IPL are schedule-only; only NBA `parlays` is real).
- **N7 — Legacy NBA-era surfaces:** `/board`, `/projections`, `/events`, `/trends` predate `/games` + `/simulate` + the per-sport hubs and overlap them; `/trends` + `/homer-nukes` are already retired landings.

---

## Phase 1 — Full page-by-page audit

Categories: **FLAG** flagship · **SUP** supporting · **TRUST** trust/results · **ADMIN** internal/admin · **LEG** legacy · **OFF** off-season/dormant · **DUP** duplicate/redirect.
Placement: **P1** primary nav · **P2** secondary/"More" · **FOOT** footer-only · **INT** internal-only · **HIDE** hide from discovery · **REDIR** redirect later · **ARCH** archive later.
(The 14 audit dimensions are covered across this table plus the per-row "Does well / Confusing / Overlap" and the Phase-6 difficulty/risk columns.)

### Flagship + core products

| Route | Current label | Purpose | Data source | Cat | Does well / Confusing · Overlap | Placement | New label | Action |
|---|---|---|---|---|---|---|---|---|
| `/simulate` | Simulate | Simulator lobby: hero + featured sims + all games → Generate Simulation | `SimulateLobby` (buildAllGameDetails, MLB/WC boards) | FLAG | Best front door; clean. · shares body w/ `/games` | **P1** | **Simulate** | keep as flagship front door |
| `/games` | Game Reports | **Same `SimulateLobby` as `/simulate`** (compat alias) | same as `/simulate` | DUP | Identical content · = `/simulate` | REDIR→`/simulate` (later, owner ok) | — | fold into Simulate; keep URL as redirect |
| `/games/[sport]/[gameId]` | (dynamic) | Single-game detail: Generate Simulation + 10s anim + dashboard, then dense model report | `getGameDetail`, sim artifact join (MLB), WC cards/parlays | FLAG | The full sim experience; MLB+WC wired · = `/world-cup/round-of-32/[slug]` for WC | **P1** (via Simulate) | **Game Simulation** | keep; primary detail surface |
| `/today` (+ `/`) | Today's Picks / Home | Daily command center: flagship products, what's-live, WC focus, Top 10, suggested parlays, sport cards, yesterday | many (WC/MLB/UFC boards, bank-builder, daily-portfolio, top10, parlays) | FLAG | One-scan daily hub · **N3** `/`≈`/today`; very dense | **P1** | **Today's Picks** | slim; make `/` a true landing, `/today` the slate |
| `/bank-builder` | Bank Builder | $100→$10K ladder: state, step, today's card/no-play, cleared steps, settlement detail | banked-ladders, ledger, official-candidate, daily-portfolio, bb-proposal | FLAG | Honest ClimbHero, no-play states · overlaps `/mr-dub` (ladder), `/results` (settlement) | **P1** | **Bank Builder** | keep as flagship |
| `/results` | Results | Parlay-first track record: leg accuracy, card performance, per-date, learnings | optimizer-summary, graded payloads, mlb/nba results, calibration | TRUST | Honest staleness banner, leg-level lead · **N4** overlaps `/mr-dub`, `/results/parlays` | **P1** | **Results** | keep as the trust center; unify w/ `/mr-dub` |
| `/mr-dub` | Track Record | Portfolio executive dashboard: KPIs, $100→$19.5K journey, day-by-day, product attribution | portfolio.json, daily-summary, master-ledger, banked-ladders | FLAG/TRUST | Bloomberg-feel, fully derived · **N4** overlaps `/results` | **P2** (or merge into Results) | **Portfolio** | decide: merge into Results or keep as its premium view |

### Secondary products

| Route | Current label | Purpose | Data source | Cat | Notes · Overlap | Placement | New label | Action |
|---|---|---|---|---|---|---|---|---|
| `/picks` | Build-a-Pick / Parlay Lab | Suggested-card lobby (WC+MLB+UFC), filters, Model Top 10 | world-cup/projections, data-parlays, ufc | FLAG/SUP | Canonical parlay surface (metadata "Parlay Lab") · **N5** = `/parlays`,`/parlay-lab`,`/nba/parlays` | **P2** | **Parlay Lab** (pick ONE label) | make canonical; unify label |
| `/build` | Build | Custom paper-card builder (add legs → odds/payout/warnings) | build-legs, WC projections/props | SUP | Real builder · linked from `/picks` | **P2** | **Build a Card** | keep; pair with Parlay Lab |
| `/moonshot` | Moonshot | Two daily longshot cards + 3-step ladder spec, separate record | moonshot/portfolio, moonshot-lane, structured-moonshot | FLAG/SUP | Clean separation from BB, honest data-pending | **P2** (P1 only when active) | **Moonshot** | keep; show in nav only when active |
| `/world-cup-specials` | Soccer Specials | Day-by-day WC longshot suggested cards + ledger | world-cup-specials, specials-tracker/ledger | SUP | Suggested-only framing · surfaces on `/picks`,`/today` too | **P2** (only w/ soccer live) | **Soccer Specials** | keep; gate to live soccer |

### Sport hubs + World Cup

| Route | Current label | Purpose | Cat / Live? | Notes · Overlap | Placement | Action |
|---|---|---|---|---|---|---|
| `/world-cup` | World Cup | Tournament command center (Model Picks/Games/Projections/Props/Cards/Results/Methodology tabs) | FLAG · **live** | Comprehensive, fail-closed · = detail + R32 routes | **P2** | keep as the soccer hub |
| `/world-cup/round-of-32` | Knockout Model Picks | R32 board: ML/totals/BTTS/safer-value per game | FLAG · live | De-vigged, 90-min honest · = detail routes | **P2** (under World Cup) | keep |
| `/world-cup/round-of-32/[slug]` | (dynamic) | Future-game team-market detail (props pending) | SUP · live | Prevents 404 · = `/games/world-cup/[gameId]` | **P2** | keep; consider merging w/ game-detail |
| `/world-cup/groups` · `/schedule` · `/teams` · `/team/[code]` | Groups/Schedule/Teams/Team | Tournament reference (48 teams, 104 matches, 12 groups) | SUP · live (reference) | Honest TBD labels · self-consistent | **P2** (World Cup sub-nav) | keep as reference tabs |
| `/mlb` | MLB | MLB hub (Games/Overview/Projections/Props/Cards/Results/Methodology) | FLAG · **live today** | Substantial · = `/mlb/board` | **P2** | keep as the MLB hub |
| `/nba` | NBA | NBA hub, same tab shell | SUP · **off-season** (Finals context stale) | Smart active-slate · = `/nba/board`=`/board` | **P2** (label off-season) | keep, de-emphasize |
| `/ufc` | UFC | UFC moneyline V1 + cards, readiness-gated | SUP · **conditional** | Honest gating, no fabricated props | **P2** (only when a card is live) | keep, gate to live card |
| `/nhl` · `/ipl` | NHL / IPL | Schedule-only hubs (provider-pending) | OFF · schedule-only | Honest "provider pending" | **FOOT/P2** (dormant) | keep, footer-level until modeled |
| `/sports` | Sports | Sport directory hub (live status + counts per sport) | SUP · live | Useful hub · overlaps `/today` sport cards, `/events` | **P2** | keep as the multi-sport directory |

### Trust / results cluster

| Route | Current label | Purpose | Cat | Notes · Overlap | Placement | Action |
|---|---|---|---|---|---|---|
| `/results/model-audit` | Model audit deep-dive | Per-market/side/confidence/edge settled audit | TRUST | Power-user proof · under `/results` | **P2** (under Results) | keep as Results deep-dive |
| `/results/parlays` | Saved slip history | Pre-game saved slips graded after settlement | TRUST | Honest "pre-game only" · **N4** overlaps `/results` | **P2** (under Results) | keep as a Results tab |
| `/results/date/[date]` | (dynamic) | Per-date NBA+MLB settled audit | TRUST | Static-exported, honest empty | **P2** (under Results) | keep |
| `/results/{mlb,nba,nhl,ipl}` | <Sport> Model Audit | Re-exports of `/{sport}/results` | TRUST/DUP | Namespacing aliases | **P2** (under Results) | keep as aliases; one canonical |
| `/mlb/results` · `/nba/results` | <Sport> Results | Real per-sport model audits (settled) | TRUST · live | Comprehensive · = `/results/{sport}` | **P2** (under sport + Results) | keep; pick canonical URL |
| `/nhl/results` · `/ipl/results` | <Sport> Results | Empty audit shells (no settled data) | OFF | Placeholder | **HIDE** until data | keep, hide from nav |

### Per-sport sub-route sprawl (finding N6)

| Route pattern | Purpose | Cat | Notes | Placement | Action |
|---|---|---|---|---|---|
| `/{sport}/board` · `/board/[date]` | Model board detail | SUP | Overlaps the sport hub's own board tab | **P2** (under sport) | keep for MLB/WC-active; de-dupe vs hub |
| `/board` | NBA model board (legacy) | LEG | Pre-`/games` NBA board; `/nba/board` re-exports it | REDIR→`/nba` later | archive/redirect (owner ok) |
| `/projections` | All-sport single straight-bet picks | LEG/SUP | Overlaps `/board` + `/picks`; NBA-era framing | **P2/FOOT** | fold into sport hubs/Parlay Lab later |
| `/{sport}/parlays` (mlb/nhl/ipl) | Placeholder → points to `/nba/parlays` | DUP | Honest empty; URL noise | HIDE | keep honest, drop from nav |
| `/nba/parlays` | Re-export of the real Parlay Lab | DUP | **N5** = `/picks`/`/parlay-lab` | REDIR→`/picks` | make `/picks` canonical |
| `/{sport}/power` (×4) | High-variance "power" boards | OFF | **All four are empty placeholders** | HIDE | keep 1 prototype, hide rest until data |
| `/parlay-lab` · `/parlays` | (redirects) | DUP | Hard redirect → `/picks` | REDIR (as-is) | keep redirects |

### Education / about

| Route | Current label | Purpose | Cat | Notes · Overlap | Placement | Action |
|---|---|---|---|---|---|---|
| `/learn` | How It Works | Plain-English 2-min intro (canonical on-ramp) | SUP | Best newcomer page · → `/methodology` | **P2** ("How It Works") | keep as the education entry |
| `/methodology` | Methodology | Deep technical reference (per-sport specs, ladder rules) | SUP/TRUST | Power-user bible · deeper than `/learn` | **P2/FOOT** | keep as the deep reference |
| `/about` | About | Casual "what is this" for non-bettors | SUP | Reachable via rail only · overlaps `/learn` | **FOOT** | keep, footer-level |
| `/responsible-use` | Responsible use | Compliance/safety (helpline, 21+, no automation) | SUP/TRUST | Essential, serious tone | **FOOT** (+ persistent link) | keep, always reachable |

### Internal / legacy / retired

| Route | Current label | Purpose | Cat | Notes | Placement | Action |
|---|---|---|---|---|---|---|
| `/ops` | Ops (internal) | Read-only ops dashboard (admin/status.json) | ADMIN | `robots noindex`; no secrets; not in nav | **INT** | keep as-is (out of discovery) |
| `/preview/june20` | Internal Preview | One-off June-20 WC preview build | ADMIN | `robots noindex`; not linked | **INT/ARCH** | keep noindex; archive later |
| `/events` | Sports & Events | Schedule-only coverage directory (WNBA/UFC/FIFA + modelled) | SUP/LEG | Honest schedule-only · overlaps `/sports` | **FOOT** | fold into `/sports` later |
| `/trends` | (retired) | Retired soft-redirect landing | LEG | Not noindex; honest "moved" | REDIR→`/board`/hub later | add noindex; redirect later (owner ok) |
| `/homer-nukes` | Homer Nukes (retired) | Retired product landing | LEG | `robots noindex`; unlinked; history kept | **ARCH** | keep archived |

**Phase 1 tally:** ~62 routes. Real product pages ≈ 30; trust/results ≈ 10; reference (WC) ≈ 6; internal ≈ 2; legacy/retired/redirect/placeholder ≈ 14. **Nothing is broken or fabricating** — the site is honest; it is *over-broad and inconsistently labelled*, which is the real problem to solve.

---

## Phase 2 — Flagship Product Suite

The site should read as **four flagship products** on one bankroll story, with everything else as supporting depth.

### Tier 1 — Primary flagship (homepage + primary nav)

**1. Simulate** — the front door.
1. Promise: *Run a precomputed model simulation of any game and read the full dashboard.*
2. For: everyone; the "what is this" hook.
3. Primary CTA: **Generate Simulation**. 4. Secondary CTA: See Today's Picks.
5. Data: `public/data/{sport}/game-simulations/<date>.json` (1,000-run MLB artifacts) via `SimulateLobby` + `GameSimulationRunner`.
6. Route: `/simulate` (+ `/games/[sport]/[gameId]` detail). 7. Homepage module: "Today's featured simulations" (3–5 ready games).
8. Trust: paper-only, precomputed, same output for every user. 9. Owner approval: none.
10. States: Simulation Ready · Unavailable (no artifact) · Stale (older slate) · Archived.
11. Do NOT show: fabricated soccer sims, inflated run counts, a "predicted final score" for the central read.

**2. Today's Picks** — the daily hub (distinct from Simulate).
1. Promise: *One scan of today's model slate — top leans, no-plays, product status.*
2. For: returning daily users. 3. Primary CTA: Open a game's simulation. 4. Secondary CTA: See Results.
5. Data: WC/MLB boards, Top-10 board, daily-portfolio, bank-builder summary. 6. Route: `/today`.
7. Homepage module: "Today's model slate" summary. 8. Trust: paper-only; "settled from official results".
9. Owner approval: none for display. 10. States: live slate · thin slate · no-play (explain the discipline).
11. Do NOT show: active exposure unless a card is owner-approved; a forced Bank Builder card.

**3. Bank Builder** — the signature ladder.
1. Promise: *Follow a disciplined $100→$10K paper ladder — every step, stake, and no-play in the open.*
2. For: the "story/challenge" follower. 3. Primary CTA: View the ladder. 4. Secondary CTA: See Results.
5. Data: banked-ladders, ledger, official-candidate, daily-portfolio, bb-proposal. 6. Route: `/bank-builder`.
7. Homepage module: Bank Builder status card (step + state). 8. Trust: no-play discipline, official settlement only.
9. **Owner approval: required before any exposure/activation.** 10. States: active · awaiting approval · no-play · settled.
11. Do NOT show: a forced card; exposure without approval; hindsight rewrites.

**4. Results** — the trust center.
1. Promise: *Every pick, every settlement, every dollar of the paper run — the receipts.*
2. For: the skeptic / trust-first user. 3. Primary CTA: See the record. 4. Secondary CTA: Read the methodology.
5. Data: portfolio.json, ledger, optimizer/graded payloads, per-sport audits. 6. Route: `/results` (absorbing `/mr-dub` + `/results/*`).
7. Homepage module: trust/receipts strip (record · open exposure · pending vs settled). 8. Trust: pending-is-not-loss; official settlement only.
9. Owner approval: none. 10. States: settled · pending · empty (honest "starts here").
11. Do NOT show: unsupported hit-rate/performance claims; hiding losses.

### Tier 2 — Secondary product modules (in "More", promoted only when active)
Parlay Lab (`/picks`) · Build a Card (`/build`) · Top Model Picks (Top-10 board) · Moonshot (`/moonshot`) · Soccer Specials (`/world-cup-specials`) · Game Reports / sport hubs (`/mlb`, `/world-cup`, …) · Portfolio deep view (`/mr-dub`, if kept).

### Tier 3 — Internal / supporting
Ops (`/ops`, noindex) · Methodology (`/methodology`) · How It Works (`/learn`) · About (`/about`) · Responsible use (`/responsible-use`) · legacy/off-season pages · `/preview/june20`.

---

## Phase 3 — Proposed new site architecture

### Primary nav (5)
**Home · Simulate · Today's Picks · Bank Builder · Results** — plus a **More** menu. (Brand mark = Home.) One consistent set across desktop-top, desktop-rail, and mobile-bottom — the three surfaces must match.

### More / secondary (menu or /more hub)
Parlay Lab · Build a Card · Top Model Picks · Moonshot *(when active)* · Soccer Specials *(when soccer live)* · Game Reports (sport hubs: World Cup · MLB · others) · Methodology · How It Works.

### Internal / admin (out of public nav)
Ops · Portfolio deep view (`/mr-dub`, if not merged into Results) · raw ledgers · admin status.

### Hidden / legacy / off-season (reachable by URL, not featured)
Board · Events · Trends · Projections · NBA/NHL/UFC/IPL while stale/off-season · retired product pages (`/homer-nukes`) · empty `power` boards · placeholder `/{sport}/parlays`.

### IA diagram
```text
/  (Home — 30-sec story + flagship cards + featured sims + slate summary + trust strip)
├── Simulate
│   ├── Game lobby (featured + all simulation-ready games)
│   └── Game simulation dashboard  (/games/[sport]/[gameId])
├── Today's Picks
│   ├── Top model picks (Top 10)
│   ├── Parlay Lab / Build-a-Pick module
│   ├── No-play notes (discipline explained)
│   └── Featured simulations
├── Bank Builder
│   ├── Current ladder state + step + stake
│   ├── Today's proposal / no-play
│   ├── Step history
│   └── Approval + settlement receipts
├── Results   (absorbs Portfolio + per-sport audits + saved slips)
│   ├── Track record (record · exposure · pending vs settled)
│   ├── Settled cards · Pending cards
│   ├── Product-by-product performance
│   └── Model audit deep-dive
└── More
    ├── Parlay Lab · Build a Card
    ├── Moonshot (when active) · Soccer Specials (when soccer live)
    ├── Game Reports (World Cup · MLB · sport hubs)
    ├── Methodology · How It Works · Responsible use
    └── Archives (Board · Projections · Events · Trends · off-season sports)
```

---

## Phase 4 — Exact page requirements (restructured)

**A. Home (`/`)** — de-duplicate from Today; the 30-second story, not the full slate:
1) Hero (simulation-first headline; sub = model simulations + paper picks + tracked results; CTA **Simulate Today's Games**, secondary **See Today's Picks**). 2) Flagship product cards (Simulate · Today's Picks · Bank Builder · Results). 3) Today's featured simulations (3–5, Simulation-Ready badge, Run CTA). 4) Today's model slate (top leans + no-play notes + Bank Builder status — a *summary*, then "Open Today's Picks"). 5) Trust/receipts strip (record · **$0 open exposure** · pending vs settled · paper-only). 6) How it works (precomputed · same output for every user · official settlement · no-play discipline). 7) Footer CTA (Simulate · Results · Methodology). *Do not render the entire Today board here.*

**B. Simulate (`/simulate`)**: 1) simulator hero. 2) sport/date filter. 3) featured simulation cards. 4) all simulation-ready games. 5) dashboard preview (what a run shows). 6) unavailable sports/states (honest). 7) methodology link. 8) paper-only note. Each card: teams · sport · time/status · Ready/Unavailable/Archived badge · top generated lean (if real) · run count (if real) · CTA Generate/View Simulation.

**C. Game simulation detail (`/games/[sport]/[gameId]`)** — current order is already correct: 1) matchup header. 2) Generate Simulation. 3) 10s sport animation. 4) post-sim dashboard: 5) market snapshot · 6) central read (prop lean, not a score) · 7) main takeaways · 8) biggest leans · 9) prop/player table · 10) distributions · 11) market agreement · 12) unavailable modules · 13) recap. 14) dense model report BELOW the simulation. 15) methodology / freshness note.

**D. Today's Picks (`/today`)** — the daily slate (not the everything-page): 1) date/sport selector. 2) top model picks (Top 10). 3) strongest simulation-backed leans. 4) Parlay Lab / Build-a-Pick module. 5) Bank Builder status. 6) Moonshot/Longshot status *(when active)*. 7) no-play explanations. 8) per-game "Simulate" links. 9) paper-only note. *No active exposure unless approved; explain no-play; show why a product is unavailable.* (Trim the current WC-focus/UFC/sport-cards density into collapsible or sport-hub links.)

**E. Bank Builder (`/bank-builder`)**: 1) current ladder state. 2) current step. 3) stake / rolled stake. 4) status (active · awaiting approval · no-play · settled). 5) today's proposal (if any). 6) no-play explanation (if none). 7) step history. 8) rules. 9) risk/exposure note. 10) owner-approval state. 11) settlement receipts. *No forced card; no exposure without approval; preserve the no-play discipline.*

**F. Results (`/results`)** — the proof layer (absorb `/mr-dub` + `/results/*` as tabs): 1) overall record. 2) settled cards. 3) pending cards. 4) product-by-product performance. 5) Bank Builder history. 6) WC/Soccer Specials history. 7) model misses/lessons. 8) open exposure. 9) official-settlement policy. 10) pending-is-not-loss policy. 11) data freshness.

**G. More / secondary** — as Phase-1 actions: Top Model Picks (ranked daily leans → simulation); Parlay Lab (paper builder, correlation warnings, no exposure); Build a Card; Moonshot/Soccer Specials (show only when active/live, else honest unavailable, keep out of nav); Game Reports (secondary to Simulate); Methodology/How It Works (artifacts · deterministic sims · official settlement · no-play · paper-only); decide Portfolio (`/mr-dub`) merge vs keep.

---

## Phase 5 — Recommended User Journeys

| # | Journey | Flow | Entry · CTA · Support pages · Needs · Don't distract with |
|---|---|---|---|---|
| 1 | Casual | Home → Simulate → pick game → Generate → read recap | Home · **Generate Simulation** · `/simulate`, game detail · "what is this + how to read a lean" · Bank Builder/ledger internals |
| 2 | Daily picks | Home → Today's Picks → top leans → Simulate game → Results later | Today's Picks · Open a game · Top-10, game detail, Results · today's strongest leans + no-plays · off-season sports, legacy boards |
| 3 | Bank Builder follower | Home → Bank Builder → step/no-play → history → Results | Bank Builder · View ladder · step history, Results · current step/stake/state + discipline · other products' clutter |
| 4 | Trust-first | Home → Results → Methodology → Simulate | Results · See the record · `/results/*`, Methodology · record, pending vs settled, official policy · marketing hype |
| 5 | Power user | Simulate → game detail → full model report → Parlay Lab | Simulate · Generate · game detail, `/picks`, `/build` · full dashboard + dense report + build tools · onboarding copy they don't need |

---

## Phase 6 — Implementation roadmap (low-risk chunks)

Each chunk is independently shippable and reversible. **Money risk is NONE for every chunk** (display/label/IA only; canonical money artifacts are never written; md5-guard each deploy).

| # | Chunk | Goal | Files likely touched | User-facing change | Tests | Deploy risk | Rollback | Owner approval? |
|---|---|---|---|---|---|---|---|---|
| 1 | Copy/label cleanup | One label per route across all 3 nav surfaces; fix stale NBA footer copy | `nav.tsx`, `command-rail.tsx`, `nav-active-route.ts`, `footer.tsx` | consistent labels; honest multi-sport footer | nav-active-route tests, footer copy test, banned-copy grep | low | revert commit | **no** (labels only) |
| 2 | Homepage restructure | Make `/` the 30-sec story, not the full Today board | `app/page.tsx`, `home-hero.tsx`, new home modules | flagship cards + featured sims + slate summary + trust strip | home-band tests, simulator-first-ux, route smoke | med | revert; `/today` unchanged | recommended |
| 3 | Simulate lobby refinement | Filters + clearer cards + archived/unavailable states | `simulate-lobby.tsx`, `simulate-lobby-featured.ts`, games-experience | date/sport filter, badges | featured tests, lobby tests | low | revert commit | no |
| 4 | Today's Picks slim-down | Reduce density; sport-hub links; keep no-play notes | `today/page.tsx` + section components | shorter, scannable slate | today structure tests, money-integrity | med | revert commit | recommended |
| 5 | Bank Builder polish | Tighten state/step/approval/receipts ordering | `bank-builder/*`, ClimbHero | clearer ladder + approval state | bank-builder-consistency tests, money gates | med (money-adjacent display) | revert; **no accounting change** | **yes** (money-adjacent) |
| 6 | Results / Trust Center merge | Absorb `/mr-dub` + `/results/*` into one proof hub (tabs) | `results/*`, `mr-dub/*`, redirects | one trust center | results tests, money-integrity, forensic | med | keep old routes as redirects | **yes** (trust surface) |
| 7 | Secondary consolidation | Group More; gate Moonshot/Soccer/UFC to active; unify Parlay Lab canonical | `nav.tsx`, `picks/*`, `moonshot/*`, `/{sport}/parlays` | cleaner "More"; fewer dead links | nav tests, route smoke | low | revert commit | recommended |
| 8 | Internal/legacy cleanup | Add `noindex` to `/trends`; footer-only `/events`/`/projections`; hide empty power boards; plan redirects | route metadata, `footer.tsx`, `command-rail.tsx` | fewer stale surfaces in discovery | route smoke, no-deletion check | low | revert commit | **yes** (no page deletion without owner ok) |

**Sequencing:** 1 → 2 → 3 → 4 → 7 → 8 first (low/med risk, high clarity gain), then 5 → 6 (money-adjacent, owner-approved). Never delete a page or hide a trust/results surface without explicit owner approval.

---

## Quick wins (low-risk, obvious, for the next implementation prompt)
1. **Unify one label per route** across the 3 nav surfaces (`/picks` → pick "Parlay Lab" *or* "Build-a-Pick" everywhere; `/mr-dub` → one of "Track Record"/"Portfolio"/"Mr. Dub").
2. **Refresh the stale footer identity copy** ("NBA player-prop analytics" → simulation-first multi-sport, paper-only).
3. **`noindex` on `/trends`** (retired landing currently indexable).
4. **Remove the retired `homer` bucket** from `nav-active-route.ts` (dead code).
5. **Gate Moonshot / Soccer Specials / UFC out of nav when not active** (they already render honest empty states).

## Owner decisions required (before implementation)
1. **Results vs Portfolio:** merge `/mr-dub` into `/results` as its premium tab, or keep both? (Recommend: merge — one trust center.)
2. **Home vs Today:** make `/` a distinct 30-sec landing (recommended) or keep it wrapping the full Today board?
3. **Primary-nav label for `/picks`** and for `/mr-dub` (pick one each).
4. **Legacy routes** (`/board`, `/projections`, `/events`, `/trends`): keep reachable-but-hidden, redirect, or archive? (No deletion without your sign-off.)
5. **Off-season sports** (NBA/NHL/UFC/IPL): footer-only until modeled, or keep in a Sports hub?
6. **`/nba/parlays` ↔ `/picks`:** make `/picks` the single canonical Parlay Lab and redirect the alias?

## Next recommended implementation prompt
**"Chunk 1 — Copy/label cleanup"**: unify one label per route across `nav.tsx` / `command-rail.tsx` / `nav-active-route.ts`, refresh the stale footer identity copy to simulation-first multi-sport, add `noindex` to `/trends`, and remove the dead `homer` bucket — display/label only, no data or money changes, full gate battery + banned-copy grep + route smoke, one commit, deploy if green. It is the lowest-risk, highest-clarity first step and unblocks the homepage restructure (Chunk 2).

