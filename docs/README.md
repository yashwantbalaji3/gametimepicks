# GameTime Picks — Documentation

This is the documentation map for GameTime Picks, a sports-statistics product that publishes model projections, game forecasts and results.

- **Production:** https://gametimepicks.yashwantbalaji.com
- **Sports in scope:** NFL, NBA, MLB (offseason), UFC, EPL, Ligue 1. La Liga has research data only: a walk-forward report and shadow forecasts under `data/internal/research/soccer/laliga/`, with no public product.
- **Public label:** model output is labelled **MODEL PROJECTION**. Nothing here claims a guaranteed or target hit rate. See [`KNOWN_LIMITATIONS_AND_RISKS.md`](./KNOWN_LIMITATIONS_AND_RISKS.md).

> **Verify, don't assume.** The live repo and production win over any doc. Before trusting a "current state" line, check `git rev-parse origin/main`, `gh pr list` and production. When a doc disagrees with the repo, fix the doc.

**Paths** are repo-relative. Operational evidence (founder decisions, approval ledgers, release verifications, provider receipts that carry private data) is held privately by the Program Director and is not copied into this public repo. Docs may refer to it but never reproduce it.

---

## How the documentation is organised

Each topic has **one canonical doc**. Supporting docs are listed beside it.

**Historical material stays where it is.** "Archived" is an index status, not a move: many superseded docs are still named by code, tests or committed data, and moving them would break those references.

**Protected records are linked, never edited or paraphrased.** These are:
- preregistrations;
- authorization receipts;
- approval records;
- incident records;
- frozen forecasts and settled results.

## A. Product, models and architecture

| Topic | Canonical doc | Supporting |
|---|---|---|
| System architecture | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`ENGINEERING_START_HERE.md`](./ENGINEERING_START_HERE.md), [`DATA_PIPELINES.md`](./DATA_PIPELINES.md), [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) |
| Sports coverage | [`SPORTS_COVERAGE_POLICY.md`](./SPORTS_COVERAGE_POLICY.md) *(sport list needs refresh)* | [`SPORT_TO_PROVIDER_DATA_MAP.md`](./SPORT_TO_PROVIDER_DATA_MAP.md) |
| Model promotion | [`MULTISPORT_PROMOTION_GATES.md`](./MULTISPORT_PROMOTION_GATES.md) | Preregistrations (protected). Promotion requires a preregistered validation **and** founder approval. |
| Participant eligibility | Shared availability module `app/src/lib/availability/eligibility.mjs` | [`V17_SPORT_ELIGIBILITY_MATRIX.md`](./V17_SPORT_ELIGIBILITY_MATRIX.md); NBA player-eligibility contract below |
| Data providers | [`PLATFORM_VENDOR_AND_API_INVENTORY.md`](./PLATFORM_VENDOR_AND_API_INVENTORY.md) | [`SPORT_TO_PROVIDER_DATA_MAP.md`](./SPORT_TO_PROVIDER_DATA_MAP.md) |
| Odds and compliance | [`receipts/`](./receipts/): every odds capture or display runs under a named founder receipt | [`odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md`](./odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md) |
| Website / UX | [`UX_DESIGN_STANDARDS.md`](./UX_DESIGN_STANDARDS.md) | [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) *(stale)*, [`ASK_GAMETIME.md`](./ASK_GAMETIME.md), [`PARLAY_LAB_V2.md`](./PARLAY_LAB_V2.md) |
| Results and settlement | [`V19_RESULTS_TRUST_ARCHITECTURE.md`](./V19_RESULTS_TRUST_ARCHITECTURE.md) | [`CANONICAL_SETTLEMENT_WRITER.md`](./CANONICAL_SETTLEMENT_WRITER.md), [`FORECAST_LEDGER.md`](./FORECAST_LEDGER.md) |
| Command Center (social publishing) | [`ADMIN_DEPLOYMENT_GTP_OPS.md`](./ADMIN_DEPLOYMENT_GTP_OPS.md) | The console, its approval flow and the Executive Bridge (mock only) live on the Command Center branch; their runbooks land with the reviewed safety install. |

### Canonical prediction rules (summary)

- **One forecast for every product.** Every product (website, Top Boards, Trends, Theater, social graphics, Command Center packages) reads the same official forecast. What-if simulations never feed picks.
- **Forecasts are immutable once frozen.** A post-freeze change, such as an injury, is shown as a separate, dated availability note. The frozen forecast is never rewritten.
- **Missing injury data means available.** A player with no injury entry is treated as available. A withheld player or stat is blanked on public cards, never filled with a placeholder.

### NBA player-eligibility contract (pending PR #1332, flag OFF)

