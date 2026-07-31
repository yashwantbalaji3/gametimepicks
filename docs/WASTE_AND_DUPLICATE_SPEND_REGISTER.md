# Waste & Duplicate Spend Register — Program 084–087 (2026-07-31)

Ranked by real impact. "Cost" is verified dollars where they exist; on a public repo most waste is
runner-time, queue health, credits, and latent-if-private storage — recorded as such, never
invented as dollars. UNKNOWN is stated where evidence is absent.

| # | Item | Class | Verified cost | Measured usage/evidence | Removal risk | Recommendation | Status |
|---|---|---|---|---|---|---|---|
| 1 | `auto-refresh` hung on offseason `nba_api` — 9 runs/day × 25-min timeout, 0 output, held the shared writer queue | REDUNDANT_API_CALLS / EXCESSIVE_REFRESH | $0 (public repo) but **736 wasted min / 3.7 days** + queue eviction of real work | 29/29 runs cancelled at exactly 25.4 min; steps 10–17 skipped every time | Low | Timeout + fail-soft to cache (pattern already proven in morning-projections) | **FIXED this program** |
| 2 | `daily-refresh` cron duplicated `auto-refresh` (identical `automation_refresh.sh`, 1 h later) | DUPLICATE_PROVIDER / UNNECESSARY_DEPLOYMENTS | $0; ~25 min/day + queue hold | Same script invoked by both (`daily-refresh.yml:114`, `auto-refresh.yml:135`) | Low (auto-refresh covers 9 slots/day) | Remove cron, keep dispatch | **FIXED** |
| 3 | Pregame-archive artifact: 77 MB × 7–8/day × 90-day retention, `if: always()`, unique names — tree ALSO committed to repo | DUPLICATE_STORAGE | $0 today (public repo); **~48 GB standing**; ≈$12/mo latent if repo ever private | `mlb-pregame-capture.yml:196-200`; 10,311-file tree | Low (repo is the durable record; 7 days ample for debugging) | Retention 90 → 7 | **FIXED** |
| 4 | Vercel builds every push incl. docs/scripts-only (~20 builds/day; [skip ci] proven ignored) | UNNECESSARY_DEPLOYMENTS | UNKNOWN $ (plan unverified); ~25–35% of ~600 builds/mo change nothing deployed | Commit `7fea87a1` (no `app/` changes) built 24 s after push | Low (fail-toward-build skip logic; data commits always build) | In-repo Ignored Build Step | **FIXED** (`app/vercel.json`) |
| 5 | Failed morning-projections still triggered `mlb-daily-production` (2 paid ingests) via unconditioned `workflow_run`, then the backstop cron repeated them | REDUNDANT_API_CALLS | ~60–120 wasted credits on a bad morning (≈$0.09–0.18/incident at $30/20K) | No `conclusion == 'success'` guard on the chain | Low (backstop cron unchanged) | Add success condition | **FIXED** |
| 6 | `daily-lifecycle` failed 6 straight days, silently (not alerter-wired), and even a green run stops before deploy (`ENABLE_AUTONOMOUS_DEPLOY` unset) | UNKNOWN_OWNER_OR_PURPOSE / duplicate settlement with `nightly-settle` | $0; ~3 min/day + a dead promise of a daily roll | Failure log: "tests failed — not deploying" — the morning-slate invariant timing issue; both it and `nightly-settle` call `settle_soccer_day.sh` | Medium — it's the designed "canonical lifecycle" | **Alerter wired (FIXED).** Supersede-or-retire decision (vs `nightly-settle`) = founder; do not run two settlement paths forever | PARTIAL |
| 7 | `daily-rebuild` daily green no-op — `VERCEL_DEPLOY_HOOK_URL` never configured, so its freshness purpose silently isn't happening | UNUSED_SUBSCRIPTION-shaped (dead job) | $0 (0.2 min/day) | 5/5 runs "success" at 0.2 min doing nothing | None to keep; its absence = the static clock freezes on no-data days | **Founder**: set the deploy-hook secret (recommended) or delete the workflow | OPEN — founder action |
| 8 | Balldontlie key configured, fallback disabled since — idle credential | CONFIGURED_UNUSED | UNKNOWN (likely free tier) | `ENABLE_BALLDONTLIE_FALLBACK=false` default; key passed by 2 workflows | None | If unpaid: leave. If paid: cancel | OPEN — founder evidence |
| 9 | API-Football key live in 2 scheduled workflows for WC steps that no-op post-closeout; EPL results decision pending | LEGACY_SPORT_SPEND (potential) | UNKNOWN plan | WC closed as destination; `EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md` open | Low to confirm plan | If paid and idle: downgrade to free until the EPL decision; keep the key | OPEN — founder evidence |
| 10 | 339 MB of `app/public/data` (80% of tracked repo) checked out + mirrored + deleted on **every** build; no retention policy anywhere; ~16 MB/day growth (~480 MB/mo) permanently committed | DUPLICATE_STORAGE / build-input bloat | $0 direct; drives build time, clone time, git write-amplification (5.4 GB raw blobs/30d) | `parlays/` 157 MB + `mlb/` 145 MB dominate; build serves 512 bytes of loose data (everything else inlined) | **Medium-high** — retention design must not break settled-history surfaces, md5-pinned money files, or research contracts | Design a dated-artifact retention/archive policy as its own reviewed program — NOT a quick fix | OPEN — 60-day plan |
| 11 | Morning slate generated before evening markets post → live-slate invariant tests red every morning → `daily-lifecycle` gate refusals (item 6) + ~1/3 of pregame-capture runs discarded at the leakage gate | EXCESSIVE_REFRESH_FREQUENCY (timing, not volume) | $0 credits (later ingest fetches the delta); runner minutes + 6 days of red | 2026-07-31 board: 15 games, 10 with odds at 11:52 ET; 11/34 capture runs failed at the HARD leakage gate (gate working as designed) | Medium — touching the invariants risks weakening real guards | Adjudicate sim-orphan invariant via the already-spawned Program 080–083 task; consider generating the full board later or marking evening games PENDING_MARKETS | OPEN |
| 12 | Dead code with provider references: cricket/IPL pipeline (no workflow at all), OpticOdds + SportsData stubs, 6 `.env.example` placeholder keys | LEGACY / UNKNOWN_PURPOSE | $0 | No caller anywhere | Low | Prune in a cleanup PR (not done this session — code deletion beyond cost scope) | OPEN — 30-day plan |
| 13 | `THE_ODDS_API_KEY` alias — two names for one credential | Hygiene | $0 | `pipeline/config.py:122`, `lineup-aware-refresh.yml:93` | Low | Standardize on `ODDS_API_KEY` when next touching those files | OPEN |
| 14 | **Duplicate Vercel project `gametimepicks` (no-dash) built every push since 2026-05-04** — 1,372 wasted production builds; canonical is `gametime-picks` (PROVEN: builtAt fingerprint on the custom domain); duplicate serves nothing (alias 404, SSO-protected URLs); caused the PROVEN June free-tier rate-limit that blocked PR #261; three living docs carried inverted labels for ~2 months | UNNECESSARY_DEPLOYMENTS / DUPLICATE_PROVIDER / UNKNOWN_OWNER_OR_PURPOSE | $0 verified (Hobby evidence) — cost is deployment caps, build minutes, and operator confusion | GitHub env/deployment records + HTTP fingerprint (`VERCEL_DUPLICATE_PROJECT_INVESTIGATION.md`) | Low — skip guard fails open; dashboard disconnect reversible | **FIXED repo-side 2026-07-31**: duplicate skip guard in the shared Ignored Build Step + guard test + `VERCEL_CANONICAL_PROJECT.md`; founder: F1 disconnect duplicate Git, F2 redacted settings capture, Phase-4 deletion only after 7-day quiet + separate approval | ~460 duplicate builds/mo (≈1,400–1,800 build-min/mo est.); halves deployment-cap use |

