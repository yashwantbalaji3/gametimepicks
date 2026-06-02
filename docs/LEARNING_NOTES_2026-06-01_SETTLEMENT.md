# Learning Notes — 2026-06-01 Settlement

> **Observational only.** Nothing here is wired into the optimizer or the
> projection model. The confirmed-signal policy
> (`app/public/data/audit/policy.json`) is demotion-only and requires 3+
> confirming days; as of this slate it confirms **nothing**. June-1 results
> were **not** used to alter June-1 picks, and are not used to alter any
> same-day slate. Any model idea below is a **proposal**, not a change.

Settled via the official path: `nightly-settle` workflow_dispatch for
`settle_date=2026-06-01` (free public APIs; in-progress games refused at
source). All 9 MLB games final; 0 pending games/slips/legs.

---

## 1. June-1 public slip record (MLB-only slate, no NBA games)

| Metric | Value |
|--------|-------|
| Slips (decisive) | **48** |
| Wins | **1** |
| Losses | **47** |
| Pushes / Pending | 0 / 0 |
| Slip hit rate | **2.08%** |

By model risk lane (from the daily audit `byProfile`):

| Lane | W–L | Hit rate |
|------|-----|----------|
| Conservative | 0–8 | 0% |
| Balanced | 0–8 | 0% |
| Aggressive | 0–8 | 0% |
| Star power | 0–8 | 0% |
| (unprofiled) | 1–15 | 6.25% |

Every official risk lane went **0-for-8**. A brutal slip slate top to
bottom — even the conservative lane missed.

By sport: **MLB only** (1–47). No NBA / mixed slips on this slate.

---

## 2. Single-leg (straight-bet) record — the more stable signal

Parlays compound, so a coin-flip leg day still craters the slip hit rate.
The single-leg record is the better read on model accuracy:

| Metric | Value |
|--------|-------|
| Decisive legs | **306** |
| Wins–Losses | **152–154** |
| Hit rate | **49.67%** |

So the legs were ~coin-flip; the 2% **slip** rate is variance from
multi-leg compounding over a near-50% leg day, **not** evidence of a model
regression by itself. One bad slate.

### By market (June 1)

| Market | W–L | Hit rate |
|--------|-----|----------|
| `batter_hits_runs_rbis` | 67–55 | **54.9%** |
| `batter_hits` | 65–57 | **53.3%** |
| `batter_total_bases` | 16–31 | **34.0%** |
| `pitcher_strikeouts` | 4–11 | **26.7%** |

---

## 3. Recurring signal across the 5 settled public-era days (05-27 → 06-01)

Single-leg market hit rate by day (MLB comparison reports):

| Date | Overall | `pitcher_K` | `batter_hits` | `b_hrr` | `batter_TB` |
|------|---------|-------------|---------------|---------|-------------|
| 05-27 | 48% | 56% | 53% | 47% | 39% |
| 05-28 | 43% | 27% | 53% | 38% | 34% |
| 05-29 | 54% | 50% | 58% | 57% | 42% |
| 05-30 | 52% | 61% | 57% | 53% | 34% |
| 06-01 | 50% | 27% | 53% | 55% | 34% |

**Recurring strength:** `batter_hits` (53–58% **every** day) and
`batter_hits_runs_rbis` (47→38→57→53→55%, solid recently). These are the
model's most reliable markets.

**Recurring weakness:** `batter_total_bases` has been **under 42% on all
five days** (39/34/42/34/34%). This is the clearest recurring miss — it is
the only market consistently below break-even.

**Volatile / low-sample:** `pitcher_strikeouts` swings 27%↔61% on 11–28
legs/day; June-1's 27% is within its noise band, not a clear trend.

---

## 4. Bank Builder (paper) — June 1

Bank Builder keeps **no durable ladder history** by design (paper-only;
the Builder Slip is selected live from the current snapshot near +100).
There is no graded Builder-Slip artifact on disk for June 1. Given the
near-universal slip miss (1/48), a ~+100 2-leg Builder Slip drawn from this
pool would almost certainly have lost — but this is an observation, not a
recorded result, and the ladder honestly resets to the $100 base on a loss.

---

## 5. Confirmed-signal policy status

`policy.json` (7-day rolling window: 06-01 … 05-26; 3 confirming days
required for any model-changing signal):

- **0 confirmed signals.** `batter_total_bases` is accumulating demotion
  "fires" (consistent with §3) but is **not** confirmed.
- `mixedSportDownrank`, `sameGameNbaCap`, and per-market demotions
  (`AST`, `PTS`, `batter_hits`, …) all show `confirmed: false`,
  `weightMultiplier: 1.0`.
- Per the policy's own disclaimer: *"Demotion only; one bad slate cannot
  move the model."*

**Nothing is wired into the optimizer**, and nothing should be without
explicit approval.

---

## 6. Proposed follow-ups (NOT shipped — require explicit approval)

1. **Investigate `batter_total_bases` calibration** — sub-42% for 5
   straight days is the strongest recurring weakness. Worth a model-side
   look (line bias? variance of the extra-base distribution?). Do **not**
   demote/down-weight it in the optimizer until the audit policy *confirms*
   it (3+ days) **and** a human approves wiring the policy in.
2. **Keep watching `pitcher_strikeouts` sample size** — its swings are
   dominated by small per-day counts; consider whether it deserves a
   minimum-sample guard before any demotion fires count.
3. **No same-slate usage** — none of the above may use a slate's own
   results to alter that slate's pregame picks.

---

## 7. Hard rules honored

Observational only · official settlement path · no manual outcome edits ·
no fabricated stats · no same-slate contamination · `audit/policy.json`
**not** wired into the optimizer · 0 confirmed signals · MLB/NBA remain the
only modelled sports · no banned betting copy.

*Settled 2026-06-02 ~04:06 ET. Latest settled slate is now 2026-06-01.*
