# June 20 lineup-aware automation + public finished-state

_Branch `june20-lineup-automation-public-finished-state` off main `33345ca4`. Started 2026-06-20 13:14 UTC (09:14 ET)._

## Live reality at 13:14 UTC
| item | finding |
|---|---|
| Keys (local `.env`) | ODDS_API_KEY ****2a97 (paid) · API_FOOTBALL_KEY ****c7fa · credits **18,462** (floor 2,000) |
| **Lineup windows** | ALL games **pre-window** — earliest (NED/SWE, KO 17:00Z) opens its window at 16:00Z (T-60), ~2h45m out. No lineups posted yet → roles stay **projected**. Nothing to refresh now; the automation runs the refresh later when windows open. |
| June 20 ET WC slate | Netherlands/Sweden 17:00Z · Germany/Ivory Coast 20:00Z · Ecuador/Curaçao 00:00Z+1 — all pre-event |
| Tunisia vs Japan | 04:00Z = **June 21 ET** → still the next slate, correctly excluded |
| **UFC** | **Real event exists** — ESPN UFC scoreboard shows **UFC Fight Night: Kape vs. Horiguchi (June 20)**. BUT the repo's UFC surface is built from a manual/CSV ingest (`ufcstats_csv.py`), not a one-command `generate_ufc_board --date`; the last ingested event is June 15 (settled). Generic Odds-API MMA today is mostly a non-UFC European promotion. **Honest call: verified + documented, NOT fabricated** — UFC stays results-only until the operator runs the UFC ingest. |
| June 19 settlement | intact (Lane A advanced, Lane B + Moonshot stopped; Mr. Dub $9,776.17 / $0 / 9-6 / Moonshot 0-1) |
| GitHub secrets | the workflow needs `ODDS_API_KEY` + `API_FOOTBALL_KEY` configured as **GitHub Actions secrets** — the local `.env` is NOT available to runners. I cannot set repo secrets (operator action). The workflow ships **dormant-safe** (auto-flags default `false`, mode `preview_only`). |

## Audit
| area | current state | source | required action | launch gate | notes |
|---|---|---|---|---|---|
| GitHub Actions | none for lineups | — | add `lineup-aware-refresh.yml` (cron + dispatch) | preview-safe default | needs operator to add GH secrets |
| Lineup watcher | none | — | add `scripts/watch-worldcup-lineups.mjs` | tested | computes 45-min windows + API-Football lineup check |
| Lineup-aware refresh | manual | pipeline | add `scripts/refresh-lineup-aware-slate.mjs` (regen) | preview-safe | reuses pipeline pulls + JS regen |
| Role regrader | projected-only | `player-role-quality.ts` | enhance: accept confirmed startXI → confirmed_starter / exclude bench | tested | honest confirmed-starter upgrade |
| WC projections / props / specials / parlays | live June 20 | latest | no refresh now (pre-window, no lineups) | current | automation refreshes later |
| MLB / Mixed | live (15/15) | engine | no change | current | |
| UFC | results-only (June 15) | ufc artifacts | document real June 20 event; no fabrication | honest | operator UFC ingest = next step |
| Lane A Step 3 / Lane B restart / Moonshot | awaiting / stopped | artifacts | candidate-only (auto-flags false; lineups pending) | not auto-placed | bankroll preserved |
| Mr. Dub / Results | accurate | artifacts | none | unchanged | |
| protected crown | immutable | — | never touch | unchanged | |
| secrets | local `.env` | — | never print/commit | clean | |

## Plan
1. `scripts/watch-worldcup-lineups.mjs` — load the WC slate, compute windows, query API-Football lineups, write `automation/lineup-refresh-status.json` + GH outputs.
2. `scripts/refresh-lineup-aware-slate.mjs` — JS regen (role regrade → specials → coverage → status), preview-mode-safe (never writes production in `preview_only`).
3. `.github/workflows/lineup-aware-refresh.yml` — `*/15` cron in the WC window + `workflow_dispatch`; runs the watcher, then (when `refresh_needed` and flags allow) the pulls + regen. Auto-flags default `false`/`preview_only`.
4. `player-role-quality.ts` — accept a confirmed-startXI set: in-XI attackers → `confirmed_starter`, with-props-but-out-of-XI → `bench_risk` (excluded). Projected behavior unchanged when no XI.
5. Tests (watcher window logic + role confirmed/bench), build, audits, QA, PR, merge, deploy.

## Guards
No fabrication (incl. UFC); pre-event only; bankroll not auto-placed (flags false); protected crown untouched; secrets never printed/committed; automation dormant until operator adds GH secrets; canonical/allowed copy only.

## Outcome (built + verified)
| deliverable | file | state |
|---|---|---|
| Lineup watcher | `scripts/watch-worldcup-lineups.mjs` | pure `computeRefreshWindows` (KO−60…−15; target −45) + API-Football XI check + GH outputs; **6 watcher tests pass** |
| Lineup-aware refresh | `app/scripts/refresh-lineup-aware-slate.mjs` | preview-isolated regen of role-screened Specials + coverage; fetches official startXI only when posted; **`preview_only` never writes production** (verified) |
| Role regrader | `app/src/lib/world-cup/player-role-quality.ts` | `classifyPlayerRoles(rows, lineupsPosted, confirmedStarters?)` — in-XI attacker → `confirmed_starter`; props-but-out-of-XI → `bench_risk` (excluded); unknown excluded; projected when no XI; **4 regrader tests pass** |
| GH Actions | `.github/workflows/lineup-aware-refresh.yml` | `*/15` cron across the June 20 ET window + `workflow_dispatch`; defaults `mode=preview_only`, auto-place flags `false`; needs operator GH secrets `ODDS_API_KEY`+`API_FOOTBALL_KEY` |

**Honest run at 13:33 UTC:** all 3 games **pre-window** (NED/SWE 206′ to KO → window opens 16:00Z, target 16:15Z; GER/CIV 386′; ECU/CW 626′). `apiFootball: absent` locally (no key in CI env) — windows still computed, no fabrication. `refresh_needed=false` → nothing to refresh now; the workflow runs the refresh later when a window opens. Preview sample written to `app/public/data/previews/lineup-refresh/2026-06-20/` (5 cards, projected roles, coverage 83). Production Specials/coverage/Bank Builder/Moonshot/Mr. Dub **untouched**.

**Gates:** tsc clean · **1183/1183 tests pass** (+10 new) · build OK · audits clean (no banned copy in public data; no `-1000` generated legs; no hardcoded secrets; protected artifacts unmodified) · desktop + mobile (375px) QA clean, no console errors.

**Operator follow-ups (cannot be done by the agent):** (1) add repo secrets `ODDS_API_KEY` + `API_FOOTBALL_KEY`; (2) to let the schedule write production, set repo var `MODE=auto_public_board` (default stays `preview_only`); (3) UFC — real June 20 event (Kape vs. Horiguchi) verified but the repo has no one-command generator; run the manual `ufcstats_csv.py` ingest to surface it (kept results-only, not fabricated); (4) Bank Builder Lane A Step 3 (NED ML −139 + GER ML −220 = +150 → $601.56→~$1,504 clears the $1,400 rung) / Lane B restart / Moonshot remain **candidate-only** (auto-flags `false`, lineups pending) — flip the flag or place manually once lineups post.
