# Sprint 029 — Model / Market Intelligence

Durable log for the sportsbook-intelligence sprint. Each phase records what shipped, what was
measured, and what is blocked — so a fresh session can continue from the repository rather than
from recollection.

Status labels: SHIPPED · PROVEN IN PRODUCTION · LOCALLY VALIDATED · BLOCKED · DEFERRED FOR DATA ·
DEFERRED FOR FOUNDER / LEGAL

---

## Baseline at session start

| | |
|---|---|
| HEAD | `06af7ed6` (== `origin/main`, no bot drift) |
| Suite | 2944 total · 2940 pass · 0 fail · 4 skip |
| TypeScript | clean |
| Protected money (`mr-dub/portfolio.json`) | `affe6b21071f2b3be96bb2774eb347c3` |
| Bank Builder locks | `cb80473f88f3cb5f67208fa568925295` |

Suite command (the only one that works — tests import `.ts` directly and need the loader):

```bash
cd app && npx tsx --test $(find src -name '*.test.mjs')
```

`npm test` does not exist, and plain `node --test` fails every file with
`ERR_UNKNOWN_FILE_EXTENSION`. Note that piping to `grep` masks the runner's exit code, so read the
`# fail` line rather than `$?`.

---

## STRUCTURAL EVIDENCE CHANGE — pitcher team resolution is no longer blocked

The prior handoff recorded player-prop team resolution at **136 / 1,251 rows (10.9%)** and marked
pitcher rows **DEFERRED FOR DATA**, on the stated grounds that "there is currently no
probable-pitcher artifact/source available in the demonstrated current data path."

Measured against the repository, that is not the case. `mlb/boards/<date>.json` carries two team
evidence sources the earlier measurement did not use:

1. `games[].awayProbablePitcherId/Name` + `homeProbablePitcherId/Name` — MLB StatsAPI probable
   pitchers, attributed to a specific side. 23 slots on the 2026-07-27 slate.
2. `leans[].playerTeamAbbr` — populated on **509 / 557** leans, including 19 `pitcher_strikeouts`
   rows.

Provenance was traced to `pipeline/mlb/generate_mlb_board.py:405-450` before being trusted, and it
is mixed:

- **Pitchers** resolve from probable-pitcher assignment. Side-specific and definitive.
- **Batters** resolve from MLB StatsAPI *roster membership* across the teams playing that day, via
  `setdefault` — "first roster wins". That is real evidence, not a matchup-string guess, but the
  tie-break is silent, so a player appearing on two of the day's rosters could be misattributed.

Because of that tie-break, the census applies a **participant cross-check**: a resolved team must be
one of the two teams in that row's own game, or the row stays UNRESOLVED. On the measured slate
**509 / 509 attributions passed** — zero mismatches.

Result: participant-verified team coverage is **1,054 / 1,251 sportsbook rows (84.3%)**, up from
10.9%, and `pitcher_strikeouts` now produces real comparison rows. This is not a weakened identity
rule — it is a better evidence source plus a cross-check the earlier path did not have.

**Superseded:** "pitcher team resolution DEFERRED FOR DATA". Batting orders still exclude pitchers;
probable pitchers cover them.

---

## Phase 0 — Reconcile · SHIPPED

Repository, remote, lineage (`369b6ea0`, `6ee58c28`, `9b6ad334`, `06af7ed6`), hashes and suite all
verified before any file was touched. `vp/` has uncommitted changes and is Cowork-owned — left
alone.

Tool-trust: the test runner was proved in both directions (a known-positive assertion passing and a
deliberate known-negative failing) before any result from it was believed.

---

## Phase 1 — Model / Market Pairing Registry · SHIPPED · LOCALLY VALIDATED

`app/src/lib/markets/pairing.ts` — one canonical selector, `getMarketIntelligenceMode()`, returning
`FULL_COMPARISON | MODEL_ONLY | SPORTSBOOK_ONLY | UNAVAILABLE` plus the named gates that removed
capability. Pages must not re-derive these states.

`UNAVAILABLE` is the default and every gate can only remove capability, so a row missing an input
degrades instead of over-claiming.

