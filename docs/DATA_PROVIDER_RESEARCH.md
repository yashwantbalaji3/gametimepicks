# Data Provider Research — Phase 19

Research conducted via web search, May 2026. Verify pricing/terms before activating any paid tier — providers update plans frequently.

## Recommended NBA stack now (free)

| Layer | Source | Notes |
|---|---|---|
| Schedules | **nba_api** (`ScoreboardV3`) | Free, no API key, Python-native, actively maintained (v1.11.4 Feb 2026, Python 3.10+) |
| Box scores | **nba_api** (`BoxScoreSummaryV3` / `BoxScoreTraditionalV3`) | Free. **Note:** V2 deprecated for games after 4/10/2025 — must use V3 |
| Player game logs | **nba_api** (`PlayerGameLogs`) | Free. Used by `attach_recent10`. |
| Player IDs | **nba_api** (static `players`) | Free. Static, no network, embedded in package |
| Odds / props | **The Odds API** | Free tier 500 req/month. **Player props are Business tier (~$30+/mo)** |

**Why nba_api wins as the Tier 1/2 settlement source:**
- Free, no key required
- Python-native (matches our pipeline language)
- Actively maintained — releases every 1-2 months
- Battle-tested in the open-source NBA-analytics community
- Direct from stats.nba.com (the same source most paid providers proxy)

**The trade-off:** stats.nba.com applies rate limits and occasionally returns 429s during high-traffic events. Our settle path is small (1 box score per game, 1-2 games/day during regular season) so this is non-issue. For broader use we should add request pacing.

## Recommended paid stack later (when budget exists)

| Need | Source | Cost | Why |
|---|---|---|---|
| Player props | The Odds API Business | ~$30/mo (200k req) | Already integrated. Pinnacle sharp lines included for edge detection |
| Real-time live odds | balldontlie ALL-ACCESS | $159.99/mo | Aggregates many books. Unnecessary until we have a real user base |
| Injury feeds | balldontlie injuries endpoint | Paid tier | Free injury status feeds tend to be stale or scraped |
| Advanced stats | nba_api or paid stat providers | Free → SportsData.io | Pace, defensive ratings, usage. nba_api covers most. |

**Avoid spending until model is proven.** Free tier covers everything needed for v1 model + first-100-subscriber product.

## Sources to avoid (compliance / quality concerns)

| Source | Reason |
|---|---|
| Sportradar | Enterprise-only, sales-call required, expensive. Overkill for this stage |
| Basketball Reference scraping | License terms restrict commercial use. Stathead (paid) is the legal alternative |
| Sportsbook scraping (DK/FD/MGM HTML) | ToS violation. Unreliable. Anti-bot measures |
| ESPN unofficial endpoints | Undocumented, unstable, no SLA. Used to break weekly |
| Crypto / "AI sportsbook" odds APIs | Reliability concerns. Often resell other feeds |
| Aggregator APIs that repackage public sources | Pay twice for the same data |

## Compliance cautions

- The Odds API ToS allows pulling odds into analytics products. Do **not** redistribute raw odds feeds.
- Basketball Reference content cannot be republished without explicit license — even cached numbers.
- nba_api uses public stats.nba.com endpoints. NBA tolerates this for personal/research use; tolerance for commercial use is murky. Keep queries minimal and don't claim official partnership.
- If we ever add affiliate sportsbook links, US state-by-state gambling-advertising laws apply — consult a lawyer before launching.

## Per-source evaluation matrix

### nba_api (Python)
- Coverage: schedules, box scores, game logs, advanced stats, play-by-play
- Freshness: live during games (with stats.nba.com lag)
- Reliability: high; 5+ years of community use
- Rate limits: enforced by stats.nba.com (~2-3 req/sec safe ceiling)
- Cost: free
- Compliance: research-tolerated; commercial gray area
- Static export: ✓ (runs in pipeline, output is JSON)
- GitHub Actions: ✓ (already in our workflow setup)
- Helps: settlement, trends, playerId matching, projections
- Multi-sport future: WNBA only — NFL/MLB/NHL need separate libraries

### balldontlie
- Coverage: NBA, NFL, MLB, NHL, EPL + many more
- Freshness: free tier delayed; paid tiers real-time
- Reliability: high
- Rate limits: free tier "generous" but not specified; paid tiers higher
- Cost: free tier with API key; paid tiers $9.99–$159.99/mo per sport (or $299.99 ALL-ACCESS for everything)
- Compliance: clean — explicit ToS, designed for developers
- Static export: ✓ (server-side fetch)
- GitHub Actions: ✓
- Helps: schedules, stats, odds (paid), props (paid)
- Multi-sport future: ✓ — best candidate when expanding past NBA

### The Odds API
- Coverage: 30+ sports, 50+ bookmakers
- Freshness: minute-level
- Reliability: high; widely used
- Rate limits: usage-based (free 500/mo, Business 200k/mo)
- Cost: free → $99/mo Business (player props require Business)
- Compliance: clean
- Static export: ✓
- GitHub Actions: ✓ (already integrated)
- Helps: odds, props, edge detection
- Multi-sport future: ✓ — single integration covers all sports

### Sportradar
- Coverage: comprehensive, every major sport
- Cost: enterprise (sales call, often $1k+/mo)
- Verdict: **revisit when annual revenue >$50k**

### SportsData.io
- Coverage: NBA + others
- Cost: free trial → paid plans starting ~$50/mo
- Verdict: middle-tier alternative if balldontlie + nba_api ever fall short

## Static historical datasets

Useful for backtest harness without API quota burn:
- **Kaggle NBA datasets** — historical box scores, salary, draft data. Free.
- **stats.nba.com archives via nba_api** — pull once, cache locally.
- **basketball-reference.com** — data is fine for personal research; **do not redistribute**.

## Exact next operator steps

1. **Today (no cost):** install `nba_api` in workflow venv. Already supported by `pipeline/diagnose_props.py`.
2. **This week ($0):** activate The Odds API free tier (~500 req/mo) for moneyline/spread/total. Confirms integration works without paid tier.
3. **When ready ($30/mo):** upgrade The Odds API to Business for player props. Test for one billing cycle, evaluate.
4. **Defer indefinitely:** balldontlie ALL-ACCESS, Sportradar, SportsData.io. Revisit when NBA model is proven and we expand to a second sport.

## Watchlist (re-research before next phase)

- The Odds API pricing changes (Business tier price has shifted twice in 18 months)
- balldontlie pricing (per-sport vs ALL-ACCESS bundle is volatile)
- nba_api endpoint deprecations (V2 → V3 transition for box scores already happened; expect another wave when NBA refreshes their stats backend)
- Any new "AI-native" sports APIs with usage-based billing — could be cheaper than current options
