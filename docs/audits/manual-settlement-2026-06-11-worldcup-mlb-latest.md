# Manual settlement — June 11, 2026 (World Cup + MLB + Bank Builder Step 3)

Run: 2026-06-12 (UTC) · Base: `14cdf3c` · Operator-run full settlement, official sources only.

## 1. Official sources + final scores (verified BEFORE any mutation)

### World Cup — ESPN FIFA World Cup scoreboard + match summaries
`site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611` (+ `summary?event=`),
fetched 2026-06-12T04:05Z. Both matches `STATUS_FULL_TIME`, `completed: true`. Group stage —
no extra time, so FT **is** the 90-minute regulation result. Evidence committed at
`app/public/data/world-cup/settlement/official-scores-2026-06-11.json`.

| Match | espnEventId | Final (90′) | Corners | Scorers |
|---|---|---|---|---|
| Mexico vs South Africa | 760415 | **Mexico 2–0** | 3–1 | Quiñones 9′, Jiménez 67′ |
| South Korea vs Czechia | 760414 | **South Korea 2–1** | 4–5 | Krejcí 59′ (CZE); Hwang In-Beom 67′, Oh Hyeon-Gyu 80′ (KOR) |

### MLB — official MLB Stats API (statsapi.mlb.com)
8 scheduled games: **7 Final with box scores**; ATL @ CWS (gamePk 824589) **postponed** —
zero leans graded for it (its 52 leans excluded as unavailable, never misgraded).

## 2. Bank Builder Step 3 — SETTLED: WIN (verified leg by leg)

| Leg | Market | Odds | Book | Official result | Outcome |
|---|---|---|---|---|---|
| Mexico | Moneyline (90′ regulation) | −235 | DraftKings | Mexico won 2–0 in regulation | **WIN** |
| South Korea or Czechia | Double chance | −270 | FanDuel | South Korea won 2–1 in regulation (either-team-wins covered; a draw would have LOST) | **WIN** |

Math (exact, no rounding drift): `728.76 × (1+100/235) × (1+100/270) = 728.76 × 1.9535066982 = 1,423.64`.

| Field | Before | After |
|---|---|---|
| Bankroll | $728.76 | **$1,423.64** (+$694.88) |
| Step | 3 (700→1,400) | **4 (1,400→3,500)** — Step 3 cleared |
| Record / streak | 2–0 / W2 | **3–0 / W3** |
| nextTargetUnits | 2000 (pre-migration value) | **3500** (public ladder Step-4 goal) |
| nextPickStatus | pending | pending (Step-4 card not yet selected) |

Artifacts written: `public-summary-latest.json`, `public-ledger-latest.json` (+ dated
`public-ledger-2026-06-12.json`), `active-builder-slip-latest.json` (+ dated 2026-06-11) —
ledger Step-3 entry carries legs, finals, `combinedAmerican: -105`,
`settlementSource: "espn_scoreboard"`, `officialResultConfirmed: true`.
**Idempotency:** the settlement script no-ops if a Step-3 entry already exists; tests enforce
unique step numbers + bankroll continuity. Internal artifacts (`summary-latest.json` $444.19,
`ledger-latest.json`) untouched, per policy.

## 3. World Cup projections + cards settled

`pipeline.world_cup.settle` extended: `grade_double_chance` (loses on draw, wins when either
covered side wins) + `--scores` operator-verified official-scores input (API-Football remains
the default when keyed). Settlement artifact (`settlement/latest.json` + dated) now carries
`finals` (scores + corners) and `settlementSource`. Re-run verified byte-identical (idempotent).

Graded published picks (the 3 parlay-eligible picks; corners had no published pick — recorded
as match facts only):

| Pick | Market | Final | Outcome |
|---|---|---|---|
| South Africa or Draw (+195) | double_chance | Mexico 2–0 | **LOSS** |
| South Korea or Czechia (−270) | double_chance | S. Korea 2–1 | **WIN** |
| Over 2.5 (+125) | match_total_goals | S. Korea 2–1 (3 goals) | **WIN** |

Suggested WC cards (5): low_001 **WON**, low_002 **WON**, medium_001 **LOST**, medium_002
**LOST**, high_001 **LOST** → 2–3. Written into `parlays/2026-06-11.json` + `latest.json`
(per-leg `result`, card `result`, `settledAt`, `settlementSource`); rendered on the
/world-cup Results tab + settled chips on suggested cards.

