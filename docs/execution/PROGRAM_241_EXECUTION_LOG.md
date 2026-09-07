# Program 241 · execution log

Charter: live-audit resolution (A01–A24), four-sport UX coherence, friends-beta readiness.
Continues in the P240 session (same context; P240 evidence carried, re-verified where charter
requires).

## Phase 0 (2026-09-07 11:10 ET / 15:10 UTC)

- Clock 15:10Z · local = origin = `96473c63b` (bot: UFC post-card grading) on top of P240 tip
  `5a858d91b`. Working tree clean but for preserved untracked (vp/, HANDOFF). CI green through
  `aeaca6e9e`; prod verified serving P240 tree earlier today (re-verify after next deploy).
- Daily pipeline state at 15:10Z: morning-projections (13:30Z cron) not yet fired (drift) →
  mlb-daily-production and daily-products pending → Sep-7 board/cards legitimately unpublished.
  The audit's "September 7 unpublished" observations were taken in exactly this window. The
  daily-products workflow_run watcher (P240 acceptance) remains armed.
- A04 hypothesis (NFL "conflicts with P240's 16 forecasts"): P240 never claimed Week-1 FORECASTS
  exist — they generate inside each game's event window (first pass Sep-9 14:30Z). The audit saw
  the correct pre-generation state (schedule yes, forecasts 0) plus the hub's archive-first
  section order. To verify rendered: prod /nfl shows all 16 Week-1 rows ("The rest of Week 1",
  verified in P240 on the deployed export). Resolution = ordering/labeling, not a data-owner
  disagreement — will re-verify rendered before closing.
- P240 evidence classes for the charter's §3 note: Sep-6 card repair = REPAIRED evidence;
  run-34128380515's no-op replay = replay evidence; the NEXT natural generation+settlement cycle
  (Sep-7 cards, tonight) = the fresh full-lifecycle observation, pending. Sep-4/5 receipts are
  pre-P240 format (zero-leg placeholder era) — catch-up holds them honestly; evidence recovery
  optional, low value (no legs existed).

## A-register (updated as work lands; dispositions: OPEN / IN-RELEASE / FIXED / VERIFIED-CLOSED / RECHECKED-STALE / NAMED-GATED)

| ID | Class | Owner (to fill from mapping) | Disposition |
|---|---|---|---|
| A01 | today-scoping (home strongest reads) | | OPEN |
| A02 | today-scoping (home featured sims) | | OPEN |
| A03 | stale capability copy (home tiles) | | OPEN |
| A04 | NFL hub order/current-week first | | OPEN |
| A05 | EPL priced-state reconciliation | | OPEN |
| A06 | today-scoping (EPL player reads) | | OPEN |
| A07 | EPL validation scope labeling | | OPEN |
| A08 | UFC bout-row actions | | OPEN |
| A09 | UFC tense/event-state | | OPEN |
| A10 | simulate no-games vs unpublished | | OPEN |
| A11 | MLB hub child copy inherits period | | OPEN |
| A12 | /today one-population-per-section | | OPEN |
| A13 | risk taxonomy drift | | OPEN |
| A14 | parlay center archive vs current | | OPEN |
| A15 | card-page records vs results streams | | OPEN |
| A16 | settled vs decisive denominators | | OPEN |
| A17 | results explorer placement | | OPEN |
| A18 | bank-builder state machine copy | | OPEN |
| A19 | moonshot reconciliation | partially fixed in P240 | RECHECK |
| A20 | stale capability (sports/mr-dub) | | OPEN |
| A21 | system-status scope | | OPEN |
| A22 | navigation consolidation | | OPEN |
| A23 | UFC narrative pronouns/claims | | OPEN |
| A24 | about/learn stale content | | OPEN |

## Release plan

R1 truth/freshness (A01 A02 A06 A09 A10 A11 A12 + A05's header half) →
R2 IA: nav + homepage + hub order (A22 A04 A17-placement) →
R3 publication/reachability (A04-data A05-data A08) →
R4 player polish →
R5 products (A13 A14 A18 A19) →
R6 results (A15 A16 A17) →
R7 copy/support/beta ops (A03 A07 A20 A21 A23 A24) + final QA matrix.
Each release: gate, commit, verify journey.
