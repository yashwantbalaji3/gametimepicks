# Parlay leg-quality risk gates

Last updated: 2026-05-30.

> **Scope.** This is a **docs + pure-helper** audit. It defines and
> documents the per-leg quality gates that already exist in the
> codebase, surfaces one honest finding about the public risk sections,
> and proposes (does **not** ship) a tightening. It changes **no**
> optimizer lane, **no** published number, and **no** settled result.
> Nothing here is consumed by the optimizer — per
> [`MODEL_LEARNING_LOOP.md`](./MODEL_LEARNING_LOOP.md) §3/§9, audit
> policy is never wired into lane composition without explicit operator
> approval and an out-of-sample confirmation.

**Single source of truth.** The gate that actually composes lanes is
`pipeline/parlay_optimizer.py::is_eligible`, driven by the
`ProfileRules` constants. The companion TS file
`app/src/lib/leg-quality-gates.ts` is a **non-authoritative mirror** for
client-side "why is this leg in / out" explainers; its presets are pinned
to the Python values by `leg-quality-gates.test.mjs` so drift fails CI.

---

## 1. Two gate layers (don't conflate them)

There are two distinct gates between a raw board prop and a slip a user
sees. They answer different questions.

| Layer | Question | Where | Granularity |
|-------|----------|-------|-------------|
| **A. Per-leg eligibility** | Is this single prop good enough to enter a lane? | `is_eligible(lean, rules)` | one leg |
| **B. Slip composition** | Do these legs combine into a valid slip for this lane/section? | `_greedy` (profile lanes) / `generate_public_risk_sections` (public spread) | whole slip |

Layer A is the **leg-quality** gate this doc is about. Layer B adds
slip-level correlation caps (same-game, same-team, anomaly count,
volatile-market count, leg count, combined-odds window) on top of the
already-eligible legs.

## 2. Per-leg eligibility gate (Layer A) — what ships today

`is_eligible` is an all-or-nothing predicate. A leg must clear **every**
row below for its profile, in addition to a non-`Pass` side:

| Gate | conservative | balanced | aggressive | star_power |
|------|:---:|:---:|:---:|:---:|
| Allowed confidence | High | High · Medium | High · Medium · Low | High · Medium |
| Min model edge (pp) | 3.0 | 2.0 | 1.0 | 3.0 |
| Legacy `requireRecent10` (`recent10Count ≥ 5`) | yes | — | — | yes |
| `requireValidPlayerId` (`playerId > 0`) | yes | yes | — | yes |
| `excludeAnomalies` (R5 extreme-edge) | yes | yes | — | yes |
| `requireStar` (`starTier ≠ none`) | — | — | — | **yes** |
| DNP guard — NBA `recent10Count ≥` | 7 | 5 | 3 | 7 |
| DNP guard — MLB `len(recentSeries) ≥` | 5 | 5 | 3 | 5 |
| MLB market allowlist | hits · TB | hits · TB · H+R+RBI · K | hits · TB · K · H+R+RBI | hits · TB · H+R+RBI |

