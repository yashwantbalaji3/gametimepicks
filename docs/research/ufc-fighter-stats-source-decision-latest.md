# UFC fighter-stats source decision (June 9)

The odds board is live (OddsAPI). **Real picks require a fighter-stats provider** —
the remaining blocker. Options:

| Source | Fields | Cost | Difficulty | ToS/scrape risk | Supports projections? | Rec |
|---|---|---|---|---|---|---|
| **SportsDataIO MMA** | record, physicals, strike/TD off-def, finish rate, history | **Paid (key)** | Low (clean API) | Low | Yes | **Recommended if budget approved** |
| **UFCStats / FightMetric** | rich strike/TD/control, full history | Free | Med-High (scrape + ID map) | **ToS/rate-limit** | Yes | Needs explicit approval |
| ESPN MMA | schedule, results, shallow stats | Free | Low | Low | No (too thin alone) | Use for schedule/results only |
| OddsAPI | odds only | (in use) | — | — | No | Board + market-implied baseline only |
| Manual CSV seed | hand-entered | Free | Low | — | Prototype only | Not production |

**Minimum fields needed for a moneyline model:** fighter id/name, record,
height/reach/stance, sig-strikes landed/absorbed per min, strike accuracy/defense,
takedown avg/accuracy/defense, submission avg, recent results + method history,
days since last fight, opponent-quality proxy, weight class.

**Recommendation (PAID DECISION — STOPPED for approval):** SportsDataIO MMA is the
fastest reliable path; UFCStats is the free-but-risky alternative. No key purchased
or scraping enabled without your go-ahead. Until then `fighterStatsReady=false` and
all picks stay locked.