**Domain fix.** `PlayerMarketFamily` was defined purely from the sportsbook vocabulary, which made
`batter_hits_runs_rbis` — a family GameTimePicks models and the book does not price —
unrepresentable, and therefore made `MODEL_ONLY` structurally unreachable rather than merely empty.
Added `BATTER_HITS_RUNS_RBIS` (model-side only, no provider key) and split
`MODEL_KEY_BY_PLAYER_FAMILY` from `PROVIDER_KEY_BY_PLAYER_FAMILY`. Both maps are now `Partial`,
which immediately caught a real `possibly undefined` defect in the family lookup.

### Measured distribution — slate 2026-07-27 (real artifacts, not fixtures)

`node app/scripts/measure-pairing-coverage.mjs` (read-only, no network, no credits)

**Player props — 1,530 rows** (1,251 sportsbook + 279 model-side-only)

| Mode | Rows | Share |
|---|---:|---:|
| FULL_COMPARISON | 230 | 15.0% |
| MODEL_ONLY | 279 | 18.2% |
| SPORTSBOOK_ONLY | 1,021 | 66.7% |
| UNAVAILABLE | 0 | 0.0% |

Gates: `NO_MODEL_FAMILY` 801 · `NO_SPORTSBOOK_MARKET` 279 · `MODEL_ARTIFACT_MISSING` 220.

| Provider family | Rows | FULL | BOOK-only |
|---|---:|---:|---:|
| batter_home_runs | 425 | 0 | 425 |
| batter_total_bases | 234 | 73 | 161 |
| batter_hits | 196 | 143 | 53 |
| batter_rbis | 173 | 0 | 173 |
| batter_runs_scored | 160 | 0 | 160 |
| pitcher_outs | 23 | 0 | 23 |
| pitcher_earned_runs | 20 | 0 | 20 |
| pitcher_strikeouts | 20 | 14 | 6 |

Model-side families the book does not price: `batter_hits_runs_rbis` 197 · `batter_hits` 54 ·
`batter_total_bases` 23 · `pitcher_strikeouts` 5.

**Game markets — 36 rows** (12 games × moneyline/run-line/total): 35 FULL_COMPARISON (97.2%),
1 SPORTSBOOK_ONLY.

### Why rows fall out

The family-level overlap ceiling (3 of 8 provider families) is the dominant constraint, not a
defect: 801 rows are families GameTimePicks does not model, and showing them as market context is
the honest treatment. A further 220 rows are overlapping families where the board published no
projection for that exact player/line — `insufficient_data`, not a pipeline failure. Team
resolution, previously the binding constraint at 10.9%, no longer gates any row on this slate.

**15.0% is the real publishable comparison rate.** The old 35% family-overlap figure was only a
ceiling.

### The one refused game market

CLE @ CIN: the book posted a run line of **-1.5** while the simulation published cover probabilities
at lines `[1.5, 2.5]`. Matching those would require assuming a sign convention for whose side the
number describes. The pairing layer refuses (`THRESHOLD_UNSUPPORTED`) rather than fabricate a cover
probability. Phase 2 will add an explicit, tested sign normalization instead of an assumption.

### Tests — 33, all passing

All 11 required negative cases are covered, including: sportsbook-only family → SPORTSBOOK_ONLY;
model-only family → MODEL_ONLY; unresolved team → never FULL_COMPARISON; ambiguous identity → fails
the whole row closed; stale artifact → downgrade; missing model artifact → not FULL_COMPARISON;
unsupported sport → fails closed to market context; American odds `0` and null lines rejected; and
no mode asserting a validated advantage while `modelBeatsMarket` is false for every family.

### Adversarial mutations — both verified applied, then caught

| Mutation | Applied? | Guard |
|---|---|---|
| Remove the team-identity gate | verified (gate text absent, `if (false)` present) | 1 failure |
| Bypass the freshness gate | verified (same check) | 3 failures |

Both restored; file confirmed byte-identical to pre-mutation; suite green after each.

---

## Phase 2 — Game-level intelligence · SHIPPED · LOCALLY VALIDATED

`app/src/lib/markets/game-intelligence.ts` — `buildGameIntelligence()` returns one object per game
covering moneyline, run line and total, for reuse by Market Center, the game report, /today and the
homepage. Pure: no clock, no filesystem.

### Run-line sign convention — VERIFIED, not assumed

The two sources describe different quantities behind similar-looking numbers:

