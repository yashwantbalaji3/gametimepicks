# MLB totals differentiation — prerequisites (Phase 5F, 2026-09-15)

**Status:** DESIGN + DECISION REQUEST. No model is scored, registered or adopted here. The over/under call stays PAUSED;
the P317 engine-level shadow is a separate question and cannot unpause it.

## 1. Data audit (already-committed or previously approved data only)
- MLB finals with venue: committed StatsAPI linescores from **2026-07-04** only (939 finals; venue via the boards). No 2025 or
  earlier MLB results exist anywhere in the repository (`data/`, `app/public/data`, `pipeline/`); the only pre-2026 game logs
  are NBA caches. The one-season walk-forward venue factor built from this is noise (`totals-differentiation-no-go.md`).
- Conclusion: a multi-season park environment **cannot** be built from committed data. It needs a backfill.

## 2. Founder decision — one line, yes/no
> **May the pipeline backfill MLB final scores for the 2023, 2024 and 2025 regular seasons from the free MLB StatsAPI schedule
> endpoint the site already uses for finals and lineups (`statsapi.mlb.com/api/v1/schedule?sportId=1&date=…`, ~540 daily calls, no
> credits, no key), committed as `data/internal/mlb/linescores/<date>.json` (~7,300 games, ~4 MB) with venue from the same payload?**

- Fields: gamePk, officialDate, venue (name + id), home/away team ids and names, home/away runs, status (final/postponed),
  doubleheader flag.
- Seasons: 3 (2023–2025); 5 would sharpen park priors but 3 already gives ~80 home games per park per season, ~240 per park.
- Source: MLB StatsAPI, already the approved free source for the settlement path (docs/MLB_LINESCORE_SETTLEMENT_AUDIT_2026-07-09.md);
  MLB's data terms allow non-commercial informational use with attribution; the repository already attributes it.
- Storage: raw daily files in the existing linescores directory (read-only history, never edited); derived park table at
  `data/internal/research/mlb/park-environment/<season>.json`.
- What it unlocks: a preregistered, walk-forward park run-environment candidate (prior seasons + trailing current season,
  shrunk toward league, park moves handled by venue id, no line as input) scored forward-only against the engine control — the
  first defensible between-game differentiation signal. Without it, differentiation research stays blocked.

## 3. Starter run-prevention forward capture — contract (no historical values are fabricated)
- **Source:** MLB StatsAPI (approved; free) — per-pitcher season stats as of the capture instant (`/api/v1/people/{id}/stats?
  stats=season&group=pitching&season=2026`: innings pitched, earned runs, runs, hits, walks, strikeouts, home runs allowed,
  games started). Approval needed only if the founder treats this endpoint as a new source; it is the same host and terms.
- **When:** at each `mlb-daily-production` run, for every probable starter on the day's board, BEFORE first pitch; the capture
  stamp is the run's `--now`; a game whose first pitch precedes the capture is excluded (pre-event boundary, same rule as the
  full-game generator).
- **Identity:** StatsAPI person id (the board's probable pitcher id); team by the board's abbreviation.
- **Missing data:** a starter with no season line (debut, injury return) records `null` — never zero, never a league mean; the
  engine mechanism that consumes it must treat null as "no adjustment".
- **Storage:** `data/internal/mlb/model-inputs/starter-run-prevention/<date>.json` (private; allowlisted in the production commit
  step), first write per (date, gamePk, pitcher) wins.
- **Contamination guard:** a test that every stored capture stamp precedes the game's first pitch and that no file is rewritten
  after that first pitch.
- **Earliest honest evaluation:** forward only, from the first capture date; a candidate mechanism (e.g. a per-starter hit-rate
  or run-rate multiplier in `EngineParams`) is registered before the first shadow row, judged on ≥ 200 games. No development look
  exists for this input because no past values exist; the first look is the registered forward look.
