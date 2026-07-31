# Public Beta — First Observation Plan (seven days)

**Program:** 076–079 · **Window:** 2026-07-31 → 2026-08-06 · One command anchors every day: `cd app && npm run ops:public-beta-observe`.

## Daily checklist (each item reads real artifacts; nothing is inferred)

1. **Pipeline freshness** — newest board = today ET; all five downstream artifact families present for the newest board date; observer shows no STALE warning.
2. **Settlement closure** — newest settled date advances by one each morning; gap-0 accounting on the new date; 07-28 stays Withheld and 07-29 stays Not produced (they never re-enter a denominator).
3. **Native stamping** — observer's `native stamping` line: from 2026-07-31 onward every new board should read `FULLY_STAMPED`, and the ledger-side `lineage acceptance` flips once the first stamped slate settles (first candidate: the 07-31 slate settling on 08-01).
4. **Route health** — six core routes 200 on production; `/data/admin/status.json`, `/ops/`, `/preview/*` still 404; no internal strings (the export guard runs in every build).
5. **Alert path** — if a scheduled run fails, confirm the run summary carries the alert block. Delivery stays log-only until `OPS_WEBHOOK_URL` exists (founder).
6. **Analytics** — mode stays `OFF` unless the founder activates; if activated: staging payload inspection FIRST, then production event counts. No metric leaves `NOT_YET_MEASURED` without a real denominator.
7. **Adoption reads** (only if analytics live) — reach and activation counts recorded daily; **no retention or trend statement before day 7**, and none with a denominator under the contract's minimum.

## What would count as the week's three proofs

- **Repeatability:** seven consecutive boards generated, settled and published with zero manual dispatches.
- **Stamping:** `PROVEN_STAMPED` > 0 from natural generation, growing daily, with no historical row ever promoted.
- **Serialization:** at least one day where two writer workflows overlapped in schedule and both artifacts survived (queue observed in the Actions UI, no discarded board).

## Escalation

A red day (missing board, settlement failure, hash mismatch, boundary regression) triggers: read the workflow log → classify with the failure taxonomy in `DAILY_PIPELINE_RELIABILITY_AND_ALERTING.md` → fix the producer, never the evidence → record in the program log. A green week ends with the first honest adoption review — or, if analytics stayed dark, a one-line conclusion: *the terminal ran itself for a week; measurement remains one founder action away.*
