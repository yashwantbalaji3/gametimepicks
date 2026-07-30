# Public Website Page Audit — 2026-07-30

**Program:** 073–075 · Route totals: **69 → 49 source routes**, **256 → 175 exported HTML files**. Export verified after the deny-by-default data sweep (1,039 internal data files / 328 MB removed from the export, including the admin status payload that carried the money hash). QA at desktop + 375×812: all audited routes 200, exactly one H1, no horizontal overflow, no "UFC Simulations" live framing, archives labelled.

Classifications: KEEP (current public purpose) · REWRITE (kept, copy/content corrected) · REDIRECT (stub → live destination) · ARCHIVE (dated historical record, honestly labelled) · PRUNE (absent from export) · REMOVE (deleted outright).

## Core destinations — KEEP / REWRITE

| Route | Purpose (one sentence) | Canonical data | Audit result |
|---|---|---|---|
| `/` | Explain the research terminal; route to today's research | slate + capability registry | REWRITE — UFC card reframed "UFC · Settled archive · View the record"; hub subtitle no longer claims UFC simulations run |
| `/today` | The current ET slate's research | boards + availability contract | KEEP — July 30, event-time order |
| `/markets` | Market-implied probabilities + the disagreement explorer | market center + row-lineage sidecar | KEEP — denominators/intervals; TB never ranked |
| `/games/[sport]/[gameId]` | One event's market, simulation, provenance, outcome | reconciled game artifacts | KEEP (the bulk of the 175 exported files — one per current-season game report) |
| `/results` (+ children) | Closed accounting and honest history | canonical accounting | KEEP — In-progress / Complete / Withheld / Not-produced states distinct |
| `/methodology`, `/learn`, `/market-guide` | Method in public language | terminal contract | REWRITE — research-terminal framing; difference-not-edge; "Sprint 035" note removed from the glossary |
| `/system-status` | User-facing service status | system-status contract | KEEP |
| `/mlb` (+ board/parlays/power/results) | The one live sport center | MLB artifacts | KEEP — Simulation Center framing reserved for FULL_MODEL |
| `/simulate`, `/build`, `/parlays`, `/picks`, `/bank-builder`, `/moonshot`, `/mr-dub`, `/about`, `/responsible-use`, `/research` | Paper products + reference, display-only | respective canonical artifacts | KEEP — paper-only labelling verified; no forward-edge framing |

## Archives — ARCHIVE (dated, no live implication)

| Route | Ruling |
|---|---|
| `/ufc` | Settled archive of the one graded card (6–1, official ESPN MMA settlement) — restored from a redirect because the record had no other public surface; banner rewritten to public language |
| `/world-cup-specials` | The settled Specials accountability ledger, RETIRED-labelled, restored by adjudication |
| `/nba/results`, `/results/nba` | Historical playoff-run record (HISTORICAL_ONLY sport) |

## Redirect stubs — REDIRECT (bookmarks preserved, no content shipped)

`/nba` `/nhl` `/ipl` `/sports` `/board` `/projections` `/trends` `/events` `/homer-nukes` `/parlay-lab` `/world-cup` (closed destination) — each a ~16-line stub to the live equivalent; the sport-chrome guards assert they claim nothing.

## Removed — REMOVE (20 routes, Program 069, ratified by adjudication)

IPL/NHL `board`/`board/[date]`/`parlays`/`power`/`results` children · NBA `board`/`power` · `results/ipl`, `results/nhl` · World Cup `groups`/`round-of-32`/`round-of-32/[slug]`/`schedule`/`team/[code]`/`teams`.

## Internal — PRUNE (absent from the export, verified)

`/ops`, `/preview/epl`, `/preview/june20` — HTML, route chunks and their data pruned; guarded by `public-route-inventory.test.mjs` (7/7) and `internal-route-exclusion.test.mjs`. The export-strings guard additionally sweeps every shipped HTML file for eleven classes of internal language (proven on synthetic positives/negatives each run; caught the real "Sprint 035" leak on its first run).
