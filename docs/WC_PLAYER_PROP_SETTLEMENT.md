# World Cup Player-Prop Settlement (Phase C) — 2026-07-13

Build the settlement ingest + deterministic grading for the exposed WC player props (anytime goalscorer,
shots, shots-on-target, assists), into a **separate paper/model ledger only**. Official money / the 19-14
record are untouched (md5 `affe6b21`). Nothing fabricated.

## What was built
- **`lib/world-cup/wc-prop-settlement.ts`** — pure, deterministic grading (`gradeWcPlayerProp`): goalscorer /
  assist Yes/No from the count; shots / SOT / assists Over-Under vs the line; exact integer tie → void;
  **missing stat → "ungradable" (never guessed)**. Plus `buildPropSettlementLedger` → a `scope:
  "paper_model_only"` ledger with a W/L/void/ungradable summary.
- **`app/scripts/settle-wc-player-props.mjs`** — ingest for API-Football fixture player-statistics
  (`fixture id → player name → goals/shots/shots-on/assists`), grades the committed props, writes only
  `data/internal/world-cup/prop-settlement/<date>-fixture-<id>.json` (never web-served, never money).
  **Fails closed** if the provider returns no data (free plan / no season access / not finished).

## Validation — against a REAL finished match ✅
The grading is validated against **real official statistics** from the **2022 World Cup third-place playoff,
Croatia 2-1 Morocco** (API-Football fixture `979138`, 2022-12-17), pulled live:
- Gvardiol (1 goal) → "anytime goalscorer Yes" = **win**; En-Nesyri (0 goals) → "Yes" = **loss**.
- Oršić (3 shots) → "shots Over 1.5" = **win**; Gvardiol (1 shot) → "Over 2.5" = **loss**.
- En-Nesyri (1 SOT) → "SOT Over 0.5" = **win**; assists 0 → "assists Over 0.5" = **loss**.
All grade deterministically and correctly (`wc-prop-settlement.test.mjs`).

## The blocker — LIVE 2026 settlement cannot run yet (two reasons)
1. **API-Football plan tier.** The current key is a **FREE plan**: `"Free plans do not have access to this
   season, try from 2022 to 2024."` So it **cannot** fetch 2026-season fixture player-statistics — the exact
   data needed to settle the exposed semifinal props. Validation therefore used 2022 real data (which the free
   plan allows), NOT the 2026 semifinals.
2. **The semifinals are future** (Jul 14 / Jul 15) — there is nothing finished to grade regardless of plan.

## Coverage decision — NO flip (honest)
`market-coverage.ts` soccer goalscorer + shots/SOT/assists **stay `settlementSupport: "unsupported"`** and
`experimental` → `isProductEligible === false`. The mission's "flip to supported once validated against a
finished match" is intentionally NOT applied to the live 2026 markets: the grading LOGIC is validated, but the
live props **cannot actually be settled** on the free plan, so calling them "supported" would mislead. The
grading is ready; the coverage flips the day a paid plan + a finished 2026 match let the settle script run.

## Founder decision needed
- **Upgrade the API-Football plan** to a tier with 2026-season access (fixture player-statistics). Then, after a
  semifinal finishes: `node app/scripts/settle-wc-player-props.mjs --fixture <id> --date 2026-07-14` writes the
  paper/model ledger; once it grades a real 2026 match, flip the two soccer prop markets'
  `settlementSupport` → `supported` (they already grade deterministically). Props stay out of Bank Builder /
  Moonshot until then.

## Guardrails held
Official money + 19-14 untouched; ledger is paper/model + internal-only; grading never guesses (ungradable on
missing data); no fabricated results; validated against real finished-match statistics.
