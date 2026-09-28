# Engineering — start here

This is the **current** shape of GameTimePicks and the rules that keep it honest. It is not a history.
For what happened recently, read the newest entry in [`HANDOFF_INDEX.md`](./HANDOFF_INDEX.md). For how
the daily automation runs, read [`OPERATOR_ONBOARDING.md`](./OPERATOR_ONBOARDING.md) and
[`DAILY_OPS.md`](./DAILY_OPS.md). The shared roadmap and who owns what lives in the GitHub Project
**GameTimePicks — Public Launch Roadmap**.

> The repository is the source of truth. Where this page and the code disagree, the code wins — and
> the page gets a PR.

---

## 1. Product architecture

GameTimePicks is a sports forecasting product across **NFL · MLB · EPL · UFC**. Every surface answers
one of five questions:

| Axis | Surface | What it is | Where it lives |
|---|---|---|---|
| **PAST** | Research · Results | recorded fact and settled outcomes | `/research/`, `/teams/`, `/players/`, `/compare/`, `/results/` |
| **PRESENT** | Live | what is happening in the game right now | `/live/` — `src/components/live/`, `src/lib/live/`, `api/live.mjs` |
| **FUTURE** | Predictions · Simulations | frozen pregame forecasts and the sims behind them | `/nfl/`, `/mlb/`, `/epl/`, `/ufc/`, game reports, `/models/` |
| **PERSONAL** | My GameTime | following, saved forecasts, "what changed" | `/my/`, `/saved/`, `/following/` — `src/lib/my/`, `src/lib/follow/` |
| **INTERFACE** | Ask GameTime | a grounded question-answering layer over the above | `/ask/` — `src/lib/ask/`, `api/ask.mjs` |

**Stack.** A Next.js static export (`app/`, Node **20.4** — pin Next 15.5.x) served by Vercel, a handful
of Vercel serverless functions (`app/api/*.mjs`: the live gateway, Ask, analytics collector), and
GitHub Actions workflows (`.github/workflows/`) that run the producers (`app/scripts/`, `pipeline/`)
and commit generated artifacts. Most product data is a **committed JSON artifact** read at build time.

**The flow every feature follows:**

```
owner (a source or a model)
  → producer (a script, run by a workflow)
    → committed artifact (data/ or app/public/data/)
      → projection (a smaller read model for one surface)
        → UI
```

Never create a second source for something an owner already produces. If a surface needs a value,
find its owner and read the owner's artifact — do not re-derive it beside the original.

---

## 2. Data ownership

| Data | Owner | Lifetime |
|---|---|---|
| **Pregame forecast** | the model | **frozen** at publication; immutable once kickoff passes |
| **Live event state** | the provider (ESPN / MLB StatsAPI) — factual | ephemeral, current |
| **Final result** | canonical **settlement** | permanent |
| **User preferences** | the user's device / account | local until deliberately migrated |

These boundaries do not blur. The live layer never rewrites a forecast; settlement never reads a
live value as a result; a UI never "fixes" a frozen number.

---

## 3. Semantic rules

- **Missing ≠ zero.** No observation is not a measured `0`. `null` renders as "—" or "awaiting", never `0`.
- **A live threshold crossing is not a result.** During a game the only allowed language is
  `CURRENTLY ABOVE LINE` / `BELOW LINE` / `AT LINE`. `HIT`, `MISS`, `WIN`, `LOSS`, `CASHED` come
  only from canonical settlement.
- **Market probability ≠ model probability.** A de-vigged sportsbook price is a price. Never place it
  in a `modelProbability` field, and never manufacture "confidence" from odds, a line gap, an interval
  width or live performance.
- **Frozen values never mutate after kickoff.** A producer that sees a newer board keeps the frozen
  record and counts the refusal; it does not backfill.
- **An unsupported state does not become public because a UI wants a value.** Promotion is an
  explicit allowlist decision made upstream (§4), never a UI default.