| Source | Field | Means |
|---|---|---|
| simulation | `homeCover(L)` | P(home wins by MORE than L) — home **laying** −L |
| sportsbook | `home.line` | the home side's **signed** line (−1.5 laying, +1.5 receiving) |

So home receiving +L covers whenever away fails to win by more than L — that is `1 − awayCover(L)`,
**not** `homeCover(L)`. Matching by line value alone is silently wrong on roughly half the slate.

Both identities were checked against each game's own `runDifferential` histogram before the module
was written (agreement <0.001 on all 12 games), and the guards **re-derive them from a distribution
rather than restating constants**, so an inverted convention cannot pass.

Verified on real artifacts in both directions:

- home laying (CLE @ CIN, −1.5): cover 33.6% < win 51.3% ✓
- home receiving (11 games, +1.5): e.g. cover 74.4% > win 63.1% ✓

This recovered the row Phase 1 refused. **Game markets went 35/36 → 36/36 FULL_COMPARISON.**

### Totals and pushes

An integer total can push, so over/under/push is three-way while the book's two-way de-vig has no
push term. `overProb`/`underProb`/`pushProb` are reported as simulated, and the COMPARISON uses the
push-excluded conditional so both sides answer the same question. Measured: a line of 8 carries
7.9% push mass, shifting over from 43.9% to 47.7%.

23 tests. Mutations (invert the sign; match by magnitude only) verified applied, then caught (4 and
3 failures respectively).

---

## Phase 3 — Player-prop intelligence · SHIPPED · LOCALLY VALIDATED

`app/src/lib/markets/player-intelligence.ts` — `buildPlayerPropIntelligence()`.

**The most important decision is an omission.** The board lean also carries `lean` ("Over"),
`edgePct` and a `confidence` grade. None reach the object. All four modeled families are DEMOTED, so
`lean` is a recommendation the evidence does not support and `edgePct` is a claim the audit
refutes. A field with no honest rendering should not reach a renderer. Carried instead: projection,
sigma, sample size, recent form.

The guard asserts on property KEYS, not a JSON substring — the calibration disclosure honestly
contains the word "confidence". A companion test asserts the fixture still carries the banned fields
so the guard cannot pass vacuously.

Probability provenance: the board stores only RAW implied for props (they sum >1). No-vig is derived
here, never back-filled, and requires both prices. Measured: raw 70.1% → no-vig 66.4%; a one-sided
market correctly yields null.

Leakage safety uses `<`, not `<=` — a game dated the same day as the slate may not have been played
when the board was built. **Measured across all 1,251 live rows: zero violations.**

Validated on the live slate: 230 FULL_COMPARISON / 1,021 SPORTSBOOK_ONLY (matches the census
exactly), 0 leakage violations, 0 comparison rows missing a team.

24 tests. Three mutations (relax the leakage comparator; leak the unpublishable team; pass the
demoted conclusion through) verified applied, then caught.

---

## Phase 4 — Market Center · SHIPPED · LOCALLY VALIDATED

Route `/markets`, loader `lib/markets/load.ts`, surface `components/market-center.tsx`, client
projection `lib/markets/view-model.ts`. Nav added to `nav.tsx` + `command-rail.tsx`.

**Two defects found by building the surface rather than reasoning about it:**

1. **"Model only (0)".** The loader iterated sportsbook rows only, so a family the book never posts
   could not appear in its own feed — the tab was structurally empty on a slate with 279 such rows.
   Added a model-side pass (now 279, led by `batter_hits_runs_rbis`). Those rows also exposed a real
   distinction: a synthetic row with a null price reported `MARKET_INCOMPLETE`, claiming the book
   posted a *broken* market when it posted *none*. Added an explicit `bookRowPresent` flag.

2. **A 2.4 MB page.** `calibrationDisclosure` + `methodologyNote` repeated across ~1,250 rows were
   ~900 KB of identical text. The view model projects rows to rendered fields and hoists the
   constants. **2.4 MB → 968 KB**, with a test asserting the projection stays materially smaller.

Guarded absent (unbuildable, not unbuilt): opening line, movement, market movers, steam, 24-hour
change, trend charts, team totals. The guard strips comments first — both files carry a header
explaining the absence — and a companion test proves the scanner still detects a real addition.

Browser-verified against the **BUILT static export** (`next dev` 500s on `output: export` — use
`python3 -m http.server --directory app/out`): tabs, filters reading 230/279/1021 exactly as the
census, real portraits/logos, zero console errors, no horizontal overflow at 375px.

