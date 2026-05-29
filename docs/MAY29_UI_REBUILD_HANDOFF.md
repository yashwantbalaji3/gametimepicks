# May 29 UI rebuild handoff (2026-05-29)

Last updated: 2026-05-29 (PR `docs/ui-rebuild-handoff-may29`).

Snapshot of the product state after PRs #170-#174 reshaped
`/results`, `/parlay-lab`, and removed the desktop sports rail.

---

## 1. Production / git state

| Field | Value |
|---|---|
| Production / main SHA | `ff939be` |
| Last morning workflow | success at 2026-05-29T16:57 UTC (auto-commit `198e438`) |
| Last nightly settle | success at 2026-05-29T10:36 UTC (settled May 28) |
| Public parlay tracking era | starts `2026-05-27` |

---

## 2. May 29 active slate state

| Field | Value |
|---|---|
| `/parlay-lab` slate strip | `Fri · May 29 · 64 slips · MLB-only slate · Today` |
| Settled chip on May 29 | absent (correct — pre-game) |
| Mono-sport banner | `"No NBA games scheduled today — MLB-only slate."` |
| Visible sport tabs | `All`, `MLB` only (NBA + Mixed correctly hidden) |
| Optimizer JSON | live (`/data/parlays/optimizer/2026-05-29.json`) |
| `totalSlips` | 64 |
| `sourcePools` | `{nbaCount: 0, mlbCount: 639}` |
| `publicRiskSections` | 4 slips per section × `all` + `mlb` buckets |
| `publicRiskSections.nba` / `multi` | empty (NBA Finals off-day) |
| Game-time coverage | 56 / 56 publicRiskSections legs carry `commenceTime` |
| First MLB game first pitch | 2026-05-29T22:40 UTC (6:40 PM ET) |
| May 29 game status | all 15 games "Scheduled" — no games final yet |

May 29 settlement will be picked up by the automated nightly cron
~06:30 ET on 2026-05-30. **No manual settlement during the day;
this is intentional.**

---

## 3. May 28 consolidated results state

`/results` post-restructure (live at `ff939be`):

1. **Compact hero**: `RESULTS` eyebrow + `Settled slate: May 28`
   headline + one-line tracking-era note.
2. **One-row lifetime card**: `Lifetime · Public Era · 23.4% · 33 W ·
   108 L · 141 decisive · 5 pending`.
