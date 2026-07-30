# EPL preview — implementation log

**Program 062–065, Lane E.** Built 2026-07-30 against the ratified design in
`docs/EPL_MARKET_INTELLIGENCE_PROTOTYPE.md` (§9.2 build list).
**Governing policy:** `docs/PRODUCT_STRATEGY_RESEARCH_TERMINAL.md` — research terminal + market
intelligence. No claim of predictive superiority appears anywhere in this lane, because there is no
EPL model to make one about.

**What shipped:** the odds side, end to end, on synthetic and sample data.
**What did not:** results and settlement execution. Blocked on a founder decision
(`docs/EPL_RESULTS_SOURCE_DECISION.md`), and blocked *honestly* — the adapter exists, is tested, and
refuses to run.

---

## 1. Files

| Path | What it is |
|---|---|
| `app/src/lib/soccer/epl-clubs.ts` | Club naming index; collision detection through `buildAliasIndex`; 20-club season membership check |
| `app/src/lib/soccer/epl-identity.ts` | `EventIdentity` adapter — competition-scoped, kickoff-to-minute; provider-ref index |
| `app/src/lib/soccer/epl-lifecycle.ts` | Fixture lifecycle states and their settlement dispositions |
| `app/src/lib/soccer/epl-markets.ts` | `MATCH_RESULT_1X2` family; `devigThreeWay` TS port; three-way reading |
| `app/src/lib/soccer/epl-artifacts.ts` | Artifact schemas, validators, leakage gate, no-model-field refusal |
| `app/src/lib/soccer/epl-settlement-adapter.ts` | Lineage-gated adapter over the canonical soccer engine; blocked on `RESULTS_SOURCE_PENDING` |
| `app/src/lib/soccer/epl-load.ts` | Soccer-local artifact loader |
| `app/src/lib/soccer/epl-preview.ts` | Preview view model + all preview copy |
| `app/src/app/preview/epl/page.tsx` | Internal preview route |
| `app/public/data/soccer/epl/**` | Artifact root: four subroots, provenance READMEs, sample artifacts |

Tests (all under `app/src/lib/soccer/`): `epl-identity`, `epl-markets`, `epl-devig-cross-language`,
`epl-lifecycle`, `epl-artifacts`, `epl-settlement-adapter`, `epl-preview`, `epl-closeout-guard` —
**85 tests across 8 files, all passing.**

```
cd app && npx tsx --test src/lib/soccer/*.test.mjs
```

---

## 2. Decisions, and the failure each one is answering

### 2.1 A new artifact root, not the existing soccer one

`app/public/data/soccer/epl/{fixtures,odds,results,settlement}/`, each with a provenance README.

`public/data/world-cup/` is a closed destination with a standing guard test, and its `settlement/`
folder holds two incompatible graded schemas — pick-level rows with `win`/`loss`, card-level rows with
`won`/`lost` — that no tool reads uniformly. Writing EPL there would resurrect a closed surface and
inherit an unparseable directory. `epl-closeout-guard.test.mjs` asserts, from both sides, that no lane
code names a World Cup path and that nothing under `public/data/world-cup/` claims to be EPL.

`results/` and `settlement/` are **empty and stay empty**. Their READMEs state why, and a test asserts
they contain no artifacts.

### 2.2 The leakage gate is in artifact one

Every row carries `capturedAt`; every odds row also repeats `kickoffIso` so eligibility is checkable
without a join. `validateOddsArtifact` **rejects** any row where `capturedAt` does not strictly precede
`kickoffIso`, delegating the comparison to the canonical fail-closed `isLeakageSafe`. Equality is not
pregame.

This is deliberately stricter than the MLB research archive, which learned the rule after artifacts
already existed and then had to prove eligibility retroactively. Retrofitting a leakage rule means
arguing about data you already have; enforcing it in the first schema means never having the argument.

`epl-artifacts.test.mjs` includes a **mutation test**: it deletes the pregame check, runs the validator
in a child process (tsx caches modules, so an in-process mutation would be decorative), observes the
post-kickoff row become accepted, then restores the file and asserts the md5 is unchanged.

### 2.3 Identity is competition-scoped and kickoff-to-minute

`deriveEventId({ sport: "soccer", league: "epl", participants, scheduledStart })` through the canonical
seam. Two things make a fixture distinct and both are required:

- **competition** — the same clubs meeting in a cup is a different event, so a future cup adapter
  cannot collide with this one;
- **kickoff, truncated to the minute** — clubs meet twice a season, and a postponed fixture is replayed
  at a third time.

The World Cup era keyed fixtures on `sorted(normalized_names)` with no league and no date, which
collides by construction for clubs. Provider ids are `ProviderRef` aliases on the identity, never the
identity, and `buildEplProviderIndex` uses `buildAliasIndex.resolve` — the genuinely injective case —
so a ref claimed by two fixtures resolves to neither.

**Rejections are returned, not dropped.** A fixture whose club the table cannot name produces an
`UNRESOLVED_CLUB` rejection rather than an identity carrying a provider's raw spelling. A dropped row
makes an artifact look complete.

### 2.4 The club table refuses collisions, and refuses membership claims

