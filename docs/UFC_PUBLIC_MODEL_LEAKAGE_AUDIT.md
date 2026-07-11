# UFC Public Model-Leakage Audit (2026-07-10)

Every place `/ufc` could expose internal model diagnostics while the moneyline model is unvalidated
(`moneylineValidated=false`, `publicPicksVisible=false`, `cleanGradedRows 0/150`), and what was done.

## Gate

`app/src/app/ufc/page.tsx`:
```
const modelGated = !v1Validated || !(ops?.publicPicksVisible ?? false);   // = true today
```
While `modelGated`, the page shows the **market-implied** read only; model probability / edge / gap / "model
pick" assertions and model-probability suggested cards are hidden and replaced with an honest validation gate.

## Surfaces audited

| surface | leaked (before) | shared? | action |
|---|---|---|---|
| **Fight simulations** (FreeSim shell) | none — market-implied by construction | UFC-only adapter | ✅ already clean (says "Model pick **gated** — market read only") |
| **Projections tab** → `ProjectionCard` | `modelProbability`, `edgePct` | shared (MLB/WC/NBA) | ✅ added `hideModel` prop → shows market-implied only for UFC; other sports unaffected |
| **Expanded tab** → `UfcExpandedFightCards` | moneyline `modelProbability`, "model gap" | UFC-only | ✅ added `hideModel` → moneyline shows market-implied; no-odds method/round/distance stay as clearly-badged **MODEL-ONLY · NOT PARLAY ELIGIBLE** insight (test-required, non-bettable) |
| **Suggested Cards** (overview + tab) → `SuggestedCard` | model-probability parlays | shared | ✅ gated behind `!modelGated`; a "Model-adjusted picks · validating (0/150)" panel replaces them |
| **Markets tab** | "model-only" coverage labels | UFC-only | left as-is — describes market *coverage*, not a pick/edge |

## Kept public (market-implied — allowed now)

De-vigged moneyline win probabilities, favorite/underdog, market-implied moneyline lean, odds,
provider-needed prop roadmap. Plus a status strip: **Public now · market-implied / Gated · model-adjusted
picks / Validation · 0 / 150 clean graded fights.**

## Tests added
- `ufc-model-gate.test.mjs` (7) — gate derived from real flags (not hardcoded); `ProjectionCard` +
  `UfcExpandedFightCards` suppress model prob/edge when `hideModel`; page passes `hideModel={modelGated}`;
  suggested cards gated; market-implied stays live; the committed artifacts are genuinely unvalidated.
- `ufc-product-safety.test.mjs` (5) — UFC never enters the eligible-leg pool / products (see that file).

## Verified at build time
Painted `/ufc` DOM: `Model read` / `model gap` / `· edge ` / model-probability strings = **0**; the only
"Model pick" text is the honest **"Model pick gated — market read only"**. `Market-implied` present
throughout. No model number leaks while unvalidated.

## Residual (founder decision)
The no-odds method/round/distance projections in the Expanded tab remain visible as model-only insight (they
have no market to fall back to, and the tab is test-required). They are badged MODEL-ONLY · NOT PARLAY
ELIGIBLE and are never picks. If you want them fully hidden until validation, that's a follow-up.
