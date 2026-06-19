# June 19 — Bank Builder quality audit: Jax replacement, Turkey market, leg display

_Branch `june19-bankbuilder-quality-replacement-leg-display` off main `d886e75c`. Audit at 2026-06-19 17:33 UTC._

## Phase 0/1 — active legs: start time + pre-event + last-5
| lane | step | leg | event start (UTC) | now 17:33Z | pre-event? | last5 hit | risk issue | action |
|---|---|---|---|---|---|---|---|---|
| A | 2 | USA moneyline_90 -165 | 19:00Z | yes | **yes** | n/a (team) | none — clean favorite | **keep** (user-approved) |
| A | 2 | Griffin Jax Strikeouts U4.5 -106 | 23:11Z | yes | **yes** | **2/5** [6,3,5,4,5] | fails ≥4/5 gate; awkward pitcher-K under | **REPLACE** |
| B | 1 | Turkey **draw_no_bet** -230 | 03:00Z (Jun 20) | yes | **yes** | n/a (team) | label/market clarity (DNB ≠ Double Chance) | **audit market** |
| B | 1 | Zack Gelof Hits O0.5 -241 | 01:41Z (Jun 20) | yes | **yes** | **5/5** | none — high hit rate | **keep** (acceptable) |

All four legs are pre-event → replacement allowed for all.

## Phase 2 — Griffin Jax quality audit
| candidate | market | odds | last5 | model prob | role/data | keep/replace | reason |
|---|---|---|---|---|---|---|---|
| Griffin Jax | Strikeouts Under 4.5 | -106 | **2/5** [6,3,5,4,5] | 0.71 | probable starter, 20 samples | **REPLACE** | Cleared the Under in only 2 of his last 5 (user's observation confirmed). A pitcher-strikeout Under is high-variance for Bank Builder; the model edge doesn't offset a 2/5 recent hit rate. Fails the ≥4/5 Bank Builder gate. |

## Phase 3 — Jax replacement candidates (last5 ≥4/5, pair with USA ML into +203..+279)
| candidate | opp | start | market | odds | last5 | model prob | surv | +USA ML | return | selected |
|---|---|---|---|---|---|---|---|---|---|---|
| **Nick Gonzales** | PIT vs COL | 00:41Z | HRR Under 2.5 | -112 | **5/5** [0,2,0,0,2] | 0.67 | **87** | **+204** | **$601.56** | ✅ recommended |
| Chandler Simpson | — | — | HRR Under 1.5 | -107 | 5/5 [0,1,1,0,0] | 0.61 | 82 | +211 | $614.82 | alt |
| Jacob deGrom | — | — | Strikeouts Under 6.5 | -108 | 4/5 [3,6,8,6,5] | 0.53 | 77 | +209 | $612.07 | rejected (pitcher-K, low mP) |

Selected: **Nick Gonzales HRR Under 2.5 -112** — highest survival (87) + 5/5 + everyday player + clean explainable market; USA ML + Gonzales = **+204 → $601.56** (in $600–750 target).

## Phase 4 — Turkey market audit (Turkey vs Paraguay, kickoff 03:00Z Jun 20)
| current market | intended market | real odds available? | start | replacement allowed? | action |
|---|---|---|---|---|---|
| draw_no_bet `-230` (mP 0.640) | "Turkey or Draw" = **double_chance** | **yes**: double_chance `-400` (mP 0.750) | 03:00Z (pre-event) | yes | **operator decision** (below) |

**Clarification: they are NOT the same market.**
- **Turkey or Draw** (Double Chance, `-400`): wins if **Turkey wins OR the match is a draw**. Higher hit probability (75%), shorter price.
- **Turkey Draw No Bet** (`-230`): wins only if **Turkey wins**; a draw **voids** the leg (stake returned); a Turkey loss loses. Lower hit probability (64%), longer price.

The active artifact currently uses **DNB**. The public copy must not call DNB "Turkey or Draw."

### Lane B options (Gelof O0.5 -241 5/5 kept unless noted)
| option | Turkey leg | MLB leg | combined | return | trade-off |
|---|---|---|---|---|---|
| **A** keep DNB | Turkey DNB -230 (64%) | Gelof O0.5 -241 | **+103** | **$203.01** | hits the $200 rung; **loses if Turkey draws** |
| **B** Double Chance + Gelof | Turkey or Draw -400 (75%) | Gelof O0.5 -241 | **-129** | **$176.86** | lowest-variance WC market; **undershoots the $200 rung** |
| **C** Double Chance + longer MLB | Turkey or Draw -400 (75%) | Marcell Ozuna HRR U2.5 -137 (5/5) | **+116** | **$216.24** | lowest-variance WC market **and** hits target; swaps the acceptable Gelof leg |

## Final decisions (operator-confirmed)
- **Lane A:** replaced Jax with **Nick Gonzales HRR Under 2.5 -112** (5/5, survival 87). USA ML kept. **+204 → $601.56.**
- **Lane B:** operator chose **Turkey or Draw (Double Chance)**. During execution, the chosen Ozuna leg was found to be a **Pirate in Gonzales's PIT@COL game** (cross-lane correlation / not four distinct games), so it was swapped to the same-market-type **Rhys Hoskins HRR Under 1.5 -146** (5/5, CLE@HOU). Lane B = **Turkey or Draw -400 + Hoskins = +111 → $210.62.**
- Result: four distinct games (USA/AUS, PIT@COL, TUR/PAR, CLE@HOU); both MLB legs 5/5; no pitcher-K-under leg remains; exposure unchanged ($297.88).

## Phase 7 — display gaps found + fixed
- WC projection rows have **`homeCode: null`** for USA + Turkey (away codes AU/PY present) → home-team flags don't render. Root cause of the missing USA/Turkey flags.
- BB leg rows do not surface opponent + kickoff/game time.

## Guards
No fabrication; pre-event only; protected `public/data/bank-builder/*` untouched; canonical labels; no banned copy; DNB ≠ Double Chance never conflated.