3. **In-page nav pills** (PR #171): Overview · Risk Sections ·
   Sport Mix · Slip Details · Projection Audit · Learning Signals.
   Mobile hides the long Learning Signals hint inline.
4. **May 28 breakdowns wrapper**:
   - Risk-section breakdown (Low / Medium / High / Longshot)
   - Sport-mix breakdown (NBA-only / MLB-only / Mixed)
   - Settled risk-section slip drilldown (PR #165 — 16 slip rows)
5. **Daily audit banner** (moved from above-the-fold to below the
   breakdowns).
6. **Per-date sections** (May 28 + May 27).
7. **By internal profile** tile row — under a clear "historical lane
   view" eyebrow so the legacy Conservative / Balanced / Star
   Power / Aggressive tiles stay accessible but no longer compete
   with the dashboard.
8. **Learning signals** — `<details>` collapsed by default. Summary
   chip reads `Learning signals · 1 confirmed · 7 tracking · 11
   too small · click to expand`.
9. **Methodology card** — new "What changed recently" block (PR
   #173) above the existing Learning Roadmap callout.
10. **NBA/MLB audit pointer** — unchanged.

### 3.1 Page-shape measurements (1280×800 desktop)

| | Before (pre-PR-170) | After (PR #170/#171) | Δ |
|---|---|---|---|
| Page height | 30,811 px | 8,212 px | -73% |
| First useful content Y (Risk-section breakdown) | 3,659 px | 330 px | -91% |
| Above-the-fold content | hero + 737px era card | hero + lifetime + full Low/Medium/High/Longshot | ✅ |
| Horizontal overflow | present | gone | ✅ |
| Left sports rail | visible | removed | ✅ |

### 3.2 May 28 numbers (after PR #166 H+R+RBI fix + regrade)

**Per public risk section** (lifetime via `byPublicSection`):

| Section | W | L | Pending | Hit rate | n |
|---|---|---|---|---|---|
| Low Risk | 2 | 1 | 1 | 66.7% | 3 |
| Medium Risk | 1 | 2 | 1 | 33.3% | 3 |
| High Risk | 0 | 4 | 0 | 0.0% | 4 |
| Longshot | 0 | 4 | 0 | 0.0% | 4 |

**Per sport bucket**:

| Bucket | W | L | Pending | Hit rate | n |
|---|---|---|---|---|---|
| 🏀 NBA-only | 4 | 0 | 0 | 100.0% | 4 |
| ⚾ MLB-only | 0 | 15 | 1 | 0.0% | 15 |
| 🔀 Mixed | 1 | 13 | 2 | 7.1% | 14 |

**Per internal profile (kept for transparency)**:

| Profile | W | L | Pending | Hit rate | n |
|---|---|---|---|---|---|
| Conservative | 18 | 16 | 5 | 52.9% | 34 |
| Balanced | 5 | 37 | 2 | 11.9% | 42 |
| Aggressive | 3 | 37 | 4 | 7.5% | 40 |
| Star Power | 10 | 30 | 3 | 25.0% | 40 |
| **Lifetime** | **41** | **150** | **17** | **21.5%** | **191** |

---

## 4. Results UI restructure summary

Five PRs landed today (#170-#174):

| PR | Effect | SHA |
|---|---|---|
| #170 | Compact hero + restructure + remove rail | `e83fbe8` |
| #171 | In-page nav pills + collapsible learning signals | `b8ffe46` |
| #172 | Mono-sport slate-strip polish on `/parlay-lab` | `4b5a311` |
| #173 | "What changed recently" methodology copy | `270fea3` |
| #174 | Delete dead `desktop-sports-rail.tsx` | `ff939be` |

---

## 5. Sidebar / nav decision

**Decision:** the desktop sports rail was removed everywhere.

Rationale:
- Of the 6 items in the rail (All / NBA / MLB / Mixed / Results /
  Custom), 4 (`/`, `/results`, `/parlay-lab`, `/parlay-lab#custom`)
  duplicated destinations already in the top nav. Two
  (`/nba`, `/mlb`) point to sport-specific board pages that are
  rarely the user's primary entry point.
- Per-page surfaces already provide the relevant in-page filtering:
  Parlay Lab has sport tabs filtered by the active pool; Results
  has the new in-page section nav (PR #171); Projections has its
  own date + sport tabs.
- The mobile bottom nav is unchanged — it never carried the rail
  (rail was `hidden lg:flex`).

Cross-page rail audit verified `/`, `/parlay-lab`, `/results`,
`/projections`, `/about` all render rail-free with no horizontal
overflow and `main` `padding-left: 0`.

---

## 6. Methodology recent learnings

PR #173 added three plain-English bullets to the on-page
MethodologyCard (a "What changed recently" block) AND extended
both methodology docs with matching sections:

- **Grading blind spot fixed** — H+R+RBI now grades off the box
  score the same way Hits / Total Bases do (PR #166). On May 28:
  21 of 43 H+R+RBI legs now grade cleanly (2W-19L). Remaining 22
  are real player no-shows.
- **Public risk sections tracked separately** — the hit rate users
  see on Results matches what they saw on Parlay Lab the day
  before. Pipeline-backed since PR #159.
- **Sample gates still hold** — the on-page Learning Signals table
  spells out the shortfall on every too-small row. No model
  behavior change. Confirmed signals stay operator-gated.

Doc files:
- `docs/MODEL_LEARNING_ROADMAP_2026-05-28.md` (section 11)
- `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md` (section 7)

---

## 7. Hard rules respected (production scan)

- 0 banned betting copy across all surfaces
- 0 user-facing safe/safety outside CSS `safe-area-inset`
- 0 cricket / WNBA / IPL
- 0 May 26 replay
- 0 16.0% pre-era leak
- 0 Odds API key exposure
- 0 manual outcome edits
- 0 "the model learned" / "AI is choosing" / "deep learning is
  active" / "machine learning" / "neural network" overclaim

---

## 8. Known limitations

- **May 29 settlement** waits for tonight's nightly cron. No
  manual settlement during the day.
- **2 publicRiskSections pending slips** on May 28 stay pending —
  Eli White (ATL) didn't appear in the May 28 Braves game, so the
  H+R+RBI leg honestly returns `stats_unavailable`. The drilldown
  surfaces them with the `UNRESOLVED` per-leg chip.
- **Per-section result history is May 28-only** — pre-dates PR
  #152's selector. Not actionable without rewriting May 27's
  optimizer snapshot.
- **Vercel auto-commit deploy lag** — occasionally the workflow's
  auto-commit doesn't trigger a Vercel rebuild on its own. The
  next regular PR cycle pulls it forward; today's auto-commits
  `b823f24` (morning) and `198e438` (afternoon refresh) were both
  promoted by subsequent PR deploys.

---

## 9. Verification commands

```bash
# Production /results
curl -sL https://gametime-picks.vercel.app/results/ \
  | grep -E "Settled slate: May 28|RESULTS|RISK SECTIONS|SPORT MIX|SLIP DETAILS|PROJECTION AUDIT|LEARNING SIGNALS|Lifetime · public era|What changed recently|grading blind spot" \
  | head -40

# Production /parlay-lab
curl -sL https://gametime-picks.vercel.app/parlay-lab/ \
  | grep -E "Fri · May 29|MLB-ONLY SLATE|TODAY|No NBA games scheduled today|Low Risk|Medium Risk|High Risk|Longshot" \
  | head -40

# Production May 29 optimizer integrity
curl -sL https://gametime-picks.vercel.app/data/parlays/optimizer/2026-05-29.json \
  | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('date:', d.get('date'), 'totalSlips:', d.get('totalSlips'))
print('sourcePools:', d.get('sourcePools'))
prs = d.get('publicRiskSections', {})
for sec, by_sport in prs.items():
    print(f'  {sec}:', {k:len(v) for k,v in by_sport.items() if isinstance(v, list)})
total = timed = 0
for sec, by_sport in prs.items():
    for sport, slips in by_sport.items():
        if sport == 'all': continue
        for slip in slips:
            for leg in slip['legs']:
                total += 1
                if leg.get('commenceTime') or leg.get('gameTime'):
                    timed += 1
print(f'game-time: {timed}/{total}')
"

# Hard-rule scans
curl -sL https://gametime-picks.vercel.app/results/ > /tmp/r.html
curl -sL https://gametime-picks.vercel.app/parlay-lab/ > /tmp/lab.html
for s in "guaranteed" "lock" "no-brainer" "sure thing" "sharp money" \
         "easy win" "easy money" "free money" "risk-free" \
         "cricket" "wnba" "ipl" "May 26 replay" "16.0%"; do
  c=$(grep -cE "\b$s\b" /tmp/r.html /tmp/lab.html | awk -F: '{sum+=$2}END{print sum}')
  echo "  $s: $c"
done

# Sidebar rail verification (should be 0)
grep -c "desktop-sports-rail\|Sports navigation" /tmp/r.html /tmp/lab.html
```

Expected today: all zeros for hard rules + sidebar; May 29 active;
May 28 consolidated.

---

## 10. Next recommended work

1. **Automatic nightly settle for May 29** (no action required — runs
   at ~06:30 ET on 2026-05-30; will move May 29 into Results).
2. **Operator approval workflow for `longshotKeepCollapsed`** — the
   only confirmed-not-consumed signal. A small PR could wire an
   `operatorApproved: <PR>` flag in `audit/policy.json` so the
   optimizer can consume it deterministically.
3. **`market:batter_total_bases` confirmation** — likely tips to
   confirmed on the next 1-2 nights (currently 2/3 days). The
   Learning Signals row will flip automatically; no code change
   needed.
4. **Aggressive profile shadow-eval prep** — projected to clear
   n=60 around 2026-06-01. The numeric thresholds in
   `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md` section 3.1
   spell out the shadow-eval protocol.
5. **NBA Finals Game 5** (likely 2026-05-30 or 31) — publicRiskSections
   NBA-only + Mixed buckets will repopulate; the mono-sport banner
   will auto-clear.

---

## 11. Cross-reference

- `docs/MODEL_LEARNING_ROADMAP_2026-05-28.md` — full roadmap +
  section 11 "What changed recently".
- `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md` — gate
  thresholds + section 7 May 29 follow-up.
- `docs/MAY29_STATE_HANDOFF.md` — earlier (pre-UI-rebuild) handoff.
- `app/src/components/results-hero.tsx` — new compact hero.
- `app/src/components/results-section-nav.tsx` — in-page anchor
  nav + learning-signal headline summarizer.
- `app/src/components/methodology-card.tsx` — "What changed
  recently" block + Learning Roadmap callout.
- `pipeline/mlb/settle_mlb_results.py` — H+R+RBI grader.
- `app/public/data/parlays/optimizer-summary.json` — lifetime +
  per-date numbers including `byPublicSection` and `bySportBucket`.

This doc updates when the next significant feature lands or the
model first consumes a confirmed signal.
