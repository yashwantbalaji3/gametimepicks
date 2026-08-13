# NFL Event-Day Runbook (Program 169 · Release K)

Sequenced around real kickoffs (ET-aware, from the committed schedule capture — never one fixed
clock). Every step reads receipts; none fabricates. The instruments named here all exist and are
guard-tested: captures (schedule/results/rosters/injuries), player identity registry, participation
pool, game-sim, TD engine, End Zone Vault, settlement contracts.

## T-24h — sources & identity
1. Cadence verified (`verify-cadence-receipts.mjs --run <id> --before <sha>`): nfl-schedule + results steps green or explained.
2. Roster capture fresh enough (168h bound): `node scripts/nfl/capture-nfl-rosters.mjs --now <iso>` if not; registry must build with quarantines reviewed (`buildPlayerRegistry` accounting exact).
3. Event identity: providerEventId present in ≥2 captures (pre-event lineage — the CAR@ARI lesson).

## T-6h — roster / injury / market check
1. Injuries artifact fresh (24h bound) — staleness widens every player to UNKNOWN and that is the answer.
2. Odds lane state on /launch: AUTH_REQUIRED unless a founder receipt landed; if authorized, ONE guarded canary within its ceiling, then re-derive availability.
3. Participation pool build (`buildActivePool`): preseason players stay ROLE_UNCERTAIN without dated+sourced snap scenarios; record any scenarios as expiring artifacts.

## T-90m — participation freeze & no-play review
1. Re-run the pool with the freeze clock; expired scenarios drop out loudly.
2. TD engine boards: gates decide PUBLISHABLE vs MODELLED_NOT_PUBLISHABLE; End Zone Vault builds ACTIVE / BOARD_ONLY / NO_VAULT — append the day's ledger entry via `validateVaultLedgerAppend` (duplicate dates refuse; corrections add lineage).
3. Private game-sim artifacts (PRESEASON_CONSERVATIVE variant in preseason) generate with the artifact-date seed; publicActivation stays OFF absent the activation gate.

## Kickoff — lock
No generation past kickoff: post-start artifacts are REFUSED by contract, not patched.

## Postgame — result join
1. Next cadence captures the final; `loadCurrentNflResults` must show the event JOINED (integer scores, seasonType preserved, reconciliation exact).
2. Anytime-TD settlement (`settleAnytimeTd`): scoring-player credit wins; passer-only credit loses; DNP/postponed void; pending is never a loss. Only artifacts that existed pre-kickoff settle; coverage-only otherwise.

## Next day — corrections
`monitorNflResults` classes (SCORE_CORRECTION / STATUS_REGRESSION / DISAPPEARED_UNEXPECTED) are review-gated, append-only; nothing regrades silently.

## Incident boundaries
Source outage → last-known-good STALE, never an empty slate. Identity ambiguity → quarantine.
Credit anomaly → stop. Protected money is untouchable by every NFL path (separate Vault ledger).
