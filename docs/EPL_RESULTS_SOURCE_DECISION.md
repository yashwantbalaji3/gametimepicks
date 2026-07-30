# EPL results source — founder decision required

**Status:** OPEN. Engineering has not chosen and will not choose.
**Owner:** founder. **Blocking:** promotion gate G1, and with it every settlement-side surface of the EPL prototype.
**Written:** 2026-07-30 (Program 062–065, Lane E).

---

## 1. The decision in one sentence

**Which source is authorised to supply official English Premier League final scores, and at what cost?**

Nothing else about EPL is blocked on this. Fixtures, identity, three-way odds capture, de-vig,
provenance and the internal preview surface are built and tested. Results, settlement, and any claim
about accuracy are blocked, and stay blocked, until this is answered.

## 2. Why engineering stops here

Two program guardrails converge on this file:

1. **Choosing or purchasing a vendor is not an engineering default.** Adding or extending a paid
   credential is a founder decision.
2. **A settlement source is an allowlist entry, not a configuration value.** `OFFICIAL_SETTLEMENT_SOURCES`
   in `app/src/lib/identity/settlement-lineage.ts` is an allowlist precisely so that "a source nobody
   thought to forbid" cannot end up grading a result from a search-result snippet. Adding an entry
   should require justifying it.

So the adapter refuses. `EPL_APPROVED_RESULTS_SOURCES` in
`app/src/lib/soccer/epl-settlement-adapter.ts` is an empty array, every call returns
`RESULTS_SOURCE_PENDING`, and a test asserts the list stays empty. There is no configuration flag, no
environment variable, and no fallback that quietly turns settlement on.

## 3. What the source must actually do

A candidate qualifies only if it satisfies **all** of these. These are the gate, not preferences.