Notes:
- **Confidence is case-sensitive** (`"High"`, `"Medium"`, `"Low"`).
- The **DNP guard** (PR #115) is the modern leg-activity floor. NBA reads
  `recent10Count`; MLB reads `len(recentSeries)`. For MLB, `recent10Count`
  is *derived from* `recentSeries` upstream (`normalize_lean`), so the two
  are equal in real data.
- A leg with **no usable price** (`oddsForSide` null/0) is dropped before
  composition — the UI never renders a fabricated payout.
- The **MLB market allowlist** plus the slip-level `mlb_max_volatile_legs`
  cap are what keep volatile cohorts (total bases, strikeouts, H+R+RBI)
  from stacking. `pitcher_strikeouts` is deliberately **out** of
  conservative and star_power.

## 3. Slip-level caps (Layer B) — context, not leg quality

Applied per slip after Layer A, so a slip never over-concentrates risk:

| Cap | conservative | balanced | aggressive | star_power |
|-----|:---:|:---:|:---:|:---:|
| Legs (min–max) | 2–2 | 3–3 | 4–4 | 2–3 |
| Max legs per game | 1 | 2 | 3 | 1 |
| Max legs per team | 1 | 2 | 3 | 1 |
| Max anomaly legs | 0 | 0 | 1 | 0 |
| Max volatile MLB legs | 1 | 1 | 3 | 1 |

The aggressive 5-leg build was hard-capped to 4 after the 5/25 audit
(0W–14L on 5-leg slips). The Star Power same-game cap was cut 2 → 1
after same-game NBA stacks went 1W–23L in the 5/25 blowout.

## 4. The public risk sections — honest finding

The Parlay Lab **Suggested** spread shows four public sections —
**Low / Medium / High / Longshot** — defined in
[`parlay-risk-sections.ts`](../app/src/lib/parlay-risk-sections.ts) and
mirrored server-side in `PUBLIC_RISK_SECTION_SPECS`:

| Section | Combined odds | Legs |
|---------|---------------|------|
| Low | under +300 | 2–3 |
| Medium | +300 to +599 | 3–4 |
| High | +600 to +999 | 4–5 |
| Longshot | +1000 and up | 5–6 |

**Finding.** The public-section pool is built by `_build_leg_pool`, which
qualifies legs with the **single most-permissive profile gate
(`aggressive`)** — confidence down to Low, edge ≥ 1pp, no
valid-player-id requirement, anomalies allowed, DNP floors at 3.
`generate_public_risk_sections` then assigns each candidate slip to a
section **purely by its combined odds + leg count**.

So **every public section inherits the same `aggressive` per-leg bar.**
The "Low Risk" label today means *shorter combined odds and fewer legs* —
**not** a higher per-leg quality bar. A Low-section slip can legitimately
contain a Low-confidence, 1pp-edge, `recent10Count = 3` leg. Within a
section, legs are *ranked* by `_sgp_leg_quality` (`edge × confidence +
5 × recent-fullness`), so higher-quality legs surface first — but they are
not *gated* by a section-specific quality floor.

This is recorded plainly. It is not a bug in the odds/leg labels (those
are accurate), but the label set under-promises on the high end and
**over-implies leg quality on the low end**.

## 5. Profile ↔ section relationship

The internal **profiles** (conservative / balanced / aggressive /
star_power) are the optimizer's named lanes. The public **sections**
(low / medium / high / longshot) are an odds+legs re-bucketing of the
aggressive-qualified pool. They are *not* the same axis:

- A `conservative` 2-leg slip at +260 lands in the **Low** section.
- An `aggressive` 4-leg slip at +700 lands in the **High** section.
- But a 3-leg slip built from aggressive-grade legs that happens to price
  at +250 also lands in **Low** — with no conservative leg gate applied.

That last case is the gap §4 describes.

## 6. PROPOSED per-section leg ladder (NOT shipped)

A proposal to make the public "Low" label mean conservative-grade legs,
by tightening the per-leg bar as the section gets lower-variance. Encoded
(testable, inert) as `PROPOSED_SECTION_LEG_GATES` in
`leg-quality-gates.ts`:

| Section | Proposed leg gate | Mirrors |
|---------|-------------------|---------|
| Low | High only · edge ≥ 3 · DNP NBA 7 · no anomalies | conservative |
| Medium | High·Medium · edge ≥ 2 · DNP NBA 5 · no anomalies | balanced |
| High | any tier · edge ≥ 1.5 · DNP NBA 3 · anomalies ok | aggressive+ |
| Longshot | any tier · edge ≥ 1 · DNP NBA 3 · anomalies ok | aggressive (today) |

The ladder is monotonic: edge floor and DNP floor relax as risk rises;
confidence breadth widens; Low/Medium exclude anomalies, High/Longshot
tolerate them. `leg-quality-gates.test.mjs` asserts that monotonicity.

**Promotion path before this could ship** (all required):
1. Out-of-sample confirmation that the tightened Low/Medium pool would not
   have collapsed visible slip availability on real past slates (the
   sample is still below the `MODEL_LEARNING_LOOP.md` §7 gates — so this
   stays a proposal).
2. A pinning test in `pipeline/` that fixes the new per-section gate.
3. **Explicit operator approval** to consume the policy in
   `generate_public_risk_sections`.

Until all three hold, the public copy stays "experimental · publicly
tracked" and the spread keeps using the aggressive pool.

## 7. The pure helper (`leg-quality-gates.ts`)

`evaluateLegQualityGate(leg, gate)` is a pure predicate mirroring
`is_eligible` (minus the user selection filters, which are display
filters, not quality gates). It returns:

```ts
{ passes: boolean; failures: string[] }
```

It collects **every** failing reason (not just the first) so an explainer
can show the full picture, but `passes` is identical to the Python
boolean because every check is ANDed. Exposed presets:

- `PROFILE_LEG_GATES` — the four authoritative lane gates (pinned to
  Python by tests).
- `PUBLIC_SECTION_LEG_GATE_TODAY` — equals the aggressive gate, pinning
  the §4 finding so a silent retightening can't slip in undocumented.
- `PROPOSED_SECTION_LEG_GATES` — the §6 ladder (inert).

## 8. What this doc + helper do NOT do

- Do **not** change `is_eligible`, any `ProfileRules`, or
  `generate_public_risk_sections`.
- Do **not** get imported by any optimizer / snapshot / settlement path.
- Do **not** re-grade, re-weight, or alter any pregame suggestion.
- Do **not** claim a calibrated hit rate — the sample is still below the
  `MODEL_LEARNING_LOOP.md` §7 gates.
