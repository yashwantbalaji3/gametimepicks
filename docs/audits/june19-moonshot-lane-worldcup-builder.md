# June 19 — Moonshot Lane C (World Cup-forward longshot paper challenge)

_Branch `june19-moonshot-lane-worldcup-builder` off main `ff461a82` (PR #535 merged). Built 2026-06-19 ~18:40 UTC._

A **separate** high-volatility paper lane — NOT part of the disciplined Dual Bank Builder (Lane A/B). World-Cup-forward, multi-game, team anchors + player attacking upside. Paper-only.

## Phase 0 — current-state audit
| area | current source | status | risk | Moonshot action |
|---|---|---|---|---|
| Active Bank Builder (Lane A/B) | `methodology/launch/dual-bank-builder-active.json` | active (PR #535) | real-money discipline | **never touched** — Moonshot is a separate artifact |
| Mr. Dub portfolio | `mr-dub/portfolio.json` | exposure $297.88 (A/B) | core ledger | add a **separate** Moonshot exposure section + ledger event |
| World Cup slate | `world-cup/projections/latest.json` | 4 pre-event matches (USA 19:00Z, Morocco 22:00Z, Brazil 00:30Z, Turkey 03:00Z) | odds-backed, `dataQuality: B` | source team-market legs |
| World Cup player props | `world-cup/player-projections/latest.json` | 192 props, odds-backed, `parlayEligible:false` (lineups not posted) | market-implied, limited | source player upside legs (Moonshot allows limited-data with a label) |
| Parlay Lab / risk bands | `risk-odds-bands.ts` | Longshot band `>+600` | — | Moonshot cards are Longshot; reuse the leg guards (no leg < -500) |
| Results settlement | `bank-builder-results.ts` | official sources | — | Moonshot settles from the same official WC/MLB sources (separate label) |
| Protected history | `public/data/bank-builder/*` | immutable | — | **untouched** |
| Uncommitted changes | none (clean on main) | — | — | clear to start |

## Phase 5 — World Cup-only vs Mixed decision
| scope | eligible legs | candidate cards | best odds | target fit | selected |
|---|---|---|---|---|---|
| **World Cup-only** | team ML/DNB/DC/BTTS across 4 games + 192 odds-backed player props | multiple +600..+900 cards buildable | +808 (Step 1) | ✅ fits +600–900 | **✅ World Cup-only** |
| Mixed (WC+MLB) | available but unnecessary | — | — | — | not needed |

**Decision: World Cup-only.** Enough real odds-backed legs exist (team sides + attacking props across Brazil/Morocco/Turkey) — cleaner than mixing sports, and matches the user's WC-forward inspiration. USA (19:00Z, ~20 min to kickoff) is **excluded** for pre-event safety; the card uses Morocco (22:00Z), Brazil (00:30Z), Turkey (03:00Z) — all comfortably pre-event.

## Selected Moonshot Step 1 card ($25 → ~$227, +808)
| # | leg | game | kickoff | market | odds | model prob | type |
|---|---|---|---|---|---|---|---|
| 1 | **Morocco** (to beat Scotland) | Scotland vs Morocco | 22:00Z | moneyline_90 | -162 | 0.59 | team anchor |
| 2 | **Vinícius Júnior** anytime goalscorer | Brazil vs Haiti | 00:30Z | goalscorer | -120 | 0.55 | star player anchor |
| 3 | **Ismael Saibari** anytime goalscorer | Scotland vs Morocco | 22:00Z | goalscorer | +145 | 0.41 | player upside |
| 4 | **Turkey or Draw** (Double Chance) | Turkey vs Paraguay | 03:00Z | double_chance | -400 | 0.75 | team anchor |

- **Combined: 1.617 × 1.833 × 2.45 × 1.25 = 9.08× → +808.** Stake $25 → projected **$227.01**. Longshot band, in the Step-1 +600–900 target (clears the ~$200 goal at ~8.0×).
- **Correlation profile: `multi_game_with_intentional_stack`** — 3 distinct games; the Sco-Mor game intentionally stacks Morocco ML + Saibari to score (Morocco win + a Morocco attacker scores). Disclosed in the "Why this card" drawer, not hidden.
- **Joint model probability ≈ 0.59 × 0.55 × 0.41 × 0.75 ≈ 10.0%** (vs +808 implied ≈ 11.0%) — an honest moonshot.
- No leg shorter than -500 (Brazil ML -1100 / Morocco DC -910 deliberately excluded as filler). All four pre-event + odds-backed; player props labeled limited-data / market-implied.

## Guards
No fabrication (every leg has a real bookmaker price + model prob); pre-event only; never called lower-risk; separate from Lane A/B; protected `public/data/bank-builder/*` untouched; canonical/allowed copy only.
