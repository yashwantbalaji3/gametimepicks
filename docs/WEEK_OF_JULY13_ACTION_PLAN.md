# Week of July 13 — Action Plan

Timestamp: 2026-07-13 (Mon). Guardrails on every task: **money md5 `affe6b21…` unchanged, official 19-14 /
$0 untouched, no fake data, UFC excluded from products, gates green before push.**

## The recurring problem this week solves
The slate goes **2 days stale on weekends** because the daily refresh needs founder-run keys and isn't
automated. Job #1 is to make the daily loop dependable.

### Mon Jul 13 — Stabilize daily operations 🔴 top priority
- **Automate the daily refresh.** Wire `refresh_daily_products.sh` into a scheduled runner (GH Actions
  `daily-rebuild.yml` + a refresh job) that runs with the repo secrets; **DoD:** MLB/WC artifacts auto-advance
  each morning, portfolio md5 guarded, health/forensic gates block a bad day. **Risk:** needs the owner to add
  `ODDS_API_KEY`/`API_FOOTBALL_KEY` as GH secrets. Files: `.github/workflows/*`, `scripts/refresh_daily_products.sh`.
- **Event-lifecycle guards** (started this pass): past-event UFC spotlight/preview suppression is done; extend
  the same "stale slate" honesty to any "tonight/tomorrow" copy. **DoD:** no page says "tonight" for a past day.
- **Refresh to July-13 now:** `bash scripts/refresh_daily_products.sh --date 2026-07-13` + `generate-mlb-game-simulations --date 2026-07-13 --write`.

### Tue Jul 14 — Picks Lab + product cards
- **Bank Builder approval flow** end-to-end: author `bank-builder-approved.json` → `promote-bank-builder-proposal.mjs --apply` (md5-guarded), or confirm no-play. **DoD:** a public BB card or an honest no-play, $0 official exposure.
- **Picks Lab custom builder** (deferred): deterministic top-picks pool + selected-card panel. **DoD:** users can assemble a paper card from model-qualified legs; UFC experimental reads excluded from model-qualified.

### Wed Jul 15 — UFC post-event → next card
- **Ingest UFC 329 results** (internal only, experimental grading vs the market-implied winners). **DoD:** `/ufc` shows a **results-review** state, not stale pre-fight picks; official 19-14 untouched.
- **Next-card ingest** (`build_schedule` → `build_odds` closer to the event) + **fighter-DB gap report** (Garza/Steveson). **DoD:** the next UFC card previews with ≥ current coverage.

### Thu Jul 16 — Soccer / World Cup knockouts
- **Settle July-11 QFs** (90' team markets from official scores; ET/PEN don't count) + **ingest semifinals**. **DoD:** finished games show results, upcoming show market-implied reports; no fake props.
- Homepage spotlight priority: WC knockout as a spotlight candidate (the selector already supports the slot).

### Fri Jul 17 — MLB model quality
- **Paper hit-rate tracking** (market-implied vs settled) + model-vs-market comparison report; error analysis on the by-edge anti-calibration finding. **DoD:** a refreshed model-perf ledger, separate from the 19-14.

### Weekend Jul 18-19 — Rollout polish
- Mobile QA, copy cleanup pass, results/trust center refresh, deployment checklist, founder review. **DoD:** a clean, honest public surface with no stale dates.

## Cross-cutting DoD for every task
tsc clean · full suite green · build green · forensic PERFECT · health HEALTHY · md5 `affe6b21…` · no internal
artifacts in `out/` · no forbidden claims · both refs pushed.
