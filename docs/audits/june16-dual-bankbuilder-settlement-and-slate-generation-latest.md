# June 16 — Dual Bank Builder Settlement + Fresh Slate Generation

_Work log + audit for the June 16, 2026 P0: officially settle Dual Bank Builder Run #2 Step 1,
surface the result transparently, write the failure audit, generate the June 16 slate, and deploy.
All data from official sources / real odds — no fabrication._

## 1. Settlement — Dual Bank Builder Run #2, Step 1 (0 / 2, closed)

Settled in place by `pipeline/daily/settle_dual_bank_builder.py` from official endpoints only
(API-Football fixtures for the World Cup leg; MLB Stats API box scores for the hitter props).

| Lane | Leg | Official result | Outcome | Source |
|---|---|---|---|---|
| A | Iran or Draw | Iran 2–2 New Zealand (FT) | WON | API-Football fixture (FT) |
| A | Troy Johnston Over 0.5 hits | 0 hits (Final) | LOST | MLB Stats API gamePk 824666 |
| B | Mike Trout Under 1.5 hits | 2 hits (Final) | LOST | MLB Stats API gamePk 825071 |
| B | Samad Taylor Over 0.5 hits | DNP (no batting appearance) | VOID | MLB Stats API gamePk 823046 |

- **Lane A LOST**, **Lane B LOST** → **Run #2 Step 1 = 0 / 2**, `runStatus: closed`, `advancedToStep:
  null`. No lane advances; no Run #3 was launched.
- Artifact: `app/public/data/bank-builder/dual-lanes-{latest,2026-06-15}.json` — `status: settled`,
  each lane `status: lost` / `return: 0`, each leg carries `result` + official `final`.
- Run #1 ($100 → $10,376.17, 5–0) and UFC 250 are untouched (separate artifacts; never read here).

Full per-leg breakdown + V2 lessons: `docs/audits/june16-bankbuilder-run2-step1-failure-audit.md`.

## 2. UI — transparent settled state (no buried failure)

`components/bank-builder/dual-bank-builder-teaser.tsx` (rendered on `/bank-builder` and `/today`)
now handles the settled run:
- Header eyebrow "Dual Bank Builder · Step 1 closed" + a "0/2 advanced · closed" badge.
- Intro paragraph states the run was officially settled and **both lanes lost**, with every leg's
  real outcome shown — including the misses.
- Each lane shows a LOST status chip and `$100 → $0`; the forward ladder is replaced with "Step 1
  closed · lane did not advance".
- Each leg row shows a WON / LOST / VOID result chip and, in the drawer, the official final line.
- A **"What we learned"** section names the failure modes (DNP risk, single-player variance, low
  Unders on stars) and states the next run is paused until the Bank Builder V2 gate exists.
- `loadDualBankBuilder` now returns the doc when `status` is `pending | settled | closed` (was
  pending-only), so the result surfaces instead of falling back to the teaser.

## 3. June 16 slate — generated (official sources / real odds)

| Sport | Artifact | Result |
|---|---|---|
| World Cup | `world-cup/projections/2026-06-16.json` | 3 fixtures (France/Senegal, Iraq/Norway, Argentina/Algeria), 13 market projections (ML/double-chance/DNB/BTTS/total), 13 public / 11 parlay-eligible |
| World Cup | enrichment | recent form + group attached to 13/13 projections (API-Football) |
| World Cup | `world-cup/player-projections/2026-06-16.json` | 72 props (36 anytime-goalscorer + 36 shots-on-target), 62 matched to API-Football squads (photos); market-implied / limited-data, **not** parlay/Bank eligible |
| World Cup | `world-cup/parlays/2026-06-16.json` | 2 suggested cards |
| MLB | `mlb/boards/2026-06-16.json` | 15/15 games with live odds, 686 leans (4 markets), 60 Odds credits |
| MLB | recent games | 640/686 leans enriched |
| MLB | `parlays/snapshots/2026-06-16.json` | 18 slips |
| MLB | `parlays/optimizer/2026-06-16.json` | 64 slips |
| Mixed | `daily/cards/2026-06-16.json` | 4 cross-sport cards (2 Low, 2 Medium) |

All `latest.json` pointers (WC projections / player-projections / parlays / daily cards) now resolve
to 2026-06-16. Pages are date-aware (`currentEtDate()` = 2026-06-16), so the June 15 files no longer
surface as active. WC gate (`stats/readiness-latest.json` → `projectionsPublic`/`parlayPublic`)
remains true.

## 4. Guard — no new Bank Builder until V2

`pipeline/daily/build_dual_bank_builder.py` now **fails closed**: it refuses to launch a new run
(exit 2, artifact left untouched) unless `pipeline/daily/bank_builder_v2_eligibility.py` exists or an
operator passes `--force-v1-launch`. Verified: running it returned "REFUSED" and left the settled
artifact unchanged. No cron/workflow invokes the launcher, so there is no auto-creation path; this
guard is belt-and-suspenders. A regression test asserts the guard is present and active.

## 5. Verification

- `tsc --noEmit`: clean. `npx tsx --test`: **919/919 pass** (dual test rewritten for the settled
  state + a V2-guard regression test added).
- Banned-copy audit over the generated data + new code/docs/pipeline: clean.
- Odds credits: 294 → 234 (60 for the MLB board; ~16 across WC events). Within budget.

## 6. Provider usage

- The Odds API: WC events + MLB board (15 games × 4 markets). 234 credits remaining after the run.
- API-Football: WC fixtures / standings / recent form / squad photos for the 3 fixtures. Pro plan.
- `.env` gitignored; no secrets printed or staged.
