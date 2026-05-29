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
