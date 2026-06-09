# UFC OddsAPI discovery (June 9)

Live discovery via the existing `ODDS_API_KEY` (free events list + one paid h2h run).
- **Sport key:** `mma_mixed_martial_arts`. **Endpoints:** `/v4/sports/{key}/events`
  (FREE) + `/events/{id}/odds` (1 credit per market×region).
- **Upcoming events:** 5 found (e.g., Alex Pereira vs Carlos Ulberg, 2026-06-14).
- **Markets:** `h2h` (moneyline) available + two-sided. Method/rounds/totals vary by
  book — not fetched yet (h2h only for the board).
- **Cost:** 5 events × h2h × us = **5 credits**; remaining ≈ **19,429** after the run.
- **Result:** real moneylines fetched (Pereira -175 / Ulberg +150, …) →
  `odds-latest.json` `oddsReady=true`; readiness → `odds-internal` (picks LOCKED).
- **Recommendation:** keep h2h-only for the board; add method/rounds only once the
  model + grading exist. Refresh via `ufc-odds-refresh.yml` (manual, ~5 credits).
