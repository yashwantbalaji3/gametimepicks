# May 29 product state handoff (2026-05-29)

Last updated: 2026-05-29 (PR `docs/may29-state-handoff`).

This is a snapshot of the product state at the end of the May 29
morning workflow + post-May-28 settlement cleanup. It captures
exactly what's live, what's pending, and the next observable
thresholds. Pure handoff doc — no code change.

---

## 1. Production / git state

| Field | Value |
|---|---|
| Production / main SHA | `91d213f` |
| Last morning workflow | success at 2026-05-29T12:07 UTC |
| Last nightly settle | success at 2026-05-29T10:36 UTC (settled May 28) |
| Public parlay tracking era | starts `2026-05-27` |

---

## 2. May 29 active slate state

| Field | Value |
|---|---|
| `/parlay-lab` slate strip | `Fri · May 29` |
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
| May 29 game status | all 15 games "Scheduled" (no games final yet) |

May 29 settlement will be picked up by the automated nightly cron
~06:30 ET on 2026-05-30. No manual settlement attempted today
(hard rule: do not settle partial slates).

---

## 3. May 28 consolidated results state

`/results` surfaces (all live on production at `91d213f`):

- **Results header** ("Suggested parlay results · GameTime Picks")
- **Fresh-era status block** ("Public parlay tracking starts 2026-05-27")
- **Daily projection-level audit banner** (2026-05-28)
- **Lifetime / by-profile / by-sport summary tiles** (era-filtered)
- **May 28 breakdowns eyebrow** (single shared eyebrow for both
  tables — PR #161)
- **Risk-section breakdown** (PR #158/#159 — pipeline-backed
  totals)
- **Sport-mix breakdown** (PR #158/#159)
- **Settled risk-section slip drilldown** (PR #165 — actual slips
  behind the summary numbers, accordion per section)
- **Per-date sections** for May 28 + May 27 (existing)
- **Learning signals table** (PR #160 + #167 — now with explicit
  shortfall copy on too-small rows)
- **Methodology card** (existing)
- **NBA/MLB audit pointers** (existing)

### 3.1 May 28 publicRiskSections summary (lifetime through May 28)

After PR #166's H+R+RBI grader fix + regrade:

| Section | W | L | Pending | Hit rate | n |
|---|---|---|---|---|---|
| Low Risk | 2 | 1 | 1 | 66.7% | 3 |
| Medium Risk | 1 | 2 | 1 | 33.3% | 3 |
| High Risk | 0 | 4 | 0 | 0.0% | 4 |
| Longshot | 0 | 4 | 0 | 0.0% | 4 |

### 3.2 May 28 sport-mix lifetime

| Bucket | W | L | Pending | Hit rate | n |
|---|---|---|---|---|---|
| 🏀 NBA-only | 4 | 0 | 0 | 100.0% | 4 |
| ⚾ MLB-only | 0 | 15 | 1 | 0.0% | 15 |
| 🔀 Mixed | 1 | 13 | 2 | 7.1% | 14 |

### 3.3 May 28 profile slip totals

| Profile | W | L | Pending | Hit rate | n |
|---|---|---|---|---|---|
| Conservative | 18 | 16 | 5 | 52.9% | 34 |
| Balanced | 5 | 37 | 2 | 11.9% | 42 |
| Aggressive | 3 | 37 | 4 | 7.5% | 40 |
| Star Power | 10 | 30 | 3 | 25.0% | 40 |
| **Lifetime** | **41** | **150** | **17** | **21.5%** | **191** |

---

## 4. May 28 pending audit outcome

Before PR #166: 4 pending publicRiskSections.all slips (Low 1,
Medium 1, Multi 2). Root cause: `batter_hits_runs_rbis` was NOT in
the MLB grader's `GRADABLE_MARKETS` set — every H+R+RBI prop
silently returned `"unsupported market"`, propagating as
`result="unresolved"` on the leg and `status="pending"` on every
slip that contained one.

After PR #166: 2 pending publicRiskSections.all slips. The
remaining pending are honest "stats_unavailable" — both slips
contain Eli White (ATL) `batter_hits_runs_rbis Over 0.5`, and Eli
White had 0 plate appearances in the May 28 Braves game. The
grader correctly returns `None` for that leg; the drilldown
surfaces it transparently with the UNRESOLVED leg tone.

H+R+RBI legs settled by grader on May 28: 21 of 43 (49%) — 2W-19L
on the resolved subset. The 22 unresolved are real player no-shows
or non-appearance cases; never invented.

---

## 5. Learning signal status

`/results` Learning Signals table (PR #160 + #167) now shows 19
rows. As of 2026-05-29:

| Family | Confirmed | Tracking | Too small | Shadow-test candidate |
|---|---|---|---|---|
| Profile (×4) | 0 | 0 | 4 | 0 |
| Public risk-section (×4) | 0 | 0 | 4 | 0 |
| Sport-bucket (×3) | 0 | 0 | 3 | 0 |
| Audit-policy (×8) | 1 (longshotKeepCollapsed) | 7 | 0 | 0 |

Every too-small row now carries an explicit shortfall ("needs X
more decisive slips before…"). The only confirmed signal
(`longshotKeepCollapsed`, 1 of 1 days) is explicitly labeled
"Confirmed — not consumed" — operator-approval gate intact.

Next observable threshold:

- `market:batter_total_bases` at 2/3 confirming days → one more
  qualifying day flips it to confirmed (~2026-05-30 or 31).
- Aggressive profile needs 20 more decisive slips to clear the
  n=60 demotion floor (~2026-06-01 at 76 slips/day).
- Low Risk section needs 37 more decisive slips to clear the n=40
  cap-tightening floor (~2026-06-08 at 4 section slips/day).

---

## 6. Known limitations

- **NBA absent today** is the honest state — no NBA game scheduled
  on 2026-05-29 (Finals rest day). NBA-only and Mixed buckets are
  honestly empty; sport tabs and risk-section sport tabs honor
  this. When NBA returns, those buckets repopulate automatically.
- **2 publicRiskSections pending stay pending** until next morning
  workflow re-runs the grader — but they won't move (Eli White
  didn't appear). The drilldown surfaces this transparently.
- **Per-section result history is May 28-only** — pre-dates PR
  #152's `publicRiskSections` selector. Not actionable without
  rewriting May 27's optimizer snapshot, which would alter settled
  state.
- **Vercel auto-commit deploy quirk:** the auto-commit from
  morning-projections.yml occasionally doesn't trigger a Vercel
  rebuild on its own. The next regular PR cycle pulls it forward.
  Today's auto-commit `b823f24` was promoted to production by PR
  #162's deploy.

---

## 7. Verification commands

Run these to confirm any of the state above:

```bash
# Production /parlay-lab on May 29
curl -sL https://gametime-picks.vercel.app/parlay-lab/ \
  | grep -E "Fri · May 29|No NBA games|Low Risk|Medium Risk|High Risk|Longshot|Settled" \
  | head -40

# Production /results on May 28
curl -sL https://gametime-picks.vercel.app/results/ \
  | grep -E "Risk-section|Sport-mix|Learning signals|May 28 breakdowns|Confirmed — not consumed|All pending|Fresh tracking era" \
  | head -40

# Production May 29 optimizer payload integrity
curl -sL https://gametime-picks.vercel.app/data/parlays/optimizer/2026-05-29.json \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
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

# May 28 graded payload — pending count + lifetime
curl -sL https://gametime-picks.vercel.app/data/parlays/optimizer-graded/2026-05-28.json \
  | python3 -c "
import json,sys
from collections import Counter
d = json.load(sys.stdin)
us = d.get('uniqueSlips') or []
prs = d.get('publicRiskSections') or {}
print('uniqueSlips status:', Counter(s.get('status') for s in us))
for sec, by_sport in prs.items():
    ct = Counter(s.get('status') for s in (by_sport.get('all') or []))
    print(f'  {sec}.all status:', dict(ct))
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
```

Expected output today: all zeros, May 29 active, May 28 consolidated.

---

## 8. PRs that landed today (2026-05-29)

| PR | Title | SHA |
|---|---|---|
| Auto | morning projections 2026-05-29 08:08 ET | `b823f24` |
| #162 | fix(results): keep settled and active slates clearly separated | `d9518f6` |
| #163 | fix(results): polish May 28 consolidated result details | `9beac84` |
| #164 | docs(audit): update learning signals after May 28 settlement | `db61b0a` |
| #165 | feat(results): add settled risk-section slip drilldown | `b3a4e9c` |
| #166 | fix(results): audit pending public risk-section slips | `ce32c6c` |
| #167 | feat(results): add risk-section learning signal inputs | `e9c67d3` |
| #168 | fix(ui): polish parlay lab for mono-sport slates | `91d213f` |

Plus the next morning auto-commit + this handoff PR.

---

## 9. Next recommended work

1. **Automatic nightly settle for May 29** (no action required — runs
   at 06:30 ET on 2026-05-30; will move May 29 to /results).
2. **Operator approval workflow for `longshotKeepCollapsed`** — this
   audit signal has been confirmed since the policy file first
   generated. A small PR can wire an explicit
   `operatorApproved: <PR>` flag in `audit/policy.json` so the
   optimizer can consume it deterministically.
3. **`market:batter_total_bases` confirming day** — likely tips to
   confirmed on the next 1-2 nights. When it does, the Learning
   Signals table flips it from "Tracking" to "Confirmed — not
   consumed" automatically; no code change needed.
4. **Aggressive profile shadow-eval prep** — projected to clear
   n=60 around 2026-06-01. The numeric thresholds in
   `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md` section 3.1
   spell out the shadow-eval protocol.
5. **NBA Finals Game 5 (probably 2026-05-30 or 31)** — when an NBA
   game reappears, the publicRiskSections NBA-only + Mixed buckets
   will repopulate and the mono-sport banner will auto-clear.

---

## 10. Cross-reference

- `docs/MODEL_LEARNING_ROADMAP_2026-05-28.md` — full roadmap.
- `docs/AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md` — gate
  thresholds + post-May-28 follow-up section.
- `app/src/lib/results-breakdown.ts` — UI loader-side classifier.
- `app/src/lib/results-drilldown.ts` — drilldown helper (PR #165).
- `app/src/lib/learning-signals.ts` — learning signals helper
  (PR #160 + #167).
- `pipeline/grade_optimizer.py` — grades both bucket pool +
  publicRiskSections slips (PR #159).
- `pipeline/mlb/settle_mlb_results.py` — MLB market grader with
  H+R+RBI (PR #166).
- `app/public/data/parlays/optimizer-summary.json` — lifetime +
  per-date numbers including `byPublicSection` and `bySportBucket`.

This doc updates when the next significant feature lands or when
the model first consumes a confirmed signal.
