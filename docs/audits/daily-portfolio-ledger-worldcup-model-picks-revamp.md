# Daily Portfolio Ledger + World Cup Model Picks Revamp + Specials Merge

**Date:** Tuesday June 23 2026, ~3:48 AM ET. **Branch:** `daily-portfolio-ledger-worldcup-model-picks-revamp` (off `origin/main` `fce63b54`, PR #564).
**Scope:** reframe Mr. Dub as a daily paper portfolio (Bank Builder A/B + Moonshot A/B), make the World Cup model-picks table the main experience, merge "World Cup Specials" into Suggested World Cup Parlays. **High-risk money sprint — designed → dry-run → tested; exposure NOT mutated.**

## Protected baseline (must preserve)
| area | baseline | preserved? |
|---|---|---|
| crown bankroll | $10,376.17 | YES (untouched) |
| crown record | 5-0 | YES |
| active bankroll | $10,176.17 | YES (no formula change this PR) |
| core exposure | $0 | YES (lanes are CANDIDATES, not activated) |
| moonshot exposure | $0 | YES (candidates only) |
| core record | 10-2-0-0 | YES (only official settlement changes it) |
| moonshot record | 0-1 | YES (separate) |

## Phase 2 — June 23 slate (API-Football, verified)
All 4 WC games **NS** at 3:48 AM ET, eligible (>30m to kickoff): Portugal/Uzbekistan 1 PM · England/Ghana 4 PM · Panama/Croatia 7 PM · Colombia/DR Congo 10 PM ET.

## Phase 1 — accounting model decision
**Current convention** (`build-mr-dub-ledger.mjs`): `currentBankroll = crownFinal + dualRealized`; a won rung rolls (unrealized, $0 realized), a lost seed realizes −stake; `openExposure` = sum of pending lane stakes; `totalOpenExposure` = core + moonshot. Crown is the historical completed ladder, separate from active bankroll.

**New intended model (user):** Mr. Dub = daily paper portfolio owning 4 lanes (Bank Builder A/B + Moonshot A/B), tracked with stake / potential return / status / realized P/L.

**Decision (safe, per the prompt's own fallback):** Add a **derived `dailyPortfolio` layer** — do NOT rewrite the historical bankroll formula or mutate any money field. The daily portfolio is computed from the unified model-pick pool + the existing portfolio baseline:
```
activeBankroll   = portfolio.currentBankroll (10176.17)   // unchanged
openExposure     = sum of ACTIVE lane stakes              // $0 — lanes are CANDIDATES this PR
availableBankroll = activeBankroll − openExposure
potentialReturn  = sum of candidate potential returns
```
Lanes are generated as **candidates** ($0 placed). Real activation (persisting placements + mutating exposure/bankroll) is the gated next step — it needs tested multi-lane Moonshot accounting + ladder-fit Bank Builder validation, which would mutate money and is therefore deferred (documented backlog). This honors "if migrating is too risky, add the daily-portfolio view without changing historical formula; if activation isn't safe, leave candidates and document."

## What this PR delivers (safe + tested)
1. **Unified model-pick pool** (`lib/world-cup/model-qualified-picks.ts`): team model legs (moneyline_90 / double_chance / draw_no_bet / match_total_goals / btts) + player-prop model picks, normalized to one `ModelPick` shape, pre-event + odds-window (−500..) gated, model-qualified only.
2. **Lane candidate generation**: Bank Builder A/B = 2 highest-hit-rate lower-volatility legs; Moonshot A/B = 5 highest-upside legs. Max 1 leg per game (correlation-safe); a 2nd leg from a game is only used when unavoidable and is flagged. Combined odds computed honestly from leg odds.
3. **Daily portfolio** (`lib/mr-dub/daily-portfolio.ts`) + **`/mr-dub` "Today's paper portfolio"** UI: 4 lane cards, exposure/available/potential summary, crown separate. $0 exposure (candidates).
4. **World Cup Model Picks table** (`components/world-cup/model-picks-table.tsx`): team pick · total/BTTS · anytime GS · SOT · assists · shots · cards · best addable leg — top model-qualified pick per cell or "No model-qualified pick". The main /world-cup experience.
5. **Specials merge**: renamed to **"Today's Suggested World Cup Parlays"**; `/world-cup-specials` de-emphasized (archive notice + CTA). $0 exposure, model-qualified legs only.
6. **/today**: daily-portfolio module + model-picks CTA.

## Deliberately NOT done this PR (money safety / documented backlog)
- **No exposure activation** — Bank Builder + Moonshot lanes are CANDIDATES ($0). Real placement requires tested multi-lane accounting + ladder-fit + bankroll migration (mutates money).
- **No historical bankroll-formula change** — `currentBankroll`/crown untouched.
- Deep per-page rewrites (game-detail, full /picks + /build revamp) beyond the model-picks-table + model-qualified defaults — incremental, documented.

## Verification (filled at the end)
