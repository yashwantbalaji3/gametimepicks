# Program 084–087 — Execution Log (2026-07-31)

Fresh session; no prior context assumed. Every claim below was reconstructed this session from
git, the filesystem, generated artifacts, GitHub workflow history, and production.

## Lane A — Fresh-session recovery & truth baseline

- **Checkout found on branch `program-069-public-cleanup` at `d1791ce3`** (the audit-docs commit —
  an ancestor of main, despite the stale branch name), tree dirty with the prior session's
  observer output + untracked `vp/` files. Observer output backed up and restored; switched to
  `main`, fast-forwarded 212 commits to **`origin/main = 23e32c1f`**. Pre-existing stashes (2)
  left untouched; `vp/` left untouched and uncommitted throughout.
- **SHA reconciliation:** `d1791ce3` (docs) and `f3e8b2a9` (earlier slate) are both ancestors of
  `23e32c1f`; bot commits since the audit: `2a9f1be5` (morning projections 11:53 ET), `c26c4086`,
  `23e32c1f` (production slates). Production served `23e32c1f` built 16:16 UTC — **deployed SHA =
  origin/main exactly**; no unpushed required work existed.
- **Observer (2026-07-31): WARN** — only the expected `NOT_YET_STAMPED` lineage warning for 07-30
  (flips when the Aug-1 cycle stamps natively). Board 07-31 present (15 games, 319 research rows,
  FULLY_STAMPED native), newest settled 07-30 (23,045 rows), quarantines unchanged (07-28
  permanent, 07-22 research), analytics OFF, internal routes pruned from the export (verified in
  the build: `ops`/`preview` swept).
- **Baseline validation:** typecheck ✓ · production build ✓ · health gate ✓ (17 checks; 2 known
  warnings — the intentionally-unstamped portfolio `generatedAt`) · Python 16 suites / 3,084
  assertions ✓ · JS suite 3,551/3,557 with **2 pre-existing live-slate failures** (see below) ·
  protected md5s byte-exact (`affe6b21…` money, `cb80473f…` BB locks) · zero unauthorized exposure.
