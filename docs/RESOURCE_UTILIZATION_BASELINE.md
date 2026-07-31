# Resource Utilization Baseline (2026-07-31, Program 088-091)

Snapshot of what exists, what it can do, and what it actually did — the "before" line the next
program measures against. Verified numbers only; UNKNOWN stays UNKNOWN.

| Dimension | Baseline fact (evidence) |
|---|---|
| Repo | 14,225 tracked files, 424.3 MB; `app/public/data` = 339.2 MB (80%); growth ~16 MB/day; `.git` 249 MB; 601 commits/30d (161 bot) |
| Vercel | 2 projects both building every push since 2026-05-04 → 1 canonical building ~3–6/day (skip guard + disconnect); build ~2.5–4 min; static export 473 MB post-prune; no functions/KV/analytics products in use |
| GitHub Actions | 22 workflows (9 scheduled ≈26 runs/day); $0 (public repo); auto-refresh produced ZERO successful runs in its observable history until today (25-min hang → silent exit-1, both fixed); artifacts 159 count / ~0.8 GB newest-100, legacy ~48 GB decaying to ~3–4 GB |
| The Odds API | balance 10,300 / ~20K tier; July 9,700 credits (48.5%) incl. one-off archive experiment; steady 60–130/day; floors 2,000/300; cache TTL 120 min proven (`spent: 0` generations) |
| Free APIs | MLB StatsAPI ~13 steps × 7–8 runs/day; nba_api offseason-hostile (now double-guarded); ESPN fallback |
| Notifications | Discord webhook DELIVERY_PROVEN, 5/5 writers + warning kind; Vercel email = failures/promotions/domain/usage only (no per-deploy success email exists); founder toggles pending |
| Analytics | schema v2 built, sink NOOP, APPROVED_NOT_CONFIGURED; every metric NOT_YET_MEASURED |
| Money/protected | 19-14 · bankroll $19,065.40 · md5 `affe6b21…`/`cb80473f…` byte-exact all session |
| Live-slate caveat | 2 invariant tests + lifecycle gate red every morning until evening odds post (5/15 games lean-less at 11:52 ET); adjudication tracked separately; NOT weakened |

Efficiency interpretation and per-metric ratios: `RESOURCE_EFFICIENCY_SCORECARD.md`.
Founder-evidence gaps: Vercel billing/seats/usage screenshots (F2), API-Football + balldontlie
tier confirmations, domain renewal invoice.
