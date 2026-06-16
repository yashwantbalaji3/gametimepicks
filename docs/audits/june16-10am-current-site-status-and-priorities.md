# GameTimePicks — June 16, ~10:00 AM ET — Site Status + Today Priorities

_Status + planning report. Read-only: no product code/data/settlement changed. Settlement
events were checked from official sources for reporting only._

## 1. Date/time context
June 16, 2026, ~10:00 AM ET. June 15 slate is finished. Production is the June 15 static build
(through PR #494). No June 16 data has been generated yet.

## 2. Repo state
- Branch `main`, HEAD **`a4b1e32`** ("Document current GameTimePicks project state" — docs only).
- App/product code = **`0920a2d`** (PR #494). Both `a4b1e32` and `0920a2d` are on main ✓.
- Working tree clean (only gitignored `.env` + `pipeline/cache` untracked).
- Recent history shows automated cron commits (`auto: morning projections …`, `auto: Phase 10
  daily refresh …`) — there is daily automation committing to main; **no June 16 auto-refresh
  has landed yet.**

## 3. Production route status — HEALTHY
All routes **200** on **both** domains (`gametime-picks.vercel.app` and
`gametimepicks.yashwantbalaji.com`): `/ /today /world-cup /games /picks /parlay-lab /build
/bank-builder /results /methodology`. No broken routes; custom domain healthy.

## 4. Browser smoke (code behavior)
No console errors; no horizontal overflow. `/bank-builder`: Dual lanes render as "Step 1 live ·
pending", lanes intact, Run #1 preserved, no "Coming Soon". On June 16 the code correctly gates
the June 15 slate out (WC summary "Off today · 0 Projections", MLB "no slate") — no stale-active
leak in the code.

> **Staleness note (not a crash, but important):** production is a STATIC export built on June 15,
> so the live site still shows the June 15 slate (Iran/NZ WC focus, June 15 MLB cards) and the
> Dual lanes marked **"pending"** — even though those events are now FINAL (both lanes lost). The
> June 16 generation + redeploy will refresh this; the lanes need settling (see §7).

## 5. Current feature state
- **Homepage/Today:** World Cup-first; live Dual Bank Builder; MLB cards; completed Run #1 recap;
  yesterday's results; UFC settled recap. (Prod still shows June 15 content until redeploy.)
- **World Cup:** 3-way (Draw real), double chance (real book odds), totals, BTTS, DNB; API-Football
  recent form + group; **Iran/NZ player props live with real photos**, labelled market-implied/
  limited-data. Incomplete: player props only for the last slate's fixtures (not yet all June 16).
- **MLB:** odds-backed hits/total-bases/strikeouts projections + cards. June 15 data is now stale
  (games final). **June 16 needs generation.**
- **Bank Builder:** Run #1 completed (**$100 → $10,376.17 / 5–0**); Dual Run #2 lanes shown
  pending (now decided — settle).
- **UFC:** UFC 250 settled (moneyline 6–1, cards 0–4) — history, not active.
- **NBA:** Finals Bank Builder steps settled history; no active slate.
- **Parlay Lab:** rename live; sport/mixed/risk filters; rich drawers currently on Bank Builder
  lanes only (not yet on Parlay Lab/Build).
- **Build:** usable (select legs → combined odds/return); deeper filters + rich drawers pending.
- **Results:** settlement archive; correctly does NOT settle the pending lanes.
- **Methodology:** projection framework (no-vig, implied prob, edge, composite confidence, data
  quality, parlay eligibility) live.

## 6. Provider status (no secrets exposed)
- **API-Football:** `/status` → Pro, active, **0/7500** requests today. Fixtures/standings/recent-
  form/photos available.
- **The Odds API:** **315 requests remaining** (185 used). MLB + `soccer_fifa_world_cup` active.
- `.env` gitignored, not staged; keys never printed.

## 7. Dual Bank Builder Step 1 — settlement readiness (CHECKED, official) — READY, BOTH LANES LOST
All four events are **FINAL**; settlement can run now.

| Lane | Leg | Official source | Result | Outcome |
|---|---|---|---|---|
| **A** | Iran or Draw | API-Football fixture 1489378 | **Iran 2–2 New Zealand (FT)** | **WIN** (draw) |
| **A** | Troy Johnston Over 0.5 hits | MLB box score gamePk 824666 | **0 hits (Final)** | **LOSS** |
| **B** | Mike Trout Under 1.5 hits | MLB box score gamePk 825071 | **2 hits (Final)** | **LOSS** |
| **B** | Samad Taylor Over 0.5 hits | MLB box score gamePk 823046 | **DNP (no at-bats)** | **VOID** |

- **Lane A = LOSS** (Iran-or-Draw won, but Troy Johnston 0 hits lost the parlay).
- **Lane B = LOSS** (Mike Trout 2 hits lost; Samad Taylor DNP voids his leg but the parlay is
  already lost).
- **Dual Bank Builder Run #2 Step 1 = 0/2 lanes.** Settlement is **ready to run** (full PR next).
- This validates the owner's concern + the "Bank Builder must be stricter" lesson. New
  data point: **player-prop DNP risk** (Samad Taylor) — a leg can void if a player is rested.

## 8. June 16 slate readiness
- **World Cup:** 3 upcoming fixtures with odds — **France v Senegal (15:00 ET), Iraq v Norway
  (18:00 ET), Argentina v Algeria (21:00 ET)**. API-Football fixtures + Odds API events available.
- **MLB:** **15 games** scheduled June 16 (odds available via The Odds API).
- **No June 16 board/projection files exist yet** → needs generation (WC projections + enrich +
  player props; MLB paid run; cards). UFC/NBA: no active slate (no stale-active should show).

## 9. Prioritized task list — June 16

### P0 — must do today
1. **Settle Dual Bank Builder Run #2 Step 1 (both lanes LOST).** Why: lanes show "pending" but
   are final; truthfulness. AC: dual-lanes artifact statuses set to lost (Lane A & B), Results +
   Bank Builder + Today reflect 0/2; no lane advances; Run #1 untouched. Branch
   `june16-settle-dual-bankbuilder-step1`. Risk: low (data-only, official sources confirmed). Dep:
   none. **Must precede any new Bank Builder launch.**
2. **Bank Builder failure audit.** Why: capture the lesson (Trout 2 hits, Johnston 0 hits, Taylor
   DNP). AC: `docs/audits/dual-bank-builder-step1-failure-*.md` with per-leg outcome + V2
   implications. Risk: none (docs). Dep: task 1.
3. **Generate the June 16 slate** (WC projections + enrich + player props for the 3 upcoming
   fixtures; MLB paid run for 15 games; cards/mixed). Why: today's active content. AC: June 16
   board/projection/player-prop files written; /today shows June 16; Odds credits within budget.
   Branch `june16-paid-slate`. Risk: medium (spends Odds credits — owner-approved pattern). Dep: none.
4. **Redeploy so prod shows June 16** (the merge of tasks 1+3 triggers it). AC: prod /today =
   June 16 slate; settled lanes shown; no stale June 15 active content.
5. **Confirm no stale June 15 cards/props as active** after generation (date-gates already do this;
   verify). Risk: low.

### P1 — high priority
1. **Bank Builder V2 eligibility model** (BEFORE launching another ladder). Why: Step 1 went 0/2 on
   volatile/DNP legs. AC: a "survival score" combining volatility penalty, player-prop/DNP-risk
   penalty, market-type weighting, recent-form consistency, odds-range constraints, lineup-confirmed
   requirement for player props; no fragile hitter props unless elite; pure + unit-tested. Branch
   `bank-builder-v2-eligibility`. Risk: medium. **Gate: do NOT launch a new Bank Builder until this exists.**
2. **Expand World Cup player props to all June 16 fixtures** (France/Senegal, Iraq/Norway,
   Argentina/Algeria). AC: odds-backed props with API-Football photos for each upcoming fixture.
   Branch `june16-wc-player-props`. Dep: task P0.3.
3. **Official settlement automation** for MLB + World Cup (reduce manual settle). Branch
   `settlement-automation`. Risk: medium.

### P2 — product polish
1. Rich player/team drawers in Parlay Lab + Build (reuse the lane drawer). 2. Improve Build
filters. 3. Improve Parlay Lab filters/organization. 4. Better game-specific suggested parlays.
5. World Cup game-detail tab polish. 6. Heavier ladder animation. (All low risk, UI-only.)

### P3 — later
1. Full Poisson/team-strength WC model (after more group games). 2. UFC slate automation.
3. Historical analytics. 4. Full daily automation hardening.

## 10. Recommended next prompt/task
**"Settle Dual Bank Builder Run #2 Step 1 from official results (both lanes lost), write the
failure audit, then generate the June 16 slate (WC + MLB) and redeploy."** Then, before any new
ladder: build the **Bank Builder V2 eligibility model**.

## 11. Explicit recommendation
**Do NOT launch another Bank Builder until the V2 eligibility gate exists.** Evidence: Step 1 went
0/2 — a low-line hitter recorded 0 hits (Johnston), a star exceeded a low Under (Trout, 2 hits),
and a prop voided on a DNP (Taylor). "High model probability" alone did not survive; the ladder
needs a stricter survival score (volatility + DNP-risk + lineup-confirmation gates) first.
