# Simulator Dashboard Mission — Oversight Scaffold

**Reviewer:** Claude (VP), read-only · staged 2026-07-08 · fill when Code's report arrives.
**Baseline to protect:** money md5 **`affe6b21071f2b3be96bb2774eb347c3`** · record **19-14** · bankroll $19,065.40 · crown $20,465.40 · drawdown $1,400 · **open exposure $0** · BB no-play (awaiting Step 3) · Moonshot no-play. Branch `june30-reset`.
**Nature of mission:** UX/product simulator upgrade — **not** betting activation. Verify against artifacts, not claims.

## The 8 oversight checks (must all pass)
| # | Check | How I'll verify (read-only) | Verdict |
|---|---|---|---|
| 1 | **Money md5 unchanged** | `md5(portfolio.json)` still `affe6b21…`; record still 19-14; open exposure $0 | |
| 2 | **Suite / build / gates green** | tsc, tests, build, money-integrity, forensic, smoke 9/9 in report; corroborate md5 chain | |
| 3 | **No active exposure created** | `openExposure: 0`; BB/Moonshot still `awaiting/ no-play`; no new active lane | |
| 4 | **No fake/unsupported modules** | each simulator module renders a real artifact field or an honest "unavailable"; no invented distributions/EV | |
| 5 | **Uses existing artifacts only** | modules read `mlb/game-simulations/*`, boards, de-vig probs — no fabricated data source | |
| 6 | **/simulate + MLB game routes smoke-tested** | routes 200, 0 undefined/NaN, animation renders, report renders | |
| 7 | **Banned copy absent** | grep visible text: no guaranteed/risk-free/free money/sure thing/lock/real-money | |
| 8 | **No sportsbook/payment/wallet** | no bet/checkout/wallet/odds-routing added; paper-only intact | |

## Mission-specific honesty gates
- **Run count:** MLB artifact supports **1,000 runs** — the UI must say 1,000 (or the true number), **never 10,000**.
- **Soccer:** **no faked soccer sim modules** — WC uses point probabilities, not a persisted 1k/10k sim; soccer modules must be honest/"unavailable" where the data isn't there.
- **Animation:** the 10s+ sport animation is **UX-only** — it may be a branded MLB diamond etc., but must not present fake live play-by-play or reveal any number that isn't a real model output.
- **Distributions:** show a "sampled distribution layer" **only when the artifact supports it**; else "distribution unavailable."
- **Positioning:** paper-only / educational intact; product-mapping panels are display-only, never a bet.

## Founder decision to tee up (after review)
Assess whether the UX is strong enough for public/social launch content:
- 10s+ animation — branded, honest, not fake play-by-play? Quality bar for social clips?
- Post-simulation dashboard — clear, honest, receipt-linked?
- `/simulate` lobby — good front door / game selection?
- **Verdict options:** ready for social content · ready with minor fixes · not yet (list gaps).
- **Reminder:** do NOT approve any Bank Builder / Moonshot exposure unless the founder explicitly says so.

## VP summary (fill, ≤3 lines)
- State vs baseline: ____
- Biggest risk / any fake module: ____
- Launch-content readiness recommendation: ____
