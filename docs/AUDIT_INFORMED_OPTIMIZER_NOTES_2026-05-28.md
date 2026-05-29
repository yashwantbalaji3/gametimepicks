# Audit-informed optimizer notes (2026-05-28)

Last updated: 2026-05-28 (PR `feature/audit-informed-longshot-controls`).

This is an honest record of what the daily audit currently shows
about optimizer-produced slips, what the public surface already
enforces, and the exact numeric thresholds we would need to clear
before a behavior change reaches the optimizer.

> **No behavior change in this doc.** Today's sample is too small to
> safely demote a profile, market, or risk section. The pre-existing
> hard rule applies: we do not consume an audit signal in the
> optimizer until the signal clears the confirming-days threshold in
> `audit/policy.json`. Until then, every observation below is
> informational.

---

## 1. Current audit state (lifetime, 2026-05-25 → 2026-05-27)

Source: `app/public/data/parlays/optimizer-summary.json`.

| Profile      | Wins | Losses | Decisive | Hit rate | Sample read |
|--------------|------|--------|----------|----------|-------------|
| Conservative | 9    | 9      | 18       | 50.0%    | Too small to lock — variance band wider than the gap to the prior. |
| Balanced     | 2    | 20     | 22       | 9.1%     | Clearly below replacement expectation, but only 22 slips. |
| Aggressive   | 1    | 19     | 20       | 5.0%     | The worst public lane today, but n=20. |
| Star Power   | 5    | 15     | 20       | 25.0%    | Within band, n=20. |
| **Lifetime** | 17   | 63     | 80       | 21.3%    | Whole-product baseline. |

Source: `app/public/data/audit/policy.json`.

- Window: 3 days available of 3 required.
- All signals `confirmed: false`.
- No market demotion has fired with sufficient strength.

---

## 2. What the public surface already enforces

These are live and tested — no further code change required to
honor the user's "Longshot stays behind, never first" and similar
section caps:

