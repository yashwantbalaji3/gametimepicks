# Data Freshness & Artifact Audit — 2026-07-13

Real ET date **2026-07-13**. Newest committed slate **2026-07-11** (2-day lull: MLB All-Star break; WC between
QF and SF). "Stale" below means "older than today"; on a lull day that is EXPECTED and honestly surfaced by the
liveness banner — it is only a *bug* where a page presents it as live (none do) or where settlement is behind.

## Freshness by domain (newest committed artifact)
| domain | newest | date | public? | vs 07-13 | risk |
|---|---|---|---|---|---|
| MLB board / schedule / props / team-markets / sims | `mlb/boards/2026-07-11.json` (+peers) | 07-11 | public | stale 2d (All-Star break) | Low — UI guards it |
| MLB results (settled) | `mlb/results/available_dates.json` | →07-11 | public | **fresh** (settled thru 07-11) | Low |
| WC projections / R32 board / props / specials / parlays | `world-cup/projections/2026-07-11.json` (+peers) | 07-11 | public | stale 2d | Med |
| **WC settlement (official scores)** | `world-cup/settlement/official-scores-2026-07-07.json` | 07-07 | public | **behind 6d** — 07-08→07-11 unsettled | **High** |
| **UFC projections / odds / schedule** | `ufc/projections-latest.json` (eventDate 07-11) | 07-11 | public | **archived** — advertises a finished event | **High** |
| **UFC results** | `ufc/results-latest.json` (eventDate 05-16) | 05-16 | public | **frozen ~58d** — 07-11 card never settled | **High** |
| daily-portfolio | `mr-dub/daily-portfolio.json` | 07-11 | public | stale 2d, `status:"candidate"` | Med |
| bank-builder-approved | `mr-dub/bank-builder-approved.json` | 07-07 | public | `status:"active"` but 6d old | Med |
| Moonshot lane | `moonshot-lane/active.json` | — | public | `status:"stopped"` (0-1), intentional | Low |
| legacy cross-sport results | `results/available_dates.json` | 06-13 | public | **frozen ~30d** (separate from mlb/results) | Med |
| **portfolio.json (money)** | `mr-dub/portfolio.json` | — | public | `generatedAt 07-07` header | **DO NOT re-stamp** |

## Money file — do not touch
`portfolio.json`: record **19-14**, bankroll **$19,065.40**, crown **$20,465.40**, exposure **$0**, md5
**affe6b21**. Its `generatedAt` header (07-07) is *intentionally stable* — re-stamping would change the md5 and
break the money lock. The stale header is cosmetic and MUST be left as-is. (`daily-portfolio.json`, a different
file, is at 07-11.)

## Internal-artifact leak — NONE (with one naming caveat)
- ✅ `data/internal/` is at REPO ROOT, outside `app/public/` → never web-served; `out/` contains no
  `data/internal` path; `next.config.mjs` `output:"export"` bundles only `app/public/`.
- ⚠️ **Naming caveat (P1 hygiene):** 4 UFC files whose names contain "internal" ARE on the PUBLIC surface and
  copied into `out/` — `/data/ufc/projections-internal-latest.json`, `…-internal-card-latest.json`,
  `suggested-parlays-internal-latest.json`, `…-internal-card-latest.json`. They are experimental UFC model
  reads (stale, Jul-10/May-16), not money. Rename (drop "internal") or move to `data/internal/ufc/` and update
  the reader before launch. Not a security leak; a hygiene/consistency issue.

## Settlement gaps (the real freshness blockers)
1. **World Cup: official scores stop at 07-07.** The 07-08→07-11 knockout results (incl. the QFs) are unsettled.
   `/results` + `/world-cup` must show these as **pending**, never fabricate. Blocked on committed official box
   scores (founder/pipeline action) — do not settle without them.
2. **UFC: results frozen at 05-16.** The 07-11 card is ingested as *predictions* (experimental) but never
   settled; `/ufc` shows it "Completed — awaiting settlement." Since UFC is excluded from products and its
   automation is dispatch-only, this will not self-heal — either settle the 07-11 card or relabel it clearly as
   an unsettleable experimental archive.
3. **Two results systems out of sync:** legacy cross-sport `results/` (frozen 06-13) vs current `mlb/results/`
   (07-11). Decide which `/results` surfaces and retire/refresh the other.

## Bottom line
No money risk, no internal-data leak, nothing stale-as-live. The freshness debt is concentrated in
**settlement** (WC 6d, UFC frozen) and **UFC surface hygiene** — all P1 (before broad launch), most needing
committed official data or a founder call, not a code fix. See `AUTOMATION_AND_SECRETS_STATUS.md`.