- **The 2 pre-existing test failures** (`event-identity` sim-orphan invariant;
  `resolve-team` MEASURED resolution): today's board carries 15 games but only 10 had posted odds
  at generation (11:52 ET); sims cover all 15 and props referenced 3 lean-less games. Root cause is
  slate **timing**, not identity regression: the five orphan gamePks are the five evening games
  without leans. Same mechanism caused 6 straight `daily-lifecycle` quality-gate refusals. Not a
  regression of this session; tests were NOT weakened; adjudication tracked via the Program
  080–083 spawned task, and recorded in the waste register (#11).

## Lane B — Founder approval + webhook proof

- Approval recorded in `ANALYTICS_ACTIVATION_DECISION.md` **§7 (Approve, dated 2026-07-31) + §7.1**
  verbatim constraints; original unsigned record preserved; `ANALYTICS_STILL_BLOCKED.md` updated by
  **append**, not rewrite. Committed separately (`cf5c4186`) before any runtime work.
- `OPS_WEBHOOK_URL` secret exists (created 2026-07-31T16:01:33Z; names-only inspection).
- Informational delivery test: new `OPS_ALERT_TEST=1` mode in `scripts/ops_alert.sh` (labeled
  *"delivery TEST … nothing failed"*, `::notice` not `::error`) + dispatch-only workflow
  `ops-alert-test.yml`. Run **30647650414** succeeded 16:34 UTC; log contains neither the "unset"
  notice nor the "delivery failed" warning ⇒ the POST was accepted. **State: DELIVERY_PROVEN** —
  full chain in `OPS_WEBHOOK_ACTIVATION_PROOF.md`. Redaction/truncation/no-masking/wiring guards
  re-run green (`scripts/ops_alert_test.sh`, extended with test-mode assertions).

## Lane C — Analytics activation state

- **APPROVED_NOT_CONFIGURED** (terminal for this program, by the approval's own scope): no endpoint
  variable exists anywhere (names inspected); sink provably NOOP; no provider chosen, no account
  created. Options package already existed (`ANALYTICS_ENDPOINT_OPTIONS.md`, recommends Option A
  first-party collector, $0). Wrote `ANALYTICS_APPROVED_ENDPOINT_PENDING.md`.

## Lanes D–F — Inventory, billing evidence, sport map

- Full sweep via three parallel read-only audits (providers/env-vars; all 22 workflows + run
  history; storage/deploy surface). Outputs: `PLATFORM_VENDOR_AND_API_INVENTORY.md`,
  `SPORT_TO_PROVIDER_DATA_MAP.md`, `API_USAGE_AND_CREDIT_AUDIT.md`,
  `FOUNDER_BILLING_EVIDENCE_CHECKLIST.md`.
- Key facts: repo is **PUBLIC** (Actions + artifact storage $0 verified); **The Odds API is the
  only wired paid API** (July: 19,982 → 10,300 credits ≈ 9,700 used ≈ 48% of the inferred 20K/$30
  tier); no DB/storage/monitoring SaaS exists anywhere; `.env` verified gitignored and never
  tracked; NBA/UFC/WC paid paths dormant since mid-June; API-Football + balldontlie keys idle.

## Lanes G–H — Waste + shipped no-regret fixes

Register: `WASTE_AND_DUPLICATE_SPEND_REGISTER.md` (13 items). Shipped (all reversible, none
touching cadence/coverage/money):

1. `scripts/automation_refresh.sh` — `timeout` + fail-soft on the offseason-hung `nba_api` hydrate
   (was: 29/29 auto-refresh runs dead at the 25-min timeout, 736 min/3.7 days, queue eviction).
2. `daily-refresh.yml` — cron removed (identical script to auto-refresh; dispatch kept).
3. `mlb-pregame-capture.yml` — artifact retention 90→7 days (~48 GB standing → ~4 GB; tree is also
   committed to the repo).
4. `app/vercel.json` + `app/scripts/vercel-ignore-build.sh` — Ignored Build Step: skip when
   nothing under `app/` changed since `VERCEL_GIT_PREVIOUS_SHA`; every doubt path exits toward
   BUILD; logic tested against real commit spans (docs-only → skip; slate span → build; unknown
   SHA → build). Motivated by proof that Vercel built a scripts-only commit ([skip ci] ignored).
5. `mlb-daily-production.yml` — `workflow_run` chain now requires upstream **success** (was
   double-spending paid ingests after a failed morning run); backstop cron unchanged.
6. `daily-lifecycle.yml` — wired to the shared alerter (5th routed workflow; observer + guard
   updated 4→5; was 6 consecutive silent failures).
7. `nightly-settle.yml` — duplicate `npm ci` removed (verify-then-install).

## Lane I — Financial outputs

`CURRENT_COST_BASELINE.md` (verified $0 + estimated ≈$30/mo, unknowns listed, never zeroed),
`VERCEL_GITHUB_COST_AUDIT.md` (verdicts: Vercel UNKNOWN-plan/right-sized-on-usage; GitHub
RIGHT_SIZED at verified $0), `COST_OPTIMIZATION_30_60_90_DAY_PLAN.md`.

## Validation & secret safety (§16)

- No secret value read/printed anywhere (names only; `gh secret list`). Webhook redaction guard
  green incl. hostile input, truncation, no-masking, no-inline-URL. Analytics: forbidden-field +
  half-config-NOOP + kill-switch guards green in-suite; internal dashboard absent from export
  (prune verified in build log). Disabled-sport ingest state verified (dry-run/dispatch gates +
  `audit:sports` report). Duplicate-paid-call path eliminated (Lane H #5); cache-TTL dedupe proven
  by `spent: 0` ledger entries. UNKNOWN costs kept out of totals. Full serial suite, typecheck,
  build, health, Python: green except the 2 documented pre-existing live-slate failures (above).
  Protected hashes + `vp/` intact and uncommitted.

## Commits this program (main)

`cf5c4186` analytics §7 approval · `7fea87a1` webhook test mode + workflow + observer artifacts ·
`e9800f59` Lane B/C proof docs · `613315f7` Lane H no-regret fixes · `8df72085` audit docs ·
`74e6efc9` two-Vercel-projects addendum — see `PROGRAM_084_087_FOUNDER_REPORT.md`.

## Deployment verification (end of program)

- `8df72085` (touches `app/`) **built and served** on the custom domain (builtAt 17:13:52Z) —
  the ignore command correctly chose BUILD.
- `74e6efc9` (docs-only) produced **zero deployments on both Vercel projects** (GitHub deployments
  API) while production kept serving `8df72085` — the ignore command correctly chose SKIP.
- **The in-repo Ignored Build Step is therefore PROVEN LIVE in both directions**, on both
  projects, on day one. Production serves the intended final app-affecting SHA.
- Late discovery from the same API: every push deploys **two** Vercel projects
  (`gametimepicks`, `gametime-picks`) — build usage doubled; canonical-project decision added to
  the founder checklist (register item #14).
