# NBA Free Player-Stats Source Inventory (Game 4 recovery)

_2026-06-10. Which free sources can supply player game logs / recent form in CI._

| Source | API/JSON | Roster | Player game logs | Current playoffs | CI-safe | ToS/scrape risk | Verdict |
|---|---|---|---|---|---|---|---|
| **ESPN site/web API** | JSON, no auth | ✅ | ✅ | ✅ | ✅ (not IP-blocked) | low (public JSON, no HTML scrape) | **USE — primary free source** |
| nba_api (stats.nba.com) | JSON | ✅ | ✅ | ✅ | ❌ **IP-blocked from Actions** (read-timeout) | low | keep as local/non-CI fallback only |
| BallDontLie (free) | JSON, key | players only | ❌ `/stats` paid | n/a | ✅ | low | insufficient (no logs on free tier) |
| TheScore | no public API; app/HTML | — | — | — | ❌ | scrape risk | not recommended |
| Basketball-Reference | HTML tables | ✅ | ✅ | ✅ | ✅ but HTML | **scrape + rate-limit/ToS risk** | avoid (HTML scrape) |
| StatMuse / Yahoo / CBS / Rotowire | HTML | varies | varies | varies | mostly ❌ | scrape risk | not recommended |
| Kaggle/GitHub datasets | files | ✅ | historical | ❌ not current | n/a | license | too stale for a live slate |

## Conclusion
**ESPN's public JSON is the one free source that gives current playoff player game logs
without scraping and without the stats.nba.com IP block.** Everything else is either
paid (`/stats`), HTML-scrape (ToS/rate-limit risk), or not current. No aggressive
scraper is built. nba_api remains a non-CI fallback (works locally, not from Actions).
