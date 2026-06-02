# Public Suggestion Volume Discipline (2026-06-02)

> **A product-honesty / anti-overpublishing change. NOT a performance
> claim.** No projection math changed, no `edgePct`/`confidence` gate
> wired, no `audit/policy.json` consumed, no workflow schedules changed, no
> unsupported sports enabled, Bank Builder still paper-only. Fewer cards +
> honest empty states is the entire point — it makes **no** claim that the
> remaining cards are more likely to win.

---

## 1. Why this change exists

The calibration investigation (`docs/MODEL_CALIBRATION_2026-06-02.md`)
found the model's quality signals are not predictive (`edgePct` is
anti-predictive; `confidence` is binned edge). It also found the public
Suggested view **overpublishes**: the default "all" view rendered **16
cards per slate** built from only a handful of distinct players/markets —
e.g. on June 1 a single market appeared in **15 of 16** cards and one game
in **14 of 16**. That is undisciplined and repetitive regardless of any
hit-rate question.

So the safe, honest move (the only one the evidence supports) is to **cap
volume and stop padding** — not to claim a better win rate.

---

## 2. What this change does

A pure helper, `app/src/lib/parlay-volume-discipline.ts::applyVolumeDiscipline`,
applied to the per-sport published `publicRiskSections` **before** any
team/player narrowing, in `parlay-lab-builder.tsx`. It:

- caps cards per risk section and overall,
- caps how much one player / market / game can dominate the published set,
- **keeps the optimizer's own within-section order** (takes the first N) —
  it adds no new ranking opinion,
- lets sections be **empty** (the existing honest `SectionEmpty` copy
  renders) rather than padding with weak/repetitive cards.

Both the rendered cards and the "Showing N parlays" count derive from the
same disciplined sections, so they never disagree.

### Exact caps (`PUBLIC_VOLUME_CAPS`)
| Cap | Value |
|-----|------:|
| Low Risk | 3 |
| Medium Risk | 3 |
| High Risk | 2 |
| Longshot | 1 |
| **Total public cards** | **9** |
| Max player exposure (cards a player can appear in) | 2 |
| Max market exposure | 4 |
| Max same-game exposure | 3 |

These are an editorial anti-overpublishing choice, **not** a tuned
performance number.

---

## 3. What this change does NOT do / claim

- Does **not** change projections, leg probability, `edgePct`,
  `confidence`, settlement, or workflows.
- Does **not** use `edgePct`/`confidence` as a quality gate or reorder by
  any quality signal.
- Does **not** consume `audit/policy.json`.
- Does **not** claim fewer cards = higher win rate.
- Does **not** touch unsupported sports; Bank Builder stays paper-only.

---

## 4. Empty-state behaviour

- A section with zero kept cards renders the existing honest
  `SectionEmpty` copy ("No 4–5 legs parlays for today's slate that also
  land in +600 to +999."). No banned copy, no false alternatives.
- A small persistent note above the spread sets expectations: *"We cap how
  many cards we publish per slate and show fewer when the slate doesn't
  produce enough varied combinations — sections can be empty rather than
  padded."*
- **Bank Builder** already shows an honest empty state when no pending,
  fully-unsettled ~+100 slip exists; it never forces a card. Unchanged.

---

## 5. Shadow comparison (offline, settled slates)

`cd app && npx tsx scripts/shadow-volume-discipline.mjs` over May 27 –
June 1 (May 25/26 excluded; the May-27 snapshot predates `publicRiskSections`
so shows 0). Default "all" view:

| Date | cards before→after | by section | max player | max market | max game |
|------|:------------------:|------------|:----------:|:----------:|:--------:|
| 05-28 | 16 → 3 | L3 M0 H0 Lo0 | 13→2 | 14→2 | 16→3 |
| 05-29 | 16 → 5 | L3 M2 H0 Lo0 | 11→2 | 13→4 | 11→2 |
| 05-30 | 16 → 3 | L3 M0 H0 Lo0 | 12→1 | 13→2 | 16→3 |
| 06-01 | 16 → 5 | L3 M2 H0 Lo0 | 12→2 | 15→4 | 14→3 |
| **agg** | **64 → 16** (25%, 48 fewer) | — | — | — | — |

- **Volume falls materially** (64 → 16 across the 4 dated slates).
- **Repetition/concentration falls materially** (max player 11–13 → 1–2;
  max market 13–15 → 2–4; max game 11–16 → 2–3).
- **Hit rate did not degrade** — *historical shadow evidence only* — slip
  13% → 31%, leg 60% → 67%. This is reported solely to confirm the cap does
  **not** keep worse cards (the spec's safety check); it is **not** a
  performance claim.

Live confirmation on the June-1 slate: Parlay Lab "all" went from **16 → 5**
("Showing 5 parlays": Low 3, Medium 2, High 0, Longshot 0) with honest
empty High/Longshot sections.

---

## 6. Risks & rollback

- **Risk:** sections can look sparse on a repetitive slate (by design —
  honesty over fullness). Mitigated by the explanatory note + honest empty
  copy.
- **Risk:** caps are editorial, not tuned. They are a single constant
  (`PUBLIC_VOLUME_CAPS`) — easy to adjust.
- **Rollback:** revert the one wiring change in `parlay-lab-builder.tsx`
  (use `sportSections` instead of `disciplinedSportSections`); the helper +
  tests + shadow script are inert if not called.

---

## 7. Next recommended work

- Watch live slates for whether the caps feel right; tune
  `PUBLIC_VOLUME_CAPS` if a section is chronically empty for the wrong
  reasons.
- The deeper fix remains **projection→probability recalibration** (separate,
  approval-gated) — until then, no model-edge quality claim should be made.

*Implemented 2026-06-02. Anti-overpublishing only; no performance claim; no
projection/edge/workflow/policy changes; Bank Builder paper-only.*