- **Producer output:** `app/public/data/nba/player-eligibility/<date>.json`, schema `gtp.nba.player-eligibility@1`.
- **Fields:** `{schema, sport, date, players, withheld}`. Each `withheld` key is `"<playerId>.<stat>"`.
- **One shared reader for website and social.** Website surfaces and social graphics read it through one shared module, so a stat the social guard withholds is withheld on the site too.
- **Rewritten only on material change.** The producer rewrites the file only when a material eligibility decision changes.
- **The minutes model is still open.** Withholding implausible projected minutes is a guard, not a model fix. The minutes model correction is tracked separately and is not promoted without validation.

## B. Operations

| Topic | Canonical doc | Supporting |
|---|---|---|
| Release policy | This section | [`deploy.md`](./deploy.md), [`VERCEL_CANONICAL_OPERATING_RUNBOOK.md`](./VERCEL_CANONICAL_OPERATING_RUNBOOK.md), [`COST_001_VERCEL_COST_CONTROL.md`](./COST_001_VERCEL_COST_CONTROL.md) |
| Daily automation | [`OPERATOR_ONBOARDING.md`](./OPERATOR_ONBOARDING.md) | [`runbooks/README.md`](./runbooks/README.md) |
| Sport event runbooks | [`NFL_EVENT_DAY_RUNBOOK.md`](./NFL_EVENT_DAY_RUNBOOK.md), [`nba/NBA_LINES_RUNBOOK.md`](./nba/NBA_LINES_RUNBOOK.md), [`../app/scripts/nba/launchd/README.md`](../app/scripts/nba/launchd/README.md), [`EPL_CORRECTIONS_RUNBOOK.md`](./EPL_CORRECTIONS_RUNBOOK.md), [`UFC_WEEKEND_RUNBOOK.md`](./UFC_WEEKEND_RUNBOOK.md), [`MLB_OPERATIONAL_RUNBOOK.md`](./MLB_OPERATIONAL_RUNBOOK.md) | — |
| Incidents and rollback | [`INCIDENT_AND_ROLLBACK_RUNBOOK.md`](./INCIDENT_AND_ROLLBACK_RUNBOOK.md) | — |
| PR history | [`RELEASE_AND_PR_HISTORY.md`](./RELEASE_AND_PR_HISTORY.md) *(stale since 2026-06)* | — |

### Release policy (as operated since 2026-11-11)

- **Release window.** Production merges happen only between **04:00 and 21:30 UTC**.
- **Release gate (v1).** Every merge goes through the release gate, which merges only when **all** of these hold:
  - the PR head equals the exact reviewed commit (`--match-head-commit`);
  - the PR is open, mergeable and clean;
  - the required `quality` and `python` checks succeeded;
  - no check on that head failed or was cancelled, including old runs;
  - no other workflow is in progress anywhere in the repo, apart from the deploy flush;
  - the current time is outside minutes :25–:45 of the hour.
- **Recovering from a red `main`.** A PR whose head carries a failure from a red `main` gets `main` merged in, which gives it a new head. Close/reopen does not work.
- **The gate cannot be bypassed.** It is never edited to force a merge. Legitimate CI is never cancelled to speed up a release. A proposed v2 gate was rejected on independent review and rolled back.
- **Branch history.** Merge, never rebase or force-push.
- **Deploys.** Only `main` and `preview/**` pushes deploy; other branch pushes run CI only.
- **Production evidence.** Each release records its gate log and a production verification.
- **Local heavy work.** Builds, full suites and Playwright runs take the shared build lock. Each one runs a disk-capacity preflight first and is blocked below 25 GiB free.

## C. Founder decisions and authorizations

- **The founder-decision register is the canonical list.** It is maintained privately by the Program Director and holds one row per decision, with its source and what superseded it.
- **What the repo carries:** odds authorization receipts ([`receipts/`](./receipts/)) and approval records (`docs/launch/approvals/`, `docs/decisions/`). These are protected records.
- **Approvals are founder-typed only.** A token held by an automation is never a founder approval.

## D. Historical archive (index only; nothing is moved)

| Group | Catalog |
|---|---|
| Handoffs, sessions, program logs | [`HANDOFF_INDEX.md`](./HANDOFF_INDEX.md) *(stale since 2026-10)* |
| Audits, reports, research | [`MODEL_AUDITS_INDEX.md`](./MODEL_AUDITS_INDEX.md), [`audits/README.md`](./audits/README.md) |
| Generated references, older material | [`archive/README.md`](./archive/README.md) |

Governance: [`DOCUMENTATION_GOVERNANCE.md`](./DOCUMENTATION_GOVERNANCE.md). Every behaviour-changing PR updates the matching canonical doc.

*Index refreshed 2026-11-12; previous version 2026-06-02.*
