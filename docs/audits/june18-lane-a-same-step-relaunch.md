# June 18 — Lane A same-step relaunch audit (keep Josh Bell, replace Czech)

_Branch `june18-lane-a-same-step-relaunch` off main `d89a7461` (#523). Audit at 15:31 ET (19:31 UTC)._

## Timing audit (official)
| item | leg / game | start (UTC) | status @ 19:31Z | source | eligible for relaunch | notes |
|---|---|---|---|---|---|---|
| failed leg | Czech Republic ML | 16:00 | **Full Time** | ESPN fifa.world | n/a (settled loss) | Czechia **1–1** South Africa → moneyline LOST |
| **kept leg** | **Josh Bell H+R+RBI O1.5** | **18:35** | **Live / In Progress** | MLB Stats API (gamePk 822889) | **NO — already started** | the decisive block |
| candidate | Canada ML / DNB / DC | 22:00 | pre (Scheduled) | ESPN | n/a (relaunch blocked) | would qualify on timing |
| candidate | Mexico ML / DNB | 01:00 (Jun 19) | pre (Scheduled) | ESPN | n/a | Mexico DNB −240 / Mexico ML +104 |
| candidate | Switzerland | 19:00 | in-play (First Half) | ESPN | NO (kicked off) | also Lane B's leg — conflict |
| Lane B | Switzerland ML | 19:00 | in-play | ESPN | read-only | unchanged |
| Lane B | Goldschmidt H+R+RBI O1.5 | 23:05 | pre | MLB Stats API | read-only | unchanged |

## Answers
- **Is Josh Bell still pre-event?** **No** — his game (Twins @ Rangers, first pitch 18:35Z) was **Live / In Progress** at evaluation (19:31Z), ~56 min after first pitch.
- **Is same-step relaunch allowed?** **No — BLOCKED.** Per the timing gate, a card cannot be retroactively relaunched once the kept (surviving) leg is in-play. Czech is settled, but the kept partner (Bell) has started.
- **Which soccer replacements were available?** Canada (ML/DNB/DC, 22:00Z) and Mexico (ML/DNB, 01:00Z) were not-started and team-side; Czech ML was −141 so Mexico ML (+104) / a Canada DNB would be the closest clean team-side odds. **But none can be used** — the relaunch is blocked by the kept leg's start, independent of replacement availability.
- **What would Lane A's projected return have become?** N/A (blocked). Had Bell been pre-event, e.g. Mexico ML (+104) × Bell (+101) ≈ +312 → $184.03 → ~$759; a Canada DNB closer to Czech's −141 would land nearer the prior $632. Documented as illustrative only — **not applied**.

## Decision & fallback
- **Same-step relaunch NOT performed.** No card edit — the active artifact's Lane A is unchanged (stopped Step 2 + queued **$100** Step-1 path from #523).
- **Public Bank Builder** stays clean: Lane A shows the natural "$100 starting path · Step 1 · next qualified card" (no Czech, no "fresh restart", no "failed"). Lane B unchanged (Switzerland + Goldschmidt).
- **Mr. Dub** records a `lane_relaunch_blocked` audit event (publicVisible:false) with the official timing proof; the paper bankroll is **unchanged** (the event has $0 P/L — no double-count). Lane A remains a stopped lane + queued restart on the ledger.

## Implementation
- Pure helper `lib/parlays/relaunch-eligibility.ts` `canSameStepRelaunch()` encodes the timing gate (failed-leg settled + kept leg pre-event + replacement pre-event), unit-tested. The June 18 case → `{ allowed: false, fallback: "queued_restart" }`.
- `relaunchAudit` written to the active artifact (non-protected); `build-mr-dub-ledger.mjs` emits the `lane_relaunch_blocked` ledger event.

## Guards
- Protected `public/data/bank-builder/*` untouched. Lane B untouched (read-only). No fabrication — odds/results/status from ESPN + MLB Stats API. No banned copy.