**Player props: NOT settled (left pending).** ESPN's official match summaries carry no
per-player stat lines for these matches (empty stat groups) — shots / shots-on-target /
assists / scorer props cannot be reliably graded, so per the hard rule they remain unsettled.
Scorers/assists are recorded in the evidence artifact for transparency only.

## 4. MLB settled (official box scores)

`pipeline.mlb.settle_mlb_results --date 2026-06-11` + `pipeline.mlb.export_mlb_results`:
384 published leans → **314 decisive: 148W–166L (47.1%)**, 0 pushes, 52 unavailable
(postponed ATL@CWS + non-appearing players). Per-game hit rates in
`mlb_comparison_report_2026-06-11.json`; public artifacts under `app/public/data/mlb/results/`
(visible on /results). Idempotent by lean id.

## 5. Mixed-sport cards settled (1–5)

`pipeline.daily.settle_suggested_cards` (new): WC legs from the WC settlement artifact; MLB
legs resolved via the optimizer leg pool (label → player/market/side/line, no string-guessing)
against the settled MLB leans. Byte-identical on re-run.

| Card | Legs | Result |
|---|---|---|
| mix_low_001 | SK/CZ DC ✓ + Burleson H+R+RBI O1.5 ✓ (actual 3) | **WON** |
| mix_low_002 | SK/CZ DC ✓ + Seager Hits U1.5 ✗ (actual 2) | LOST |
| mix_medium_001 | SK/CZ DC ✓ + Ward H+R+RBI O1.5 ✗ (actual 0) | LOST |
| mix_medium_002 | Over 2.5 ✓ + Ward ✗ | LOST |
| mix_high_001 | SA or Draw ✗ + Ward ✗ | LOST |
| mix_high_002 | SA or Draw ✗ + Dobbins K O3.5 ✓ (actual 5) | LOST |

## 6. Public UI updated (gating + settled rendering)

- **/bank-builder**: $1,423.64 · Step 4/5 · 3–0; the World Cup hit renders in Previous hits;
  the official-candidate card is **gated on `currentProgressionStep === 3`** so the settled
  step can never re-render as a pending card.
- **/today**: same gate (+ the Step-3-era Flex Card gated off); bankroll now locale-formatted.
- **/world-cup**: Results tab now renders the settlement artifact — official finals (+corners),
  graded picks, settled suggested cards, source line.
- **/picks** + suggested cards everywhere: settled cards show WON/LOST chips + per-leg ✓/✗ and
  drop the interactive paper-stake calculator ("Settled from official results").
- **/results**: June 11 MLB settlement visible via the exported MLB results artifacts.

## 7. Tests / audits

- JS: **809 pass / 0 fail** — pre-settlement state locks updated; NEW settlement-integrity test
  (exact parlay math, ledger continuity, unique steps, record == ledger wins).
- Python: WC settle tests extended (DC loses-on-draw / wins-either-team, 90′ ML, scores-file
  validation, dispatch skips unsupported markets); new card-grading tests
  (loss>pending>won, push handling); `pipeline.settle_test` 85 assertions pass.
  (`pipeline/settle_test.py` under pytest errors pre-date this change — it uses its own runner.)
- `tsc` clean · `npm run build` clean · copy audit clean (only the site-wide "No guarantees"
  footer + the pre-existing negated "not a profit or guarantee claim" disclaimer on /results).
- Stale sweep of rendered pages: no `$444.19`, no `$728.76`-as-current, no pending Step-3 card,
  no `2–0` record on /bank-builder//today. `$728.76` remains only as the historical
  stake/from amount inside settled entries — correct.

## 8. Unresolved / pending items (and why)

- **ATL @ CWS postponed** — its 52 MLB leans ungraded (no game played). Settle when rescheduled.
- **WC player props (76)** — pending: no official per-player stat lines available (see §3).
- **WC corners projections** — no published pick existed; corner counts recorded as facts only.
- The Step-4 official card does not exist yet — /bank-builder + /today honestly show
  "none cleared yet" with the Step-4 goal ($1,400 → $3,500).
