# Parlay Lab Coverage + UX Audit — 2026-06-10

**Question that started this:** "NBA Suggested Parlays only show ~5 cards, all low-risk
single-game style. Why? Can we show 3–5 per sport per risk level?"

**Short answer:** The ~5–6 NBA cards are **correct and working as intended**. NBA tonight is a
**single-game slate** (Finals Game 4: Spurs @ Knicks). With one game, the only possible
NBA parlays are *same-game stacks*, which the correlation policy permits **only at the
lowest risk tier**. MLB (13 games) and Mixed both fill 3–5+ cards across every risk level.
Nothing is broken; the fix is **UI clarity**, not loosening gates.

---

## Data snapshot (from `app/public/data/parlays/optimizer/2026-06-10.json`)

| | NBA | MLB | Mixed |
|---|---|---|---|
| Games on slate | **1** | 13 | — |
| Candidate legs in pool | 184 | 455 | 639 total |
| NBA legs by market | PTS 32 · PRA 31 · REB 29 · 3PM 25 · AST 25 · STL 23 · BLK 19 | | |

### Published cards by risk × sport (`publicRiskSections`, cap 6/bucket)

| Risk | NBA | MLB | Mixed |
|---|---|---|---|
| Low | **6** | 6 | 6 |
| Medium | **0** | 6 | 6 |
| High | **0** | 6 | 6 |
| Longshot | **0** | 6 | 6 |

The 6 published NBA cards are all **2-leg same-game pairs**, e.g. *Kornet BLK o0.5 +
McBride 3PM o0.5*, *Brunson REB o2.5 + Wembanyama 3PM o1.5*, *Fox STL o1.5 + Castle STL
o0.5*. Every leg is real (model-ranked, from the 184-leg NBA pool). None are single-leg
fillers; none are fabricated.

---

## Why NBA stops at Low risk (the mechanism)

Same-game caps are set **per risk profile** in `pipeline/parlay_optimizer.py`:

| Profile | `max_legs_per_game` |
|---|---|
| conservative | 1 |
| balanced | 2 |
| aggressive | 3 |
| star_power | 1 (PR #110 safety) |

- A **pure-NBA parlay needs ≥2 legs**. With **one** NBA game, both legs are same-game.
- `conservative` caps same-game at **1** → cannot build a 2-leg NBA parlay → **NBA=0** there.
- `balanced` allows **2** same-game → the 6 published low-risk NBA pairs come from here.
- Higher risk tiers (medium/high/longshot) are curated to favor **cross-game
  diversification** for variety + decorrelation. On a 1-game slate there are no other NBA
  games to diversify into, so those NBA buckets are **empty by policy** — not by bug.

This is the intended PR #110 behavior: same-game NBA stacks are correlation-risky (two
players in one game move together), so they're capped hard and only the safest pairs surface.

---

## The eight audit questions, answered

1. **Why only ~5 NBA cards?** 6 low-risk same-game pairs — the maximum that the
   correlation policy safely permits for a one-game slate.
2. **Is it the single-game correlation limit working as intended?** Yes. `max_legs_per_game`
   caps + the diversification-favoring higher-risk curation produce exactly this.
3. **Enough NBA candidate legs now that 7 markets are live?** Yes — 184 legs across 7
   markets. Legs are not the constraint; **games** are. Diversified parlays need multiple games.
4. **Can we safely show 3–5 NBA cards per risk level?** **Not tonight, not safely.** It would
   require either loosening same-game caps (forbidden) or more NBA games on the slate.
5. **If not, what should the UI say?** A prominent single-game explainer + per-bucket counts
   with honest empty-state reasons (implemented in Phase 2). The component
   `pool-availability-note.tsx` already carries the core message; Phase 2 surfaces counts.
6. **Do MLB + Mixed meet 3–5 per bucket?** Yes — both publish 6 per risk tier across all 4
   tiers (low/medium/high/longshot). Target met.
7. **Hidden cards suppressed by UI?** Minor: the optimizer holds **8** MLB slips/profile but
   `publicRiskSections` caps display at **6**/bucket. That cap is a deliberate curation, not a
   UI bug. There is no hidden NBA inventory — the NBA buckets are genuinely 0 at med/high/long.
8. **Exact follow-up to create more NBA cards safely?**
   - **Multi-game NBA slates** (regular season) naturally produce cross-game NBA parlays at
     every risk tier — no code change needed.
   - A **documented** policy PR could allow 3-leg same-game NBA at low risk *with* an explicit
     correlation matrix/penalty — but that is a model/policy change, out of scope here and
     must not be done blindly.

---

## UX conclusions (drive Phases 2–6)

- **Do not fabricate or pad** NBA cards. Show the 6 real ones + explain the single-game limit.
- **Surface per-bucket counts** (NBA Low 6 · Med 0 · High 0 · Long 0; MLB/Mixed 6 each) so the
  emptiness is obviously *intentional*, not *broken*.
- **Lead with MLB/Mixed** when NBA is single-game, since those have full coverage.
- Honest copy only — no "lock/safe/guaranteed" language; paper-tracking framing throughout.
</content>
