# Settlement without a Vercel build: architecture and cost assessment (2026-10-09)

**Scope:** an ASSESSMENT under `LEDGER-001`, `RESULTS-001`, `OPS-001` and `COST-001`. Nothing here is implemented or migrated. `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` remains the only roadmap; this file is evidence it references.

## 1. What happens today
Every settlement job commits to `main`, and almost every one stages files under `app/public/data/**`, which is a Vercel BUILD_INPUT (`app/scripts/vercel-ignore-build.sh`). **Each settlement is therefore a full Production build.**

| Job (`.github/workflows/`) | Triggers | Commits a build input? |
|---|---|---|
| `nightly-settle.yml` (MLB, NBA, cross-sport) | 4 daily crons, then the chain morning-projections → mlb-daily-production → daily-products | **Yes.** `app/public/data/{results,mlb/results,parlays,curated,bank-builder,products,mr-dub,…}`, plus a second commit to `data/internal/forecast-ledger/` (also a build input) |
| `nfl-event-window.yml` | `0 15`, `0 21` and `30 14` daily; `0 13` Fri/Sat/Sun; dispatch | **Yes.** The window commit writes `app/public/data/nfl/`. The receipts commit is mostly `data/internal/nfl/**` (not a build input, including the World Model V2 grades) but also stages `app/public/data/nfl/{interval-calibration.json,reconciliation/,live-props/}` |
| `nfl-live-props.yml` | every 15 minutes in game windows | **Yes** (`app/public/data/nfl/live-props/`, `live-markets/`) |
| `nba-results-refresh.yml` | hourly (`41 * * * *`) plus extra night slots | **Yes** (`app/public/data/nba/results/`). Its own header says it builds |
| `epl-settle.yml`, `soccer-leagues.yml`, `ufc-post-card.yml`, `ufc-fight-week.yml`, `results-top-boards.yml` | daily or fight-week crons | **Yes** (`app/public/data/{soccer,ufc,results/top-boards}/`) |
| Private shadows (`nfl-props-forward-shadow`, `nfl-sim-v2-shadow`, `soccer-dc-shadow`, `nflverse-weekly`) | various | No (`data/internal/research/**` only) |

**Observed:** 34 of 39 Production deployments between 21:00Z on Oct 8 and 13:15Z on Oct 9 were automated data commits. **COST-001 context:** Build CPU is about 99.9% of the bill, and bot data commits were already measured at about 36% of build CPU.

**How pages read results:**
- **At build time:** most Results pages, through server reads and `generateStaticParams`.
- **In the browser, from static `/data/*` files** that ship inside the deployment, so they change only after a build:
  - `nfl-family-drilldown`
  - `model-results-explorer`
  - `/saved` (graded-picks files)
  - `/my` (saved-settlements)
  - `use-live-props`
- **At runtime through an API:** only `/api/live`, which serves scores and state, never grades.

**Latency example:** TB @ DAL went final at about 03:30Z on Oct 9. It had not been graded at 13:41Z, because grading waits for the next `nfl-event-window` delivery, and the GitHub scheduler starts that 1h40m–4h55m late.

## 2. Building blocks already in place
- **Vercel functions:** root-level `app/api/*.mjs` files deploy as functions alongside the static export. `/api/live` is one. Cache headers are `s-maxage=<ttl>, stale-while-revalidate` with per-state TTLs.
- **Vercel Blob** (`@vercel/blob`): already used by `api/collect.mjs` (append-only buckets) and `api/analytics-retention.mjs`, with `BLOB_READ_WRITE_TOKEN`.
- **Supabase** (`@supabase/supabase-js`): accounts schema, RLS tested by `rls-live.test.mjs`, server use in `api/slip-read.mjs`. **There is no results or ledger table.**
- **Finality semantics:** NFL props move LIVE → FINAL_PROVISIONAL → FINAL_CANONICAL with a 3-hour reconciliation window. Corrections are appended and never rewritten. NFL winners settle once, and they change only through a committed correction log.

## 3. Options

| | A. Coalesced publication windows | B. Runtime results store on Vercel Blob | C. Supabase results table |
|---|---|---|---|
| **What changes** | Settlement jobs still commit, but each job's build-input files go to a staging path or branch. A publish job promotes them on a fixed schedule (for example 4–6 slots a day, plus a post-final slot on game days). This is COST-001 option E. | Settlement writes immutable, versioned JSON to Blob (`results/<sport>/<family>/<eventId>/<version>.json`, plus a small `latest` index). A new `api/results.mjs` function, or public Blob URLs, serves them with `s-maxage` caching. Static pages keep their build-time snapshot as the fallback and update in the browser. This is COST-001 option F. | Settlement writes rows to a `settlements` table (append-only, with correction rows). Public read goes through RLS `select` on public columns, or through `api/results.mjs` with the service key. |
| **Builds per settled game** | Shared across a slot: the number of builds becomes the number of slots, not the number of commits | **0** for families served at runtime | **0** for families served at runtime |
| **Grade latency** | Up to one slot interval | Minutes after the settle job runs, which is still bound by the scheduler; a dispatch on final would help | Same as B |
| **Corrections** | Unchanged (git history) | A new version key plus the `latest` pointer; old versions stay readable. Matches the append-only rule | Correction rows with old/new values. Natural for LEDGER-001's "correction events" |
| **Public read security** | Static files, as now | Public-read objects hold only public data. The write token lives only in Actions secrets. There are no user data or PII | RLS select-only on a public view. The service key stays in Actions and server only. Needs a hosted RLS test (`rls-live --hosted`) |
| **New moving parts** | One publish workflow | One function and a Blob namespace, both patterns already in use | A new table, migrations, and a hosted-DB dependency on the public read path |
| **Incremental cost** | Lower build CPU. No new services | Blob storage for KB-sized JSON plus operations, and function invocations largely absorbed by CDN caching. **Has to be measured, not assumed** | Free or low tier at this volume, but a database is now in the critical path |
| **Risk** | Lowest. Freshness drops for families that move often | Moderate: the client must handle "data newer than page" honestly (as-of stamps, stale states) | Highest: schema, RLS and availability |

## 4. Recommendation (subject to founder decision; nothing started)
1. **First: option A for the high-churn, low-urgency families**, such as hourly NBA results captures in the preseason, intraday MLB lineup refreshes and daily product bookkeeping. It needs the founder's data-freshness target per family (COST-001 Phase 3 asks for it). This is the fastest route to fewer builds, and it changes no architecture.
2. **Then: pilot option B on one family** where minutes matter and the data is small: NFL World Model V2 grades and NFL settlement receipts.
   - The settle step writes the versioned JSON to Blob in the same run.
   - `/results/nfl` and the game pages read it at runtime, with an as-of stamp and the build-time snapshot as fallback.
   - Acceptance: 0 additional deployment attempts per settled game, idempotent re-runs, and corrections visible as new versions.
3. **Keep option C** for when LEDGER-001 needs queries across events (Results V2 drill-downs). Do not adopt it for the pilot.
4. **Measure before any saving is claimed:** builds per day and billed CPU before and after (dashboard login needed), and Blob plus function usage after.

## 5. Open questions for the founder
- **The freshness target for each family:** how stale may NBA, MLB, EPL, UFC and NFL results be?
- **Whether a runtime read path is acceptable for public Results:** it means a function dependency at view time, with the static fallback kept.
- **Whether the NFL pilot (option B) should follow the UX-001 navigation merges:** one Production-bound integration at a time.
