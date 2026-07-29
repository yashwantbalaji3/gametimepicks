# Multi-Sport Promotion Gates — Durable Policy

**Status:** RATIFIED (Program 058–061). A sport is promoted by passing gates, never by having a page, a scaffold, or founder enthusiasm.

## The six gates (all must pass to leave scaffold status)

| # | Gate | Pass requirement |
|---|---|---|
| G1 | **Official results source** | Free, machine-readable, per-event official data (the MLB StatsAPI standard). Settlement from snippets or scraping is banned platform-wide. |
| G2 | **Identity reliability** | Proven injective join between odds-provider events and the results source; alias-collision refusal wired; repeated-participant events (doubleheaders, rematches, replays) provably distinct. |
| G3 | **Leakage safety** | Per-row `capturedAt < eventStart` enforcement from the first artifact. Never retrofit. |
| G4 | **Settlement quality** | Automated, lineage-gated, mutation-tested settlement with quarantine semantics and fail-closed behavior for postponed/abandoned/no-contest events. |
| G5 | **Evaluation capability** | A realistic path to ≥5,000 decisive settled rows before any public probability claim; identical-row model/market comparison machinery if a model exists. |
| G6 | **Product value** | The sport serves the research-terminal thesis (§ strategy doc) — calibration transparency and market intelligence — not content volume. |

**Promotion levels:** `SCAFFOLD_ONLY → MARKET_INTELLIGENCE (no model) → RESEARCH_MODEL (shadow only) → FULL_MODEL`. Each level requires founder sign-off recorded in the program ledger of the sprint that promotes it.

## Current status (audited 2026-07-29)

| Sport | Level | Gate blockers |
|---|---|---|
| MLB | FULL_MODEL (reference implementation) | — (model itself suspended for superiority claims per Lane C) |
| NBA | HISTORICAL_ONLY | G2 untested at scale, G3 not wired, G4 dry-runs needed; **first expansion candidate** (Lane D) |
| Soccer/EPL | SCAFFOLD (EPL target: MARKET_INTELLIGENCE) | legacy schema fragmentation, competition-aware identity, G4 policy per competition (Lane E) |
| UFC | SCAFFOLD_ONLY | G1 (no official free API), G2 (rematch-unsafe join — repair in Lane F), G4, G5 (sparse volume) |
| NHL | SCAFFOLD_ONLY | behind NBA on G5/G6 priorities; same season window |
| NFL | DISABLED (market-intelligence candidate only) | G1 partner-gated, G5 structurally thin (~272 games/season) |
| IPL | SCAFFOLD_ONLY | G1 unreliable, season ended |

## Anti-patterns (each one has already burned us)

- Promoting because artifacts exist (NBA pages ≠ NBA readiness).
- Joining events by participant names without event/date identity (UFC rematch collision; MLB doubleheader collision).
- Settling from non-official sources (banned since the World Cup era).
- Public probabilities before an evaluable corpus exists (soccer N=5 FIFA-Poisson stayed private — correctly).
