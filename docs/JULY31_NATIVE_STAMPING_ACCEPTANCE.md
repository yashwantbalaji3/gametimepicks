# July 31, 2026 — Native Stamping Acceptance

**Program:** 076–079 · **Status: ACCEPTED on real generated rows.** The first board produced after the forward-only stamping deploy carries native provenance on every row, from the normal generation workflow, with nothing edited after the fact.

## The acceptance numbers

| Check | Result |
|---|---|
| Board | 2026-07-31, generated 01:28 ET via `morning-projections` (run 30606697599) — the standard workflow path |
| Native stamps | **227/227 rows** carry `eventId` + `capturedAt` + `scheduledStart` + `providerRefs` + `rowSchemaVersion` (`mlb-board-row-1`) |
| Research eligibility | **227/227 derived eligible; 0 rows violate `capturedAt < scheduledStart`** — the earliest first pitch is 18:21Z against a 05:28Z capture (~13h pregame) |
| Identity | `eventId` uses the settlement derivation (e.g. `mlb:chicago-cubs-v-new-york-yankees:20260731t1821`), so the board row and the result that will grade it name the same event to the minute |
| Provider refs | real Odds-API event id + bookmaker recorded from the response, never inferred |
| Guards | 19 identity/stamping tests + `pipeline/mlb/` 58 — including the mutations: stripping `capturedAt` forfeits eligibility; a board-level `generatedAt` cannot rescue a row; capture at/after first pitch is not pregame |
| Observer | `native stamping FULLY_STAMPED · 227/227` — flipped from `NOT_STAMPED 0/425` on the previous board, exactly as the acceptance metric was designed to move |

## Honest boundaries of this acceptance

- **Coverage is partial by hour, not by defect.** 15 games are scheduled; 8 carried posted prop lines at 01:28 ET. The board accounts for what the books had posted — the scheduled morning run refreshes through the same path as lines appear. Nothing was fabricated to fill the slate.
- **`PROVEN_STAMPED` in the research sidecar remains 0 today, correctly.** The sidecar classifies **settled** rows, and the July 31 slate settles overnight into August 1. That is the designed remaining wall-clock step, not a gap: the first natively-stamped slate to settle flips the ledger-side `lineage acceptance` from `NOT_YET_STAMPED` and produces the first `PROVEN_STAMPED` rows. Passive verification: after the Aug 1 `nightly-settle`, run `npm run ops:public-beta-observe` — `lineage acceptance` should report stamped rows on 2026-07-31, then `npx tsx scripts/build-research-row-lineage.mjs --self-test` to confirm the sidecar classifies them natively.
- **No July 30 row was promoted.** The previous board remains `NOT_STAMPED 0/425` and its settled rows `NOT_YET_STAMPED 0/385` — history stays honest; only genuinely new evidence moves the number.
