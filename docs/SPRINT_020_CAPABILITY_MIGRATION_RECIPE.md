# Capability Registry Migration — worked design, ready to execute

> ## ⚠️ Baseline correction before you start (2026-07-25)
>
> **The correct suite baseline is 2876 total / 2872 pass / 0 fail / 4 skip.**
>
> Commit `e891e171`'s message claims "suite 2879 (2875 pass)". That is an arithmetic error in the
> message: it added one test to a 2875-total suite and incremented by 4 instead of 1. No tests were
> removed — the runner's total (2876) equals the count of static `test()` declarations in `src/`
> (2876), and `2872 pass + 4 skip = 2876` is internally consistent. Verified at `fcd223f2`.
>
> If a handoff charter quotes 2879/2875 as the "verified checkpoint", it inherited the same error.
> Do not go hunting for three phantom regressions. Re-derive the baseline from a real run:
>
> ```bash
> cd app && find src -name '*.test.mjs' | xargs npx tsx --test 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
> ```
>
> Lesson worth keeping: a number in a commit message is an assertion like any other, and it
> propagates. Derive counts from the runner, don't do mental arithmetic on them.

Status: **designed and attempted; reverted to green.** The registry itself shipped in `82237a5d`.
This document is the recipe for the remaining migration, written after doing it once, so the next
session executes rather than rediscovers.

## Why this is a separate change

`lib/sport-capability-registry.ts` is live and already drives the `/events` badge. What is NOT yet
capability-driven is **product eligibility** — `MODELED_SPORT_KEYS` in `lib/sport-capabilities.ts`,
which decides whether a sport's legs may enter official suggested parlays and Build-Your-Own.

Making that switch is ~15 lines of production code and a **23-test conversion across 4 files**. The
production side is easy. The tests are not, and the reason is interesting rather than tedious — see
"the real difficulty" below.

Current blast radius (measured, not estimated):

| File | Failing tests when `MODELED_SPORT_KEYS` becomes MLB-only |
|---|---|
| `src/lib/sport-capabilities.test.mjs` | 17 |
| `src/lib/published-cards.test.mjs` | 3 |
| `src/lib/custom-parlay.test.mjs` | 2 |
| `src/lib/build-a-parlay-config.test.mjs` | 1 |

## The production change (verified to work)

In `lib/sport-capabilities.ts`, after `capabilitiesForLevel(...)`, apply the registry. `level` is a
DISPLAY field and may only ever narrow capability, never widen it:

```ts
function applyCapabilityRegistry(c: SportCapabilities): SportCapabilities {
  const eligible = canEnterPredictionProducts(c.key);
  return {
    ...c,
    status: c.status === "modeled" && !eligible ? "schedule_only" : c.status,
    hasProjections: c.hasProjections && canShowLiveProjections(c.key),
    hasSuggestedParlays: c.hasSuggestedParlays && eligible,
    hasBuildYourOwn: c.hasBuildYourOwn && eligible,
    // NOT a blanket downgrade: NBA's grading pipeline is real and its settled record stays
    // publishable, so grading follows resultsMode (live OR archive).
    hasGrading: c.hasGrading && resultsMode(c.key) !== "none",
  };
}

export const SPORT_CAPABILITIES = SPORTS_COVERAGE.map((s) =>
  applyCapabilityRegistry(capabilitiesForLevel(normalizeSportKey(s.key), s.level)),
);
```

`tsc` passes. The mixed-sport RULE needs no change — `keys.every(k => canShowSuggestedParlays(k))` is
already capability-based rather than count-based.

## The real difficulty

The tests use **NBA as the second modeled sport** to exercise mixed-sport mechanics
(`isOfficialSuggestedParlayAllowed(["nba", "mlb"])`). Once NBA is ineligible, MLB is the only
FULL_MODEL sport — so "a mixed slip of eligible sports" **cannot be constructed from real sport keys
at all**. The tests are not merely asserting a wrong fact; they depend on a second eligible sport
existing.

**Decision taken (Sprint 020 authorised autonomous decisions):** the eligibility rule stays
**capability-based, not count-based**. "Every sport on the slip must be eligible" remains correct with
one eligible sport; a second FULL_MODEL sport becomes eligible automatically, with no rule change and
no new branch. Do NOT special-case single-sport-only behaviour.

## The extraction that makes the tests writable

Separate the RULE from WHICH SPORTS satisfy it today:

```ts
export function allSportsEligible(
  sports: Iterable<string | null | undefined>,
  isEligible: (sport: string) => boolean,
): boolean {
  const keys = distinctSportKeys(sports);
  if (keys.length === 0) return false;   // an empty slip is never a product
  return keys.every((k) => isEligible(k));
}

export const isOfficialSuggestedParlayAllowed = (s) => allSportsEligible(s, canShowSuggestedParlays);
export const isBuildYourOwnParlayAllowed     = (s) => allSportsEligible(s, canUseInBuildYourOwn);
```

