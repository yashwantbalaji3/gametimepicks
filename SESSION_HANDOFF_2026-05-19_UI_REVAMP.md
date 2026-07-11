# SESSION HANDOFF · 2026-05-19 · UI REVAMP

> **Audience:** the next Claude Code session.
> **Working directory:** `~/Downloads/gametimepicks`.
> **Date this handoff was written:** Tuesday, May 19, 2026, ~13:30 ET.
> **Read this entire file BEFORE running anything.**

This file is the zero-context resume artifact for GameTimePicks. It is exhaustive on purpose. Skim section 14 first if you need to pick up where the previous session left off.

---

## 1. Executive summary

### What GameTimePicks is

GameTimePicks is an educational sports player-prop analytics web app. It compares model projections to real sportsbook lines and publishes a public audit of every settled lean — wins, losses, pushes, edge, confidence. It is a Next.js 14 static-exported site deployed on Vercel, backed by a Python pipeline that fetches schedules + odds, runs a projection model, and grades the model against final box scores after games complete.

The site is intentionally:
- **Educational, not betting advice.** Every public surface carries that disclaimer.
- **Honest about sample size.** A 60-pick claim never looks like a 1000-pick claim.
- **Transparent about its math.** Pushes excluded, pending excluded, parlay hit rate refused until candidate slips are persisted before games.

### Current vision

A polished futuristic sportsbook/casino-styled analytics platform with a hard rule against fabrication. The user wants the product to look and feel like a real sportsbook command center while remaining honest about what the model knows and doesn't know. Eventual model goal is **80%+ accuracy**, but the site must never claim that. It must reflect only what real settled results show.

### Current state of production