- **Stable IDs beat names.** Players join by canonical provider id (ESPN athlete id,
  `predictionId = {providerEventId}:{playerId}:{family}`). No fuzzy name matching anywhere.
- **Never fabricate** odds, lines, probabilities, projections, identities, availability, roles,
  results, stats or history. A fallback value is a claim — if the real one is unknown, say unknown.
- **Portraits are a requirement, not polish** — canonical ESPN id only, initials + team fallback,
  never a generic or wrong face.

---

## 4. Model and state vocabulary

Match these **exactly**, with explicit allowlists — never substring logic (`state.includes("AVAILABLE")`
would admit `AVAILABLE_ROLE_UNCERTAIN`).

**Publication states a public surface may show** (the V2A featured allowlist,
`src/lib/live/featured-forecasts.mjs`): `PUBLISHED`, `VALIDATED_PICK`, `ADOPTED`.

**States that can never be promoted** (`BLOCKED_MODEL_STATUSES`,
`src/lib/products/eligible-leg/contract.mjs`): `REJECTED`, `STOP`, `PAUSED`, `HOLDING`, `PRIVATE`,
`SHADOW`, `HISTORICAL_ONLY`, `UNSUPPORTED`.

**Other states you will meet:**

| State | Meaning |
|---|---|
| `ESTIMATE` / `ESTIMATE_BELOW_BAR` | shown, clearly labelled, but has not earned validated status (NFL passing yards, P318 STOP) |
| `DEMOTE_TO_MARKET_CONTEXT` | the model lost to the market on a preregistered test; the market is shown as context, not as our forecast (all MLB player-prop families) |
| `EXPERIMENTAL` / `EXPERIMENTAL_PUBLIC` / `EXPERIMENTAL_LEAN` | published and graded, **not** a product pick (NFL game forecasts) |
| `UNEVALUATED` | no evidence either way — not publishable |

**Forecast classes** (`FORECAST_CLASS`): `VALIDATED_MODEL`, `EXPERIMENTAL_MODEL`,
`MARKET_IMPLIED_NO_FORECAST`, `PRIVATE_OR_SHADOW`.

**NFL participation** (`src/lib/sports/nfl/participation-states.mjs`): `CONFIRMED_OUT`,
`EXPECTED_STARTER`, `EXPECTED_ROTATION`, `LIMITED`, `AVAILABLE_ROLE_UNCERTAIN`, `DEPTH_ONLY`,
`UNKNOWN`, `SOURCE_STALE`, `STARTED_LOCKED`. Most board rows are `AVAILABLE_ROLE_UNCERTAIN`: official
actives publish ~90 minutes before kickoff, after the board freezes.

**Current NFL player families:** `player_rush_yds`, `player_reception_yds`, `player_receptions`,
`anytime_td` — `PUBLISHED`. `player_pass_yds` — `ESTIMATE` (never featured). Check the board's own
`families[key].state` before relying on this table.

---

## 5. Repository discipline

```
merge origin/main INTO your branch — never rebase
git add <explicit paths> — never git add -A / git add .
one small coherent PR per change; never share a feature branch with another engineer
never hand-edit a generated artifact when a producer exists — re-run the producer
exact-head CI green before merge; then verify MERGED state and DEPLOYED state separately
```

**Guards must test behaviour.** A test that passes because today's data happens to look a certain way
is not a guard. Prefer pure functions, deterministic fixtures and synthetic states over whatever the
slate holds tonight. (`docs/` has several incidents where a guard went red — or worse, green — because
the calendar moved.)

**Mutation probes must prove the mutation applied.** Mutate the *function* the guard protects, assert
the replacement actually landed (exactly one occurrence, file differs), watch the guard go red, then
restore. Deleting an assertion proves nothing — a removed assertion cannot fail.

**Commands** (from `app/`):

