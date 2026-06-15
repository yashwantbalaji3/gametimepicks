# June 15 — Dual Bank Builder redo + Bank Builder UI + WC upcoming refresh (preview)

Branch `june15-redo-dual-bankbuilder-worldcup-complete`, stacked on the #492 branch
(`2b6a5b6`). PREVIEW — do not merge without owner review.

## Why a redo was needed (timing)
At **18:42 ET** the slate had moved: Saudi Arabia v Uruguay (18:00) and MIA@PHI (Otto
Lopez, 18:41) had **kicked off**, so BOTH previous lanes contained a now-started leg.
Still upcoming: **Iran v New Zealand (21:00 ET)** + **9 MLB games** → enough to rebuild
from genuinely-upcoming legs. (Also fixed `build_odds_only_projections` to drop
already-commenced matches — WC projections now show only Iran v NZ.)

## Owner feedback → changes
| Feedback | Change |
|---|---|
| Lane A return too low; Over 1.5 hits too risky | New MLB **lower-variance market gate**: batter_hits Over only at 0.5, Under any line; strikeouts; total_bases/HRR Under only — **excludes all Over 1.5+ hits** (pool 199 → 39 lower-variance legs) |
| Prefer soccer double chance heavily | Selector **market-preference bonus** (double_chance +0.06, DNB +0.03, hits-Over-0.5 +0.03) |
| Lane A ~$200 | Lane A window tightened to combined decimal [1.88, 2.12] |
| Bank Builder UI clearer | New **step-ladder** per lane ($100→~$200 → Step 2-4 → 👑 $10K), live Step 1 highlighted |

## Final lanes (Run #2 · active · pending)
| Lane | Thesis | Legs | Combined | $100 → | Joint model |
|---|---|---|---|---|---|
| **A** | Lower-variance, cross-sport | **Iran or Draw** (double chance, −600, 81%) + **Troy Johnston Over 0.5 hits** (−163, 77%) | **−113** | **$188** | 63% |
| **B** | Higher-return, differentiated | **Mike Trout Under 1.5 hits** (−269, 84%) + **Samad Taylor Over 0.5 hits** (−176, 81%) | **+115** | **$215** | 68% |

- **Replaced** old Lane A (Uruguay or Draw — match started — + **Alec Burleson Over 1.5 hits**, the risky leg the owner flagged). The risky MLB Over-1.5 leg is gone from both lanes (locked by a test).
- Lane A is $188 — $2 under the $190 ideal; it's the best lower-variance pair anchored on the preferred soccer double chance (Iran or Draw is decimal 1.167, so the steady MLB partner lands the combo at 1.882). Lane B is $215 (in the $200-240 band).
- Different legs, no shared game, all legs upcoming at launch, status pending.
- **Rejected alternatives**: all-MLB Over-0.5 pairs landed at higher returns but without the preferred double-chance anchor; pairs including a started match (Saudi/Uruguay, MIA@PHI) were excluded by the `commence > now` gate.

## UI
- Bank Builder + homepage render the live lanes with the new step ladder; the completed
  Run #1 ($100 → $10,376.17 · 5–0) is shown as a recap and is **byte-untouched**.
- WC projections refreshed to the single upcoming fixture (Iran v NZ) with double chance,
  DNB, BTTS, 3-way + recent form; player-props artifact message corrected to
  `integration_pending` (key now configured; full build is the next increment) — not "needs key".

## Integrity / tests / build
- Real odds (The Odds API) + real form (API-Football); only upcoming legs; lower-variance MLB
  markets only; completed Run #1 + UFC 250 settlement byte-untouched; `.env` gitignored + not staged.
- `dual-bank-builder.test.mjs` +2 (no risky Over-1.5 hits; ~$200 band). 917 tests pass,
  tsc clean, build clean (186 pages — only Iran/NZ WC detail page now).

## Honest limitations / deferred (clearly-scoped next increment)
- **World Cup player props** (anytime-goalscorer / shots): odds + API-Football data are both
  available, but the full player-match + per-player recent goal/shot form + hit-rate viz +
  eligibility + PlayerPropsExplorer integration is a large, focused build — deferred (gated
  honestly as `integration_pending`, no fabrication). This has been the documented next
  increment across PRs and is the top remaining WC item.
- Deep Parlay Lab / Build filter chips (Player Props / Double Chance / Totals / DNB), per-game
  WC suggested-card expansion, and player portraits (need the player-prop layer first): the new
  markets + lanes flow through the existing components; these are follow-ups.
- Lane A is $188 (preferred-double-chance-anchored) vs the $190-210 ideal — closest defensible.

**Recommendation:** review on preview; merge the redo + Bank Builder UI after the stack.
Next: build the World Cup player-prop layer (the only major remaining WC item).
