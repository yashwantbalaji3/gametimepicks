# Public Content and Freshness Registry

**Program:** 073–075 · The standing rule every row enforces: **no active route may silently display the last successful slate as current.** Stale current-day data renders an explicit unavailable/stale state; archives label their date range; a rate never appears without its denominator and interval, and quarantined / generation-blocked / zero-denominator groups show no rate at all.

| Route / component | Canonical source | Cadence | Max age before "stale" | Behaviour when stale/missing |
|---|---|---|---|---|
| `/today` slate | `mlb/boards/<date>.json` + availability contract | daily (morning-projections) | same ET day | `SlateLivenessBanner` re-derives the real ET clock → "Latest slate · N days ago", never a false "Live today"; per-game tiers fail closed to report-only |
| `/` hero + status chips | slate pointer + canonical money artifacts | daily | same ET day | chips state the real latest date; money figures only from the md5-pinned canonical |
| `/markets` market center | market snapshots + pairing | intraday captures | capture timestamp shown | stale snapshot framed as dated historical, never blanked, never presented as current |
| `/markets` disagreement explorer | row-lineage sidecar (settled slates) | after each settlement | n/a (retrospective by design) | states its own settled date; only provenance-backed rows listed individually |
| `/results` accounting | canonical results accounting | nightly settle | n/a | five distinct states: In progress / Complete / Incomplete / Withheld (07-28) / Not produced (07-29); pending rows never counted early |
| Game reports | reconciled per-game artifacts | daily | game's own date shown | absent artifact → honest per-section unavailable states, no fabricated sim |
| `/methodology`, `/learn` | terminal-summary contract | after settlement | n/a (reference) | figures carry their as-of date from the contract, not the page |
| `/system-status` | system-status contract (worst-of) | after each pipeline run | contract's own stamp | fail-closed adapter; missing artifact renders as an outage, not as green |
| `/mlb` hub | same as /today | daily | same ET day | same liveness banner contract |
| `/ufc` archive | `ufc/results-settled-latest.json` | frozen | n/a — archive | dated "settled 2026-06-15"; explicit no-record note for the never-settled card |
| `/world-cup-specials` archive | committed specials snapshots | frozen | n/a — archive | RETIRED label + tournament date range; ledger rows immutable |
| `/bank-builder`, `/mr-dub`, `/moonshot`, `/picks`, `/parlays` | md5-pinned money + product artifacts | nightly | product artifact's own stamp | display-only; a missing daily card renders "awaiting qualified card", never a stale card as new |
| Redirect stubs (nba, nhl, ipl, sports, board, projections, trends, events, homer-nukes, parlay-lab, world-cup) | none | n/a | n/a | no content shipped — nothing to go stale |
| `data/build-info.json` | build pipeline | every deploy | n/a | deliberately public: deploy verification reads it from production |

**Enforcement:** freshness is re-derived client-side from the real clock (`FreshnessBadge`), route liveness by `SlateLivenessBanner`, accounting states by `results-accounting.ts` (IN_PROGRESS distinct from CLEAN), the export boundary by the deny-by-default data sweep + `public-route-inventory.test.mjs`, and copy by the export-strings guard. The registry describes intent; those guards are what make it true.