Production always passes the real gate. Tests inject a fixture predicate over synthetic keys
(`fixture_alpha`, `fixture_beta`) to prove the mixed-sport mechanics still hold.

## Test conversion rules

1. **Capability FACT → invariant.** `assert.deepEqual(MODELED_SPORT_KEYS, ["mlb","nba"])` becomes:
   every member of `MODELED_SPORT_KEYS` has `capabilityState === "FULL_MODEL"`, no non-FULL_MODEL
   sport appears, and the set is non-empty.
2. **Iteration over a memorised list → derive it.** `for (const s of ["nba","mlb"])` becomes
   `for (const s of MODELED_SPORT_KEYS)`.
3. **Mixed-sport MECHANICS → fixture predicate** via `allSportsEligible`, never real sport keys.
4. **Leg/slip filter tests** (`filterOfficialSuggestedSlips`, `filterBuildYourOwnLegs`,
   `unsupportedSportsIn*`) take slip objects, so they need fixture SLIPS whose sport tags are the
   synthetic keys, plus an injectable predicate on those helpers too — this is the part that expands
   the change beyond `sport-capabilities.ts`.

Steps 1–2 are mechanical (a scripted pass converted 9 tests cleanly). Step 4 is where the remaining
work is: those helpers currently read module state directly and need the same predicate parameter.

## Guardrails for whoever does this

- Never assert "NBA is modeled" again in any form. Assert the invariant.
- Do not delete a mixed-sport test to make the suite pass — convert it to fixtures. Losing coverage of
  multi-sport gating is exactly the regression this migration could introduce.
- `hasGrading` must stay TRUE for HISTORICAL_ONLY sports, or `/results` loses NBA's real archive.
- Money md5 `affe6b21071f2b3be96bb2774eb347c3` and the Bank Builder approval gate are untouched by any
  of this — it is presentation/eligibility only.

## What is already true today, without this migration

- `/events` badge and blurb are honest (registry-driven).
- `canEnterPredictionProducts` exists, is tested, and fails closed.
- No incorrect NBA content can currently reach a user: the off-season boards are empty, so no NBA leg
  exists for the stale gate to admit. The gate is wrong, not fail-closed — it starts mattering when
  NBA data returns (~October 2026).

---

## ✅ EXECUTED — Sprint 026 · Phase 2

The migration is complete. `SPORT_CAPABILITIES` now applies `applyCapabilityRegistry(...)` on top of
`capabilitiesForLevel(...)`, so coverage `level` and the evidence-backed registry must BOTH clear a
sport before it enters a product. NBA (`level: "full"`, registry `HISTORICAL_ONLY`) is now correctly
refused by suggested parlays and Build Your Own, while keeping `hasGrading` and its `/results`
archive.

**Blast radius was 8, not 23** — the extraction landed first. `allSportsEligible` plus an optional
`SportEligibility` predicate threaded through the slip/leg/section helpers absorbed most of the
conversion before the production flip, so only 8 tests across 4 files had to change.

Two things the original recipe did not anticipate:

1. **`generateCustomParlaysFromPool` was fail-open.** It takes an arbitrary `legs` array and its
   `multi` mode deliberately keeps every sport, so an unfiltered caller could put an ineligible sport
   into a generated slip. The UI path was safe (`getLegPool` filters), but the boundary was not.
   `_filterPool` now applies `filterBuildYourOwnLegs` itself — idempotent for an already-filtered
   pool, fail-closed for any future caller.
2. **The UI's sport selector was a separate hardcoded list.** `SPORT_OPTIONS` in
   `components/custom-parlay-generator.tsx` offered "🏀 NBA" independently of capability, and
   `buildSportScopeOptions()` — the capability-derived helper that should have driven it — had no UI
   consumer at all. The selector is now capability-filtered, so an ineligible sport cannot appear as
   a destination that could only ever return an empty pool.

**Tests are fixture-injected, and that created a real risk worth naming.** Converting the mixed-sport
families onto synthetic predicates keeps the mechanics covered, but on its own it would leave the
PRODUCTION path unasserted. `src/lib/capability-product-gating.test.mjs` is the counterweight: every
test there calls production helpers with NO predicate. It was negative-tested three ways (remove the
narrowing → 6 fail; widen instead of narrow → 3 fail; drop the generator's pool filter → 1 fail).

`MODELED_SPORT_KEYS` was NOT deleted. It is now *derived* from the post-narrowing capability table,
so it equals `FULL_MODEL_SPORTS` by construction (asserted in both directions) and is no longer a
gate that can drift from the registry. Deleting it would be churn, not safety.

Suite 2896 (2892 pass / 0 fail / 4 skip). tsc + production build clean. Money
`affe6b21071f2b3be96bb2774eb347c3` and Bank Builder locks `cb80473f88f3cb5f67208fa568925295`
unchanged — this was presentation/eligibility only.
