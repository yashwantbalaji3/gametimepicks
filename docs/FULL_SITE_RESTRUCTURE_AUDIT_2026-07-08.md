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
