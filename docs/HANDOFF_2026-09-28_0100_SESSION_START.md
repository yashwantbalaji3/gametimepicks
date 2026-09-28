# Continuation state — fresh session, 2026-09-28 ~01:00 ET

State, not history. Written at the close of the Sunday NFL live-acceptance session.

---

## Repository

| | |
|---|---|
| main | `4d8c8377f0` |
| Production | `805d07ff` (`auto: mlb lineup refresh`, built 2026-09-27T21:33Z) |
| working tree | clean (0 tracked files dirty) |
| open PRs | **4** — #743, #742, #723, #716 |
| closed this session | 9 stale PRs (#1, #2, #4, #5, #213, #214, #215, #316, #487) |

### 🔴 main's quality gate is RED, on a pre-existing failure

`npm run ask:eval` fails on **clean main** — reproduced locally, not introduced by any open PR:

```
mut-18 · "What does GameTime forecast for tonight?"
    ✗ fell-back — verifier PASS
RESULT: soft failures only     (exit 1 — soft failures block)
```

All seven hard gates PASS. The soft failure is real and worth understanding rather than patching:

`mut-18` mutates the writer to emit a fixed string, `"GameTime picks the Over/Under over tonight."`,
and expects the **verifier** to catch it and force a fallback. Tonight the verifier PASSES, because
its paused-market check has **no subject in context**: the projection built `forecasts MLB 0`, so no
paused MLB total exists to recognise the claim against.

**This is a verifier finding, not a test-data artifact** — the guard only catches an unsourced pick
on a paused market when such a market is present. It was deliberately NOT patched at session end:
weakening a safety verifier to turn a gate green is the wrong trade, and fixing it properly is new
work. **First task of the new session.**

Because the gate is red, #743 and #742 could not be merged with green exact-head CI.

---

## Open PRs

**#743 · `fix-mf1-mlb-nonvacuity`** — MERGE once the eval blocker is resolved.
Fixes two guards that demanded the day's data look a certain way: MF1's MLB non-vacuity (required a
*mixed* slate; late Sunday every MLB matchup was unavailable) and the ask paused-market guard (could
not tell an empty slate from a policy change). Both now prove their contract data-independently and
announce a legitimately empty state. Code is correct and probed; only the unrelated eval failure
blocks it.

**#742 · `v2a-featured-forecasts`** — MERGE after #743. This is Live Hub **V2A**, described below.

**#723 · `pa-sunday-acceptance`** — MERGE. Docs only, `MERGEABLE/CLEAN`. Two of its three files
already landed elsewhere; `docs/acceptance/SUNDAY_2026-09-27_NFL_ACCEPTANCE.md` is unique and is the
Phase A/B acceptance record. It predates the evening's incidents by design — those are recorded
separately (below and in `docs/incidents/`).

**#716 · `p18-settle-publication-boundary`** — **INTENTIONAL HOLD. Do not merge without a decision.**
Held all session, and it is **not** superseded: `settle-publication-boundary.test.mjs` does not
exist on main, and `nightly-settle.yml` has not changed on main since #716 opened. It implements a
real behavioural boundary — a refusal to republish one read model must not be permission to skip the
health checks (`publish_refusal` threading `success() || publish_refusal == 'true'`). Unique,
unmerged, still wanted. It should be merged deliberately on a quiet day, not during a live slate.

### Branches
~105 stale local branches exist. **This is not evidence of unmerged work** — the repo squash-merges,
so `git rev-list main..<branch>` is non-zero even for branches whose content landed. Nothing was
deleted; provenance is uncertain and GitHub PR state is what matters, which is now clean.

---

## Production `/live`

Live and healthy. Verified against the real slate through PRE → LIVE → FINAL.

- **NFL-first hub**: sport tabs `All | NFL | MLB`, four lifecycle sections
  (`Live now` · `Upcoming` · `Final — grading pending` · `Settled today`)
- **Team logos** — real, all 14 games
- **Player portraits** — 42/42 loaded, canonical ESPN athlete id only, combiner URLs (~9 KB each),
  28px mobile / 36px desktop, team chip, initials fallback, never a generic face
- **Clock** renders `Q2 · 5:01` — ESPN's label already contains the clock, so it is composed from
  `period.number` + `period.clock`, never by decorating the label
- **Scores** factual; an absent score is an em dash, never `0`
- **No outcome language** — no HIT/MISS/WIN/LOSS anywhere, even with games final and legs settled
- **Frozen values unchanged** through the whole slate
- No horizontal overflow at 320 / 375 / 390 / 1280

### Live measurement
- **Paid `nfl-live-props`: `disabled_manually`.** Do not re-enable without the gates in "Operational
  invariants" below.
- **Free `nfl-live-props-free`: active, manual dispatch only.** Structurally unable to spend: no
  `schedule:`, `ODDS_API_KEY` named nowhere, no `env:` block on any step, exactly one script invoked
  (the shared `capture-live-props.mjs`, never a fork). Proven on the live slate: 9 games, credits
  514→514, Phase H 0→0, commit touched only `live-props/`.
- Publication cadence is therefore **manual**. Freshness must be surfaced honestly; `observedAt`
  exists at artifact and row level.

---

## NFL model/product state — exact, not blurred

| family | state | live-measurable |
|---|---|---|
| `player_rush_yds` | **PUBLISHED** | yes |
| `player_reception_yds` | **PUBLISHED** | yes |
| `player_receptions` | **PUBLISHED** | yes |
| `anytime_td` | **PUBLISHED** | yes — rushing + receiving TD columns only |
| `player_pass_yds` | **ESTIMATE** (P318 STOP) | mapped by the producer, but **must never be featured** |

Participation is a separate axis: most board rows are `AVAILABLE_ROLE_UNCERTAIN`. Role certainty
remains a founder data-rights gate — official actives publish ~90 min pre-kickoff, i.e. after board
freeze, so a confirmed-role gate cannot be satisfied at freeze time whatever source is added.

**Touchdown correction (important).** ATD *is* factually live-measurable. The gateway adapter refuses
it because `scoringPlays[].athletesInvolved` is empty, but `live-prop-state.mjs` derives it correctly
from the boxscore's **rushing + receiving** TD columns, explicitly never the passing block ("an
anytime touchdown is scored, never thrown"). A TD row carries a real `live.statValue`.

---

## Live Hub V2

### V2A — complete, in #742 (unmerged)

- **Canonical owner**: `app/src/lib/live/featured-forecasts.mjs`. fs-free so a client component can
  import it.
- **Data source**: the live-props artifact is **already pre-joined** — frozen projection, frozen
  line, live value, `observedAt` and settlement in one row, joined by
  `predictionId = {providerEventId}:{playerId}:{family}`. No name matching anywhere. No second
  normaliser, no browser→ESPN fan-out.
- **`nfl/live-props/` is intentionally public**, declared in `ALWAYS_PUBLIC_DATA_DIRS` beside
  `compare/v1`, `lab/v1`, `ask/v1`. Without it the build *refuses* (exit 1) because the URL is
  assembled at read time. Guarded so it cannot be removed quietly or mistaken for an accident.
- **Frozen TD probability** now carried (`probability: slot.probability ?? null`). ⚠ It reaches rows
  frozen for the **first time** only — the producer carries a frozen record forward by design, so
  rows frozen on 2026-09-27 keep theirs without one. Backfilling would mean re-freezing from a newer
  board, which the producer deliberately refuses. A TD row with no pregame claim renders honestly.
- **Membership is stable and never re-ranked by live play.** Selection reads no live field at all
  (asserted structurally). The same five stay attached through PRE → LIVE → FINAL · grading pending.
- **No confidence exists.** Nothing in the NFL families carries a calibrated cross-family comparable
  value; an interval in yards is not comparable to one in receptions, and a bookmaker's implied
  probability is a price. Hence **FEATURED GAMETIMEPICKS FORECASTS**, never "Top 5".
- **Board order is reused, not re-derived.** `build-nfl-player-board.mjs:424` already sorts players
  on frozen pregame numbers; the producer walks the board in that order (verified). That is a stable
  *pregame display order* — **never to be described as model ranking or confidence.**
- Cost measured: **~4 KB gzipped per game**, ~56 KB for a 14-game slate, one static CDN fetch per
  game. Do not poll unchanged static artifacts.

### ⚠ Open decision blocking V2B — family diversity

Audited across the real slate, the current selection is badly skewed:

| family | featured | eligible pool |
|---|---|---|
| rushing yards | 24 (53%) | 78 (16%) |
| receiving yards | 21 (47%) | 121 (25%) |
| receptions | **0 (0%)** | 121 (25%) |
| anytime TD | **0 (0%)** | 173 (35%) |

Cause: the one-row-per-player pass takes each player's *first* eligible family, and `LIVE_FAMILIES`
order puts the yardage families ahead of receptions and TD.

**Consequence for V2B: touchdowns are 35% of the eligible pool and 0% of what renders, so the TD
primitive would be dead code on a real slate.**

Founder-approved remedy, **not yet implemented** — a fixed family rotation, filled in board order,
preferring an unused player:

```
receiving yards → rushing yards → anytime TD → receptions → (cycle)
```

Frozen data only · stable across kickoff · explicit allowlist · no market gap · no live performance ·
no invented confidence · `predictionId` as final tie-break. It is a **presentation rotation, not a
ranking**, and must be documented as such in the canonical owner.

### Next packages — do not start before the gate is green

```
V2B — family rotation, progress rail + TD primitives, fixtures
V2C — redesigned game card + responsive layout (2 columns at 1280, 1 on mobile)
V2D — View All integration + freshness polish
```

**V2B visual target**

```
[PORTRAIT]  JAXON SMITH-NJIGBA
            SEA · Receiving Yards

GTP         LINE        LIVE
107.5       92.5        63

0 ━━━━━━━●━━━━━━━━━━│━━◆━━━━
         LIVE      LINE  GTP

CURRENTLY BELOW LINE
```

LINE and GTP are frozen landmarks and must not move when live data updates. LIVE is factual and
moving. A threshold crossing is **never** HIT/MISS. TD rows get no numeric rail: pregame probability
(when present) plus `NO TD YET` / `TOUCHDOWN SCORED`, which is factual state, not canonical HIT.

Distinguish three different things: `STARTS AT KICKOFF` (pre) · `AWAITING FIRST MEASUREMENT` (live,
unmeasured) · `LIVE 0` (measured zero). Missing is not zero.

---

## Operational invariants — preserve

```
paid nfl-live-props        disabled_manually
free runner                active, manual-only, unchanged since merge
Phase H budget             3 spent / 87 remaining
reconciliation             1 RECONCILED entry, auditable and idempotent
frozen boards              clean
#716                       NOT merged
```

**Do not re-enable the paid workflow** until all three hold: #736 deployed (it is, on main), free-only
behaviour proven (it is), and paid-probe ledger durability proven (**not yet** — the durability fix
is merged but has never executed a real paid probe). Report before re-enabling.

### The Phase H incident, in one paragraph
The first-ever scheduled `nfl-live-props` run charged 3 credits, then crashed on a temporal-dead-zone
error while grading the response, and `continue-on-error: true` reported the step green. The ledger
was written only at the end of the run, so the charge was lost — and **both** guards that bound the
spend read that ledger, so the probe re-armed and the 90-credit budget read zero. Fixed: the charge
is persisted the instant the provider answers, and `matchEvent` is a hoisted declaration. Reconciled
through `recordReconciledCharge()` (explicit credits, `provenance: "RECONCILED"`, idempotent by
`reconciliationId`) — never by hand-editing the ledger. Full record:
`docs/incidents/2026-09-27-phase-h-unledgered-charge.md`.

---

## Recorded follow-ups — do not start without direction

1. **Fix the `mut-18` verifier gap** (the current main blocker) — the paused-market check needs to
   catch an unsourced pick claim even when no paused market is in context.
2. **Time/slate-dependent CI guard audit.** Five guards took main red today purely because the slate
   progressed: product-day at kickoff (#735), `/build` eligibility mid-click (#741), MF1's mixed-slate
   requirement (#743), the ask paused-market guard (#743), and `mut-18`. This is a class, not five
   coincidences.
3. **Free Live Measurement Delivery V2** — publication cadence is manual. Candidates: bounded
   server-side per-event aggregation, shared cache, CDN-cacheable game envelopes, safe free capture
   automation. **Never** browser→ESPN fan-out.
4. **`continue-on-error` on paid steps** — a crashed paid step must not report green.
5. **Odds `capturedAt`/`sourceAsOf` defect** — the capture quarantines the *freshest* books because
   `capturedAt` is the run's pinned `--now`; today's slate was priced by 7 of 11 books.
6. Cross-family calibrated confidence research · broader public-launch work.

---

## Repo discipline

```
merge origin/main into branches, NEVER rebase
explicit git add — never -A
canonical owners; no hand-edited generated artifacts (re-derive via the builder)
exact-head CI before every merge
behavioural guards, and mutation probes that PROVE the mutation actually applied
```

⚠ Two probe failures worth remembering: a `perl` substitution that silently did not apply reported a
false green, and probes that *delete an assertion* prove nothing — a removed assertion cannot make a
test fail. Mutate the **function**, and assert the mutation landed.