- **Public section ordering** (`RISK_SECTION_ORDER`): Low → Medium
  → High → Longshot. Longshot is always last (PR #152).
- **Per-section visible target:** 4 slips per (section × sport)
  bucket (`PUBLIC_RISK_SECTION_TARGET_PER_BUCKET = 4`).
- **Strict odds + leg-count gate:** PR #152 — a slip qualifies for
  a section only when BOTH combined odds AND leg count fall in
  that section's band.
- **Same-game cap:** `_PUBLIC_SECTION_MAX_LEGS_PER_GAME = 2` — caps
  same-game correlation on public Longshot slips.
- **Player exposure cap:** `_select_diverse_sgp` — exposure penalty
  applied across the visible spread so a single player can't
  dominate Longshot.
- **Mixed-sport penalty:** PR #110 filter D — Mixed slips lose a
  display penalty in the legacy ranking, keeping single-sport
  slips on top when both qualify.
- **NBA single-game framing:** PR #148 — every NBA-only single-game
  slip is labeled "Single-game · higher variance" so the chip is
  the framing, not a hidden caveat.

Reading the user's PR C candidate list, every numbered item above
ALREADY maps to a shipped guardrail. PR C therefore stops short of
adding redundant controls.

---

## 3. Numeric thresholds that would justify a future change

If any of the following clears AND the audit window confirms it
(3-of-3 days, signal strength > 0), the next deterministic PR may
implement the matching control. Today none of these have cleared.

### 3.1 Profile-level demotion

A profile is a candidate for demotion when:

- decisive `n ≥ 60` for that profile across the audit window, AND
- profile hit rate is at least 8 percentage points below the
  product lifetime hit rate, AND
- the gap holds in at least one out-of-time validation week.

Current state: Aggressive at 5% with n=20 is suggestive but does
not meet the n threshold. We do not demote.

### 3.2 Section-level cap

A public risk section is a candidate for a tightened cap (e.g.
target=3 instead of target=4) when:

- decisive `n ≥ 40` for that (section × sport) bucket, AND
- section hit rate falls below the floor:
  - Low: < 35%
  - Medium: < 22%
  - High: < 12%
  - Longshot: < 6%
- under the same audit window.

Current state: per-section grading is not yet split out in
`optimizer-summary.json`. Splitting per-section is a near-term
deterministic improvement (`docs/MODEL_LEARNING_ROADMAP_2026-05-28.md`
section 4).

### 3.3 Market-level demotion

`audit/policy.json` already tracks per-market `weightMultiplier`
candidates. No market has hit `confirmed: true` yet. When one
does, the optimizer will multiply its `marketStabilityWeight` by
the confirmed multiplier — the consumption hook is documented in
`audit_signal_policy.py` but is gated off in `parlay_optimizer.py`
until the policy says `confirmed: true` AND the operator has
explicitly approved.

### 3.4 Same-market cap on Longshot

A user-suggested addition. Today not enforced explicitly — same-
*game* is capped, same-*market* is not. To justify implementing
this would require either:

- decisive `n ≥ 30` Longshot slips with two-or-more legs on the
  same market having a hit rate at least 10 percentage points
  below Longshot's overall hit rate, OR
- two independent operator postmortems flagging same-market
  concentration as a failure mode.

Neither condition is currently met.

---

## 4. Why no PR-C behavior change today

- Lifetime decisive total = 80. Two more shipped slates would
  carry us past `n = 100`, the rough floor below which any
  hit-rate decision is dominated by variance.
- The public surface already enforces every user-spec'd Longshot
  control via PR #150 / #152. Adding more without data would be a
  cosmetic change at the cost of a real behavior shift.
- Hard rule: audit-policy consumption stays gated off until the
  policy says `confirmed: true`. Today every signal is
  `confirmed: false`.

The next opportunity to revisit is when the audit window covers
seven decisive days AND `optimizer-summary.json` is split per
public risk section.

---

## 5. Cross-reference

- `docs/MODEL_LEARNING_ROADMAP_2026-05-28.md` — full roadmap.
- `pipeline/audit_signal_policy.py` — code that fires signals.
- `pipeline/parlay_optimizer.py` — where consumption hooks would
  land.
- `pipeline/grade_optimizer.py` — the grader populating
  `optimizer-summary.json`.
- `app/public/data/audit/policy.json` — current policy state.
- `app/public/data/parlays/optimizer-summary.json` — lifetime
  numbers.

If a future PR ships any of section 3's deterministic changes, it
should append a row to this doc with the PR link and the evidence
that cleared the gate.

---

## 6. May 28 follow-up (2026-05-29)

Logged after the May 28 nightly settle + PR #159 added per-section
pipeline grading. **No optimizer behavior change.** Every section-3
gate is still un-cleared.

### 6.1 Updated lifetime numbers

Source: `app/public/data/parlays/optimizer-summary.json` after
`pipeline.grade_optimizer` re-ran on the May 28 graded payload.

| Profile      | Wins | Losses | Decisive | Hit rate | Gate status            |
|--------------|------|--------|----------|----------|------------------------|
| Conservative | 18   | 16     | 34       | 52.9%    | n=34 — below n=60 floor |
| Balanced     | 5    | 37     | 42       | 11.9%    | n=42 — below n=60 floor |
| Aggressive   | 3    | 37     | 40       | 7.5%     | n=40 — below n=60 floor |
| Star Power   | 10   | 30     | 40       | 25.0%    | n=40 — below n=60 floor |
| **Lifetime** | 41   | 149    | 190      | 21.6%    | Whole-product baseline  |

Public risk-section lifetime (May 28-only sample, since PR #152
introduced the section selector that same day):

| Section      | Wins | Losses | Decisive | Hit rate | Gate status         |
|--------------|------|--------|----------|----------|---------------------|
| Low Risk     | 2    | 1      | 3        | 66.7%    | n=3 — below n=40    |
| Medium Risk  | 1    | 2      | 3        | 33.3%    | n=3 — below n=40    |
| High Risk    | 0    | 4      | 4        | 0.0%     | n=4 — below n=40    |
| Longshot     | 0    | 4      | 4        | 0.0%     | n=4 — below n=40    |

Per-sport-tab lifetime (also May 28-only):

| Bucket      | Wins | Losses | Decisive | Hit rate | Gate status         |
|-------------|------|--------|----------|----------|---------------------|
| NBA-only    | 4    | 0      | 4        | 100.0%   | n=4 — single-game sweep, can't generalise |
| MLB-only    | 0    | 15     | 15       | 0.0%     | n=15 — below n=40   |
| Mixed       | 1    | 13     | 14       | 7.1%     | n=14 — below n=40   |

Audit policy (`app/public/data/audit/policy.json`):

- Window: 4 of 3 required days available (5/25-5/28).
- Overall `confirmed: false`.
- Confirmed signals: **`longshotKeepCollapsed` only** (1 of 1 days
  required, confirmed=true). This is the only signal that has
  cleared its threshold. It is **not consumed by the optimizer** —
  the `/results` Learning Signals table surfaces it as
  "Confirmed — not consumed" so the gate is transparent. The
  optimizer side still requires explicit operator approval per the
  policy-consumption contract.
- Other 7 signals (mixedSportDownrank, sameGameNbaCap,
  dnpGuardStrengthen, market:AST/PTS/REB/batter_total_bases) still
  fire 1-2/3 days; none confirmed.

### 6.2 Why no change yet

Reading section 3 of this doc against the new numbers:

- **3.1 Profile demotion** (`n >= 60` AND `-8 pp` below lifetime
  AND OOT validation): Aggressive at 7.5% with n=40 is 14 pp below
  the lifetime 21.6% — would clear the gap test, but **n=40 is
  still below the n=60 floor**. No demotion.
- **3.2 Section-level cap** (`n >= 40` per section AND below
  floors): no section has n ≥ 40. No cap change.
- **3.3 Market-level demotion**: policy `confirmed: false`. No
  consumption hook fires.
- **3.4 Same-market Longshot cap**: still no instrumentation. Not
  enough Longshot data either way (n=4 lifetime).

### 6.3 Next observable threshold

If May 29 and following slates also settle ~76 unique slips/day,
the lifetime decisive count rises ~76/day. At that rate:

- Profile-demotion floor (n=60) for Aggressive: would clear after
  ~3 more slates (currently n=40 → ~63 by 2026-06-01 if rate
  holds). Worth re-checking after 5/31.
- Section-cap floor (n=40) for the highest-volume section (Low):
  if PR #152's selector emits ~4 Low slips per slate (the
  PUBLIC_RISK_SECTION_TARGET_PER_BUCKET), Low would clear n=40
  around 2026-06-08 (May 28 = 4 → +4/day → 40 by day 10).
  Cap-tightening decisions stay paused until then.
- Audit policy: the next `confirmed: true` would arrive when any
  market demotion hits 3 of 3 days. `market:batter_total_bases`
  is currently 2/3 — one more confirming day flips it.

The next PR to **change** optimizer behavior (vs purely surface
observations) is the one that crosses the first threshold above.
Until then this doc is the single source of truth for "what we
saw, and why we did not act on it."

### 6.4 What did NOT change in this update

- No optimizer / settlement / data file edited.
- No audit policy threshold lowered.
- No Longshot cap tightened (sample still 4).
- No profile demoted.
- No fabricated rows or fake confirming days.
- No claim that the model "learned" from May 28.

The `/results` Learning Signals table (PR #160) already exposes
these statuses live; this section keeps the same record in the
docs for posterity / future PR diff context.
