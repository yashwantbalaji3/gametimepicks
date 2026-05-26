# Model learning loop — daily settle → audit → promotion/demotion

Last updated: 2026-05-26 (PR #113).

This doc captures the operating loop the GameTime Picks model runs
on. The goal isn't to promise a hit rate — it's to make every day
a structured feedback cycle so the surface honestly improves over
time.

> **Hard constraint.** We do not claim 75–80% hit rates anywhere in
> the product unless they are achieved on a publicly-tracked,
> decisive-only, out-of-sample basis with the minimum sample sizes
> documented below. Until then, every surface stays labeled
> "experimental · publicly tracked."

---

## 1. Daily settlement process

Runs on the nightly cron (`nightly-settle.yml`) at ~03:00 ET, with
a backup run at ~06:30 ET if the first didn't pick up final box
scores.

1. **Pull final box scores.** NBA via ESPN scoreboard + nba_api.
   MLB via ESPN scoreboard.
2. **Grade individual leans.** `pipeline/grade.py` walks the
   settled rows and emits per-leg `win` / `loss` / `push` /
   `stats_unavailable`.
3. **Grade optimizer slips.** `pipeline/grade_optimizer.py` rolls
   leg results into slip-level `win` / `loss` / `push` /
   `pending`.
4. **Update summaries.**
   - `app/public/data/parlays/optimizer-summary.json` — lifetime,
     byProfile, bySport, byDate buckets.
   - `app/public/data/<sport>/results/lifetime_summary.json`
   - per-day `comparison_report_<date>.json` files.

Pending slips (DNP / box-score unavailable / in-flight) are
explicitly excluded from the `decisive` denominator. They are
never silently re-mapped to losses.

## 2. Daily audit metrics

The grader and a follow-up audit script
(`pipeline/audit_daily.py` — TODO) emit a per-day report with at
minimum the following splits:

- Hit rate by **sport** (NBA / MLB / multi)
- Hit rate by **market**
  - NBA: `PTS`, `REB`, `AST`, `3PM`
  - MLB: `batter_hits`, `batter_total_bases`, `pitcher_strikeouts`
- Hit rate by **confidence tier** (`High` / `Medium` / `Low`)
- Hit rate by **player tier** (star / value)
- Hit rate by **slip size** (2-leg / 3-leg / 4-leg)
- Hit rate by **same-game vs cross-game**
- Hit rate by **mixed-sport vs single-sport**
- **DNP / unavailable count** broken out separately

Sample size and the calibration bucket per split are stamped on
every row so the audit never claims significance it doesn't have.

## 3. Promotion / demotion rules

The whole point of the loop. These rules drive the safety filters
that already exist in PR #110, and will tighten over time:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Decisive sample on a market | < 25 | Hold — no promotion or demotion yet. |
| Decisive sample on a market | ≥ 25 AND hit rate ≥ 60% | Eligible for a confidence-tier promotion. |
| Decisive sample on a market | ≥ 25 AND hit rate ≤ 45% | Auto-demotion (downweight in optimizer, surface in Audit Notes). |
| Decisive sample on a slip shape | ≥ 14 AND hit rate ≤ 10% | Hard-disable the shape (e.g. 5-leg slips after the 5/25 audit). |
| DNP rate on a player | ≥ 25% over last 5 surfaces | Suppress from official suggestions (planned DNP guard — PR-next). |

Promotions require:
- Out-of-sample confirmation (the data driving the promotion did
  NOT generate the change).
- A passing TypeScript / Python test that locks the new threshold.

## 4. Rolling windows

| Window | Purpose |
|--------|---------|
| 3-day  | Trend-spotting only. Never used to promote/demote markets. |
| 7-day  | Day-to-day calibration confidence. Surfaced in audit copy. |
| 14-day | Minimum window for confidence-tier shifts. |
| Lifetime | Headline hit rate on `/results` + `/results/{nba,mlb}`. |

The optimizer-summary loader already supports `byDate`; the rolling
windows are derived at audit time, not stored.

## 5. Model safety filters (already shipped)

PR #110 landed the first generation of these. Future PRs in this
loop extend the list.

| Filter | Status | PR |
|--------|--------|----|
| Aggressive max_legs 5 → 4 | ✅ shipped | #110 |
| Star Power same-game NBA cap 2 → 1 | ✅ shipped | #110 |
| Mixed-sport display penalty | ✅ shipped | #110 |
| AST/PTS Star Power override requires `recent10Count >= 7` | ✅ shipped | #110 |
| Edge clip 20pp → 15pp | ✅ shipped | #110 |
| Display-layer 5+ leg suppression (legacy data) | ✅ shipped | #110 |
| Longshot lane hidden by default | ✅ shipped | #110 |
| DNP guard (suppress players w/ missing recent box scores) | ⏳ planned | next |
| Blowout/spread guard for volume props | ⏳ planned | next |
| Broader recent-form gate for high edges | ⏳ planned | next |
| Market auto-demotion | ⏳ planned | needs the daily-audit script |

## 6. Target strategy

The product should optimize for **fewer, higher-quality picks**,
not more exciting-looking slips.

Operating principles:

1. **Track honestly.** Public Results page is the single source of
   truth. Pending excluded, pushes excluded.
2. **Reduce bad volume.** Every demotion / disabling rule shrinks
   the surface area; that's by design.
3. **Highest-quality lanes get the most visibility.** Conservative
   and Balanced render 2 visible slips; Longshot is opt-in.
4. **No surface trick beats no surface trick.** We never promote
   a slip to look better. The optimizer score is what it is.
5. **The user always sees the worst result alongside the best.**
   The 6W-54L-10P / 10.0% headline lives at the top of `/results`
   exactly because we earned it on 5/25.

## 7. Criteria before claiming a higher hit rate publicly

If at any point we surface "we hit X%" copy on the homepage, ALL
of the following must be true:

- **Minimum decisive sample:** 25+ decisive picks for any market,
  100+ decisive slips for any lane, 200+ decisive overall.
- **Out-of-sample:** the data driving the claim cannot be the
  same data used to set the thresholds that produced the picks.
- **Decisive-only denominator:** pushes excluded, pending
  excluded, void excluded.
- **No pending/push inflation.** A "pending" tail shaped to make
  the rate look better is never acceptable.
- **Public results history visible** for at least 14 graded
  slates with no missing days.

If any of those fails, the headline copy stays "experimental ·
publicly tracked."

## 8. Implementation TODOs (for upcoming PRs)

| Task | Effort | Where |
|------|--------|-------|
| `pipeline/audit_daily.py` — automated daily postmortem | M | new file; reads optimizer-graded + settled_leans |
| Market auto-demotion based on rolling 14-day window | M | extend `pipeline/parlay_optimizer.py` to consume an `audit_thresholds.json` produced by the daily audit |
| Player DNP-risk suppression | M | needs an inactive feed (NBA injury report / MLB roster moves) |
| Blowout/spread integration | M | needs a pregame spread feed for NBA + MLB |
| WNBA validation cycle | L | see `docs/WNBA_ROADMAP.md` |
| Surface "rolling 7-day hit rate" on `/results` | S | UI-only |

## 9. What this loop does NOT do

- It does **not** retroactively re-grade settled slips. A loss
  stays a loss.
- It does **not** allow manual hit-rate adjustments anywhere in
  the codebase. Every published number traces back to
  `optimizer-summary.json` which is regenerated from JSONL on
  every cron.
- It does **not** promote anything during a `pending` tail. We
  wait for the decisive denominator to stabilize first.
- It does **not** introduce new sports without a settlement path
  (see `docs/WNBA_ROADMAP.md` for the staged-launch contract).
