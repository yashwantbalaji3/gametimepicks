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