`EPL_CLUB_ALIASES` is a naming index: canonical name, abbreviation, provider spellings. Bare `United`,
`City`, `Albion`, `Wanderers` and `Town` are deliberately absent — each is claimed by more than one
club, and an ambiguous alias does not fail politely, it attaches one club's market to another club's
fixture.

Collision detection runs through the canonical `buildAliasIndex`, and an ambiguous alias blocks the
**whole table**: `assertClubTableSound` throws, naming both claimants, and `identityFromFixture`
refuses every fixture. Half a naming table is worse than none, because the fixtures it does resolve
look complete.

**Deviation from the lane brief, stated plainly.** The brief asked for an explicit 20-club table for
2026-27. This table has 25 entries and asserts no membership. Which twenty clubs contest 2026-27
depends on promotion and relegation the repo has not verified against an official source, and writing
a roster from memory is the fabrication this platform refuses. Instead:

- the table is a **naming** index covering clubs with recent Premier League participation;
- `assertSeasonMembership(clubNames)` takes the clubs named by the **official fixture artifact** and
  requires exactly twenty distinct resolved clubs, refusing on any unresolved spelling.

Season membership therefore comes from the fixture list, checked mechanically, rather than from a
constant somebody has to remember to update. When the official 2026-27 fixture list is ingested, the
check either passes or names precisely what is wrong.

### 2.5 `MATCH_RESULT_1X2` is its own family

Not an overloaded moneyline. The canonical market domain is two-sided by type
(`MarketSide = "HOME" | "AWAY" | "OVER" | "UNDER"`), so a draw has nowhere to live in it. Overloading
would not fail — it would print a coherent home/away pair whose probabilities are wrong by the draw's
share, typically a quarter of the market. A separate family makes that unrepresentable.

`readMatchResult1x2` **fails closed on a missing draw**: a two-outcome `h2h` payload is a two-way market
that happens to name two clubs, not a soccer result market.

`devigThreeWay` is a port of `pipeline/world_cup/soccer_odds_parser.py::devig_three_way`.
`epl-devig-cross-language.test.mjs` runs 255 probability triples and 255 American-price triples
(seeded LCG, so a divergence is reproducible by case index) against the Python implementation through
the pipeline venv, at tolerance 1e-9. Raw implied probability reuses the canonical
`americanToImpliedRaw` rather than adding a second converter.

**One documented divergence:** Python's guard is `total <= 0`, which NaN passes, so it returns NaNs;
the TypeScript version refuses non-finite input outright, because JSON reaches it through a parser
that has not already rejected non-numerics. The test asserts both behaviours rather than papering over
the difference. The Python side is not modified — the legacy soccer pipeline is frozen.

### 2.6 Fixture lifecycle, fail-closed

| State | Disposition |
|---|---|
| `SCHEDULED` | `NO_SETTLEMENT` |
| `FINAL_FT` | `GRADE` — the only state that grades |
| `POSTPONED` | `VOID_ALL` — the rescheduled fixture is a new identity; markets never roll over |
| `ABANDONED` | `VOID_ALL` — absent an official completed result, no league-rules speculation is encoded |
| `REPLAYED` | `NEW_IDENTITY_REQUIRED` — settles under its own `eventId`; the original keeps its terminal state |
| `FINAL_AET` / `FINAL_PEN` | `PEND_AND_ALARM` — unreachable in league play, so a feed reporting them is wrong |
| `UNKNOWN` | `PEND_AND_ALARM` |

Extra time and penalties are *named* although EPL cannot reach them. `pipeline/world_cup/settle.py`
graded 90-minute markets off the extra-time aggregate precisely because extra time had no state of its
own; a future cup adapter inherits the name and the refusal instead of re-deriving the defect.

Unrecognised statuses map to `UNKNOWN` and alarm. Pending is a **named, counted** state — the legacy
path left 192 of 385 graded legs permanently pending because ungradeable rows were skipped rather than
recorded, and nothing counted them.

### 2.7 Settlement: built, gated, and switched off

`settleEplFixture` is an adapter *over* `app/src/lib/settlement/soccer-markets.ts`. It re-implements no
grade — the canonical engine stays the only soccer grading implementation. Its gates run in order:

1. **approved results source** — `EPL_APPROVED_RESULTS_SOURCES` is empty, so every production call
   returns `RESULTS_SOURCE_PENDING` and grades nothing;
2. **source on the list** — `SOURCE_NOT_APPROVED` otherwise;
3. **lifecycle** — `VOID_ALL` voids every leg; anything but `GRADE` grades nothing;
4. **leg belongs to this fixture** — `LEG_EVENT_MISMATCH`, so a leg can never be graded against another
   fixture's result;
5. **lineage** — `validateSettlementLineage` must return clean, or the run writes nothing.

Tests pass an explicit synthetic source list to exercise the grading path, and a separate test asserts
the **default list is empty**, so the blocked state cannot be lifted by accident. The outcome object
carries no stake, payout, bankroll or P/L field, and a test pins its exact key set.

