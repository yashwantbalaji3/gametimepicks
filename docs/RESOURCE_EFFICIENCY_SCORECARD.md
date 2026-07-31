# Resource Efficiency Scorecard (2026-07-31, Program 088-091)

Every metric names its numerator, denominator, and window — no vanity percentages. UNKNOWN
means unverified evidence, never zero. Companion baseline: `RESOURCE_UTILIZATION_BASELINE.md`.

## Resource scorecard (§10.1)

| Resource | Capacity/plan | Current use | Useful use | Waste | Optimization applied | Headroom |
|---|---|---|---|---|---|---|
| Vercel builds | plan-dependent (Pro badge unverified) | ~3–6 builds/day post-fix | ~100% (only app/data changes build, one project) | eliminated: duplicate project (~460 builds/mo), docs-only builds (~7–10/day) | ignore-step + duplicate skip + Git disconnect | large — an order of magnitude below any plan cap |
| Vercel bandwidth/storage | plan-dependent | static site, no functions | serving the product | none known | — | dashboard evidence = founder F2 |
| GitHub Actions minutes | $0 (public repo) | ~26 scheduled runs/day; ~300 min/day est. | rising: auto-refresh completes for the first time (2 root causes fixed) | was 736 min per 4 days of pure timeout waste (F1, fixed); remaining question is auto-refresh cadence (founder) | timeout guard + silent-exit fix + npm caches | unlimited at $0; queue health is the real meter |
| GitHub artifacts/repo | free tier / 212 MB repo | 90d-era artifacts aging out to ~3–4 GB steady | failure forensics + capture archive | ~48 GB standing (legacy retention, decaying) | 90d→7d on the heavy uploader | fine; repo growth (16 MB/day) is the 60-day design item |
| The Odds API credits | ~20,000/mo (tier per balance evidence; invoice = founder) | July: 9,700 (48.5%) incl. one-off experiment; steady ≈ 60–130/day | board+props for every covered game | July experiment now gated off; failed-upstream double-ingest fixed | budget/anomaly alert (spend>500, balance<4,000) wired | ≥5× at steady state — NBA revival fits |
| Free sports APIs (StatsAPI/ESPN/nba_api) | free | high volume, throttled | identity, settlement, enrichment | offseason nba_api hang (fixed, twice) | timeout + fail-soft to cache | n/a |
| Email notifications | Vercel-native | failure/promotion/domain/usage events | founder deployment visibility | zero duplicate-project emails possible (disconnected) | matrix mapped; founder toggles pending | n/a |
| Discord ops webhook | founder endpoint | 5 workflows + credit warnings | hard-failure + budget signal | none — severity routing documented | warning kind added | n/a |
| Analytics capacity | none active | 0 | 0 | 0 | APPROVED_NOT_CONFIGURED; impact quantified | endpoint decision = founder |

## Efficiency metrics (§10.2) — measurement window stated per row

| Metric | Value | Numerator / denominator / window |
|---|---|---|
| Useful production deploys / total builds | ~50% → **~100%** by construction | app/data-serving builds / all builds; July pre-fix vs post-fix design (first full measured week lands 2026-08-07) |
| Docs-only deploys skipped | 100% of docs-tail pushes since 17:13Z (2/2 same-day: `0f4c7706`, `d81d5987`) | skipped docs pushes / docs pushes; 2026-07-31 |
| Duplicate/superseded builds prevented | ~460/mo (≈15.6/day × 30) | duplicate production deployments lifetime 1,372 / 88 days, projected monthly |
| Successful daily cycles / scheduled | July-30 + July-31 cycles PROVEN (gap-0 accounting); auto-refresh 0% → first potential completes tonight | per observer + run history |
| Credits / odds-covered game | ~3–6 board credits (often 0 on cache) + capture share | board `credits.spent` / `summary.eventsWithOdds`; July boards |
| Credits / generated research row | ≈0.1–0.2 steady (319 rows, 0–62 credits) | board spend / research-eligible rows; 2026-07-31 board |
| Failed/discarded calls | leakage-gate discards cost minutes not credits (paid steps gated off); failed-upstream double-ingest now impossible | run history July |
| Artifact storage | ~48 GB → ~3–4 GB steady by late Oct | 7-8 uploads/day × 77 MB × retention days |
| Commit → production-ready | ~3–4 min (push → built, measured twice today: 24 s to start + ~3 min build) | builtAt − push time; 2026-07-31 samples |
| Alert delivery coverage | 5/5 scheduled writers + budget warnings; delivery PROVEN | observer + run 30647650414 |

## Cost scenarios (§10.3)

| Scenario | Monthly |
|---|---|
| Verified burn today | **$0 verified + ~$30 The Odds API (tier per balance evidence; invoice pending)** |
| Vercel plan | UNKNOWN: $0 (Hobby) / $20 (Pro, 1 seat) / more if seats — one screenshot closes it |
| After duplicate cleanup | no dollar change at current plans; ~460 builds/mo + cap-risk removed |
| No-regret operational savings shipped | ~2 h/day runner waste ended; ~44 GB artifact decay; halved deploy-cap use |
| Avoided overage risk | June-style rate-limit blocks (was realized) — now structurally unlikely |
| Analytics at beta volume | $0 (Option A first-party) — see `ANALYTICS_ENDPOINT_RESOURCE_IMPACT.md` |
| NBA expansion | ~$0 incremental (credit headroom ≥5×) |
| EPL expansion | UNKNOWN until provider decision (separate package) |
