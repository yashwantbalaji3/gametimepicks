# Handoff — site revamp + June 1 projection readiness (2026-05-31 → 06-01)

**Author:** automated session (Claude) · **Main at handoff:** `ea99d1e` (advances with this PR).
**PRs merged this run:** **#206** (NBA provider circuit breaker) · **#207** (honest between-slates labeling: projections + home). Earlier in the day: #202 (May-30 NBA settlement fix), #203 (learning notes), #204/#205 (handoff + diagnosis).

---

## 0. TL;DR
- **May 30 settled; May 31 NOT backfilled (and won't be); June 1 projections are clock-gated** to the scheduled `morning-projections` run at **13:30 UTC / 9:30am ET** (~7.5h out at the time of writing). Not dispatched early.
- The May-31 morning run **timed out** (nba_api blocked on CI). The fix shipped: a **circuit breaker** (#206) that bounds wasted time so the job can't stall. **June 1 is the live validation.**
- Two **between-slates UI mislabels** fixed (#207): projections now explains its empty "today" state; home no longer claims "Today's" when showing a settled fallback slate.
- Full sitewide inspection: **all 7 routes clean** — honest states, explained empties, no overflow, no console errors, no banned copy.

## 1. PR #207 — verified on merged main
- **`/projections`**: when today has 0 projections, the hero note explains *"Today's board posts each morning once lineups and odds are set, and stays empty on days with no scheduled games. The most recent slate is shown below."* (was a bare `GAMES 0 / PROJECTIONS 0`). Body h1 shows "Projections" (not "Tonight's projections") on a past slate. Verified: explains-empty ✓, no bare-zero ✓.
- **`/` (home)**: hero reads **"LATEST · SUGGESTED PARLAYS" / "The latest suggested parlays."** when today's snapshot hasn't posted; the embedded lab shows its own SETTLED banner. Verified: h1 "The latest suggested parlays" ✓, no "Today's" claim ✓.
- `npx tsx --test src/lib/*.test.mjs` → **562/562** · `tsc --noEmit` clean · `npm run build` green.

## 2. June 1 readiness (STEP 3) — clock-gated, NOT dispatched
| Item | Status |
|---|---|
| `morning-projections` next run | **13:30 UTC / 9:30am ET** (scheduled). Not yet run. |
| `boards/2026-06-01.json` | empty placeholder (0 leans, `NoGames`) |
| `mlb/boards` / `optimizer` / `snapshots` for 06-01 | **absent** |
| Circuit breaker (#206) | **live on main** — protects the run |
| Early dispatch | **No** (outside window, not approved) |

**What June 1's run should do:** finish in ~1–2 min as usual, or — if NBA.com blocks the runner — finish *fast* with NBA honestly suppressed (MLB board still committed) instead of hitting the 25-min timeout. The breaker bounds a hung provider to ≤ ~125 s total per run.

## 3. Sitewide inspection (STEP 4) — all clean at 1280 + 375
| Route | Verdict |
|---|---|
| `/` | Hero honest ("Latest …"); ticker 14.9% + May-30 record; no overflow/console-errors/banned-copy |
| `/projections` | Empty-today explained; most-recent slate below; honest |
| `/parlay-lab` | "LATEST AVAILABLE · SETTLED" (May-30, 120 slips); ALL/NBA/MLB/MIXED tabs + team/game/player filters present; **Build My Card works** (✓ "Added to my card", tray shows stake + projected payout) |
| `/results` | "Settled slate: May 30"; lifetime **14.9%**; era from 2026-05-27; **no May-25/26/31 leaks**; no 16.0% leak |
| `/bank-builder` | Honest empty state ("a pick appears once the pool has a pending, fully-unsettled slip"); paper-only; disclaimers present ("we do not take real money"); no real-money advice |
| `/events` | Schedule-only (WNBA/UFC/FIFA, "NO ODDS · NO PROJECTIONS"); the "projections" string is the negation "you won't find … projections" |
| `/about` | Statistical-model framing; **no false AI/ML claims**; "not betting advice" |

No console errors anywhere; no horizontal overflow at 1280 or 375; no banned copy; no user-facing "safe/safety" (the matches were "we do not take real money" disclaimers).

## 4. Parlay Lab game/sport completeness (STEP 5)
Active slate is **May 30** (settled — June 1 not generated yet). Coverage (verified previously, unchanged):
- `publicRiskSections`: low {all4/nba4/mlb4/multi4}; medium/high/longshot {all4/**nba0**/mlb4/multi4}. NBA medium/high/longshot are **honestly empty by design** (single NBA game SAS@OKC → only 2-leg Low slips under the same-game cap), with a "POOL AVAILABILITY" explanation + a cross-lane "Mixed parlays with NBA legs are also available" hint.
- Tabs: ALL (7 games), NBA (1, 4 slips), MLB (10), Mixed (8) — the #200 Mixed-tab fix is live. No ghost game options.
- **Deliberate non-change:** 4 MLB games (KC·TEX, ATL·CIN, HOU·MIL, BOS·CLE) have qualified candidates that lost the top-N-per-section cut — a *selection-concentration* trait, not a data gap. Per the runbook, optimizer diversification was **not** implemented (evidence not strong; risk of forcing weak selections). Documented for a future, tested, future-facing change only.

## 5. Bank Builder (STEP 6)
Correct honest empty state because the only available slate (May-30) is graded and June-1 isn't published. Pending-only / no-graded-leg rule satisfied; paper-only; $100 base ladder; loss-reset shown. A fresh +100..+140 pick returns once June 1 lands.

## 6. Learning / risk-quality (STEP 7)
Current through **May 30** (`LEARNING_NOTES_2026-05-30_SETTLEMENT.md`). May 31 produced **no slate data** → nothing new to analyze (adding anything would be fabrication). Audit policy confirmed **not consumed** by the optimizer (only its own writer reads `policy.json`). The one confirmed signal (`batter_total_bases` ×0.85) stays observational pending explicit operator approval. Risk taxonomy directionally calibrated (Low 27% > Med≈High 6% > Longshot 0% over May 28–30); Med/High boundary is a *watch* item, not an action.

## 7. Stale PRs
#1/#2/#4/#5 remain **obsolete** (every fix already on main). Recommend closing as superseded.

## 8. Known limitations
1. **June 1 projections not yet generated** — clock-gated to 9:30am ET; circuit breaker untested against a live blocked run (June 1 is the validation).
2. **May 31 has no parlay record** (the timed-out slate) — honest gap; the era track record skips it.
3. **Med/High risk-section calibration** (6%≈6%) — re-band only as a deliberate, tested, operator-approved change after more settled slates.
4. **Parlay Lab game concentration** — optimizer diversification deferred (see §4).

## 9. Exact next recommended work
1. **Watch the June 1 `morning-projections` run (13:30 UTC).** Confirm it does NOT hit the 25-min timeout; check the log for circuit-breaker "skipped breaker-tripped providers" lines if NBA.com is blocking. Then pull and verify NBA/MLB boards, optimizer totals + `publicRiskSections`, Parlay Lab flips SETTLED→active, Bank Builder draws a fresh pending pick, and Results still shows May 30 as latest settled (June 1 not settled).
2. If June 1 still stalls despite the breaker, the next lever is wiring the provenance-stamped recent10 cache into the model fetch (operator sign-off) — see `docs/PROJECTION_PIPELINE_NBA_CI_TIMEOUT_2026-05-31.md`.
3. Close stale PRs #1/#2/#4/#5.
