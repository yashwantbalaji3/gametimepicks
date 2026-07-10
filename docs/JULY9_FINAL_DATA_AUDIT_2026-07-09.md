# July 9 Final-Data Audit + Settlement (2026-07-09, final)

**July 9 MLB is fully final — the Moonshot paper card settled `lost` (−1 paper unit) from committed team
markets; Bank Builder stays `pending` (no July-9 World Cup games).** Free/deterministic sources only.
Official money untouched (md5 `affe6b21…`, 19-14, $0).

---

## Final-data status

| source | July-9 status | action |
|---|---|---|
| MLB StatsAPI schedule | **13/13 Final** (fully final) | committed the deterministic linescore cache |
| `data/internal/mlb/linescores/2026-07-09.json` | written, **byte-stable** on re-fetch (13/13 final) | team markets now settle from it |
| MLB `settled_leans.jsonl` (player-prop actuals) | **0 rows** for 07-09 | NOT regenerated (see below) → batter_hits pending |
| World Cup settlement (`world-cup/settlement/`) | no 07-09 file; **0 WC games scheduled 07-09** | soccer legs pending |
| paid keys (`.env`) | `ODDS_API_KEY`, `API_FOOTBALL_KEY` present | enables the July-10 paid refresh |

## Per-leg settlement (committed data only)

**Moonshot `moonshot-2026-07-09-cb3cade37e8d` → `lost` / settled, −1 paper unit:**

| leg | result | reason (from committed linescore) |
|---|---|---|
| PIT run line +1.5 | **loss** | home margin −5, +1.5 ⇒ −3.5 (did not cover) |
| TB moneyline | **loss** | away won 12-4 |
| Over 9 total | **win** | 10 > 9 |
| Pete Crow-Armstrong hits o0.5 | **pending** | 07-09 not in committed `settled_leans` |

The two losses **decide the card `lost`** regardless of the pending leg — so no player-prop data is
needed to settle the card. (Fixed a validator bug in passing: a `settled`+`lost` card may carry a pending
leg; only a *won* card may not.)

**Bank Builder `bank-builder-2026-07-09-cfe0afc610f7` → `pending`:**

| leg | result | reason |
|---|---|---|
| France or Draw (DC) | **pending** | no committed FT final; **0 WC games on the 07-09 schedule** (these are future knockout fixtures projected into the slate window) |
| Spain or Draw (DC) | **pending** | same |

## Why `settled_leans` was NOT regenerated

The MLB grading pipeline (`npm run mlb:grade-results`) would append 07-09 rows to the **public**
`settled_leans.jsonl` (the /mlb/results model-performance ledger). It was **not run** here because:
1. the Moonshot card is already **decided `lost`** by the committed team markets — the batter_hits leg is
   moot for the card result;
2. it is a broad **public-artifact** regeneration, separate from the paper-card workflow this pass
   centers on — out of scope for a controlled paper-ops + paid-refresh mission.

To resolve the batter_hits leg's own status later, run `npm run mlb:grade-results` (a dedicated MLB
model-grading pass), then re-settle. It does not change the Moonshot card result.

## July-10 paid refresh — ran successfully; public slate advance HELD BACK

The paid daily refresh (`refresh_daily_products.sh --date 2026-07-10`, founder-authorized, keys present)
**ran end-to-end and cleanly**: WC + MLB boards / props / team-markets generated, internal evidence
(team-market-lines, model-inputs) captured, health gate HEALTHY (19/0), and the **canonical money md5
verified unchanged** (`affe6b21…`). July-10 founder-review previews were generated — Bank Builder
`founder_review`/promotable (Soccer), Moonshot `founder_review`/promotable (MLB).

**The PUBLIC slate advance was reverted (held back), and only the INTERNAL artifacts kept**, because:
- the refresh's `activate-daily-portfolio.mjs --apply` step activates the **Mr. Dub daily display lanes**
  (BB $100 + Moonshot $50 = **$150 display exposure**, "3 active lanes") — which conflicts with this
  mission's non-negotiable *no-exposure / no-active-card / internal-ops-only / no-public-rollout*
  guardrails, and breaks the codebase's intentional "today = no-play, `$0` core exposure" invariant
  (`today-hub` functional test);
- advancing the public slate is a **deploy-reviewed step** (the refresh script says so: "rebuild + deploy
  is a separate step") — not something an internal paper-ops pass should push.

**Kept (internal, guardrail-safe):** July-10 founder-review previews + candidate pool + team-market-line /
model-input evidence (all `data/internal/`, preview-only, no exposure, not web-served). **Reverted:** all
`app/public/data` 07-10 slate artifacts + `daily-portfolio.json` + `master-ledger.json` (the activation).

**Operator action to publish the 07-10 slate:** re-run `refresh_daily_products.sh --date 2026-07-10` in a
dedicated pass, review the daily-portfolio activation, then rebuild + deploy deliberately.

## Money / boundary posture

Free StatsAPI only for the linescore (no Odds credits). Money md5 `affe6b21…` verified unchanged before
+ after every step (incl. the paid refresh, which self-guards). Settlement + track-record artifacts are
deterministic (no wall-clock), internal (`data/internal/`, 404 on prod). No exposure, no public slate
change committed, no full-game-sim driving.
