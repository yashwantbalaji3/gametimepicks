# Program 108-111 Execution Log (2026-08-03, 10:15–11:15 ET)

Recovery: local `32598eb2` → origin/main `71fe291c` (one bot commit: pregame archive metadata,
reconciled by fast-forward). `bbd2bdd9` confirmed an ancestor of main. Production `059f95fd`.
2 historical stashes and `vp/` untouched; protected hashes verified before and after.

## Phase 0 classification (as found)

| Item | Classification |
|---|---|
| Stale-site root cause · contract allowlist · boardless settle skip | ALREADY_PROVEN (not reopened) |
| Aug 3 09:30 morning refresh | **MISSED** — GitHub cron never fired; watchdog correctly did not dispatch (board existed) |
| Append-only scheduled patch wiring | classification layer SHIPPED; writer BLOCKED (see below) |
| 15:30 top-up decision | OBSERVATION_PENDING — will run with the new classifier |
| Vercel bot-challenge classification | SHIPPED |
| Aug 3 population freeze | SHIPPED (per-event manifest) |
| Aug 3 settlement / second contract proof | WALL_CLOCK_PENDING (assertions written) |
| Analytics / Vercel email | FOUNDER_ACTION (checked once each, unchanged) |

## Files touched (paths resolved before editing)

`app/scripts/mlb-topup-decision.mjs` (+`classifyEvents`, `EVENT_STATES`) ·
`app/scripts/mlb-topup-classify.mjs` (new, read-only report) ·
`app/src/lib/mlb-topup-decision.test.mjs` (+6 event-level proofs) ·
`app/src/lib/mlb/board-patches.mjs` (identity fix) + `.test.mjs` (+1 real-row proof) ·
`app/src/lib/mlb/base-immutability.test.mjs` (new guard) ·
`app/src/lib/deployment-verification.mjs` + `.test.mjs` (new, 9 proofs) ·
`app/scripts/public-beta-observe.mjs` (BOT_CHALLENGE state) ·
`.github/workflows/mlb-afternoon-topup.yml` (classification step).

## Two defects found and fixed before they could reach production

1. **Row-identity collapse (`ee56b83c`).** Computing the cutover manifest showed 211 rows → 206
   identities. Not duplicates — *different players* (Tena/Nunez, Herrera/Caballero/Fermin,
   Pena/Gimenez/Sanchez) whose `playerId` and `player` are both null in production, so the
   composite fell back to the literal `"team"`. Under the patch contract an official addition
   for a different player at the same market/line/side would have been **refused as a duplicate
   and silently dropped**. Identity now prefers the pipeline's canonical row `id`; live board is
   211 → 211. *The cutover ritual itself surfaced this — no synthetic fixture had.*
2. **cwd-dependent guard.** The new immutability guard passed from `app/` but found nothing from
   the repo root. Resolved relative to the file, per repo convention.

## Judgment call recorded: the official-addition writer was NOT shipped

`generate_mlb_board.py` has **no single-event scoping** — no code path produces rows for one
event, and producing a lean row runs the projection framework, not just an odds fetch. Building
it today meant new code in the **paid** path, touching the projection pipeline this program
forbids altering, shipped to an **unattended** workflow hours before it fires. That is the exact
pattern behind the last two incidents. Specification written instead
(`APPEND_ONLY_PATCH_SCHEDULED_PRODUCTION_PROOF.md` §"Remaining work").

## Validation

Full suite **3,639 tests / 0 failures** (+19 new this program). Protected money
`affe6b21…` / `cb80473f…`, 19-14, $19,065.40 — unchanged. Duplicate Vercel project still frozen
at 2026-07-31T17:16:04Z. Credits: **0 spent this program** (classification is free).
