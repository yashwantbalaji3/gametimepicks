# June 20 autonomous public-finished-state run

_Branch `june20-public-finished-state-autonomous` off main `fcd21eee`. Started 2026-06-20 12:19 UTC (08:19 ET). Autonomous run — settle nothing new (June 19 already final), take the live site to a June-20 public-ready finished state._

## Live-data reality at 12:19 UTC
| item | finding |
|---|---|
| Keys | ODDS_API_KEY ****2a97 (paid) · API_FOOTBALL_KEY ****c7fa · credits **18,530** (floor 2,000) |
| June 19 settlement | intact: Lane A advanced, Lane B stopped, Moonshot stopped (lost); Mr. Dub $9,776.17 / $0 / 9-6 / Moonshot 0-1 |
| **Lineups** | **NOT posted** — Netherlands/Sweden + Germany/Ivory Coast both `NS`, 0 startXI (~4.7h pre-kickoff). Roles stay **projected** (`lineup_pending_projected_role`); no confirmed-starter upgrade today. |
| Tunisia vs Japan | odds now posted, but commence **2026-06-21T04:00Z = June 21 ET** → it is the NEXT slate, NOT June 20 ET. Correctly excluded from June 20. |
| June 20 ET slate | Netherlands/Sweden (17:00Z), Germany/Ivory Coast (20:00Z), Ecuador/Curaçao (00:00Z+1 = June 20 ET 20:00) — all pre-event |

## Audit
| area | current state | source | issue | required action | launch gate |
|---|---|---|---|---|---|
| June 19 settlement | correct + live | artifacts | none | preserve (display only) | unchanged |
| Bank Builder Lane A | advanced, $601.56 riding to Step 3, no card | dual-bank-builder-active | needs a Step 3 candidate | place a clean team-market Step 3 (no lineups → team markets), else leave awaiting | clean or awaiting |
| Bank Builder Lane B | stopped | same | needs restart candidate | place a clean low-volatility restart, else awaiting | clean or awaiting |
| Moonshot | stopped | moonshot-lane/active | restart policy after a stop is unspecified | generate a **candidate** (no active exposure) | candidate only |
| Mr. Dub | $9,776.17 / $0 | portfolio | reflects settlement | regenerate after any placement | accurate |
| Results | settled June 19 via BB/Moonshot/Mr.Dub | artifacts | fine | none | accurate |
| June 20 WC projections | live (8h old) | world-cup/*/latest | refresh odds for public-ready state | guarded re-pull `--date 2026-06-20` | current |
| June 20 player props | live, projected roles | same | lineups still pending | re-pull; keep projected-role gate | role-screened |
| June 20 WC Specials | 5 role-screened live | world-cup-specials.json | regen on refreshed odds | regenerate, ≥1 key attacker per card | passes gates |
| June 20 suggested parlays | live | parlays/coverage | regen on refreshed slate | regenerate coverage + diagnostics | reconciles |
| June 20 MLB/Mixed | none | — | attempt full coverage if June 20 MLB odds exist | guarded MLB pull, generate, else honest empty | real or diagnostic |
| homepage / world-cup / picks / parlays / build / bank-builder / mr-dub / today / results | live June 20 | — | verify clean | full QA both domains | 200 + clean |
| protected crown history | immutable | public-ledger | — | never touch | unchanged |
| secrets | in .env | — | — | never print/commit | clean |

## Bank Builder / Moonshot next-step candidates (Phases 5-7) — decision: documented, NOT auto-placed
Lineups are **not posted**, so the Bank Builder methodology's strongest evidence (confirmed starters) is unavailable, and the active-bankroll artifacts can only be advanced/restarted by hand-edit (the engine builds fresh runs, it does not advance a Step 3 / restart a stopped lane). With the user away and unable to course-correct, I **do not auto-mutate the tracked bankroll** — the task explicitly allows "leave awaiting + show candidate diagnostics." The honest public state stands: **Lane A advanced (riding $601.56, awaiting Step 3), Lane B stopped (awaiting restart), Moonshot stopped.** Exposure $0. Clean candidates for operator approval:

| next step | candidate | combined | stake → return | gate check | decision |
|---|---|---|---|---|---|
| Lane A Step 3 | Netherlands ML (−139) + Germany ML (−220), 2 distinct WC games, team markets | **+150** | $601.56 → **$1,504** (clears the $1,400 Step-3 rung) | pre-event ✓ · settlement-supported ✓ · not extreme (>−500) ✓ · no −1000 ✓ · no player/lineup dependency ✓ · 2 distinct games ✓ | **clean candidate — awaiting operator confirm** (not auto-placed; draw risk on 2 MLs is the only variance) |
| Lane B restart | only 3 WC games (2 used by Lane A) → a fully distinct-game clean WC+WC combo is constrained; cleanest is 1 WC (Ecuador/Curaçao) + 1 MLB team ML, which needs an operator's MLB favorite pick | ~+120..+200 | $100 → ~$220..$300 | needs MLB-leg selection (operator judgment) | **awaiting restart** — surface candidate, do not force |
| Moonshot restart | a high-volatility WC card exists (e.g. the +2402 role-screened special: Turkey ❌ replaced by June-20 key attackers); restart-after-stop policy is unspecified | +700..+3000 | $25 | role-screened ✓ but policy uncertain | **candidate only** (no exposure) per Moonshot policy uncertainty |

## June 20 public board (engine-generated from refreshed data)
WC single-game 34 · WC multi-game 18 · MLB 15 · Mixed 15 · Moonshot 0 (stopped) · Bank Builder 1 (Lane A) · **grand 83**. WC Specials: 5 role-screened cards (each ≥1 key attacker or ≥2 projected starters).

## Guards
No fabrication; pre-event only; no bench/rotation/unknown WC player legs in public cards; team markets for Bank Builder (lineups pending); Moonshot candidate-only; strict odds bands; protected crown untouched; `.env` never committed; canonical/allowed copy only.