## Questions the program required answered

- **Disabled sports consuming paid calls?** No — verified: all NBA/UFC/WC/EPL paid paths are
  dispatch-only or dry-run-gated; last paid-capable dormant runs were 2026-06-09..11.
- **Schedule/odds/roster calls duplicated across workflows?** The one paid duplicate (item 5) is
  fixed; free StatsAPI calls repeat across capture crons by design (fresh snapshots are the point).
- **Refreshes before markets open?** Yes — item 11.
- **Credits spent on slates that later fail?** July-28 style quarantines spend before failing —
  inherent to pregame capture; bounded by the credit floor + caps.
- **Docs-only commits triggering deploys?** Was yes — item 4, fixed.
- **Multiple Vercel projects/domains unused?** **YES — and now adjudicated** (same day, follow-up
  investigation): canonical = `gametime-picks` (serves the custom domain, PROVEN by builtAt
  fingerprint); the no-dash `gametimepicks` is an accidental duplicate from a second import on
  2026-05-04 that served nothing while building every push. Repo-side skip guard shipped + guard
  test + canonical declaration; dashboard disconnect and eventual deletion remain founder steps
  (register item #14, `VERCEL_DUPLICATE_CONSOLIDATION_PLAN.md`).
- **Full test suites duplicated without risk value?** Was 10–11 scheduled full-suite+build runs/day
  via auto-refresh+daily-refresh; now auto-refresh only (its own cadence review = founder, 30-day
  plan).
- **Paid plans materially underutilized?** The Odds API at ~48% July (and ~10–20% at current
  steady-state) — correct size given NBA-revival headroom; do NOT downgrade (free tier is 500).
