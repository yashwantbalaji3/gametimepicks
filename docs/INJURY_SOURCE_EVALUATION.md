# NFL + NBA Injury Source Evaluation (Program 162 · Release F)

Question: is there a free, authorized source fit for a future injuries capture contract — rights,
identity linkage, timestamps, taxonomy, stale behavior — per the shadow live-input gaps
(`LIVE_INPUT_MATRIX`: NFL `injuries` MISSING, NBA `injuriesLineups` MISSING)?

Probe receipts (2026-08-11 ~20:52 UTC, one keyless request per sport, zero cost):
`site.api.espn.com/apis/site/v2/sports/football/nfl/injuries` → 200, 414 KB ·
`…/basketball/nba/injuries` → 200, 46 KB.

## What the feed provides (observed, not assumed)

| Property | NFL | NBA |
|---|---|---|
| Coverage at probe | 32 teams · 800 entries | 27 teams · 77 entries (off-season) |
| Status taxonomy (closed set observed) | Active · Out · Questionable · Injured Reserve · Suspension | Day-To-Day · Out |
| Per-entry timestamp | 100% (`date`, e.g. `2026-08-11T17:54Z`) | 100% |
| Feed-level timestamp | `timestamp` + `status: success` | same |
| Team linkage | numeric team `id` — the SAME provider team-id space the schedule captures carry (`providerTeamId`) | same |
| Athlete identity | **no top-level athlete id**; recoverable from the playercard link (`…/player/_/id/4870808/…`) — the same ESPN athlete-id space the identity components already use | same gap, same recovery |
| Editorial fields | `shortComment`/`longComment` prose per entry | same |

## Rights

Same public-JSON usage class as the registered `espn_scoreboard` source (point-in-time snapshots
with attribution, no key, no cost). No new provider would be added — a capture contract would
extend the existing registry entry's role, with the registry's exactly-N guard repointed on a
first-use receipt, exactly as the results captures did.

## Verdict: ACCEPT for a capture contract — with two named conditions

1. **Identity condition.** The athlete id must be extracted from the playercard URL and
   cross-validated against the identity components on a real sample before any join is trusted.
   URL-shape parsing is fragile; the contract must refuse an entry whose id cannot be extracted
   rather than fall back to name matching (the no-fuzzy-names law).
2. **Absence condition.** A team or player missing from the feed is **UNKNOWN availability —
   never healthy**. The feed's own semantics prove this: "Active" is an explicit status, so
   absence is not "Active". The adapter contract must encode absence → UNKNOWN, and a
   stale/failed feed must widen uncertainty, never narrow it.

Also observed and binding on any future contract: the taxonomy above is what the feed showed on
one day — the contract must treat unknown status strings as UNKNOWN (closed-set discipline with a
quarantine lane), and editorial prose must never be parsed for availability signals.

## What this evaluation is NOT

No capture contract, no fixtures, no cadence wiring ship with this evaluation — the matrix
entries stay MISSING until a contract with fixtures and a stale-behavior test lands. This
document is the keep/reject receipt the roadmap item required; the contract is its own release
with its own acceptance.
