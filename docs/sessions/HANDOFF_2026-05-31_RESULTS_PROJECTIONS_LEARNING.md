# Handoff — May 31 results, projections & learning (2026-05-31)

**Author:** automated session (Claude) · **Window:** May 31 ~12:10am ET → ~7:35am ET
**Main after this run:** `1e20a9f` (will advance with this handoff PR).
**PRs this run:** **#202** (settlement fix, merged) · **#203** (learning docs, merged) · this handoff PR.

---

## 0. TL;DR
- **May 30 is fully settled** (all 15 MLB + NBA SAS@OKC officially final).
- The scheduled `nightly-settle` left **all 270 NBA leans `stats_unavailable`** (an `nba_api`-on-CI gap). **Found, fixed, and re-settled** — recovered 270 NBA leans + 27 parlay slips from official ESPN stats. **PR #202 (merged, Vercel green).**
- **May 31 projections do not exist yet** — `morning-projections` is scheduled 13:30 UTC / 9:30am ET. Not dispatched early (per hard rule). The one open item.
- Results / Parlay Lab / Bank Builder / Projections / Events / About all verified honest post-settlement. No banned copy, no era leaks, no console errors, mobile clean.
- Stale PRs #1/#2/#4/#5 re-confirmed **obsolete**.

---

## 1. Phase 0 — baseline (at 7:03am ET)
| Item | Value |
|---|---|
| Local→origin | `b151796` → fast-forwarded to `a0fb2006` (nightly-settle commit) → now `1e20a9f` |
| nightly-settle | ✅ 09:39 UTC (settled May 30) |
| morning-projections | last ✅ May-30 14:50 UTC; **May-31 run not yet** (13:30 UTC) |
| auto-refresh | 04:15 UTC cancelled (concurrency); last success May-30 23:02 |
| May 30 settled | **YES** |
| May 31 projections | **NO** (empty `NoGames` shell only) |
| Active Parlay Lab date | May 30 (now graded → shown as **SETTLED**) |
| Latest Results settled | **May 30** |

## 2. Phase 1 — May 30 settlement
**All games officially final** (live-verified: MLB 15/15 Final, NBA SA@OKC Final). Settlement was legitimate.

