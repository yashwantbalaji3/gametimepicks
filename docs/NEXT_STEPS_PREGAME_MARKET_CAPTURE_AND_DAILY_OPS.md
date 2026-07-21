# Next Steps — Pregame Market Capture + Daily Ops Hardening (mission log, 2026-07-21)

Data-collection + operations mission. No modeling, no public change, no product/money change. Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged throughout.

## Phase log

| phase | outcome |
|---|---|
| 0 · precheck | HEAD `d115a577`, clean, no drift; money md5 + record 19‑14 confirmed; forensic PERFECT; health HEALTHY. `ODDS_API_KEY` present in `.env`. |
| 1 · archive audit | Existing forward-only archive intact: StatsAPI families (pitcher/weather/umpire/lineup) captured, immutable, post-start ineligible, freeze uses eligible-only, never in `out/`. Workflow enabled + non-blocking. |
| 2 · market design | `docs/MLB_PREGAME_MARKET_CAPTURE_PLAN.md` — goals/families/provenance/timestamp rule/credit budget. |
| 3 · market module | `capture-mlb-pregame-markets.mjs` (CLI, dry-run default, credit-guarded, immutable) + pure `market-normalizer.ts` (de-vig + eligibility, tested). |
| 4 · workflow opt-in | Market step gated on `PREGAME_ARCHIVE_MARKETS=true` + secret `ODDS_API_KEY`, `continue-on-error`, StatsAPI capture unaffected. |
| 5 · status fields | Audit → `status/latest.json` now reports market snapshots/records/eligible/de-vig%/coverage-by-family/credit-status/last-capture. |
| 6 · settlement-join | Updated `settlement-join-plan.json` — markets join by gamePk/market/selection/line into a **separate** research record; market stays the benchmark; no execution. |
| 7 · tests | `mlb-pregame-market-guards.test.mjs` (8) + existing archive guards. |
| 8 · public no-change | Served output byte-identical; archive/market snapshots not in `out/`; BB/Moonshot unchanged; money md5 unchanged. |
| 9 · daily ops | `docs/MLB_DAILY_OPERATING_PLAYBOOK.md` updated with the market-capture step + founder status checklist. |
| 10 · dry-run + one write | Dry-run (0 credits): 17 games, ~3-credit estimate, 15,418 remaining. One validation **write** for 2026‑07‑22: **1,404 records, all eligible**, de-vig 68.9%, 3 credits used. |
| 11 · gates | tsc / suite / build / forensic / health / scans / route smoke — all green. |

## Executed vs implemented
- **Implemented + executed:** team-market capture (h2h/spreads/totals). One immutable validation write ran (~3 credits of 15,418).
- **Implemented, not executed:** player-prop capture (per-event, credit-budgeted) — off by default.
- **Persistence:** large raw+normalized payloads → workflow artifacts (gitignored); only the small manifest is committed.

## Residuals / founder decisions
- Set repo var `PREGAME_ARCHIVE_MARKETS=true` + secret `ODDS_API_KEY` to enable daily market capture in CI.
- Decide whether to add player-prop market capture (more credits) once team markets prove out.
- The research gate is **not met** (1/30 dates); no modeling until it is + founder approval.