Money boundary: this adapter grades and returns. It never writes a ledger and never invokes the
money-mutating steps of `scripts/settle_soccer_day.sh`. `epl-closeout-guard.test.mjs` pins the canonical
portfolio md5 as a standing check that this lane touched nothing.

### 2.8 The preview surface

`/preview/epl`, internal. `guardInternalRoute()` makes it 404 in the production export;
`scripts/prune-internal-routes.mjs` already lists `preview`, so `out/preview/` is deleted wholesale —
verified by test rather than assumed. Sample artifacts declare `"public": false`, which the same
script's data sweep removes from `out/data`.

"Internal" on a statically exported site has meant "world-readable at its URL" before now, so every
line already meets the public-copy bar.

Per fixture the surface shows clubs, kickoff in ET **and** UTC, our `eventId` and the provider refs
behind it, raw three-way prices with the measured overround and the no-vig probabilities, per-row
`capturedAt` with its pregame verdict, the lifecycle state with its reason, and the settlement state.

**Movement is derived only from multiple real snapshots.** With one capture the surface says
`SINGLE_CAPTURE` and shows nothing — a line drawn between one snapshot and itself is a claim about data
we do not have. Two books at one instant is a spread, not movement, and is treated as a single capture.
Snapshot-per-capture files are what make this expressible at all: the MLB domain has no movement
concept because its artifact is rebuilt over itself.

**No model number, and structurally so.** `MODEL_FIELD_KEYS` is refused at artifact validation (deep
scan, nested included), the preview view model is asserted to expose none of those keys, and the copy
is scanned for claim vocabulary. There is no projection, rating, selection, or model-versus-market
comparison anywhere in the lane.

### 2.9 A soccer-local loader

`epl-load.ts` reads `public/data/soccer/epl/`. `lib/markets/load.ts` hardcodes its data root to
`public/data/mlb` and its freshness cadence describes the MLB one-artifact-per-slate pipeline; pointing
it at soccer would mean either parameterising a loader four MLB surfaces depend on, or reading EPL
files through MLB-shaped assumptions.

**Future consolidation, deliberately not attempted here:** when a second competition lands, the right
move is a shared data-root-parameterised loader with per-sport cadence, and this file becomes its
soccer configuration. That refactor touches `lib/markets/**`, which another lane owns.

---

## 3. Sample artifacts — what they are and are not

`fixtures/sample-2026-27-round-01.json` and two `odds/sample-*.json` snapshots. Every one is
`dataClass: "FIXTURE_SAMPLE"`, `source: "synthetic"`, `"public": false`, with a `notes` field beginning
`SAMPLE`.

They are **not** a capture, **not** the official 2026-27 fixture list, and **not** a claim about which
clubs contest the season. Prices are illustrative. They exist to pin the schema before the first real
ingest and to give the preview surface something real to render.

They are shaped to exercise the states that matter: one fixture with two capture snapshots
(`MULTI_CAPTURE`), one with a single capture, one with none, one `POSTPONED` and its `REPLAYED`
replacement — the same club pair at two kickoffs, so the identity distinction is visible in a committed
file rather than only in a test.

---

## 4. Promotion gates after this lane

Against `docs/EPL_MARKET_INTELLIGENCE_PROTOTYPE.md` §5. Movement is claimed only where code and tests
exist; nothing here is claimed on argument.

| Gate | Before | After | Note |
|---|---|---|---|
| G1 official results source | FAIL | **FAIL** | Unchanged by construction. Founder decision. |
| G2 identity reliability | FAIL | **PASS (on synthetic + sample)** | Adapter, collision refusal, repeated-pair distinctness — tested. Live proof needs a real fixture list. |
| G3 leakage safety | FAIL (nothing existed) | **PASS (enforced from artifact one)** | Rejection, not annotation. Mutation-tested. |
| G4 settlement quality | FAIL | **PARTIAL** | Adapter, lifecycle states and lineage gate exist and are tested. A real settled matchweek is the live proof, and needs G1. |
| G5 evaluation corpus | FAIL | **FAIL** | Zero settled rows. Accumulation starts when ingestion starts. |
| G6 product value | PENDING | **PENDING** | Founder sign-off. Not an engineering output. |

**EPL stays `SCAFFOLD` / `DISABLED` in `app/src/lib/sport-capability-registry.ts`.** This lane changed
no registry state, no navigation, and no public surface.

---

## 5. Explicitly not done

- **No ingestion job.** Odds-side vendor verification (`soccer_epl` market coverage, credit cost per
  capture) is a CI probe against a live key; the local key returns 401. Nothing here has spoken to a
  provider.
- **No totals, no both-teams-to-score.** The canonical engine grades both, but the blocker is verified
  provider coverage, not settlement. `validateOddsArtifact` rejects any market other than
  `MATCH_RESULT_1X2` until a real payload proves consistent line points, all sides present, and per-row
  capture timestamps.
- **No model.** Not a scope decision to revisit at leisure — the platform's own measurement is that its
  soccer projections lose to the de-vigged closing market, and the strategy doc's conditions for
  building another model are not met.
- **No public route, no nav entry, no registry change, no money artifact.**
- **No change to `lib/markets/**`, the World Cup outputs, the frozen Python soccer settlers, or
  `package.json`.**