- **Live URL:** `https://gametimepicks.yashwantbalaji.com`
- **Current `main` SHA:** `eba9564` (PR #60 — nightly automation)
- **PR #61 is OPEN and not merged.** It contains the latest UX additions (Model Audit Notes + Settled-state banner + Path-forward audit note). All Vercel checks pass.
- **NBA + MLB May 18 are fully settled.** May 19 NBA (CLE @ NY) is live. May 19 MLB schedule is on disk; projections not yet generated.
- **Lifetime audit:** Combined 522–432 on 954 decisive picks · **54.7%** (NBA 61.6% · MLB 50.3%).

### Main product direction

Three coupled tracks running in parallel:
1. **Settlement + audit honesty** (PR #58, #59, #61) — settle real results and surface real findings.
2. **Automation** (PR #60) — nightly settlement at 3 AM EDT, morning projection refresh at 9:30 AM EDT with credit guard.
3. **UI/UX polish** (PR #55, #56, #61 in progress) — sportsbook visual language, mobile-first, status chips, projection-first cards.

### Current priorities

1. **Review PR #61 and decide merge.** Two commits on the branch. Tests + build green; honest content; no scattered hit-rate claims.
2. **(After merge)** Decide whether to open a larger UI revamp PR (homepage command center, projection navigation, casino visual system). See §13.
3. **(Operational)** Confirm GitHub secret `ODDS_API_KEY` is set so PR #60's `morning-projections` workflow can actually run paid fetches when it fires at 13:30 UTC.

---

## 2. Current production state

| Item | Value |
|---|---|
| `main` HEAD SHA | `eba956445fa64c277c8d1de9808232e2170a4192` (`eba9564`) |
| Latest production deploy | `https://gametime-picks-5ppcopvrz-yashwantbalaji33-7164s-projects.vercel.app` |
| Custom domain | `https://gametimepicks.yashwantbalaji.com` |
| Production state | ✅ live · 200 OK · serving May 18 settled + May 19 live NBA |
| Vercel projects | `gametime-picks` (canonical) + `gametimepicks` (duplicate-checks noise; operator-side cleanup pending) |
| Build system | Next.js 14.2.15, static export, 35 routes |

### Current open PRs

| # | Title | Branch | HEAD | Notes |
|---|---|---|---|---|
| 61 | feat(results): add honest model audit notes derived from real settled data | `feature/results-model-audit-notes` | `9331922` | OPEN · CLEAN · all 3 Vercel checks pass. **In scope this session. Do not merge without explicit approval.** |
| 5 | Stop dry-run auto-refresh from clobbering real-prop boards | `fix/dry-run-clobber-guard` | `c435977` | Legacy, pre-existing, unrelated. Leave alone. |
| 4 | Remove public operator leaks from board badge and home callout | `fix/public-status-leaks` | `297025e` | Legacy, pre-existing, unrelated. Leave alone. |
| 2 | Fix auto-refresh workflow YAML syntax | `fix/auto-refresh-yaml` | `782fd6a` | Legacy, pre-existing, unrelated. Leave alone. |
| 1 | Hide admin operator status from public board | `fix/hide-admin-status-on-board` | `e0445aa` | Legacy, pre-existing, unrelated. Leave alone. |

### Current open branches

- `feature/results-model-audit-notes` — this is PR #61. Working branch the previous session left checked out. Currently `git branch --show-current` returns this. If you switch back to `main`, fast-forward will skip ahead to `eba9564`.

### Current automation status (GitHub Actions on main)

```
auto-refresh          active   (pre-existing — props-only periodic refresh, on cron)
daily-refresh         active   (pre-existing — Phase 10 wide refresh)
morning-projections   active   (PR #60 — new · cron 13:30 UTC daily)
nightly-settle        active   (PR #60 — new · cron 07:00 UTC daily)
```

### Current settled results (read from `app/public/data/{results,mlb/results}/lifetime_summary.json` on PR #61 HEAD)

| Sport | Record | Decisive | Hit rate | Newest settled | Dates |
|---|---|---|---|---|---|
| NBA | 229–143 | 372 | 61.6% | 2026-05-18 | 3 (May 15, 17, 18) |
| MLB | 293–289 | 582 | 50.3% | 2026-05-18 | 2 (May 16, 18) — `partial=false` after the 2 pending games completed |
| **Combined** | **522–432** | **954** | **54.7%** | 2026-05-18 | 4 unique dates |

---

## 3. Complete PR history summary

### PR #55 — feat(ui): NBA projection cards land a 3-tile LINE/PROJECTION/EDGE hero

- **Squash SHA on main:** `054de7d`
- **Purpose:** Make NBA projection cards visually projection-first with a sportsbook-style 3-tile scoreboard (LINE / PROJECTION / EDGE).
- **Key changes:** `app/src/components/vault-player-card.tsx` rewritten — 3-tile grid with neon-gold borders, gold-bright projection value, gold-glow on EDGE when positive, warn-amber when R5-capped. MLB tiles upgraded to match in `app/src/components/mlb/mlb-lean-row.tsx`. New `HomepageSportsRail` in `app/src/components/homepage-sports-rail.tsx`. Parlay-chip gold glow added.
- **Route impacts:** `/`, `/nba/board`, `/mlb/board/[date]`, `/parlay-lab`.
- **Caveats:** Visually changed every projection card. Layout consistent at 390 mobile.
- **Rollback:** `git revert --no-edit 054de7d && git push origin main`.

### PR #56 — feat(ui): homepage + Parlay Lab casino redesign

- **Squash SHA on main:** `5753f75`
- **Purpose:** Compress homepage hero, add casino-styled CommandTiles ("What's on the floor"), add Parlay Lab demo-chip preview state for cold-start days.
- **Key changes:** Homepage hero shrunk from 3-sentence paragraph to 1-sentence tagline + 3 chips (NBA + MLB · Audit · Educational only). New CommandTiles section. Parlay Lab `DemoPreviewState` renders 3 sample chips with gold glow when no slate is loaded.
- **Route impacts:** `/`, `/parlay-lab`.
- **Caveats:** Demo chips are stamped `preview only · chips activate when a real slate loads`. They are intentionally `aria-hidden` so screen readers skip them.
- **Rollback:** `git revert --no-edit 5753f75 && git push origin main`.

### PR #57 — fix(active-slate): MLB defaults to today, not pre-generated future date

- **Squash SHA on main:** `1fe0552`
- **Purpose:** Fix two stale-active bugs uncovered by the May 18 freshness audit.
- **Key changes:**
  1. `activeMlbDate()` in `app/src/lib/data-mlb.ts` was returning the LAST on-disk board file regardless of date. With pre-generated schedule shells for May 16–24, on May 18 it returned May 24 ("Saturday"). Fixed to pick the earliest date `>= today` (ET-anchored), fall back to the most recent if no current/future file exists. Mirrors `activeNhlDate` / `activeIplDate`.
  2. Homepage CTA band was hard-coded `TONIGHT ON THE MODEL WALL · ... queued and graded` — contradictory on off-days. Now slate-aware: `tonight on the model wall` when today is live, `latest scored slate · model audit` when off-day with a recent scored slate, `model lab idle` when cold start.
- **Route impacts:** `/`, `/mlb`, `/mlb/board`, homepage rail.
- **Caveats:** Was the prerequisite for PR #58's projection generation to surface correctly.
- **Rollback:** `git revert --no-edit 1fe0552 && git push origin main`.

### PR #58 — data: generate May 18 NBA and MLB projection boards

- **Squash SHA on main:** `75311eb`
- **Purpose:** Generate real May 18 paid projections + ship the R1-rescue fix + ET-anchor all active-date helpers.
- **Key changes:**
  1. **Data:** Real paid run via The Odds API. NBA 1 game (SA @ OKC) → 83 leans across 4 days written. MLB 14 games → 577 leans. Credit spend: NBA 6 + MLB 56 = 62 credits (under 75 cap). Balance 368 → 306.
  2. **Code:** `pipeline/attach_recent10.py` now rescues R1-suppressed leans. Background: `generate_daily_board.py` applies the confidence guardrails BEFORE `attach_recent10.py` attaches `recent10` from cached game logs. When game-log fetches transiently fail mid-run, R1 stamps every lean `insufficient_data` + lean `No Play`. The downgrade_lean idempotency guard then blocks re-evaluation even after recent10 lands. The fix restores the model's original confidence (preserved on `_originalConfidence`) when recent10 length ≥ `MEDIUM_CONF_MIN_LOGS` (5). 4 new tests in `pipeline/attach_recent10_test.py`.
  3. **Code:** `activeMlbDate` / `activeNhlDate` / `activeIplDate` switched from UTC-anchored `new Date().toISOString().slice(0,10)` to ET-anchored `currentEtDate()`. UTC-anchored was ticking forward at midnight UTC (~8 PM ET) while ET was still the same day.
  4. **Code:** Homepage CTA now counts `crossSportLeansLive` (NBA + MLB usable leans) rather than NBA-only.
- **Route impacts:** Every sport surface that picks an active date — all of them.
- **Caveats:**
  - The MLB pipeline has internal `min_credits_remaining=350` default. Pass `--min-credits-remaining 300` if you want to match the user's 300 floor (the operator approved 300, not 350).
  - **Anaconda's `bottleneck`/`numpy 2.x` ABI mismatch** crashes pandas when invoked with system Python. **Always use `pipeline/.venv/bin/python` for paid runs.** See §8.
- **Rollback:** `git revert --no-edit 75311eb && git push origin main`.

### PR #59 — results: settle May 18 projections and upgrade audit UI

- **Squash SHA on main:** `f317e91`
- **Purpose:** Settle May 18 NBA + MLB against real final box scores and ship the date-page UX upgrade.
- **Key changes:**
  1. **ESPN settlement source:** `pipeline/settle_results.py` gained `fetch_final_stats_via_espn(game_id)`. The May 18 SA @ OKC board's `gameId=401873197` is a 9-digit ESPN event ID that `nba_api` can't accept. The new source calls ESPN's free `summary` endpoint, parses player tables, refuses in-progress games (`completed: true` check), keys by lowercased player name. Manual override > nba_api > ESPN priority. 8 new tests in `pipeline/settle_test.py`.
  2. **May 18 NBA settled:** 108–58 on 166 decisive · 65.1% via ESPN source. Top hit Stephon Castle Over 7.5 AST · +37.2pp edge · actual 11. Largest miss Alex Caruso Under 7.5 PTS · model 5.46 → actual 31.
  3. **May 18 MLB settled:** Initial partial 129–142 on 271 decisive (12/14 final, CWS @ SEA + HOU @ MIN pending). After both games completed: 149–161 on 310 decisive · 48.1%.
  4. **/results/date/[date] UX upgrade:** New `AtAGlanceCard` (Hit/Miss/Push/Pending plain-English glossary) + new `BigCallsRow` (cross-sport Biggest hits + Biggest misses leaderboards).
- **Route impacts:** `/results`, `/results/date/2026-05-18`.
- **Caveats:** ESPN source only fires for 9-digit IDs. NBA.com 10-digit IDs still route to nba_api. Tests cover both paths.
- **Rollback:** `git revert --no-edit f317e91 && git push origin main`.

### PR #60 — ci: automate nightly settlement and morning projection refresh

- **Squash SHA on main:** `eba9564` (current `main` HEAD)
- **Purpose:** Replace the manual "run settle + run projections" muscle with two cron-scheduled workflows + a credit guard.
- **Key changes:** Six new files, zero existing files modified.
  - `.github/workflows/nightly-settle.yml` — cron `0 7 * * *` UTC = 3 AM EDT (clears 2 AM EDT settlement target). Settles yesterday's NBA + MLB via the free settlement sources. Commits result diffs to `app/public/data/{results,mlb/results}/`. `workflow_dispatch` accepts `settle_date` + `dry_run`.
  - `.github/workflows/morning-projections.yml` — cron `30 13 * * *` UTC = 9:30 AM EDT. Probes balance via `credit_guard.py`, refuses if estimated cost > 75 credits or projected post-run balance < 300. Runs paid NBA + MLB pipelines via `pipeline/.venv/bin/python`. `workflow_dispatch` accepts `projections_date` + `dry_run` + `max_per_run` + `min_remaining`.
  - `scripts/automation_settle.sh` + `scripts/automation_projections.sh` — shell orchestrators with colored output, target-date selection, ET-anchored "yesterday" / "today" math, idempotent re-run handling.
  - `pipeline/credit_guard.py` — pure-function probe + decision. 21/21 tests in `pipeline/credit_guard_test.py`. Refuses on missing key, probe failure, negative cost, over-cap cost, under-floor projection.
- **Route impacts:** None visible. Operational only.
- **Caveats:** Requires GitHub secret `ODDS_API_KEY` for the paid morning run. Optional `vars`: `MAX_PER_RUN` (default 75), `MIN_REMAINING` (default 300), `ODDS_MAX_EVENTS_PER_RUN` (default 8). Failure logs upload as `actions/upload-artifact@v4` (7-day retention).
- **Rollback:** `git revert --no-edit eba9564 && git push origin main`. Workflows stop firing as soon as the file is gone from `main`.

### PR #61 — feat(results): add honest model audit notes derived from real settled data (OPEN)

- **HEAD:** `9331922` (two commits: `1af7af3` Model Audit Notes + `9331922` Settled banner & Path-forward)
- **Branch:** `feature/results-model-audit-notes`
- **Preview URL:** `https://gametime-picks-f2t5f9de5-yashwantbalaji33-7164s-projects.vercel.app`
- **State:** OPEN · CLEAN · all 3 Vercel checks PASS
- **Purpose:** Surface honest, sample-size-aware audit findings on `/results`, `/results/nba`, `/results/mlb`. Make settled board pages visually distinct from live boards. Add a "what we're watching" path-forward note.
- **Key changes:**
  1. New helper `app/src/lib/results-audit-notes.ts` — computes `buildNbaAudit`, `buildMlbAudit`, `buildCrossSportFraming`, `settledDateRoster`. Pure derivation from on-disk `settled_leans.jsonl`. Weight labels: `Signal` ≥ 200 decisive, `Lean` 60–199, `Small sample` < 60.
  2. New component `app/src/components/results-model-audit-notes.tsx` — renders the audit notes in `combined` or `sport` mode. Per-sport mode adds a triple of Over/Under × Market × Edge-band split tables.
  3. New component `app/src/components/board-date-status-banner.tsx` — shared NBA + MLB top-of-page banner. Four states: `SETTLED · graded against final box scores`, `LIVE TONIGHT · today's slate`, `UPCOMING SLATE · projections arriving soon`, `LINES PENDING · projections arriving soon`. Settled state always links to `/results/date/<date>`.
  4. `app/src/lib/results-audit-notes.ts` extended with "What the audit is watching next" — descriptive review pointers, never tuning recommendations.
- **Route impacts:** `/results` (audit notes block), `/results/nba` + `/results/mlb` (sport-specific notes + split tables), `/nba/board` + `/mlb/board/[date]` + `/board` (settled banner).
- **Caveats:** **DO NOT MERGE WITHOUT EXPLICIT USER APPROVAL.** The user wants comprehensive UI revamp work, and this PR only covers Results + board-page settled state. The user has flagged that more is needed (see §13).
- **Rollback:** `git revert --no-edit <squash-sha> && git push origin main`.

---

## 4. Current UI/UX state

### Homepage `/`

- Top: educational disclaimer strip + GameTime Picks logo + tab bar (Home / NBA / MLB / NHL / IPL / Parlays / Results / Methodology / Responsible Use).
- Hero: tight tagline `Transparent model leans on NBA & MLB player props.` + `Model projections vs sportsbook lines. Every edge graded, every result public.` + 3 chips `NBA + MLB` (success pulse) · `Audit · 54.7% on 954` (gold) · `Educational only` (mute).
- Right-side hero: `SportsbookStatusBoard` showing latest scored slate.
- CTA buttons: `View latest scored board` + `Open Parlay Lab` + `how the model works →`.
- KPI strip: 4 `NeonStatPanel` cards.
- Live ticker rail (when scored slate exists).
- Trending tabs section (Projections / Parlays / Upcoming).
- `HomepageSportsRail`: 4 sport cards (NBA / MLB / NHL / IPL) with status chips + matchup + audit summary + open link. Plus 2 ticket-style CTAs (Model audit / Parlay Lab).
- "What's on the floor" section: 4 CommandTiles (Star spotlight / Guardrails / Parlay Lab / Model audit).
- Anatomy of a projection callout (when scored slate exists).
- House rules · 3-step explainer.
- MLB rail · 3 ticket cards (Open the MLB hub / Strikeouts·hits·total bases / Power Board).
- CTA band (slate-aware: live/scored/idle copy).
- Newsletter signup.
- Footer.

**Strengths:** projection-first, premium dark theme, neon-gold accents, status chips real and ET-anchored.
**Remaining weakness:** still text-dense on mobile in the trending tabs + explainer area. Could compress further (see §13).

### NBA `/nba`

- `NbaSectionTabs` strip (Overview / Model Board / Power Board / Parlays).
- Sport-overview hero with eyebrow + headline + matchup callout.
- KPI strip + 4 NeonStatPanels.
- Game-by-game preview when slate is live.
- Audit teaser pointing to `/results/nba`.

### NBA Board `/nba/board` (and `/board`)

- **PR #61 adds:** `BoardDateStatusBanner` at top — currently shows `LIVE TONIGHT · today's slate · 1 game · 74 model leans tonight · 2026-05-19`.
- Hero with eyebrow `NBA model board · live` + headline `Tuesday, May 19` + slate description.
- Data-source badges row.
- Sportsbook status board with games + projection count.
- TodayAwareSlateBanner.
- BoardWithTabs — date strip + per-day projection cards.
- "How to read these projections" disclosure.
- Newsletter signup.

### MLB `/mlb`

- `MlbSectionTabs` strip.
- Sport-overview hero.
- MlbSummaryStrip + KPI tiles.
- Per-game scorecard preview.
- Audit teaser pointing to `/results/mlb`.

### MLB Board `/mlb/board` + `/mlb/board/[date]`

- **PR #61 adds:** `BoardDateStatusBanner` at top.
  - On `/mlb/board` today (May 19): `LINES PENDING · projections arriving soon · 15 games scheduled · 2026-05-19`.
  - On `/mlb/board/2026-05-18`: `SETTLED · graded against final box scores · 149–161 on 310 decisive picks · 48.1% · 2026-05-18 · View audit →`.
- `MlbSectionTabs`.
- Sport header.
- MLB summary strip with confidence breakdown.
- KPI strip (High / Medium / Low+anomalies / Sample too small).
- Per-market totals.
- Top clean leans strip.
- Filter console (market / confidence / team / sort / density toggle).
- Per-game expandable cards.

### NHL `/nhl` + `/nhl/board`

- Schedule-only / provider-pending shell. Honest framing:
  - `NHL · educational analytics · early days`
  - `NHL is joining the lineup.`
  - `Schedule loads from the free NHL public API. The model board, parlays, and results stay honestly pending until paid odds wiring and per-player game-log ingestion are wired. We refuse to surface NHL projections before the data supports them.`
- Stats: Games on slate (live count from `nhl/schedule/<date>.json`) · Model leans `0` · Power Board `—` · Settled audit `—`.

### IPL `/ipl` + `/ipl/board`

- Provider-pending shell. Same honest pattern as NHL but for IPL data provider.
- Schedule from `ipl/schedule/<date>.json` only. No projection pipeline.

### Parlay Lab `/parlay-lab`

- Hero: `NBA Parlay Lab · educational analysis` + `Build with the model.` headline.
- Sport-mode strip: NBA active · MLB pending snapshots · NHL/IPL pending.
- Parlay console step list (numbered 1–6, dynamically renumbered when steps are hidden):
  1. Slate (date picker)
  2. Builder mode (Top model props / Selected players)
  3. Risk profile (Conservative / Balanced / Aggressive)
  4. Player pool (full rotation toggle)
  5. Players (only in Selected Players mode)
  6. Games (only when game options exist)
  7. Markets (PTS / REB / AST)
- Candidate slips output (right panel): real `Candidate 1`–`3` cards when slate is live. Combined-odds chip, per-leg LINE / PROJECTION / EDGE.
- Cold-start state: `DemoPreviewState` with 3 sample chips, gold-glow on first chip, stamped `PREVIEW ONLY · CHIPS ACTIVATE WHEN A REAL SLATE LOADS`.
- Strong educational framing throughout. **No parlay hit-rate claim anywhere.**

### Results `/results`

- Hero: 54.7% headline · 522–432 on 954 decisive picks · honest framing about pushes, pending, parlays.
- `ResultsSportTabs` (Overview / NBA · live / MLB · live / NHL · pending / IPL · pending / Parlays · pending snapshots).
- Overall stat tiles (Settled rows / Wins / Losses / Pushes).
- Per-sport audit cards (NBA + MLB).
- Calibration trend tile row (last N settled slates).
- **PR #61 adds:** Model audit notes block (cross-sport framing). 4 notes: NBA leading + Pending never affects + Calibration tracking + Watching next.
- "How the overall hit rate is computed" disclosure.
- ModelLessonsCard (real lessons from settled slates).
- ParlayResultsDisclosure (pending).
- Footer.

### Results sub-pages

- `/results/nba` (and `/nba/results`): NBA-specific hero · per-sport tabs · breakdown · **PR #61 adds:** NBA audit notes block with 4 notes + Over/Under × Market × Edge-band split tables · ModelLessonsCard.
- `/results/mlb` (and `/mlb/results`): same template for MLB.
- `/results/date/[date]`: `AtAGlanceCard` (Hit/Miss/Push/Pending plain-English) + `BigCallsRow` (cross-sport top hits + misses) + per-sport scorecards + per-game expandable details + prev/next date nav.
- `/results/parlays`: honest pending state. "Parlay hit rate stays empty until slips persist."
- `/results/nhl` + `/results/ipl`: pending shells.

### Mobile state (390 px)

- All 16 audited routes return HTTP 200 with no horizontal overflow and no console errors.
- Status banner from PR #61 renders cleanly at 390 (flex-wrap on the inner content).
- Audit notes grid collapses to 1 column on mobile.
- Tab strips horizontal-scroll where they overflow.

### Casino/sportsbook visual system

Existing CSS utilities (`app/src/app/globals.css`) that compose the look:
- `gtp-neon-pulse` — 3.2s opacity pulse on indicator dots
- `gtp-radar-pulse` — 2.8s radial pulse on sport cards (reduced-motion safe)
- `gtp-aurora-halo` — soft gradient border halo on cards
- `gtp-line-scan` — diagonal scanline overlay on hero sections
- `gtp-command-tile` — neon-bordered command tiles with periodic shine
- `gtp-status-board` — LED-style stat panel with glass inner border
- `gtp-led-mode` — single-pixel chip with LED feel
- `gtp-crt-scanlines` — barely-visible CRT effect (0.022 alpha)
- `gtp-scoreboard-number` — tabular numeric with gold textShadow
- `gtp-cta-band` + `gtp-cta-primary` + `gtp-cta-ghost` — sportsbook CTA chip styles
- `vault-data-orbit` + `vault-ambient-orbit` — dual-layer orbit backdrops
- `vault-glow-hover` — gold-glow hover state
- `casino-glow-card` — subtle card glow on hover
- `vault-deluxe-card` — premium card shell
- All animations gated by `@media (prefers-reduced-motion: reduce)`.

### Known UX strengths

- Status chips real and ET-anchored — no stale active games.
- Audit honesty system (`Signal` / `Lean` / `Small sample` weights).
- Mobile-first card layouts.
- Educational framing consistent across surfaces.
- Settled board pages now visually distinct from live (PR #61).

### Known UX weaknesses still remaining

- Homepage still text-dense on mobile in trending tabs + explainer + MLB-section areas.
- No date picker rail on `/nba/board` or `/mlb/board/[date]` — the current `BoardWithTabs` strip works but is not a "calendar picker".
- No global breadcrumb or sticky route switcher on mobile.
- Sport overview pages (`/nba`, `/mlb`, `/nhl`, `/ipl`) use slightly different header treatments — not yet fully unified.
- Methodology + Responsible Use pages haven't been touched in the recent visual-consistency passes.
- No "command center" hero that aggregates today's projections across all sports in one glance.

---

## 5. Current model/results state

### Lifetime (after May 18 settlement, as of PR #61 HEAD)

| Sport | Wins | Losses | Pushes | Decisive | Hit rate | Dates |
|---|---|---|---|---|---|---|
| NBA | 229 | 143 | 0 | 372 | **61.6%** | 3 (May 15, 17, 18) |
| MLB | 293 | 289 | 0 | 582 | **50.3%** | 2 (May 16, 18) |
| **Combined** | **522** | **432** | **0** | **954** | **54.7%** | 4 unique |

### Per-date breakdown

| Date | Sport | Record | Decisive | Hit rate |
|---|---|---|---|---|
| 2026-05-15 | NBA | 80–65 | 145 | 55.2% |
| 2026-05-16 | MLB | 144–128 | 272 | 52.9% |
| 2026-05-17 | NBA | 41–20 | 61 | 67.2% |
| 2026-05-18 | NBA | 108–58 | 166 | 65.1% |
| 2026-05-18 | MLB | 149–161 | 310 | 48.1% |

### Confidence-tier findings (from settled data)

**NBA (372 decisive):**
- High: 151–96 · 61.1% on 247
- Medium: 32–15 · 68.1% on 47 (small sample beating High slightly)
- Low: 45–32 · 58.4% on 77
- insufficient_data: 1–0 · 100% on 1 (negligible)

**MLB (582 decisive):**
- High: 128–123 · 51.0% on 251
- Medium: 37–39 · 48.7% on 76
- Low: 128–127 · 50.2% on 255
- **Tiers are NOT yet differentiating on the MLB side.** All three tiers cluster near 50%.

### Market findings

**NBA per-market:**
- PTS: 94–45 · 67.6% on 139 — **strongest market**
- REB: 76–52 · 59.4% on 128
- AST: 59–46 · 56.2% on 105 — **weakest market**

**MLB per-market:**
- batter_hits: 191–186 · 50.7% on 377
- batter_total_bases: 82–80 · 50.6% on 162
- pitcher_strikeouts: 20–23 · 46.5% on 43 — **weakest market**

### Over/Under skew

- **NBA:** Under 67.0% (71–35) vs Over 59.4% (158–108) — **Under leans outperform Over by ~7.6pp on 372 decisive**.
- **MLB:** Over 52.1% (188–173) vs Under 47.5% (105–116) — Over slightly stronger but smaller gap.

### Edge-band performance

**NBA edge bands (|edge|):**
- 0–5pp: 52–29 · 64.2% on 81
- 5–10pp: 45–32 · 58.4% on 77
- 10–15pp: 40–27 · 59.7% on 67
- 15–25pp: 47–35 · 57.3% on 82
- **25pp+: 45–20 · 69.2% on 65** — counter-intuitively the strongest cohort (R5 anomaly bucket). Surfaced as a **Lean** in audit notes, not a **Signal**.

**MLB edge bands (|edge|):**
- 0–5pp: 142–147 · 49.1% on 289
- 5–10pp: 73–53 · 57.9% on 126
- 10–15pp: 34–36 · 48.6% on 70
- **15–25pp: 31–43 · 41.9% on 74** — **weakest cohort**. Opposite signal from NBA's same band. Surfaced in the "What the audit is watching next" note.
- 25pp+: 13–10 · 56.5% on 23

### Audit-note findings (now live on `/results` and sport pages)

Cross-sport (`/results`):
1. **NBA model leading on settled audit** (Signal)
2. **Pending games never affect the record** (Signal)
3. **Calibration tracking on an early sample** (Signal)
4. **What the audit is watching next** (Signal): MLB model output reviewed · strikeouts market audited (46.5% on 43) · 15–25pp edge band on MLB watched for regression.

NBA-specific (`/results/nba`):
1. **Under leans outperform Over** (Signal · 67.0% vs 59.4% on 372)
2. **PTS strongest, AST weakest** (Signal · PTS 67.6% on 139, AST 56.2% on 105)
3. **Edge-band 25pp+ band strongest so far** (Lean · 69.2% on 65)
4. **Lifetime NBA settled hit rate** (Signal · 61.6% on 372)

MLB-specific (`/results/mlb`):
1. **Lifetime MLB settled hit rate** (Signal · 50.3% on 582). Intentionally surfaces only the lifetime note — other gaps don't clear the 4pp/5pp thresholds at current sample.

### Current limitations

- Only 4 unique dates settled. Sample is "early sample" by the helper's own thresholds.
- No NHL or IPL data — no projection pipeline for either.
- No parlay grading — candidate-slip snapshots not yet persisted.
- MLB Power Board (home runs) is shell-only — model inputs not wired.
- NBA AST market noticeably trailing PTS/REB.
- MLB confidence tiers not yet differentiating.

### Path-forward notes (surfaced on site, descriptive only)

- MLB output reviewed against NBA's stronger performance.
- Pitcher strikeouts market audited as the weakest on the MLB side.
- 15–25pp edge band on MLB watched for regression.
- **No retroactive model tuning is performed to chase past settled rows.**

### What is intentionally NOT claimed

- No future-accuracy claim ("80%" or otherwise).
- No "trend line" claim that NBA is improving on a 3-date sample.
- No parlay hit rate.
- No MLB confidence-tier signal at current sample (the tiers don't separate yet).
- No "retraining" or "calibration update" claim that doesn't ship with a real artifact.

---

## 6. Automation system (PR #60 in depth)

### Workflows on `main`

**`.github/workflows/nightly-settle.yml`**
- Cron: `0 7 * * *` UTC = **3 AM EDT / 2 AM EST**. Comfortably clears 2 AM EDT settlement target and absorbs late West Coast games.
- Inputs (workflow_dispatch):
  - `settle_date` (optional) — YYYY-MM-DD. Defaults to yesterday in America/New_York.
  - `dry_run` (boolean) — when `true`, prints the plan and exits without running settle.
- Env passthrough: `SETTLE_DATE`, `DRY_RUN_SETTLE`.
- Body: checkout · setup Python 3.9 · install pipeline requirements · run `scripts/automation_settle.sh` · commit diffs to `app/public/data/{results,mlb/results}/` with a bot commit message · upload `/tmp/gtp_settle.log` on failure.
- Free: no `ODDS_API_KEY` needed. Uses MLB Stats API + ESPN summary + nba_api free endpoints.

**`.github/workflows/morning-projections.yml`**
- Cron: `30 13 * * *` UTC = **9:30 AM EDT / 8:30 AM EST**.
- Inputs (workflow_dispatch):
  - `projections_date` (optional) — YYYY-MM-DD. Defaults to today in America/New_York.
  - `dry_run` (boolean) — when `true`, runs the cost estimate + credit guard probe but skips paid /odds calls.
  - `max_per_run` (optional) — override the per-run credit cap (default 75).
  - `min_remaining` (optional) — override the balance floor (default 300).
- Env passthrough: `PROJECTIONS_DATE`, `DRY_RUN_PROJECTIONS`, `MAX_PER_RUN`, `MIN_REMAINING`, `ODDS_API_KEY`, `ODDS_MAX_EVENTS_PER_RUN`.
- Body: checkout · setup Python 3.9 · install pipeline requirements · **`pipeline/.venv/bin/python` is the interpreter for all paid commands** (avoids anaconda's bottleneck ABI break) · run `scripts/automation_projections.sh` · commit data diffs · upload `/tmp/gtp_projections.log` on failure.
- Paid: requires `secrets.ODDS_API_KEY`.

### Cron schedule rationale

ET is the canonical sports clock. UTC math:
- EDT = UTC−4 → 3 AM EDT = 7 AM UTC = `0 7 * * *`.
- EDT = UTC−4 → 9:30 AM EDT = 13:30 UTC = `30 13 * * *`.
- In EST (winter, UTC−5) the same cron fires one hour earlier in local time (2 AM and 8:30 AM). Acceptable for both jobs.

### ET vs UTC handling

- All "today" / "yesterday" math uses `currentEtDate()` (defined in `app/src/lib/freshness.ts`) which is `Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })`. PR #58 ET-anchored the sport active-date helpers; PR #57 fixed the homepage CTA.
- The shell scripts in `scripts/automation_*.sh` compute the target date as `date -u +%Y-%m-%d -d "$(TZ=America/New_York date +%Y-%m-%d) 12:00 ET"` (or equivalent) — never UTC date.

### Credit guard logic (`pipeline/credit_guard.py`)

- **Probe:** GET `https://api.the-odds-api.com/v4/sports/?apiKey=$KEY` is free. Returns `x-requests-remaining` + `x-requests-used` headers. The guard parses these.
- **Refuse cases:**
  - `ODDS_API_KEY` empty → refuse.
  - Probe returns non-200 or missing headers → refuse with "balance probe failed — refusing rather than guessing".
  - Estimated cost exceeds `MAX_PER_RUN` (default 75) → refuse.
  - Projected remaining (`remaining - estimated_cost`) below `MIN_REMAINING` (default 300) → refuse.
  - Negative or non-numeric cost → refuse.
- **Output:** JSON `{ ok, reason, remaining, projectedAfter, estimatedCost, maxPerRun, minRemaining }`.
- **Tests:** `pipeline/credit_guard_test.py` (21 assertions across 8 boundary scenarios).

### Dry-run behavior

- `DRY_RUN_SETTLE=1` → settle script runs the cost-free schedule + settlement-pipeline plan and prints what would happen. **No API writes.**
- `DRY_RUN_PROJECTIONS=1` → projection script runs estimate + credit guard probe, prints decision, and exits BEFORE any paid `/odds` calls. Useful for verifying cost guards on a real API key without spending.

### Manual trigger commands

Via GitHub UI: Actions → workflow name → Run workflow.

Via `gh` CLI:
```bash
gh workflow run nightly-settle --ref main
gh workflow run nightly-settle --ref main -f settle_date=2026-05-18
gh workflow run nightly-settle --ref main -f dry_run=true

gh workflow run morning-projections --ref main
gh workflow run morning-projections --ref main -f dry_run=true
gh workflow run morning-projections --ref main -f min_remaining=350
```

Local smoke-test (no commit):
```bash
DRY_RUN_SETTLE=1 bash scripts/automation_settle.sh
DRY_RUN_PROJECTIONS=1 ODDS_API_KEY=<your_key> bash scripts/automation_projections.sh
```

### Required GitHub secrets / variables

| Setting | Kind | Required for | Default |
|---|---|---|---|
| `ODDS_API_KEY` | **Secret** | `morning-projections` only | — |
| `MAX_PER_RUN` | Variable | Optional credit cap override | `75` |
| `MIN_REMAINING` | Variable | Optional balance floor override | `300` |
| `ODDS_MAX_EVENTS_PER_RUN` | Variable | NBA per-day event cap | `8` |

Set via: GitHub → repo Settings → Secrets and variables → Actions.

### Failure handling

- Both workflows use `if: ${{ failure() }}` to upload `/tmp/gtp_*.log` as a 7-day-retention artifact named `settle-log-${{ github.run_id }}` / `projections-log-${{ github.run_id }}`.
- Bot commit is skipped if the working tree is unchanged (avoids empty commits when nothing settled).

### Idempotency behavior

- `python -m pipeline.settle_results --date <date>` and `python -m pipeline.mlb.settle_mlb_results --date <date>` rewrite the rows for that date in `settled_leans.jsonl`. Other dates are preserved verbatim. Safe to re-run.
- `python -m pipeline.generate_daily_board --date <date>` writes a fresh board file. Cache layer means a re-run inside the 60-minute TTL hits cached odds (0 credits).

### Partial settlement handling

- MLB pipeline writes `lifetime_summary.json` with `partial: true` + `pendingDates: [...]` + `pendingGamesTotal: N` when not every game on a date is final.
- Re-running settlement after pending games complete rolls the lifetime forward without double-counting (idempotent).
- Pending games are tracked separately in the comparison report's `pendingGameList` field with `gamePk`, `matchup`, `abstractState`, `detailedState`.

---

## 7. Projection / data pipeline architecture

### NBA generation flow

```
pipeline.generate_daily_board --date YYYY-MM-DD
  ↓
  1. NBA schedule          ← nba_api (preferred) → espn_scoreboard (fallback)
  2. Odds events           ← The Odds API /events (free; cached 60 min)
  3. Roster fetch          ← nba_api commonteamroster (cached)
  4. Player game logs      ← nba_api playergamelog (cached) → balldontlie (fallback)
  5. Build features        ← derive recent10, season averages, home/away
  6. score_prop(features, market, line, odds_over, odds_under, home_away)
       ↓
       returns { confidence, projection, edge_pct, model_probability, reason }
  7. Apply news signals    ← manual news_signals.json
  8. downgrade_lean()      ← R1 / R2 / R3 / R4 / R5 guardrails
       ↓
       stamps _guardrail + _originalConfidence on the lean
  9. Write app/public/data/boards/<date>.json
  10. Append to pipeline/validation/leans_log.jsonl
  11. (For multi-day: also writes 2-3 future-day schedule shells)
```

Output is **a) the board JSON with leans** but **without recent10**. recent10 attaches in a separate pass.

### attach_recent10 rescue flow

```
pipeline.attach_recent10 --date YYYY-MM-DD
  ↓
  1. Read board JSON
  2. Fetch game logs for unique players via fetch_logs_for_player
       ↓
       nba_api → balldontlie fallback
  3. extract_recent10_all_markets(logs, last_n=10) → { PTS: [...], REB: [...], AST: [...] }
  4. For each lean:
       4a. If logs are non-empty for this market, write lean.recent10 = values
       4b. If lean was R1-stamped AND new recent10 length >= MEDIUM_CONF_MIN_LOGS (5):
             rescue: restore _originalConfidence, derive lean side from
             projection-vs-line, clear _guardrail, re-run downgrade_lean fresh
             so R3/R4/R5 stamps stay honest.
       4c. Else: preserve existing recent10 (PR 21 fix).
  5. Atomic-write board JSON back.
```

**This is the critical fix from PR #58.** Without it, transient game-log fetch failures during `generate_daily_board` would permanently suppress every lean to `insufficient_data + No Play`, even after recent10 became available.

### MLB generation flow

```
pipeline.mlb.generate_mlb_board --date YYYY-MM-DD
  --min-credits-remaining 300   (override default 350 to match user's approved floor)
  ↓
  1. MLB schedule          ← MLB Stats API (free)
  2. Odds events           ← The Odds API /events (free)
  3. Cost gate             ← refuses if cost > 75 or post-run < 300
  4. Per-event odds fetch  ← The Odds API /odds (PAID — ~4 credits per event with 4 markets)
  5. Parse prop rows       ← bookmaker filter, market filter
  6. Roster + probable pitcher resolve ← MLB Stats API
  7. Game logs             ← MLB Stats API (free)
  8. mlb_model.score_prop  ← per-player, per-market projection
  9. Apply R5 anomaly cap  ← edges > 25pp downgraded to Low + flagged
  10. Write app/public/data/mlb/boards/<date>.json
  11. Write app/public/data/mlb/power/<date>.json (HR power-board shell)
```

### Settlement flow

```
pipeline.settle_results --date YYYY-MM-DD          (NBA)
pipeline.mlb.settle_mlb_results --date YYYY-MM-DD  (MLB)
  ↓
  1. Load leans for the date from settled_leans.jsonl (and/or board file)
  2. Resolve final stat per (player, market):
       NBA priority: manual_override > nba_api boxscore > ESPN summary > "missing"
       MLB priority: MLB Stats API per-player game stats (only path)
  3. settle_lean(lean, final_stat, source) → settled row:
       Over wins when actual > line; Under wins when actual < line; ==  → push
  4. Build comparison report (per market/conf/game/bookmaker)
  5. Write pipeline/validation/{,mlb_}settled_leans.jsonl
  6. Write pipeline/validation/{,mlb_}comparison_report_<date>.json
  7. Re-aggregate lifetime_summary.json
  8. After settle, run export pipeline (separate command) to sanitize
     into app/public/data/{results,mlb/results}/
```

### ESPN settlement source (added in PR #59)

`pipeline/settle_results.py :: fetch_final_stats_via_espn(game_id)`:

- Only fires for 9-digit ESPN event IDs (e.g. `401873197`). 10-digit NBA.com IDs go to `nba_api`.
- GETs `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=<id>`.
- **Refuses in-progress games** via `header.competitions[0].status.type.completed === true` check. Settlement never grades against a live score.
- Parses `boxscore.players[*].statistics[*]` — finds the `points`, `rebounds`, `assists` columns by key.
- Drops `didNotPlay: true` athletes — they don't become fake-zero stats.
- Returns `{ <lowercased name>: { PTS, REB, AST } }`. Keyed by name (ESPN doesn't expose NBA.com player IDs).
- Tests: 8 assertions in `pipeline/settle_test.py` cover parsing, DNP drop, in-progress refusal, ID routing, by-name resolution, and that manual overrides still win.

### Active slate helpers (UI side)

- **NBA:** `selectActiveSlate(allBoardDates, todayEt, boardsByDate)` in `app/src/lib/active-slate.ts`. Returns `{ kind, selectedDate, upcomingAndTodayDates, pastDates, latestArchivedDate }` with `kind` in `today | upcoming | no_current | no_data`.
- **MLB:** `activeMlbDate()` in `app/src/lib/data-mlb.ts`. ET-anchored. Picks earliest on-disk date >= ET today; falls back to latest if none.
- **NHL:** `activeNhlDate()` in `app/src/lib/data-nhl.ts`. Same pattern.
- **IPL:** `activeIplDate()` in `app/src/lib/data-ipl.ts`. Same pattern.
- **Today / yesterday helpers:** `currentEtDate(now?: Date)` in `app/src/lib/freshness.ts`. Always ET.

### ET anchoring

Every "today" surface flows through `currentEtDate()`. UTC-anchored code is treated as a bug.

### Data file locations

```
app/public/data/
  board.json                          NBA latest active-day board mirror
  boards/<date>.json                  NBA per-date boards
  meta.json                           pipeline run metadata
  schedule.json                       NBA latest active schedule
  slate.json                          NBA multi-day slate metadata
  odds_props.json                     NBA odds props snapshot
  players.json                        NBA player roster cache
  trends.json                         NBA trends snapshot
  results/
    settled_leans.jsonl               NBA append-and-update settled rows
    comparison_report_<date>.json     NBA per-date audit
    lifetime_summary.json             NBA aggregated lifetime
    available_dates.json              NBA settled dates index
  mlb/
    boards/<date>.json                MLB per-date boards
    schedule/<date>.json              MLB schedules
    power/<date>.json                 MLB Power Board shells (HR-pending)
    results/
      settled_leans.jsonl             MLB settled rows
      comparison_report_<date>.json   MLB per-date audit
      lifetime_summary.json           MLB aggregated lifetime
      available_dates.json            MLB settled dates index
  nhl/
    schedule/<date>.json              NHL schedules (free api-web.nhle.com)
  ipl/
    schedule/<date>.json              IPL schedules

pipeline/
  validation/
    leans_log.jsonl                   Append-only audit log of every lean emitted
    settled_leans.jsonl               Internal NBA settled rows (post-grade)
    mlb_settled_leans.jsonl           Internal MLB settled rows
    comparison_report_<date>.json     Internal NBA per-date audit
    mlb_comparison_report_<date>.json Internal MLB per-date audit
  cache/                              Free-tier API caches (do not commit large ones)
  overrides/
    results_overrides.json            Manual final-stat overrides
    news_signals.json                 Manual injury/news layer
    schedule_overrides.json           Manual schedule layer
```

### Automation scripts + workflows

```
.github/workflows/
  auto-refresh.yml                    Pre-existing periodic refresh
  daily-refresh.yml                   Pre-existing Phase 10 wide refresh
  nightly-settle.yml                  PR #60 new — cron 07:00 UTC
  morning-projections.yml             PR #60 new — cron 13:30 UTC

scripts/
  automation_refresh.sh               Pre-existing
  automation_settle.sh                PR #60 new
  automation_projections.sh           PR #60 new
```

---

## 8. Important bugs already solved

### 1. Stale active games (PR #53, then PR #57)

**Symptom:** LAL @ OKC (a long-eliminated first-round series) appeared as an active matchup on `/parlay-lab` and on the homepage.

**Root cause:** Parlay Lab loaded every NBA board on disk and unconditionally fed all leans into the picker. The MLB active-date helper returned the LAST on-disk board file regardless of date (with pre-generated schedule shells through May 24, on May 18 it returned May 24).

**Fix:** PR #53 restricted Parlay Lab data load to `activeSlate.upcomingAndTodayDates`. PR #57 fixed `activeMlbDate()` to pick the earliest date `>= ET today`, fall back to latest only if none. PR #58 ET-anchored all three sport active-date helpers (MLB / NHL / IPL).

### 2. NBA ESPN settlement mismatch (PR #59)

**Symptom:** Running `python -m pipeline.settle_results --date 2026-05-18` on the SA @ OKC game logged `nba_api boxscore failed for game_id='401873197': 'resultSet'` and marked 166 leans `stats_unavailable`.

**Root cause:** The NBA pipeline used `espn_scoreboard` as the schedule source (nba_api was failing earlier in the day). ESPN scoreboard returns its own 9-digit event IDs. The settle pipeline only had an `nba_api` auto-source which can't accept ESPN IDs.

**Fix:** PR #59 added `fetch_final_stats_via_espn(game_id)` to the settle pipeline. Refuses in-progress games. Keys by lowercased player name. Routes by ID format (9-digit → ESPN, 10-digit → nba_api).

### 3. R1 guardrail permanently suppressing rescuable leans (PR #58)

**Symptom:** Every NBA lean on May 18 + May 19 boards had real `projection` + `edgePct` values but `confidence: insufficient_data` and `lean: No Play`. R5 anomaly cap didn't fire because R1 fired first.

**Root cause:** `generate_daily_board.py` applies the confidence guardrails BEFORE `attach_recent10.py` attaches recent10 from cached game logs. When game-log fetches transiently failed mid-run (anaconda's bottleneck/numpy ABI break crashed pandas → fetches returned empty), R1 stamped every lean `insufficient_data + No Play`. The `downgrade_lean` idempotency guard then blocked re-evaluation even after recent10 became available.

**Fix:** PR #58 extended `attach_recent10.py` to rescue R1-stamped leans when `recent10` length now satisfies `MEDIUM_CONF_MIN_LOGS` (5). Restores `_originalConfidence`, derives lean side from projection-vs-line, clears `_guardrail`, re-runs `downgrade_lean` fresh. 4 new tests cover the rescue paths.

### 4. UTC midnight rollover masking the live MLB slate (PR #58)

**Symptom:** After ~8pm ET (midnight UTC), `activeMlbDate()` ticked forward by one day. The homepage cross-sport CTA undercount went from "611 projections" to "1 projections" because the MLB lean count was masked.

**Root cause:** All three sport active-date helpers used `new Date().toISOString().slice(0,10)` which is UTC.

**Fix:** PR #58 ET-anchored all three via `currentEtDate()` from `app/src/lib/freshness.ts`.

### 5. Pending-games-as-losses protection (long-standing, PRs #53, #58, #59)

**Mechanism (multi-layer):**
- Settlement scripts only count rows whose `result in (win, loss)` (NBA) or `outcome in (Win, Loss)` (MLB).
- Pushes excluded from hit-rate denominator (`pushes` field on every comparison report).
- Pending games never appear in `comparison_report.byGame` — they go to `pendingGameList` with their `gamePk`/`abstractState`/`detailedState`.
- The ESPN source explicitly refuses to settle a game that ESPN itself doesn't call `completed: true`.
- `lifetime_summary.json` carries `partial: true` + `pendingDates: [...]` + `pendingGamesTotal: N` when a recently-settled date has games still pending.
- PR #61's audit-notes block explicitly surfaces the rule as a Signal note: "Pending games never affect the record."

### 6. CDN / Vercel staleness caveat (handoff §14, observed during PR #59 merge)

**Symptom:** After merging a PR with new data files, the custom domain `gametimepicks.yashwantbalaji.com` continued to serve cached content for several minutes. Sometimes specific routes (e.g. `/results/mlb`) lag behind the rest of the site for ~3–5 minutes.

**Behavior:** Each Vercel edge invalidates independently. The canonical deploy URL (e.g. `https://gametime-picks-<hash>-yashwantbalaji33-7164s-projects.vercel.app`) refreshes immediately and can be used to verify content while the custom domain catches up.

**Mitigation:** When verifying production after a merge, poll for a specific new marker string with a 20–30s interval until the marker appears. Don't trust a "still old" reading after only one probe.

---

## 9. Known remaining limitations

### NHL / IPL projection gaps

- **NHL:** No `pipeline/nhl/` module exists. No goalie/skater game-log loader. No paid odds wiring. The `/nhl` and `/nhl/board` pages honestly say "schedule live · projection model pending" and refuse to render projections.
- **IPL:** No per-player stats provider decision (Cricbuzz / SportRadar / RapidAPI cricket evaluation still open). The `/ipl` and `/ipl/board` pages honestly say "stats provider pending".

### MLB Power Board limitation

- `/mlb/power` and `/mlb/power/<date>` render a shell only.
- Inputs (slugging + park factor + weather + pitcher HR-allowed rate) not yet wired.
- Power-board files at `app/public/data/mlb/power/<date>.json` are pending shells with `state: "pending"`.

### Candidate-slip persistence missing

- No `pipeline/snapshot_parlays.py` yet.
- No `app/public/data/parlays/<sport>/<date>.json` files generated before games.
- Result: **no parlay grading possible**. `/results/parlays` correctly stays in pending state. `/parlay-lab` correctly refuses any hit-rate claim. Building this is the unlock for the Parlay surface.

### No parlay grading yet

Follow-on of candidate-slip persistence. Until pre-game snapshots exist, parlay results cannot be graded.

### Model calibration limitations

- Only 4 unique settled dates (May 15, 16, 17, 18). Sample is "early" by the helper's own definition.
- MLB confidence tiers not differentiating yet.
- Per-market sample sizes vary widely (NBA AST has 105; MLB pitcher_strikeouts has 43).
- No cross-validation or holdout — every settled row is in-sample.

### Market limitations

- NBA covers only PTS / REB / AST. No FG3M, blocks, steals.
- MLB covers `pitcher_strikeouts`, `batter_hits`, `batter_total_bases`, `batter_hits_runs_rbis`. Home runs intentionally on the separate Power Board.

### Environmental caveats

- **Anaconda bottleneck/numpy ABI break.** System Python `python3` has numpy 2.0.2 + bottleneck compiled for numpy 1.x. Pandas tries to import bottleneck during the `nba_api` chain and crashes with `AttributeError: _ARRAY_API not found`. **Always use `pipeline/.venv/bin/python` for any pipeline command that touches nba_api.** The PR #60 workflows already pin this interpreter.
- **The Odds API monthly cap.** 500/month. Currently used ~194 (May 18 paid run was 62 credits; budget tracked manually via `gh api` and inline curls).
- **GitHub Actions cron drift.** Scheduled workflows can fire 1–3 minutes late under load. Acceptable for both jobs.

---

## 10. Hard operating rules

### Data integrity

- **No fabrication.** Never invent schedules, odds, stats, projections, injuries, results, parlays, hit rates, or learning claims.
- **No fake hit rates.** Every percentage on the site comes from `settled_leans.jsonl` / `lifetime_summary.json` / `comparison_report_<date>.json` computed from real settled rows.
- **Pending games never count as losses.** Pending is a separate state from loss everywhere.
- **Pushes excluded from hit-rate denominator.**
- **No fake parlay record.** No parlay hit rate may be claimed until candidate slips are persisted before games and graded after settlement.
- **No fake calibration charts.** No "trend line" if real settled data doesn't support it. Audit notes must carry a sample-size weight label.

### Paid API budget

- **Per-run cap:** 75 credits (`MAX_PER_RUN`).
- **Balance floor:** 300 credits (`MIN_REMAINING`). The MLB pipeline's internal default is 350; override with `--min-credits-remaining 300` for operator-approved runs.
- **No paid run** unless the cost is estimated first and the projected post-run balance stays at or above the floor.
- `pipeline.credit_guard` is the single source of truth for this check.

### Forbidden public copy

The `pipeline/public_copy_test.py` test enforces this list across `app/src/**/*.{tsx,ts}`. **Do not introduce:**
- "safe bet"
- "lock"
- "guaranteed"
- "best bet"
- "free money"
- "can't miss" / "cant miss"
- "no room for error"

### Approved public copy

Use these phrases when you need to communicate the model's stance:
- "clean leans"
- "lower-variance"
- "risk-aware"
- "educational candidates"
- "candidate slips"
- "model audit"
- "Power Board"
- "high-variance watch"
- "lower-correlation construction"
- "lines pending"
- "projections arriving soon"
- "live slate"
- "model edge"
- "projection card"
- "calibration trend"

### Engineering rules

- **Do not touch `app/package.json` or `app/package-lock.json`** unless absolutely necessary, and explain why.
- **Do not commit** SESSION_*.md / `.claude/` / root `gametime-picks-logo.png` / pipeline cache files. These stay untracked.
- **Do not expose `ODDS_API_KEY`** — no echo, no commit, no PR description.
- **Preserve the centralized Results architecture.** Results is the audit hub. Hit-rate numbers should not be scattered across sport boards.
- **No broad unrelated redesigns** within a single PR. Keep PRs focused.
- **Use `pipeline/.venv/bin/python`** for any pipeline command that touches nba_api.

---

## 11. Current repo / workflow commands

### Verification (read-only)

```bash
cd ~/Downloads/gametimepicks

# Repo state
git status --short
git branch --show-current
git log --oneline -10
git rev-parse HEAD
git rev-parse origin/main

# Open PRs
gh pr list --state open --json number,title,headRefName,mergeStateStatus,statusCheckRollup
gh pr view 61 --json state,mergeStateStatus,mergeable,headRefOid,url

# Credit balance probe (FREE, 0 credits)
curl -sI "https://api.the-odds-api.com/v4/sports/?apiKey=$ODDS_API_KEY" 2>/dev/null | grep -iE '^(x-requests-remaining|x-requests-used|http)'
```

### Tests + build + typecheck

```bash
cd ~/Downloads/gametimepicks
python3 pipeline/public_copy_test.py
python3 -m pipeline.parlay_builder_test
python3 -m pipeline.settle_test
python3 -m pipeline.export_results_test
python3 -m pipeline.mlb.settle_mlb_results_test
python3 -m pipeline.mlb.export_mlb_results_test
python3 -m pipeline.context_tag_test
python3 -m pipeline.mlb.mlb_model_test
python3 -m pipeline.active_slate_test
python3 -m unittest pipeline.attach_recent10_test
python3 -m pipeline.credit_guard_test

cd app
npm run typecheck
npm run build
cd ..
```

Expected pass counts (current as of PR #61 HEAD):
- parlayBuilder 39/39 · settle 74/74 · export_results 38/38 · mlb settle PASS · mlb export PASS · context_tag PASS · mlb_model PASS · activeSlate 42/42 · attach_recent10 10/10 · credit_guard 21/21 · public_copy_test PASS · typecheck clean · build clean (35 routes).

### Projection generation (PAID)

**Always use the pipeline venv.** Always pass `min-credits-remaining` explicitly for MLB.

```bash
# NBA (~3 credits per event × markets)
ODDS_API_KEY=<key> ODDS_DRY_RUN=false ODDS_MAX_EVENTS_PER_RUN=4 \
  pipeline/.venv/bin/python -m pipeline.generate_daily_board --date 2026-05-19

# Then rescue R1 + attach recent10
pipeline/.venv/bin/python -m pipeline.attach_recent10 --date 2026-05-19

# MLB (~56 credits for a full 14-game slate with 4 markets)
ODDS_API_KEY=<key> ODDS_DRY_RUN=false \
  pipeline/.venv/bin/python -m pipeline.mlb.generate_mlb_board --date 2026-05-19 \
  --min-credits-remaining 300
```

### Settlement (FREE)

```bash
# NBA (uses nba_api boxscore → ESPN summary fallback)
pipeline/.venv/bin/python -m pipeline.settle_results --date 2026-05-18

# MLB (uses MLB Stats API)
pipeline/.venv/bin/python -m pipeline.mlb.settle_mlb_results --date 2026-05-18

# Sanitized public export
pipeline/.venv/bin/python -m pipeline.export_results
pipeline/.venv/bin/python -m pipeline.mlb.export_mlb_results
```

### Automation dry-runs

```bash
DRY_RUN_SETTLE=1 bash scripts/automation_settle.sh
DRY_RUN_PROJECTIONS=1 ODDS_API_KEY=<key> bash scripts/automation_projections.sh

gh workflow run nightly-settle --ref main -f dry_run=true
gh workflow run morning-projections --ref main -f dry_run=true
```

### Rollback patterns

```bash
# Revert a merged PR
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <squash-sha>
git push origin main
# Vercel redeploys in ~1 min; custom domain rollover ~3 min
```

### Route verification checklist (16 routes)

When verifying any UI change, walk these at desktop and 390 mobile:

```
/
/nba
/nba/board
/mlb
/mlb/board
/mlb/board/2026-05-18
/nhl
/ipl
/parlay-lab
/results
/results/nba
/results/mlb
/results/parlays
/results/date/2026-05-18
/methodology
/responsible-use
```

For each: HTTP 200, no console errors, no horizontal overflow at 390, no stale active games, no pending counted as losses, no fake projections, no fake hit rates, no forbidden copy.

---

## 12. Current active PR (#61)

### Exact purpose

Add honest, sample-size-aware model audit findings to the Results hub + make settled board pages visually distinct from live boards + extend the audit helper with a descriptive "what we're watching" note.

### Current scope

- 5 files added (new helper + 2 new components + 2 commits worth of integration).
- 0 files removed.
- 4 files modified (integration into Results pages and NBA/MLB board pages).
- No package files touched.
- No data files touched (audit notes derive from already-on-disk settled JSONL).

**Diff against main (`eba9564`):**
```
new   app/src/lib/results-audit-notes.ts
new   app/src/components/results-model-audit-notes.tsx
new   app/src/components/board-date-status-banner.tsx
mod   app/src/app/results/page.tsx
mod   app/src/app/nba/results/page.tsx
mod   app/src/app/mlb/results/page.tsx
mod   app/src/components/mlb/mlb-board-body.tsx
mod   app/src/app/board/page.tsx
```

### What changed

See PR #61 in §3 for the detailed line-by-line summary. Briefly:
1. **Model Audit Notes** (helper + component) on `/results`, `/results/nba`, `/results/mlb`.
2. **BoardDateStatusBanner** on all NBA and MLB board pages — four states: SETTLED, LIVE TONIGHT, UPCOMING SLATE, LINES PENDING. The SETTLED state surfaces a one-click `View audit →` link.
3. **Path-forward note** added to the cross-sport framing — descriptive review pointers only, never tuning claims.

### What still remains for the future larger UI rebuild

The user has explicitly flagged that PR #61 does NOT satisfy the requested scope of a full end-to-end revamp. The bigger pieces still owed:

- Global navigation IA review (sticky nav, breadcrumbs, mobile route switcher).
- Homepage command-center rebuild (less text, more cards, "today's projections" front-and-center).
- Projection navigation UX — date + game picker rails on `/nba/board` and `/mlb/board/[date]`.
- Sport overview consistency — unify `/nba`, `/mlb`, `/nhl`, `/ipl` hero treatments.
- Reusable casino visual system — consolidate the chip/card/section-header components into a shared kit.
- Ticket/slip visual language for Parlay Lab candidate cards.
- Mobile navigation polish (the tab strip overflows; a compact picker would help).
- Methodology and Responsible Use page consistency.

### Current preview URL

`https://gametime-picks-f2t5f9de5-yashwantbalaji33-7164s-projects.vercel.app`

### Current merge recommendation

**Do NOT merge without explicit user approval.** Per Step 14 in the user's most recent prompt. Tests + build + Vercel checks all pass. Content is honest. But the user has flagged that more is needed.

### What still needs review before merge

- Visual review of the new audit-notes section at desktop (the previous session only confirmed at 390 mobile).
- User decision on whether to fold the larger UX work into PR #61 (one big PR) or merge #61 first and open a separate PR (recommended).
- Confirm the path-forward note's wording reads as descriptive review, not as a tuning recommendation.

---

## 13. Recommended next PR after #61

After PR #61 merges (or is intentionally kept open while the larger work happens), the next major PR should be a **focused homepage + sport-page consistency PR**, not a "do everything" PR. Recommended title:

> **feat(ui): unified sport command center + homepage cleanup**

### What it should focus on

1. **Homepage command-center rebuild**
   - Compress the current 10-section homepage to 5–6 high-signal sections.
   - Promote "Today's projections" + "Latest settled slate" + "Model audit" + "Parlay Lab" into a single command-row above the trending tabs.
   - Drop the long anatomy callout and the 3-step explainer (move to `/methodology`).
   - Keep the casino visual system; reduce paragraph copy.

2. **Sport overview consistency**
   - Build a shared `SportOverviewHero` component used by `/nba`, `/mlb`, `/nhl`, `/ipl`.
   - Unified eyebrow + headline + status chip + matchup preview pattern.
   - One consistent "open the model board →" CTA.
   - NHL/IPL render as "pending pipeline" via the same component (no separate broken-looking shells).

3. **Projection navigation UX (date + game picker rail)**
   - On `/nba/board` and `/mlb/board/[date]`, add a horizontal date strip above the existing tab system.
   - Each date pill shows: date label · status chip (Live / Settled / Lines pending) · click → swaps to that date.
   - Settled dates link to `/results/date/<date>` instead of the board page.

4. **Methodology + Responsible Use visual consistency pass**
   - Apply the same hero pattern as the new sport overview.
   - Compress paragraph blocks; bullet structure where useful.

5. **Mobile sticky route switcher** (small, optional)
   - When scrolled past hero on mobile, show a compact 4-icon sticky bar at the top: Home / Boards / Parlay / Results.

### What it should NOT do

- Do **not** scatter hit-rate claims across sport boards. Results stays the audit hub.
- Do **not** add new content surfaces that don't ship with real settled data behind them.
- Do **not** redesign Parlay Lab beyond the educational/preview-only framing. Persistence is the unlock; visual polish without it is paint over a missing feature.
- Do **not** touch package files.
- Do **not** introduce a parallel calibration surface (we have `/results` + the new audit notes; adding charts elsewhere violates "Results is the audit hub").
- Do **not** add NHL/IPL projections. They stay schedule-only until real pipelines exist.
- Do **not** try to do everything in one PR. If the scope balloons, split it.

### Suggested commit structure

Roughly 3–5 commits onto one branch:
1. New shared `SportOverviewHero` component + unified usage across all 4 sport pages.
2. Homepage section consolidation.
3. Date/game picker rail component + integration.
4. Methodology + Responsible Use polish.
5. (Optional) Mobile sticky route switcher.

### Suggested verification

Run all 11 pipeline tests + typecheck + build. Walk all 16 routes at 390 mobile + desktop. Run public_copy_test (it will catch any forbidden copy regressions). Verify on Vercel preview before requesting merge.

---

## 14. Session resume instructions

### Start here in a new Claude Code session

```bash
# 1. Re-read this file:
cat ~/Downloads/gametimepicks/SESSION_HANDOFF_2026-05-19_UI_REVAMP.md

# 2. Sync the repo:
cd ~/Downloads/gametimepicks
git status --short                    # expect: only untracked SESSION_*.md / .claude/ / root logo
git branch --show-current             # expect: feature/results-model-audit-notes (or main if user merged)
git fetch --prune origin
git log --oneline -10                 # expect: top is eba9564 OR 9331922 if PR #61 merged

# 3. Check PR #61 state:
gh pr view 61 --json state,mergeStateStatus,headRefOid,url
gh pr checks 61

# 4. Verify production health:
curl -sI https://gametimepicks.yashwantbalaji.com/ | head -3
curl -s https://gametimepicks.yashwantbalaji.com/results/ | grep -oE '522.{0,8}432|954 decisive|54\.7%' | sort -u
```

Expected results:
- `git rev-parse HEAD` on main → `eba9564` (or whatever PR #61 squashes to if merged).
- PR #61 status → OPEN · CLEAN · MERGEABLE (or merged).
- Production → 200 · serving `522–432 on 954 decisive · 54.7%`.

### What to inspect first

1. **PR #61 preview URL.** Confirm the new banner + audit notes + path-forward are visible. The latest preview URL is in §12. If stale, regenerate via `gh api 'repos/.../deployments?ref=<sha>' --jq ...`.
2. **The branch state.** If still on `feature/results-model-audit-notes`, decide whether to push more commits (continue the UI revamp work) or switch to `main` and open a fresh PR for the larger UX rebuild.
3. **The user's latest message.** Re-read what they last asked for. The most recent ask was the larger UI revamp; PR #61 only partially satisfied it (Model audit notes + settled banner).

### What PRs are open

- **#61** — this session's work. NOT merged. **Do not merge without explicit approval.**
- **#5, #4, #2, #1** — pre-existing legacy. Leave alone.

### What should be merged first

PR #61 should be reviewed and merged (or intentionally held) before opening the larger UI rebuild PR. Two reasons:
1. The audit-notes work is high-value and self-contained — easy to ship.
2. The next PR will reuse the `BoardDateStatusBanner` and `ResultsModelAuditNotes` components.

If the user wants to fold the larger UI work into PR #61 instead, push more commits onto `feature/results-model-audit-notes`. The branch is already rebased onto current main.

### What should happen next

Based on the user's last message in §13, the recommended next direction is:
1. Decide PR #61 merge vs hold.
2. Open a focused **homepage + sport-page consistency** PR (see §13 for the suggested scope).
3. **Do NOT attempt a full end-to-end revamp in one PR.** Split it. The user prefers focused PRs.

### What not to accidentally break

- **The settlement pipeline.** PR #58/#59 layers are working; don't change them unless a test fails on `main`.
- **The active-slate logic.** PR #57/#58 ET anchoring is correct. Don't switch back to UTC.
- **The R1 rescue.** PR #58's `attach_recent10` rescue is the only reason NBA boards have usable confidence tiers after transient game-log failures.
- **The audit math.** `/results` shows real settled rows. Don't add a new "rate" anywhere that doesn't trace to the same JSONL.
- **The credit guard.** Don't lower the floor below 300 without explicit operator approval. Don't raise the cap above 75 without a clear ask.
- **The automation cron.** Don't shift the timing without a reason. 3 AM EDT settle + 9:30 AM EDT projections is intentional.
- **The forbidden-copy list.** `public_copy_test` will catch regressions, but treat the list as the floor — don't be clever with synonyms.
- **The Parlay Lab persistence rule.** No parlay hit rate until snapshots exist. Period.

---

## 15. Final status snapshot

| Item | Value |
|---|---|
| **Current `main` SHA** | `eba956445fa64c277c8d1de9808232e2170a4192` (`eba9564`) |
| **Production status** | ✅ live · `https://gametimepicks.yashwantbalaji.com` · HTTP 200 · serving NBA May 19 live + MLB May 19 schedule-only + May 18 settled |
| **Active PR** | **#61** OPEN · CLEAN · MERGEABLE at `9331922` · `https://github.com/yashwantbalaji3/gametimepicks/pull/61` · preview `https://gametime-picks-f2t5f9de5-yashwantbalaji33-7164s-projects.vercel.app` |
| **Latest settled results** | NBA 229–143 on 372 · 61.6% (newest 2026-05-18) · MLB 293–289 on 582 · 50.3% (newest 2026-05-18) · Combined 522–432 on 954 · **54.7%** |
| **Automation status** | `nightly-settle` + `morning-projections` registered on `main` · cron active · `ODDS_API_KEY` secret needs operator confirmation · free settle path proven via May 18 dry-run |
| **Next recommended action** | (1) Review PR #61 visual + merge decision. (2) If merged, open a focused PR for the homepage + sport-overview consistency work per §13. (3) Either way, do not attempt a single "do everything" UI rebuild PR. |

---

*End of handoff. If anything in this document conflicts with what you observe on disk or on Vercel, trust the live state and re-verify by walking the steps in §14.*
