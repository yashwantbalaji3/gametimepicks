# `soccer/epl/fixtures/`

One artifact per fixture-list capture. Each row is a fixture with:

- `eventId` — ours, from `deriveEventId({ sport: "soccer", league: "epl", participants, kickoff })`.
  Kickoff is truncated to the **minute**, which is what separates the two league meetings of a club
  pair and a replayed fixture from the one it replaces.
- `homeClub` / `awayClub` — canonical names resolved through the EPL naming index. A spelling the
  index cannot name is *rejected*, never written through raw.
- `kickoffIso` — UTC. Part of the identity, so it is never adjusted after the fact.
- `lifecycle` — `SCHEDULED` / `FINAL_FT` / `POSTPONED` / `ABANDONED` / `REPLAYED`. `UNKNOWN` is
  rejected at validation: fail closed rather than assume `SCHEDULED`.
- `providerRefs` — upstream aliases (`odds-api` event id, results-source fixture id). Never identity.
- `capturedAt` — when we observed this row.

## Committed contents

`sample-2026-27-round-01.json` — `FIXTURE_SAMPLE`, `"public": false`, `source: "synthetic"`.
Not a capture, not the official 2026-27 fixture list, and not a claim about which clubs contest the
season. It exists to pin the schema and to give the internal preview surface something real to render
before the first ingest. It deliberately includes the same club pair at two kickoffs (a `POSTPONED`
fixture and its `REPLAYED` replacement) so the identity distinction is visible in a committed file
rather than only in a test.

No row carries a result: no official EPL results source has been approved. See
`docs/EPL_RESULTS_SOURCE_DECISION.md`.