| # | Requirement | Why it is non-negotiable |
|---|---|---|
| R1 | **Official** final scores — the league's own record or a licensed carrier of it | Grading from a web snippet or an aggregator's summary is how a settled result becomes unfalsifiable. The platform rule is official box scores only. |
| R2 | **Per-fixture, machine-readable**, one row per fixture with a stable fixture id | A per-round HTML page cannot be joined injectively, and a non-injective grading join is the exact defect that produced 49 wrongly-settled legs in the MLB audit. |
| R3 | **Reports POSTPONED / ABANDONED explicitly**, distinguishable from "not yet played" | Without it, a called-off fixture pends forever. The legacy soccer path left 192 of 385 graded legs permanently pending for this reason. It is a launch prerequisite, not a fast-follow. |
| R4 | **Regulation (90') score available**, not only an aggregate | League play has no extra time, so today they coincide — but the field must be named for regulation so a future cup adapter cannot inherit `settle.py`'s extra-time substitution defect. |
| R5 | **Terms of use permit** automated retrieval and the use we make of it | Unverified terms are a legal exposure, not a technical detail. |
| R6 | **Coverage confirmed for EPL 2026-27 specifically**, on the plan we would actually hold | "The provider covers football" is not evidence that our tier covers this competition this season. |
| R7 | **Runs in CI**, keyed by a repository secret | Paid ingests are CI-only; the local key path is not an operating mode. |

## 4. Options

Costs and plan contents below are **NOT verified in-repo**. Every figure must be read from the
vendor's current published terms at decision time. Nothing here is a quote.

### Option A — API-Football (paid tier)

The World Cup era's results source. `API_FOOTBALL_KEY` already exists as a repository secret and
`nightly-settle.yml` already consumes it, so the integration shape is known rather than speculative.

- **Fields:** `/fixtures` returns per-fixture status codes (including postponed and abandoned),
  `score.fulltime` (regulation) separately from the full-time aggregate, and stable numeric fixture
  ids. This maps onto R2, R3 and R4 without adapting anything.
- **Known constraint (measured in-repo, 2026-07):** the **free** plan is schedule/fixtures only —
  "Free plans do not have access to this season, try 2022–2024" — and returned zero rows for historical
  odds. Whether the free tier returns *current-season EPL final scores* is **UNVERIFIED** and is the
  first probe to run (§6).
- **Cost:** a paid tier. Amount, call limits and per-competition coverage must be read from the vendor
  at decision time.
- **What it unblocks:** everything in §7 — this is the option the built code is shaped for.
- **Risk:** recurring spend on a competition with no revenue attached to it, for a prototype the
  registry keeps at `DISABLED`.

### Option B — a free official or officially-licensed feed

- **Fields:** unknown; no candidate has been verified.
- **Status:** **no free source has been verified** for official status, per-fixture machine-readability,
  or terms of use. None is named here, because naming an unverified candidate turns a research task
  into an implied recommendation. MLB has a free official equivalent (StatsAPI); the platform has not
  established that EPL does.
- **Cost:** zero, if one exists and its terms permit this use.
- **What it unblocks:** the same as Option A, at no spend.
- **Risk:** the verification work (R1, R5, R6) is real and may conclude that nothing qualifies. Budget
  it as an outcome, not a formality.

### Option C — operator-entered official results

Already on the platform allowlist as `operator-official-input`: a human reads the official record and
enters the score.

- **Fields:** whatever the operator enters, against the canonical `eventId`.
- **Cost:** zero in money, roughly ten fixtures per matchweek in attention, thirty-eight weeks a year.
- **What it unblocks:** the settlement path end to end, and the first live proof of the G4 lineage gate,
  without any purchase.
- **Risk:** it does not scale, and a manual step that is skipped looks identical to a fixture that has
  not finished. Any adoption needs an explicit staleness state, not just goodwill.

### Option D — decide nothing this season

- **What happens:** the prototype ships preview-only as odds, provenance and `SCHEDULED` fixtures, with
  an honest `RESULTS_SOURCE_PENDING` panel. This is exactly what is built today.
- **Cost:** zero.
- **What it unblocks:** nothing. G1 stays FAIL, G4 cannot be proven live, and G5's corpus does not
  begin accumulating — a settled-row count that starts a season late stays a season behind.
- **Risk:** the 2026-27 fixture list runs on the league's schedule. Time spent undecided is corpus not
  collected, and it is not recoverable later.

## 5. Recommended default if no decision is made

**Option D.** Not because it is good — it accumulates nothing — but because it is the only option that
requires no authorisation, and because the alternatives all fail closed by design. A prototype that
honestly says "no results source" is a correct state. A prototype that grades from an unapproved feed
is a settled result nobody agreed to trust, and those are expensive to unwind: the World Cup era's two
incompatible graded schemas in one directory are still unparseable and still on disk.

If the founder wants EPL settlement this season and does not want to authorise spend, **Option C is
the smallest step that produces real evidence** — it is already allowlisted, needs no vendor, and its
first settled matchweek is the live proof G4 has never had.

## 6. What engineering will do, in order, once a direction is given

1. **Probe first, buy second.** One CI job against the existing `API_FOOTBALL_KEY` establishing whether
   the *current* plan already returns EPL 2026-27 fixtures with `score.fulltime` and explicit
   postponed/abandoned statuses. If it does, Option A may cost nothing and the decision narrows to
   terms of use. This probe reads only; it changes no plan and buys nothing.
2. Record the chosen source in `EPL_APPROVED_RESULTS_SOURCES`, and — if it is not already there — in
   `OFFICIAL_SETTLEMENT_SOURCES`, with the justification in the commit.
3. Write the ingest into `app/public/data/soccer/epl/results/`, one row per fixture, keyed on the
   canonical `eventId`.
4. Run the settlement adapter over the first completed matchweek. Its lineage gate either validates or
   the run writes nothing; there is no third outcome.
5. Report the result — including a failure — before any surface claims settled EPL coverage.

## 7. What the decision unblocks

| Blocked today | Unblocked by a chosen source |
|---|---|
| G1 (official results source) | Converts FAIL → PASS. It is the only gate a vendor decision can move. |
| G4 (settlement quality) | Becomes *provable*: the adapter, lifecycle states and lineage gate exist and are tested on synthetic fixtures; a real matchweek is what turns tests into evidence. |
| G5 (evaluation corpus) | Begins accumulating. A 380-fixture season is the corpus; it starts the week the ingest starts and not before. |
| The "final result" panel of the preview surface | Currently renders `RESULTS_SOURCE_PENDING` for every fixture. |
| Any statement about EPL accuracy or calibration | There is no model, so this is not near-term regardless — but with no settled rows it is not even measurable. |

**Not unblocked by this decision, and not asked for here:** public promotion. EPL stays `DISABLED` in
`app/src/lib/sport-capability-registry.ts` until the gates pass *and* founder sign-off is recorded in
the promoting sprint's ledger. A results source is one gate of six.

---

## Appendix — what is already true, so the decision is not made in the dark

- Identity, alias refusal, three-way de-vig (cross-checked against the Python reference), fixture
  lifecycle states, artifact schemas with a from-day-one leakage gate, the lineage-gated settlement
  adapter, and the internal preview surface: **built and tested** (`docs/EPL_PREVIEW_IMPLEMENTATION.md`).
- Odds-side capture cost and market coverage for `soccer_epl` on The Odds API: **still unverified**;
  the only signal on disk is a stale discovery listing. That is a separate CI probe and a separate
  question from this one.
- Money: untouched, and untouchable from this lane. No EPL flow reaches a bankroll under any option
  above.
