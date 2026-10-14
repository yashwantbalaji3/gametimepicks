# Data-contract CI guard (proposal, 2026-10-14)

## What happened
On 2026-10-14 at 13:27Z the scheduled `ufc-post-card` grader appended the first **VOID** row to `data/internal/research/ufc/model-vs-market/graded.jsonl`. This was the 10-10 Kareckaite–Gatto draw, appended correctly under #1076.

A parity test in `forecast-ledger.test.mjs` read `g.model.brier` on every UFC row. Void rows carry no score, so the test crashed.

**Main was red from that moment, and no check said so.**
- The data commit used `[skip ci]`, which 33 data workflows do.
- `quality-gate.yml`'s `push` trigger watches only code paths (`app/src`, `app/scripts`, `app/e2e`, `app/api`, …), not data paths.

The failure surfaced only on **PR branches**, because PR CI runs against a merge with current main: #1081, #1084 and #1085 all failed for a reason unrelated to their diffs.

The VOID shape had existed in the code for days. No test had fed one to the parity check, because the committed data had never contained one.

## Two layers, neither adds a Vercel build
| Layer | What | Cost | Catches |
|---|---|---|---|
| **1. Contract fixtures (preventive, done in #1085)** | Every record shape a producer can emit (DECIDED, VOID, WITHDRAWN, PENDING) is fed to its consumers as a **synthetic fixture**, independent of committed data. `classification.test.mjs` and the VOID parity branch are the first examples | 0 | A consumer that cannot handle a shape the producer can emit, *before* real data contains it |
| **2. Scheduled main contract check (detective)** | New workflow `data-contract-check.yml`: on `schedule` (every 3h, offset from the data crons) plus `workflow_dispatch`. It checks out **main HEAD**, runs `npm ci` and `run-suite.mjs --phase unit`, with no build and no deploy. On failure it opens or updates one issue, "main data-contract check failing", naming the failing tests and the newest data commits | **0 $**: public repo, standard runner minutes are free. About 10 min × 8 runs a day. **0 Vercel builds**: workflows do not deploy; only pushes to main do | Any data commit that breaks a test on main, within ≤ 3h, instead of whenever the next PR happens to run |

### Why not the alternatives
- **Dropping `[skip ci]` from data commits:** about 60 full quality-gate runs a day (each about 25 min with build and e2e). That's noisy and slow, and still detection-only.
- **Adding data paths to the `push` filter:** the same problem. Also, `[skip ci]` suppresses every push workflow anyway.
- **Running the unit suite inside every data workflow before it commits:** strongest prevention, but it edits 33 protected workflows and adds about 8 minutes to each data lane, which already run hours late. Worth it for the few lanes that write **graded/settlement** records (`ufc-post-card`, `nightly-settle`, `nfl settlement receipts`, `epl-matchweek` grading) as a phase 2, using a curated subset (forecast-ledger, results projection and settlement tests) rather than the whole suite.

## Proposed workflow (for review; protected-workflow change) — committed as `.github/workflows/data-contract-check.yml`
```yaml
name: data-contract-check
on:
  schedule:
    - cron: "47 */3 * * *"      # every 3h, off the hour the data lanes cluster on
  workflow_dispatch:
permissions: { contents: read, issues: write }
concurrency: { group: data-contract-check, cancel-in-progress: true }
jobs:
  unit:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults: { run: { working-directory: app } }
    steps:
      - uses: actions/checkout@v5
        with: { ref: main }
      - uses: actions/setup-node@v5
        with: { node-version: "20.4.0", cache: npm, cache-dependency-path: app/package-lock.json }
      - run: npm ci
      - name: Unit + contract suite on main HEAD
        run: |
          set -o pipefail
          node scripts/ci/run-suite.mjs --phase unit 2>&1 | tee /tmp/suite.log
          fails=$(grep -cE '^not ok' /tmp/suite.log || true)
          echo "failing=$fails" >> "$GITHUB_OUTPUT"
          [ "${fails:-0}" -eq 0 ]
      - name: Open or update the tracking issue
        if: failure()
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          body=$(grep -E '^not ok' /tmp/suite.log | head -20; echo; git -C .. log -8 --format='%h %cI %s' origin/main)
          n=$(gh issue list --state open --search "main data-contract check failing in:title" --json number --jq '.[0].number')
          if [ -n "$n" ]; then gh issue comment "$n" --body "$body"; else gh issue create --title "main data-contract check failing" --body "$body"; fi
```

## Recommendation
- Approve Layer 2 (one new workflow, no edits to existing ones).
- Adopt Layer 1 as a rule: a producer PR that adds a record shape must add a synthetic fixture for each consumer.
- Defer the phase-2 pre-commit subset for settlement lanes until after launch.

## Phase 2: targeted contract check inside data workflows (prototype, 2026-10-14 evening)
**Question:** can the data-commit workflows run a lightweight integrity check, so grading data cannot silently break `main`, without heavy suites or Vercel builds?

**Answer: yes, at about 7 seconds per run.**

| Piece | What it does |
|---|---|
| `app/scripts/ci/run-data-contracts.mjs` | Reads the **staged** paths and runs only the contract tests mapped to them in `app/scripts/ci/data-contracts.json`: a 4-test core (Forecast Ledger, results reader parity, projection parity, forecast record) plus the lane's own settlement and grading tests. If nothing maps, it runs nothing. A listed test that is missing exits 2, never a silent pass |
| Lanes mapped | ufc-grading, nfl-settlement, mlb-grading, parlay-settlement, epl-grading, nba-results, forecast-ledger. Every path is one some workflow actually stages, and a test enforces that |
| Cost | Measured 6.8–7.8 s per lane on today's data (52–84 tests). No build, no deploy, no extra install in lanes that already run `npm ci` |
| **Proof** | Replayed against `main`'s state before the fix (the old parity test plus the real VOID row): the UFC check **fails in 7.1 s, naming `parity: ledger Brier / log loss equal every owner…`**. Today that break went unnoticed for hours |

**Policy: never block the data.** A correct settlement must not be discarded because a reader cannot parse it.
- The contract step is `continue-on-error`.
- The lane commits as before.
- A final step then fails the run (red run, GitHub notification) when a contract broke.

**Wired in this PR:** `ufc-post-card` only, the lane that broke today, as the reviewed example.

**Proposed next:** the same two steps in `ufc-results-refresh`, `nightly-settle`, `nfl-event-window` (settlement receipts), `epl-settle` and `nba-results-refresh`. Each is a protected-workflow edit for review. `nightly-settle` stages many paths, so it would run several contracts (about 15–20 s).

**Rule (layer 1):** a producer PR that adds a record shape adds a synthetic fixture for each consumer, and lists the consumer test in `data-contracts.json`.