**Settlement gap found + fixed (PR #202):** the board keys SAS@OKC by its NBA.com 10-digit id (`0042500317`); `nba_api` was unavailable on the runner (NBA.com blocks CI IPs) and the existing ESPN fallback only accepts 9-digit ESPN event ids — so a final game with official stats sat ungraded. New `resolve_espn_event_id_for_teams()` bridges NBA.com→ESPN ids via the public scoreboard (date + team abbreviations, tolerant `SA`/`SAS`-style matcher). Re-ran the official pipeline for 05-30 only.

| | Before | After |
|---|---|---|
| NBA leans settled | 0 / 270 | **270** (149W/121L) |
| Public risk-section slips | 1W/29L/**9P** | **4W/35L/0P** |
| Optimizer pool (120) | 4W/83L/**28P** | **8W/106L/1P** |
| Mis-settlements | — | **0** |

**May 30 public-era record:** 8W / 106L / 1P · **7.0%** decisive. Era (May 27–30): 44W / 252L · **14.9%** over 296 decisive slips.

**Profile / section / sport-mix (May 30 public):** Low 3W/12L (20%) · Medium 0/8 (0%) · High 1/7 (12%) · Longshot 0/8 (0%). NBA 2W/4L · MLB 1W/15L · Multi 1W/16L.

**Pending reason:** the lone remaining pending slip (Nolan Arenado `batter_hits`) is a **verified DNP** (0 game-log entries May 30) — left honestly pending, never forced. No manual edits, no fabricated stats.

## 3. Phase 2 — pending / unresolved audit (May 27–30)
- **May 30:** 28→1 pending after the fix. The lone pending = Arenado DNP (no-action). 0 mis-settlements (no pending slip carries a losing leg).
- **May 28 / 29 (already settled):** the unresolved legs (Eli White PA=0; Ha-Seong Kim & Bryan Torres DNP) were re-verified against official MLB game logs as **genuine no-shows** — correctly left pending, not grader bugs.
- **Classification of the May-30 fix:** "stat unavailable from source" → root-caused to an **id-space mismatch + nba_api unavailability**, not a no-show. Fixed at the source (grader), with tests.

## 4. Phase 3 — May 31 projections & suggested parlays — **MISSED (run timed out; slate now over)**

> **Evening update (7:30pm ET):** the scheduled `morning-projections` run
> **timed out at its 25-min limit and was cancelled** — every NBA player's
> `nba_api` game-log fetch read-timed-out at 25 s (NBA.com blocks CI IPs; same
> root cause as PR #202) and the ESPN game-log fallback is unimplemented, so the
> orchestrator hung and never committed. May 31 therefore got **no projections**.
> By evening the slate is **over** (MLB 14 Final / 1 Live, **no NBA games**), so
> dispatching now would create post-hoc data and violate snapshot-before-games —
> **deliberately not done.** Full root-cause + recommended fixes:
> `docs/PROJECTION_PIPELINE_NBA_CI_TIMEOUT_2026-05-31.md`. The site stays honest
> (no May-31 projections, no fabrication); next clean cycle is June 1.

The pre-evening state (retained for the record):
| File | Status |
|---|---|
| `boards/2026-05-31.json` | exists but **empty shell** (0 leans, `NoGames`, generated yesterday) |
| `mlb/boards/2026-05-31.json` | **absent** |
| `parlays/optimizer/2026-05-31.json` | **absent** |
| `parlays/snapshots/2026-05-31.json` | **absent** |

`morning-projections` is cron `30 13 * * *` = **13:30 UTC / 9:30am ET** (after this handoff). **Not dispatched early** — lineups/odds aren't set pre-window, and the hard rule forbids early dispatch. **Next action:** once the scheduled run lands (or after 13:30 UTC if missing/stale), verify NBA+MLB boards, optimizer totals, `publicRiskSections` counts, NBA/MLB/Mixed lanes, recent10 coverage, game-time coverage; confirm Parlay Lab flips to May-31 active and Bank Builder draws a fresh pending May-31 pick. See §9 for the exact checklist.

## 5. Phases 4–6 — UI verified post-settlement (browser, dev server)
- **Parlay Lab (Phase 4):** active slate May 30 now shows **"LATEST AVAILABLE · SETTLED — This slate has finished and been graded… VIEW ON RESULTS →"**. NBA tab → 4 single-game slips + honest "POOL AVAILABILITY" note explaining NBA medium/high/longshot are empty by design (single-game cap) + cross-lane Mixed hint. Mixed-tab filter fix (#200) in place. No ghost filters.
- **Bank Builder (Phase 5):** correctly shows the **honest empty state** ("A pick appears once the published pool has a pending, fully-unsettled slip…") because May-30 is now graded (no pending unsettled slip) and May-31 isn't published. Pending-only / no-graded-leg rule satisfied. A fresh +100ish pick returns once May-31 lands. No banned copy, no real-money advice.
- **Results (Phase 6):** "Settled slate: **May 30**", lifetime public-era **14.9%**, 13 pending, settled NBA slips now show WIN/LOSS at "8:00 pm ET" (the bridge fix is live). **No May 25/26 leak, no May 31 leak, no 16% leak.** Pending reasons visible.

## 6. Phase 7 — learning (PR #203, merged — tracking, not consumed)
- 3-slate (May 28–30) public risk sections: **Low 27% (30) clearly leads, Longshot 0% (19) floor** — taxonomy still directionally calibrated, **but Medium ≈ High (6% ≈ 6%)** are now indistinguishable. Flagged as a **watch item**, not an action (thin sample, cold MLB run).
- By sport: NBA 60% (10, tiny) · MLB 5% (41) · Multi 6% (32). Weakest markets: `batter_hits` 23%, `batter_hits_runs_rbis` 31%. Strongest: `REB` 96%, `PTS` 74%.
- **First confirmed audit signal:** `policy.json` now confirms `batter_total_bases` demotion (×0.85, 3/3 days) + `longshotKeepCollapsed`. **Verified no optimizer/board code reads `policy.json`** → it stays observational, **not consumed**. Wiring requires explicit operator approval (hard rule honored). New note: `docs/LEARNING_NOTES_2026-05-30_SETTLEMENT.md`.

## 7. Phase 8 — stale PR audit (#1/#2/#4/#5): all **OBSOLETE**
Every issue is already fixed on current main: `data-source-badge.tsx` is public-safe (operator details gated behind `NEXT_PUBLIC_SHOW_DIAGNOSTICS`, tree-shaken in prod); the leaky home `ScheduleLiveCallout` was removed; `scripts/show_meta_freshness.py` exists and is called; `auto-refresh.yml` already exits before `generate_daily_board` on `ODDS_DRY_RUN`. **No merge, no fresh PR.** Recommend the operator close them as superseded.

## 8. Phase 9 — sitewide UI review: clean
`/`, `/parlay-lab`, `/results`, `/projections`, `/bank-builder`, `/events`, `/about` all render full content. **No console errors**, no horizontal overflow at 375 (the one wide element is the intentional `overflow-x-auto` nav strip), nav comprehensive, banned-copy scan clean, no May-25/26/31 leaks, no cricket/IPL, Events schedule-only (WNBA/UFC/FIFA, "NO ODDS · NO PROJECTIONS"), About claims a "statistical model" (no false AI/ML).
- **Minor polish (deferred, pre-existing):** `/projections` "today" tab shows **GAMES 0 / PROJECTIONS 0** before the morning run with no "generates each morning" note — honest but could read as broken for ~2h. Yesterday's full slate is available. Resolves at 9:30am ET. Not a regression; documented for a future copy tweak.

## 9. Verification run
- `python -m pipeline.settle_test` 85/85 · settlement/grading suites all green.
- `npx tsx --test src/lib/*.test.mjs` **562/562** · `npx tsc --noEmit` clean · `npm run build` green.
- PR #202 + #203: real `Vercel – gametimepicks` **SUCCESS** + `mergeStateStatus CLEAN` → squash-merged.

**Exact next action (May-31 projections, when 13:30 UTC run lands):**
```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git fetch origin main && git pull --ff-only origin main
gh run list --workflow morning-projections --limit 3
ls app/public/data/{boards,mlb/boards}/2026-05-31.json \
   app/public/data/parlays/{optimizer,snapshots}/2026-05-31.json
# Verify: NBA+MLB board leans>0, optimizer totalSlips, publicRiskSections
# counts (low/med/high/longshot × all/nba/mlb/multi), recent10 coverage,
# game-time coverage; Parlay Lab flips to May-31 active (not SETTLED);
# Bank Builder draws a fresh pending +100..+140 May-31 pick; Results still
# shows May 30 (NOT May 31) as latest settled.
# If after 13:30 UTC and still missing/stale → dispatch official workflow
# only (preserve Odds credit guard; never echo secrets; NBA recent10
# fallback only; do not loosen R1 guardrails).
```

## 10. Hard rules honored
No May-31 settlement; May-30 settled only after all games final; no fabricated outcomes/stats/odds/projections; no manual outcome edits; official pipeline only; no May-26 replay; no May-25/26 leak; no cricket/IPL; WNBA/UFC/FIFA schedule-only; no secrets exposed; no sportsbook scraping/links/branding; audit policy **not** consumed by optimizer; no banned copy; Bank Builder paper-only.

## 11. Known limitations / next work
1. **May-31 projections MISSED** — the `morning-projections` run timed out (nba_api blocked on CI; no game-log fallback in the model path). Too late to backfill (slate over). Diagnosis + recommended fixes in `docs/PROJECTION_PIPELINE_NBA_CI_TIMEOUT_2026-05-31.md`. **Action:** watch the June-1 13:30 UTC run; if it times out the same way, add a circuit-breaker to `fetch_player_game_logs` (and/or wire the recent10 cache fallback into the model path, with operator sign-off).
2. **Medium/High section calibration** (6%≈6% over 3 slates) — watch 2–3 more settled slates; only re-band as a deliberate, tested, operator-approved change.
3. **`batter_total_bases` demotion confirmed but not consumed** — awaits explicit operator approval before any optimizer wiring.
4. **`/projections` empty-today copy** — optional one-line "generates each morning" note.
5. **Stale PRs #1/#2/#4/#5** — safe to close as obsolete.
