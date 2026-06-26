# GameTimePicks — CTO Production-Readiness Audit (2026-06-26)

Written as the responsible architect. Brutally honest about what is and isn't production-grade. Money
integrity overrides everything; nothing below fabricates data.

## STEP 1 — Money source-of-truth audit

| Artifact | Role | Verdict |
|---|---|---|
| `mr-dub/banked-ladders.json` | **Realized-history base** — Σ official completed-ladder finals + preserved dual-lane losses + historical record. Append-only. | **CANONICAL base** |
| `mr-dub/portfolio.json` | The live money truth (crown/bankroll/profit/ROI/drawdown/record), written ONLY by `settle-daily-portfolio` + `build-mr-dub-ledger`. | **CANONICAL live** (derived from banked + live ladder) |
| `methodology/launch/dual-bank-builder-active.json` | The live ladder (lane steps/status). Settlement writes settled steps here. | Canonical for ladder state |
| `mr-dub/daily-portfolio.json` | The daily slate VIEW (cards + per-day money mirror). | **DERIVED** — must equal portfolio.json |
| `mr-dub/ledger.json`, `daily-summary.json` | Reconciliation outputs of `build-mr-dub-ledger`. | **DERIVED** |
| `accounting.ts` `buildPersistedDailyPortfolio` | Builds the daily view; reads money via `readMoney`. | **DERIVED** (now reads canonical) |

**Defect found + fixed:** `readMoney` had a hardcoded `10176.17 / 10376.17` fallback (an old single-ladder
figure) used whenever `portfolio.json` couldn't be read — and `activate-daily-portfolio.mjs` resolved its
data root with a hardcoded `cwd/app/...` that broke when run from `app/` (required for the `@/` alias),
silently triggering that fallback. Net effect: regenerating the daily portfolio wrote a **stale
single-ladder $10,176.17 over the real $20,065.40**. Fixes (this PR): `readMoney` now reads
`portfolio.json`, else DERIVES from `banked-ladders.json` (`crown = crownTotal`, `bankroll = crownTotal +
historicalDualLaneLosses`), else THROWS — no hardcoded constant ever again. `activate` root is now
cwd-robust. Verified: `activate` yields $20,065.40 / $20,465.40 from both the repo root and `app/`.

**Result:** one source of truth. `banked-ladders.json` → `portfolio.json` → everything else derives. No
duplicate money calculation remains.

## STEP 11 — Money-integrity guardrail (shipped)

`src/lib/money-integrity.ts` (+ `scripts/verify-money-integrity.mjs` CLI, wired as the final gate in
`settle_soccer_day.sh`). Encodes the cumulative-crown invariants and FAILS LOUDLY (exit 1) on any of:
crown ≠ Σ official finals · bankroll > crown · bankroll ≤ 0 · drawdown ≠ crown−bankroll · profit ≠
bankroll−$100 · ROI drift · daily-view ≠ canonical · openExposure ≠ Σ active-lane exposure · ledger Σ ≠
profit · non-integer record. 8 unit tests prove it passes the real state and catches each corruption class.
The nightly chain now refuses to publish on a corrupted bankroll.

## Current verified state
crown $20,465.40 (Σ two official $100→$10K finals) · bankroll $20,065.40 (crown − $400 realized losses) ·
settledProfit $19,965.40 · drawdown $400 · ROI 199.65× · record 14-4 · exposure $0. June-25 officially
settled (API-Football FT). All invariants hold.

## STEP 13 — Brutally honest: what is NOT production-ready

The platform can now **settle correctly, reconcile perfectly, fail loudly on money corruption, and the
nightly settle→reconcile→gate chain works**. But calling it a "fully autonomous, statistically superior,
self-improving" product would be dishonest. The gaps:

1. **Autonomy is not unattended.** The GitHub workflows that fetch odds + post the board are `workflow_dispatch`
   / dry-run by default and require operator-set secrets + mode flags. Nothing auto-publishes today. The
   *settlement* chain is cron-wired (`nightly-settle.yml`) and now self-gating, but odds-fetch + generation
   + deploy are operator-triggered. True 2 AM hands-off needs those crons enabled + secrets provisioned —
   an operator/ops decision, not code.

2. **The daily roll-forward isn't end-to-end automated yet.** `activate` now computes correct money, but
   advancing Lane A to a fresh Step-2 card from new odds, leaving Lane B stopped, and promoting the new
   slate's `latest.json` is still a manual sequence. It needs one orchestrator script (`roll_to_next_day.sh`)
   chaining: verify-prior-settled → fetch odds → build projections → activate → refresh specials/homer →
   verify-money-integrity → build → deploy. The pieces exist; the glue doesn't.

3. **"Learning / statistically superior" is aspirational, not real yet.** The calibration lib (Brier/log-loss/
   ECE) and the benchmark engine exist and are tested, but they have **almost no historical data** — one
   benchmark snapshot, and settled outcomes for a handful of days. You cannot claim the model "improves"
   or has measurable CLV/calibration edge until weeks of real snapshots + settled results accrue. Building
   "model + benchmark vs model-only" A/B comparisons now would be fitting noise. Honest status: the
   *plumbing* is in place; the *evidence* is not. Do not surface a "Market Confidence Index" or CLV figure
   to users as if it were validated — it would be a fabricated confidence signal until the data exists.

4. **Sharp/public/consensus splits are not available.** The free Odds API gives consensus prices, not
   per-book sharp-vs-public money. The benchmark spec's "sharp agreement / public agreement" cannot be
   computed without a paid sharp-data feed. Anything labeled "sharp money" today would be invented.

5. **Official-results coverage depends on one provider.** Settlement now resolves correctly via API-Football,
   but if API-Football lacks a fixture or mislabels a status, the chain correctly NO-OPs (pends) — which
   means a day can silently stay unsettled until someone notices. Mitigation exists (operator official
   bundle) but there is no alerting when settlement pends longer than expected.

6. **Legacy data debt.** `dual-bank-builder-active.json` still carries stale June-18/19 `meta`/`selectedFourLegs`
   fields that no live code reads (confirmed) but that clutter the canonical file. The daily-portfolio is a
   single-day artifact reconciled by hand post-settlement rather than regenerated; once #2 lands it should
   be regenerated, not patched.

### What would fail under six months of continuous operation
- **Unattended settlement pends** would accumulate with no alert (gap #5) → bankroll silently freezes.
- **The daily roll-forward** (gap #2) being manual means a missed day breaks the ladder continuity.
- **Disk growth**: append-only benchmark snapshots (7/day × every market) will grow unbounded — needs a
  retention/rollup policy (the spec says "never prune", which is fine for years at this volume, but should
  be a conscious decision, not an accident).
- **Provider drift**: team-name aliases (API-Football "Türkiye" vs feed "Turkey") already cause the
  occasional NOT_FOUND on a WC-specials game; the alias map needs ongoing maintenance.

### Bottom line
Money integrity and settlement are now genuinely production-grade and self-gating. The honest remaining
work to "zero operator intervention" is **ops enablement** (enable crons + secrets), **one roll-forward
orchestrator** (gap #2), and **time** (gaps #3 — the learning system needs months of real data before any
"superior prediction" claim is truthful). I will not fabricate that evidence to declare the platform
finished; the correct, honest status is: *settlement + money = done; autonomy = one orchestrator + ops
enablement away; learning = plumbing ready, evidence pending.*
