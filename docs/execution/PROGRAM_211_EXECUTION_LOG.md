# PROGRAM 211 — Execution Log & Final Report

**Verdict: PROGRAM_211_COMPLETE pending the final push's production receipt** *(the final-assurance
commit registers R-EF and ships this log; its own production receipt is proven by the next train
per the in-flight rule — every prior release's CI receipt is recorded below).* Bank Builder and
Moonshot now operate under ONE closed lifecycle machine with derived daily receipts, frozen
versioned selection policies, forward-window coverage typed by cause, automation proven by fixture
clock, public next-transition copy, and operator panels rendered only from writers' artifacts.

## Window & anchors
- Start: 2026-08-26 ~18:30 ET. Baseline tip 88387736c (bot lineup refresh; P210 tip 105dfd4bb
  ancestry- and production-proven — receipt recorded in R-0's correction of the P210 log).
- Protected money: **untouched throughout** — 19–14 · $19,065.40 · crown $20,465.40; money-gate
  PASS on every admin-status regeneration this train.

## Releases (all quality-gate GREEN on push)
| Release | Commit | Rollback parent | Outcome |
|---|---|---|---|
| R-0 · reconciliation | bf902988f | 88387736c | ui-loader legId dedupe + parity guards; P210 record corrected auditably; 1,400KB ceiling evidence-frozen |
| R-A · lifecycle | f74566fe5 | bf902988f | closed state machine + pure derivation + receipts embed lifecycle/watchdog + --dry-run recovery |
| R-B · policies | 0f83fc13f | da46871be | bank-builder@1 / moonshot@1 frozen as committed data, drift-guarded; challenger slot honest-null |
| R-C · forward coverage | 29b9dadc4 | 0f83fc13f | per-sport coverage derived, counts reconcile by construction; findings typed by cause |
| R-D · automation | 04e288bea | df464b5c8 | fixture-clock simulation + dispatch composition; coverage builder wired into daily-products.yml |
| R-EF · UX + operator | 5e2258b1b | 7069c734f | next-transition lines (cron-tied); /launch Daily Product Operations + Forward Coverage panels |

Suite 5,171 → 5,203 tests (+32 across 7 new fixture files), 0 fail at every ship · e2e 425/0/6
each release · operating record 129 → 134 rows, PDF-verified per release.

## What operates itself now
- **One lifecycle contract** (`lib/products/daily-state-machine.mjs`): EVALUATING → ACTIVE →
  AWAITING_RESULT → SETTLED_WIN/LOSS → ADVANCED/RESTARTED (+ NO_PLAY, OFF_SEASON, VOIDED, STOPPED,
  INCIDENT). Illegal jumps throw; an unearned state fails closed naming its missing evidence;
  duplicate runIds no-op; a single-writer lease refuses races and recovers past its ttl.
- **Derivation, not declaration** (`daily-lifecycle-derive.mjs`): evaluation verdicts verbatim from
  the live activation authority; settlement moves the day ONLY via the official settler's dated
  artifact; progression claims ADVANCED/RESTARTED only while the ledger owner's portfolio is fresh
  — stale progression stops honestly at SETTLED_*.
- **One writer, two views**: `build-daily-product-receipts.mjs` embeds lifecycle + watchdog in the
  same dated receipt at the same stamp; `--dry-run` is the recovery first form (prints, writes
  nothing). Admin status and /launch render it verbatim; a MISSING receipt renders AS the finding.
- **Frozen policy versions** (`selection-policy.mjs`): the bars the products already ran under,
  pinned as committed data; the drift guard fails the build if a live executor constant and a
  frozen bar disagree. NO_PLAY reachability proven on empty and longshot-only pools. The
  challenger slot is null WITH its pre-registration reason — declaring one is deliberate work.
- **Forward coverage** (`forward-coverage.mjs` + daily artifact): scheduled/priced/generated/
  started per sport, counts reconciling by construction; refusals typed, never zeros; a started
  event never counts forward.

## The findings the coverage surfaced (all typed, none hidden)
- **EPL**: the night-before generation window is the odds-freshness bar (6h) working as the
  matchweek workflow documents — the priced Aug-29 matchweek materialized early as typed-refusal
  rows (probabilities withheld until fresh prices), which never count as "generated".
- **NFL**: 16 scheduled preseason games carry no forecasts — MODEL_ABSENT_BY_DECISION (P181's
  pre-declared rejection), not staleness. Forecasts return under the frozen regular-season contract.
- **UFC**: population-exact — 13 bouts declared/carried, 9 modeled, 8 priced by boutId join.
- **MLB**: DAILY_BY_CONTRACT; future staging absent by design ("never a once-per-series prediction").

## Defects this train's own checks caught
1. The WIN-path fixture caught the machine requiring policyVersion evidence the receipt already
   carried — evidence now seeds from the receipt's own version at open.
2. Three same-named state vocabularies (P140 freshness, P172 operational, P211 lifecycle) would
   have collided — machine exports renamed LIFECYCLE_* and all three documented as intentional.
3. My out-of-band NFL schedule/index refresh restamped artifacts the scheduled workflows own and
   tripped four one-stamp guards — reverted; the committed capture already covered the weekend.
   The lesson is the program's thesis: the system runs itself; the operator reads receipts.
4. **A timed-out suite kill landed inside a mutation probe and left the LIVE settlement-lineage
   guard neutered on disk** (duplicate-mapping check gone; four tests red; one blind commit from
   shipping). Both `mutating()` helpers now probe a SIBLING COPY, sweep strays, and assert the
   live module untouched byte-for-byte.
5. The new /launch panel carried a `#c33` fallback literal — this train's own ratchet caught it.
6. One transient suite failure (R-B, first of three runs, name uncaptured by my summary filter) —
   recorded rather than claimed away; not reproduced in five subsequent full runs.
7. The sibling-copy hardening (4) created its own race: transient probe copies live in src/ for
   seconds and a concurrent colour scan can count them — the shared scanner now excludes
   `*.mutation-probe.*`.
8. The register row DESCRIBING defect 5 contained the raw hex string it described, which the
   exception-registry guard correctly flagged in committed data — prose in scanned files must name
   a literal without spelling it.

## Remaining work, partitioned
- **ENGINEERING** — `/build/custom` <600KB requires generation-time slate-view JSON + on-expand
  fetch (ceiling frozen at 1,400KB with the measured residual: rendered content ×2 via RSC).
  Mutation-probe pattern could be lifted into one shared helper. A challenger selection policy
  (pre-frozen bars + shadow lane) if the founder wants one.
- **REALITY** — EPL calibration pairs to 30/30 (learning ledger); UFC Aug-29 card end-to-end on
  fight night; NFL regular-season windows under the frozen contract (sha 3451d1a0…); the daily
  lifecycle receipts observing a real ACTIVE→SETTLED→ADVANCED day live (today was an honest
  NO_PLAY on both products).
- **FOUNDER** — NFL actives-rights/products token; NBA expansion; challenger policy declaration;
  OPS_WEBHOOK_URL for alert delivery.
- **INCIDENT** — none open. Watchdog quiet at close.

## Next five actions
1. Observe the first live ACTIVE day through the lifecycle receipts (REALITY; the machine's
   SETTLED/ADVANCED paths are fixture-proven, production-unobserved).
2. Ship the generation-time slate-view JSON payload lever (ENGINEERING; acceptance: /build/custom
   under 600KB daytime with parity guards green).
3. EPL pairs watch to 30/30 — the committed gate flips with its receipt (REALITY).
4. UFC Aug-29 fight-night operation end-to-end; coverage artifact should show the card move
   DERIVED → STARTED and the lab grade only its frozen picks (REALITY).
5. Founder decision card: challenger policy + NFL products token (FOUNDER; both documented).
