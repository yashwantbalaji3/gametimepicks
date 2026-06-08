# UFC Odds Availability (latest)

> No paid calls made. Cost-guard posture respected.

- **Schedule/matchups:** free (ESPN MMA scoreboard). No odds in that feed.
- **The Odds API:** supports MMA via sport key `mma_mixed_martial_arts`
  (h2h/winner widely; method/round totals vary by book). Our provider
  (`odds_api_provider.py`) is currently hardcoded to `basketball_nba` — adding a
  configurable MMA key is required to ingest UFC odds.
- **Decision: do NOT fetch UFC odds now.** Rationale: (a) nothing is publishable
  without a fighter-stat model + grading + backtest, so paid odds would have no
  safe downstream use; (b) the provider isn't MMA-configured; (c) the cost-guard
  rule says don't spend unnecessarily. When the rest of the stack is ready, the
  free `/v4/sports/mma_mixed_martial_arts/events` endpoint confirms a card before
  any paid `/events/{id}/odds` call, under the existing cost/balance guards.
