# Audit — June 17 Slate, Bank Builder Preview & Polish

_Branch `june17-full-slate-bankbuilder-polish` off main `d23e67d`. Follows #508 (engine) / #509 (UI)._

## Reality check (2026-06-17, real time 18:45Z)
| Sport | Status today | Eligible (at 18:45Z) | Notes |
|-------|--------------|----------------------|-------|
| **MLB** | real board (committed `mlb/boards/2026-06-17.json`) | **371 legs** | midday games already started → excluded by the not-started gate; evening games qualify |
| **World Cup** | schedule only (4 matches); **no odds/projections for 06-17** | 0 | one match (POR, 17:00Z) already kicked off; the others have no committed odds |
| **UFC** | last event 06-15 (past) | 0 | date-gated; no event today |
| **NBA** | empty board (off-season) | 0 | honest no-qualified |

## Decision: operator-gated preview, NOT a live launch (owner-approved)
The owner chose **"Ship qualified preview, don't publish live."** The dual Bank Builder **qualifies
MLB-only** at the real moment (Lane A: Ritchie K + Kirby K survival 86; Lane B: Freeman HRR + Adell
HRR survival 80; 4 distinct games, non-correlated, pre-event, odds-backed). It is shown as an
operator-ready **preview** with separate Lane A/B trackers — **no protected `public/data/bank-builder/*`
is written, no active run published.** A soccer leg is genuinely impossible today (no WC 06-17 odds;
not fabricated, no paid speculative fetch), so the soccer-per-lane preference is honestly unmet.

## Why no fresh paid generation
Live The-Odds-API / API-Football generation for 06-17 World Cup was NOT run: it would spend the
owner's paid credits on a speculative call that cannot return 2026 World Cup odds in this environment,
and fabricating is prohibited. MLB's 06-17 board already exists (committed); the engine reads it.

## What this PR ships
- **Dual-BB selector fix**: game-diversified best-four selection (one leg per game first) so two
  game-disjoint lanes form reliably — fixes a false "could not form two lanes" block when high-survival
  legs were concentrated. The engine now correctly qualifies the MLB dual run.
- **World Cup kickoff join** (`sources.ts`): `buildWcKickoffIndex` / `resolveWcPlayerKickoff` join player
  props to a real kickoff across matchId → normalized team name → fixture string, so WC player props
  carry `event_start_time` and become leakage-validatable (06-16: 13 → 85 leakage-passing candidates).
- **Live not-started gate**: the UI loader now gates "not started" against the **real current moment**
  (overridable for tests), so a started/in-progress game is never shown as bettable.
- **Lane-specific Bank Builder trackers** on `/parlays` + `/bank-builder`: separate Lane A / Lane B
  cards with stake, leg statuses, combined odds, projected return, survival + risk, sport mix, soccer
  marker, progress meter, "why these lanes", and settlement rules — preview/operator-gated, not active.

## Protected / preserved (unchanged)
Run #1 ($100→$10,376.17, 5–0, completed), Run #2 (settled/closed), Run #3 (evaluating), June 16
settlement, World Cup + UFC history. Zero `public/data` writes in this PR.

## Verification (recorded at PR time)
tsc · full app tests (1005) · build · copy/secret/protected-data audits · browser QA (mobile+desktop).
