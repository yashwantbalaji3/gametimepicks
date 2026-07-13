# Results & Settlement Audit — 2026-07-13

Which results system is canonical, and the honest settlement debt. **No scores or settlements were fabricated**
in this audit — every gap below is left as pending.

## Which results system is canonical (there are three, for three different things)
| system | source | surfaced at | current thru | what it is |
|---|---|---|---|---|
| **Official money record** | `mr-dub/portfolio.json` | `/mr-dub`, `/`, `/results` header, everywhere | **19-14**, md5 `affe6b21` | THE canonical money/record — the Bank Builder $100→$19,065.40 journey. Immutable this session. |
| **Public track record** | `parlay-results.ts` → `parlays/optimizer-graded/<date>.json` + `optimizer-summary.json`, **era-filtered** by `public-parlay-era.ts` | **`/results`** (canonical) | era-filtered; empty-until-a-post-era-slate-settles | the parlay-first public track record. Honest empty state ("No settled… yet"). |
| **MLB model-perf** | `mlb/results/*` (`data-mlb-results.ts`) | `/mlb/results`, `/results/mlb` | **2026-07-11** | money-INDEPENDENT model grading vs official box scores. Separate ledger. |

**Verdict:** `/results` is canonically the **era-filtered optimizer-graded parlay track record**; MLB model-perf
is a separate, honestly-labelled sub-ledger; the money record is portfolio.json. These three are intentionally
distinct and each honest — not a contradiction.

### Vestigial: the legacy cross-sport `results/` tracker (frozen 06-13)
`results/available_dates.json` (newest 2026-06-13) + `results/lifetime_summary.json` (hitRate 0.49, `generatedAt`
2026-07-13 wrapper but 06-13 content) are the OLD cross-sport lean tracker. **No public page reads them** (grep:
only `data.ts` touches the unrelated NBA `ln.json`). The nightly settle still regenerates them, but nothing
surfaces them. **Recommendation:** retire the legacy `results/` export (or confirm an internal consumer) so it
stops implying a second, stale track record. Not a public bug today (unsurfaced) — a cleanup.

## Settlement debt (the real gaps — all left PENDING, none fabricated)
### 1. World Cup — official scores stop at 2026-07-07 (HIGH)
`world-cup/settlement/official-scores-2026-07-07.json` is the newest. The knockout results for **2026-07-08 →
2026-07-11 (including the quarterfinals) are UNSETTLED**. Any WC market for those days must show **pending**, never
a fabricated score. Blocked on committed official box scores (founder / pipeline action). The soccer settle
script (`settle_soccer_day.sh`) is official-gated and no-ops without a trusted bundle — correct behavior.

### 2. UFC — the 07-11 card is not settled; results won't self-heal (HIGH, contained)
`ufc/results-latest.json` is a large historical corpus (1,545 bouts), not the current-card settlement; the
2026-07-11 card is ingested as **experimental predictions only** and shown "Completed — awaiting settlement."
UFC automation is **dispatch-only**, so it will not settle itself. UFC is **excluded from products** and never
in the money record, so this is contained — but the "awaiting settlement" label is indefinite. **Options:** settle
the 07-11 card from official results, OR relabel `/ufc` as an unsettleable experimental archive. Do not fabricate.

### 3. MLB — current (no debt)
`mlb/results/` is settled through 2026-07-11 (the last slate before the All-Star break). Nothing pending there.

## Honesty confirmation
- `/results` renders honest **pending / awaiting / empty** states (verified in source: "No settled…",
  "awaiting", "pending", "empty" copy present) — it never marks a pending leg as a loss.
- Official money record **19-14 / $19,065.40 / md5 `affe6b21`** unchanged; settlement debt is display/paper only
  and does not touch it.
- Nothing in this pass settled or graded anything — the WC/UFC gaps remain pending, by design.

## Actions (for the launch checklist)
- [ ] Commit official WC box scores for 07-08→07-11 → run the official-gated soccer settle. (founder/data)
- [ ] Decide UFC: settle the 07-11 card or relabel `/ufc` as an experimental archive. (founder)
- [ ] Retire (or document an internal consumer for) the vestigial legacy `results/` export. (cleanup)
