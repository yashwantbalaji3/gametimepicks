# June 20 away-day autonomous finished-state

_Branch `june20-away-day-autonomous-finished-state` off main `5af237c9`. Started 2026-06-20 15:39 UTC (11:39 ET) — user away ~11:30 ET for several hours._

## Runtime reality (verified, not assumed)
| area | current source | state | issue | action | launch gate |
|---|---|---|---|---|---|
| Production SHA | git | `5af237c9` (PR #544), clean tree | — | branch off it | — |
| GitHub Actions | `gh workflow list` | **"World Cup lineup-aware refresh" active** (registered) | — | none | ready |
| Repo secrets | `gh secret list` | **`ODDS_API_KEY` + `API_FOOTBALL_KEY` PRESENT** (+ BALLDONTLIE) | — | none — runners CAN pull | ready |
| Repo variables | `gh variable list` | no `MODE` var → workflow defaults **`preview_only`** (won't write prod); `ENABLE_ODDS_REFRESH=true`, `ODDS_DRY_RUN=true` | unattended prod writes OFF by design | keep preview_only (prompt default `AUTO_LAUNCH_LINEUP_REFRESH=false`) | n/a |
| WC June 20 fixtures | API-Football + projections | NED/SWE 17:00Z (fx 1539007), GER/CIV 20:00Z (fx 1489393), ECU/CW 00:00Z+1 | — | included | pre-event |
| Tunisia/Japan | schedule | 04:00Z = **June 21 ET** | — | excluded (next slate) | — |
| **Lineups** | API-Football `/fixtures/lineups` @15:56Z | **NOT posted** — NED/SWE startXI 0, GER/CIV startXI 0 (both `NS`); Brazil/Haiti + Türkiye/Paraguay = FT (June 19) | lineups not up yet (T-64) | **background poll** to NED/SWE window close 16:45Z | confirmed only if XI posts |
| Odds/board | `world-cup/projections/latest.json` | **current** — generatedAt 12:26Z today; NED −139, GER −220, ECU −800 (de-vigged) | none | no re-pull (fresh, pre-event) | current |
| WC Specials | `world-cup/world-cup-specials.json` | date 2026-06-20, 5 role-screened cards (projected roles) | none | regen only if XI posts | current |
| Suggested parlays | `parlays/coverage-matrix.json` | date 2026-06-20, grandTotal **83** (WC-single 34, WC-multi 18, MLB 15, Mixed 15, moonshot 0, BB 1); Low Risk only in WC-multi (3), other Low buckets carry explicit empty reasons | none | none | current |
| **Bank Builder Lane A** | `methodology/launch/dual-bank-builder-active.json` | currentStep 3, **advanced + awaiting $601.56** (Step1 won $100, Step2 won →$601.56) | stored `replacementCandidates` are STALE (Morocco/Skubal, not today) | **HOLD** awaiting; candidate = NED ML −139 + GER ML −220 (+150 → ~$1,504) | held |
| **Bank Builder Lane B** | same | currentStep 1, **stopped** (June 19 loss: Turkey/Draw + Hoskins) | — | **HOLD** awaiting restart | held |
| **Moonshot** | `moonshot-lane/active.json` | **stopped** 0-1 (Turkey/Draw leg lost), stake $25 | no restart policy | **HOLD** candidate-only | held |
| MLB / Mixed | `parlays/coverage-matrix.json` | current (15 / 15), generated 12:31Z today | none | none | current |
| **UFC** | `ufc/*-latest.json` | only **June 15** "Freedom 250: Topuria vs. Gaethje" (settled, status final); `/ufc` **fail-closed** (`publicPicksVisible=false`, "data pending"); Today lead block hidden (`!ufcSettled`) → shows only as settled recap | no June 20 data / generator in repo | **no fabrication** — keep results-only; operator runs UFC ingest for June 20 | honest |
| Mr. Dub | `mr-dub/portfolio.json` | currentBankroll **$9,776.17**, crown $10,376.17, openExposure **$0**, record **9-6**, Moonshot 0-1 | none | none | accurate |
| Protected crown history | `public/data/bank-builder/*` | June 9-18 ledgers + crown ladder | — | **never touch** | unchanged |
| Vercel domains | curl | canonical `gametime-picks.vercel.app` live; secondary `gametimepicks.vercel.app` → Vercel `NOT_FOUND` (unbound) | secondary domain binding | verify canonical | — |

## Decisions + rationale
- **Lineup windows:** I can realistically be present only for the **NED/SWE window** (opens 16:00Z, target 16:15Z, closes 16:45Z). GER/CIV (19:15Z) and ECU/CW (23:15Z) are hours out — beyond this session. A background poll watches NED/SWE; if the official startXI posts I regrade to confirmed starters, regenerate Specials, and ship one reviewed production PR. If it does not post by 16:45Z, roles stay **projected** (honest).
- **Bank Builder / Moonshot — HOLD all.** Autonomous-away-day principle: place only items that are clean team-only / all-gates-pass / match the documented candidate / carry no lineup or fabrication risk **and** are low-regret while the user cannot review. Lane A Step 3 (NED ML + GER ML) passes the card gates, but placing flips Mr. Dub exposure $0→$100 and cascades into derived ledgers + settlement-sensitive tests; with `AUTO_PLACE_BANK_BUILDER=false` and the user away, the lower-regret choice is to **hold and surface the candidate** (Objective #6 accepts "placed **or** held"). Lane B + Moonshot are discretionary restarts → hold.
- **MODE stays `preview_only`.** Enabling unattended production writes (`MODE=auto_public_board`) is a safety-relevant change the prompt defaults OFF (`AUTO_LAUNCH_LINEUP_REFRESH=false` "unless user intentionally wants auto production board writes"). The user did not opt in → I do not flip it. Documented as a one-step operator action for the later windows.
- **UFC — no fabrication.** Real June 20 event verified externally but no repo data/generator; kept results-only.

## Outcome — NED/SWE lineups POSTED (16:00Z), confirmed-starter regrade shipped
The background poll caught **Netherlands/Sweden's official startXI at 15:57Z** (GER/CIV + ECU/CW still NS — later windows, beyond this session). I fetched the XI (NL 4-3-3: Gakpo/Malen/Brobbey up top; SE 3-1-4-2: Gyökeres + Isak) and regraded:

- **Per-team scoping fix (correctness):** the regrader's `confirmedStarters` was a flat name-set — with only NED/SWE posted it would have wrongly **benched** GER/CIV + ECU/CW attackers (not in the set). Added `postedTeams` so a player is confirmable/benchable **only when their own team's XI is posted**; un-posted teams stay projected. Also made name-matching accent-robust (Gyökeres ⇄ Gyokeres).
- **Production Specials regenerated** (`auto_public_board`, reviewed): 5 cards, all pre-event (KO 17:00Z, generated 16:04Z), bands intact (+1045…+2402, legs −250…+200), **4 confirmed starters** (NED/SWE in-XI) + key/projected for the rest. Out-of-XI NED/SWE proppees correctly **benched** (excluded).
- **Honest labels:** per-leg note follows the leg's own role ("confirmed starter — in the official XI" vs "projected role"); per-card summary reads "(N confirmed, M lineups pending)". UI fix: the homepage box now renders a distinct **"Confirmed starter"** badge (was lumped under "Key attacker") — verified desktop + mobile (375px, no overflow, no console errors; Isak shows CONFIRMED STARTER, Ecuador player shows PROJECTED STARTER).
- **Coverage-matrix** content unchanged (parlay engine is XI-independent) → reverted the timestamp-only churn.

**Later windows (GER/CIV 19:15Z, ECU/CW 23:15Z)** are beyond this session. The live workflow + secrets are ready; set repo var `MODE=auto_public_board` to let it write production unattended at those windows (default stays `preview_only`).

**Gates:** tsc clean · **1187/1187 tests** (+4 new: partial-slate scoping, accent match, box badge, live snapshot) · build OK · audits clean (no banned copy / no `-1000` generated legs / no secrets / protected+bankroll untouched) · desktop + mobile QA clean.

## Decisions ledger (Phase 7-9)
| item | decision | gates | why |
|---|---|---|---|
| Lane A Step 3 | **HELD** (awaiting $601.56) | card gates pass (NED ML −139 + GER ML −220 = +150 → ~$1,504, team-only, pre-event) | placing flips exposure $0→$100 + cascades into ledgers/settlement tests; `AUTO_PLACE=false`, user away → lower-regret hold; candidate documented for one-click placement |
| Lane B restart | **HELD** (awaiting) | — | discretionary fresh $100; avoid over-exposure while away |
| Moonshot | **HELD** (candidate-only) | — | no restart policy; high-volatility; not auto-placed (`AUTO_PLACE_MOONSHOT=false`) |

## Guards
No fabrication (incl. UFC); pre-event only; bankroll not placed (held, flags false); protected crown untouched; secrets never printed/committed; MODE stays preview_only for unattended runs; canonical/allowed copy only.