13 tests. All five nav guards pass.

---

## Commands worth keeping

```bash
cd app && npx tsx --test $(find src -name '*.test.mjs')   # full suite — read "# fail", not $?
cd app && npx tsc --noEmit
cd app && npx tsx scripts/measure-pairing-coverage.mjs    # real-artifact census
cd app && npm run build && python3 -m http.server 4173 --directory out   # browser QA
```

---

## Open items

- **Run-line sign convention** — RESOLVED in Phase 2 (verified against the differential histogram).
- **Batter roster tie-break** — `setdefault` in the board generator resolves same-name collisions
  silently. The participant cross-check catches the cross-game case; a same-game collision would
  still resolve to the first roster hit. No occurrence on the measured slate.
- **No sportsbook snapshot history** — artifact-level freshness only. No opening line, no movement,
  no steam, no 24h change, and no such UI until real prospectively-retained snapshots exist.

---

## PRODUCTION PROOF — Market Center is live (Sprint 030 Phase 0)

Checked `https://gametimepicks.yashwantbalaji.com/markets/` on 2026-07-27:

- `HTTP 200`, 991,104 bytes
- Hero copy `Sportsbook prices next to our simulations`
- `Game markets (12)` · **`Player props (1530)`**
- `Sportsbook snapshot captured Jul 27 at 12:35 PM ET` · badge `Current snapshot`

**1,530 is the proof.** The pre-`14d47b68` loader had no model-side pass and could only ever produce
1,251 (sportsbook rows alone). Rendering 1,530 requires the model-only pass, so production is
serving `14d47b68` or later.

Status: **Market Center — PROVEN IN PRODUCTION.**

Not distinguishable from a live page: whether `6081b9c0`'s historical framing is deployed. That
branch renders nothing when the snapshot is current, so a current-slate page looks identical either
way. It stays **LOCALLY VALIDATED** and becomes observable on the first stale day.

### How deployment actually happens — and the gap

`.github/workflows/daily-rebuild.yml` is **DORMANT**. Its most recent run
(`30266726514`, 2026-07-27T12:38Z, 7s) logged verbatim:

```
##[notice]VERCEL_DEPLOY_HOOK_URL is not set — daily-rebuild is DORMANT (no-op).
```

So deploys happen only through Vercel's own Git integration on push to `main` — which is why the
consumer work is live. What does NOT happen is the **daily rebuild**, and that matters specifically
for this product: the static export bakes its build clock, so on a day with no push the site's clock
stops. The stale-snapshot framing shipped in `6081b9c0` is the honest fallback for exactly that
case, but the intended fix is the daily rebuild.

**DEFERRED FOR FOUNDER:** setting `VERCEL_DEPLOY_HOOK_URL` in repo secrets is a founder action
(instructions are in that workflow's header). Until then the site only refreshes when something is
pushed.

---

## Next phases (not started)

In the order the remaining consumer value falls out:

1. **Game Report integration** — reuse `buildGameIntelligence` in the MLB report so the report and
   Market Center cannot disagree. No report-specific sportsbook math.
2. **/today** — daily command center; must not label yesterday's slate as today (show "Latest
   available slate: YYYY-MM-DD" instead of silently carrying prior data forward).
3. **Homepage** — above the fold answers: what slate, refreshed when, what is modelled, is market
   context available, most interesting simulation story.
4. **Prospective snapshot retention** — store FUTURE timestamped captures only. Label
   `FIRST_CAPTURED`, never `OPENING_LINE` unless provider metadata says so. Do not reconstruct
   history; do not ship movement UI until enough real prospective observations exist.
5. **Broader sportsbook-only sport coverage** — the pairing layer already fails closed for
   non-FULL_MODEL sports (verified: soccer yields SPORTSBOOK_ONLY), so a sportsbook-only sport can
   receive market context without any prediction surface.

### Known follow-ups in shipped code

- `/markets` renders the first 200 filtered rows with a visible "narrow the filters" note. Honest,
  but pagination or virtualization would be better UX at 1,530 rows.
- The page still ships ~968 KB because all 1,530 projected rows are in the client payload for
  instant filtering. Server-side filtering or chunking would cut it further.
- `/markets` is not yet in the Playwright `navigation.spec.ts` list.
