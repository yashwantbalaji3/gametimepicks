# Sport → Provider Data Map — Program 084–087 (2026-07-31)

Definitive current map of which service powers each sport and data function, discovered from the
code and workflow history (not assumed). Costs are per `CURRENT_COST_BASELINE.md`; call volumes per
`API_USAGE_AND_CREDIT_AUDIT.md`.

| Sport | Data function | Provider | Artifacts / features | Call path | Calls/credits | Cost | Risk / status |
|---|---|---|---|---|---|---|---|
| MLB | Schedule / identity / results | **MLB StatsAPI** (free, official) | gamePk identity, boards' game list, official settlement ledger, lineage | `pipeline/mlb/mlb_stats.py`, `settle_mlb_results.py`; `mlb-pregame-capture` ~13 fetch steps × 7–8 runs/day | High volume, free | $0 | Single point of failure for settlement — acceptable (official source, stable) |
| MLB | Odds + player props + team markets | **The Odds API** | Board leans/rows, props, sims inputs, market-intel pairing | `morning-projections` (MAX_PER_RUN 75, floor 300), `mlb-daily-production` (2 ingests, floor 2000) | ~230–330 credits/day season-typical; July total ~9,700 | ≈$0.48/slate-day at the $30/20K tier | THE paid dependency. Credit guards + 120-min cache TTL live. If it fails: leans/props/sims go stale; board degrades to schedule |
| MLB | Rosters / headshots | MLB StatsAPI + `img.mlbstatic.com` CDN | Player identity + portraits | `enrich-mlb-headshots.mjs`, browser `<img>` | Free | $0 | Cosmetic degradation only |
| NBA | Schedule / results | **ESPN scoreboard** (repo var `NBA_DATA_PROVIDER=espn_scoreboard`) with **stats.nba.com** (`nba_api`) recent-form | Adapter + settlement readiness (HISTORICAL_ONLY promotion state) | `pipeline/providers/espn_provider.py`, `attach_recent10.py` via `auto-refresh`/`morning-projections` | Free; offseason = no games | $0 | `nba_api` hangs in offseason (fixed this program with timeout guard). balldontlie fallback CONFIGURED_UNUSED |
| NBA | Odds | The Odds API (same key/pool) | Market probe only (`nba-market-probe` dispatch-only, dormant since 2026-06-10) | `pipeline/probe_nba_markets.py` | 0 since June | $0 current | Promotion to live NBA gated on preseason + founder; would share the 20K credit pool |
| EPL | Odds (1X2 preview) | The Odds API | Fixture-only preview | odds side wired per Program 062–065 | ~0 (not scheduled) | $0 current | Settlement remains **gated** on the results-provider decision |
| EPL | Results (settlement) | **PENDING — founder decision** | Settlement | Provider interface built; see `EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md` | N/A | Unknown until chosen | The one blocking decision for EPL promotion |
| Soccer/WC | Fixtures / lineups / results | API-Football | Archive/proof only (WC closed as destination 2026-07) | `pipeline/world_cup/*`; dispatch-only workflows | 0 scheduled | UNKNOWN plan cost | Key still passed in `nightly-settle`/`daily-lifecycle` for legacy settle steps that no-op post-closeout |
| UFC | Results / stats | ESPN + Greco1899 CSV scrape (free) | Settled ARCHIVE (`/ufc`), scaffold only | `pipeline/ufc/*`; 6 dispatch-only workflows, none run since 2026-06-09 | 0 | $0 | boutId join adjudicated unsound for future cards; archive is static |
| UFC | Odds | The Odds API | Historical captures only | dormant | 0 | $0 | — |
| Cricket/IPL | Board experiment | ESPN cricket + The Odds API | No workflow references it at all | `pipeline/cricket/*` | 0 | $0 | Dead code — prune candidate |

## Single points of failure

1. **The Odds API** — sole odds/props source. Failure → no new leans/props/sims (board degrades to
   schedule-only; availability contract fails closed). Mitigations already live: 120-min cache,
   credit floors, dry-run gates. No redundant odds source (OpticOdds is an unimplemented stub).
2. **MLB StatsAPI** — sole identity + settlement source, by design (official box scores only).
3. **Vercel** — sole host; static export is portable to any host by design (`next.config.mjs`
   comment), so exit cost is low.
4. **GitHub Actions cron** — sole scheduler; documented best-effort (morning crons have skipped);
   remedy is manual dispatch + queue.

## Redundant / overlapping sources

- ESPN vs `nba_api` vs balldontlie: three NBA sources; only ESPN(+nba_api recent-form) active,
  balldontlie key configured but disabled. Not costing anything, but the credential is idle.
- No duplicated **paid** source exists: every paid call routes through The Odds API.

## Public-feature staleness if a provider fails

| Provider down | Public surface affected |
|---|---|
| The Odds API | /today tiers degrade (sim/model-read unavailable for new slates), /markets disagreement explorer stale, props absent |
| MLB StatsAPI | Settlement/results/records freeze (honest banners; fail-closed availability), identity for new boards blocked |
| Vercel | Whole site down (static export redeployable elsewhere) |
| Image CDNs | Portraits/logos fall back to initials (already-shipped fallback) |

## Licensing / redistribution notes

- The Odds API terms permit displaying odds with attribution; the site shows research rows, not a
  re-sold odds feed; pregame archive is internal-only (leakage-safe capture).
- `stats.nba.com` via `nba_api` is unofficial; used for internal enrichment only — an accepted,
  widely-used gray area; ESPN endpoints similarly unofficial (fallback only).
- MLB StatsAPI is publicly documented and free for non-commercial-style stat use; the site
  publishes derived research, not raw feed redistribution.