| | |
|---|---|
| unit + contract suite | `node scripts/ci/run-suite.mjs --phase unit` — read the `# fail` count, not `$?` |
| one file | `npx tsx --test src/lib/<area>/<file>.test.mjs` |
| build | `npm run build` (static export into `out/`) |
| rendered guards | `node scripts/ci/run-suite.mjs --phase post-build` (needs `out/`) |
| Ask eval (offline, never billed) | `ASK_MODEL_PROVIDER=fake npm run ask:eval` (after a build) |
| e2e | `npm run e2e` — serves the built export |
| types | `npm run typecheck` |

CI (`quality-gate.yml`) runs all of the above on every PR touching `app/**`, `pipeline/**` or
workflows. Production answers `curl` with a Vercel challenge at times; verify Production through a
browser, and read the deployed commit at `/data/build-info.json`.

**Bots commit to `main`.** Scheduled workflows push generated data directly (`auto: …` commits, usually
`[skip ci]`). Fetch before you push, merge `origin/main` into your branch, and expect main to move
under you.

---

## 6. Current workflow state

| Workflow | State | Note |
|---|---|---|
| `nfl-live-props` (paid, Phase H in-play odds) | **disabled_manually** | spent 3 credits then crashed on 2026-09-27 (`docs/incidents/2026-09-27-phase-h-unledgered-charge.md`). **Do not re-enable without founder authorization.** |
| `nfl-live-props-free` | active, **manual dispatch only** | no schedule, no provider key; runs the shared `capture-live-props.mjs`, commits only `app/public/data/nfl/live-props/` |
| Phase H budget | **3 spent / 87 remaining of 90** | one `RECONCILED` ledger entry, recorded through `recordReconciledCharge()` — never by hand-editing the ledger |

Paid provider calls are bounded by authorization receipts in `docs/receipts/` and ledgers under
`data/internal/research/odds/`. No workflow or script change may widen spend without a founder
decision.

---

## 7. Current roadmap

Tracked in the GitHub Project. In priority order:

1. **Live Hub V2** — progress rails + TD primitives (V2B), game-centric cards (V2C), View All +
   honest freshness (V2D). *Yash.*
2. **Reliability** — time/slate-independent guard audit, then Free Live Measurement Delivery V2
   (bounded server-side capture → canonical live-props owner → CDN, never browser → ESPN fan-out).
   *DP.*
3. **Public launch** — performance, accessibility, mobile QA, observability, deployment hardening,
   legal, SEO, rollback readiness.
4. **Builders** — ProductEligibleLeg V2 → Parlay / Bank Builder / Moonshot methodology rebuild.
5. **Models** — NFL Engine V2 publication decision, role certainty, EPL coverage, UFC, MLB research.
   Promotion only where evidence supports it.

---

## 8. Sensitive areas — founder review required

These are listed in `.github/CODEOWNERS`. A change here needs Yash's review, however small it looks:

- **Model publication / promotion policy** — what state a family or model is in, and what may be shown.
- **Probability semantics** — `modelProbability`, confidence, calibration, eligibility contracts
  (`src/lib/products/eligible-leg/`).
- **Settlement semantics** — what HIT / MISS / VOID mean and when they may be shown.
- **Provider authorization and spend** — `docs/receipts/`, `src/lib/sports/odds/`, ledgers.
- **Production workflows** — `.github/workflows/`.
- **Public-data exposure** — `app/scripts/prune-internal-routes.mjs` decides what the export publishes.
- **Ask safety** — the verifier and contract (`src/lib/ask/verifier.mjs`, `contract.mjs`).
- **Legal / policy copy** — terms, privacy, responsible use.

Everything else — UI, tests, reliability, performance, accessibility, docs — is normal PR review.

**Never** commit secrets or personal contact details. Keys live in the repo-root `.env` locally and in
GitHub/Vercel secrets remotely; nothing in a doc or an issue ever asks you to paste one.
