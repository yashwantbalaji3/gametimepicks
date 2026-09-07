# Program 240 · resume state

Start `8c640e790` (bot tip at cold start; P239 docs tip `d344129ee` + 11 auto commits) →
implementation tip `7934ffc32`, **deployed and verified** (Vercel built 2026-09-07T07:45Z,
verify:deployment OK, prod = local HEAD). Protected money untouched:
`affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295` — both verified at
baseline. Two stashes and untracked `vp/` preserved. **Zero provider credits spent.**

## Commits (all gated: full unit suite + 458 rendered guards, each)

| SHA | What |
|---|---|
| `b94d27c0d` | A: epl-matchweek noisy detector — fixture-gap skip writes a decision receipt |
| `7c9f0b1bb` | C1: MLB population capture today+6 + simulate date owner unions statsapi-schedule + SCHEDULE_ONLY day rows |
| `533a2947d` | C2: evidence-backed Brighton alias (heals the Sep-13 quarantine) |
| `83feafe38` | B: NFL Week 1 regular-season publication path (see below) |
| `51723a9b4` | D: dual-lane moonshot settler + cumulative positions + page reconciliation |
| `cc0a655ba` | F: route-table reclassifications (/homer-nukes public, /world-cup-specials archive) |
| `7934ffc32` | E: probabilitySource provenance + /today past-slate chip |

## NFL Week 1 (Release B) — exact state

16 official games verified 3× vs ESPN (repo capture 16/16, 0 kickoff drift; DEN@KC Mon 9/14 is
the one extension past 9/13). All 16 render on /nfl. Regular events publish under
`nfl-regular-season-public-v1` (PUBLIC_EXPERIMENTAL), simulated through the ALREADY-EVALUATED
engines (model-v1-elo-analytic train 23–24 / held-out 25 + gamesim-v1), params frozen from the
receipts, ⅓ season-boundary regression applied explicitly. Preseason-share player/TD/full-game
lanes refuse regular events typed. First natural generation: the Sep-9 14:30Z/15:00Z
event-window runs (both admit the opener; 21:00Z drift risk documented — last guaranteed pass is
the 15:00Z pair). Harness: `npx tsx --test app/src/lib/sports/nfl/regular-season-forecasts.test.mjs`.
Odds stay founder-gated: `AUTHORIZE:NFL` per the priced draft at
`docs/receipts/DRAFT_ODDS_AUTHORIZATION_NFL_2026_REGULAR.md` (Option A recommended: h2h+spreads+
totals bulk, 250-credit ceiling, `Expiry: the ceiling` parses under committed expiryTerm()).

## Pending acceptance events (observe, do not re-do)

1. **nightly-settle** (~09:30–11:45Z real, drifted crons): first production settlement of the
   four Sep-6 daily cards (`bank-builder-lane-a/b-step-1`, `moonshot-lane-a/b-2026-09-06`) AND
   first application of the dual-lane fix (moonshot lane B `moonshot:b:c1:s1:2026-08-17` grades
   LOST — dry-run verified against official box scores — restart cycle 2). Also lands the first
   rows of the forward-evaluation window.
2. **daily-products workflow_run**: first natural firing follows the next mlb-daily-production
   completion (~14:15Z+). Trigger deployed 2026-09-06 21:31Z; could not have fired before.
3. **CI quality-gate on `7934ffc32`** — cumulative tree (runs on cc0a655ba and b94d27c0d were
   superseded/cancelled by later pushes; coverage is the cumulative run).
4. **Forward evaluation** `mlb-isotonic-2026-09-forward`: 0 eligible rows at checkpoint;
   threshold 2,000 ≈ Sep 10–12. Do not run before; never peek-and-promote.

## Named findings, deliberately NOT changed

- /nfl hub section order (settled-archive adapter table first, hero's "See the slate" primary
  right after) is the shared hub contract — cosmetic observation, next hub-migration program.
- UFC internal-maturity registry rows stale (sport-capability SCAFFOLD_ONLY note vs live engine;
  legacy ops-status artifacts; schedule-latest.json orphan in fight-week allowlist) — engine
  truth is current everywhere public; repointing the registry touches the activation-eligibility
  gate (publicActivationEligible must stay mlb-only) and deserves its own careful change.
- UFC per-bout report routes: 0 individual (card-level only), disclosed honestly on /ufc.
- Ladder-resume generation stays gated on multi-lane exposure accounting in the Mr. Dub paper
  ledger (single-active-card model) — the exact blocked operation is named on /moonshot; the
  repair-and-resume disposition stands, not re-asked.

## Founder decisions outstanding (unchanged, unsynthesised)

`AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` (draft prepared) · `CONSOLE_REDEPLOY:RUN` ·
multi-lane exposure accounting: build / pause / retire (product decision).

## Reproduction

    npm run gate                                                       # app/: typecheck+suite+build+built-suite
    npx tsx --test app/src/lib/sports/nfl/regular-season-forecasts.test.mjs
    npx tsx --test app/src/lib/products/ladder-settlement.test.mjs     # dual-lane scenarios
    npx tsx --test app/src/lib/sports/epl/odds-capture-decision.test.mjs
    npx tsx app/scripts/products/settle-ladder-cards.mjs               # dry run vs real store
