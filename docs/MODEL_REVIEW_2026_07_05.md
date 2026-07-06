# Model Review — 2026-07-05 (settled 2026-07-06)

*Settled-only postmortem. Every score below is the official API-Football FT result. No estimated
scores, no hindsight rewrites. The purpose is to learn WHY each pick won or lost and to change the
model ONLY where a settled sample justifies it — never to overfit one night.*

## Official results
| Game | FT | 90′ signal |
|---|---|---|
| Brazil vs Norway | **1–2** | Norway win (outright upset) · 3 goals · BTTS yes |
| Mexico vs England | **2–3** | England win · 5 goals · BTTS yes |

Portugal vs Spain (July-6) was still NS at settlement — not graded.

## Card-by-card: what fired, did it matter
### Bank Builder Lane A — LOST (survival, the safest card)
- **Brazil or Draw (−500, DC, model 0.7845) → LOST.** Brazil, a −500 double-chance favourite (≈83%
  market / 78% model to win-or-draw), lost **outright** to Norway. Double chance survives a draw; it
  cannot survive an underdog win. This is a genuine tail event, not a bad feature.
- **England or Draw (−295, DC, model 0.6981) → WON.** England won 3–2.
- **Verdict:** the lane died on a single outright upset by a heavy favourite. The DC market's settled
  record moves to **8–1** — and its one loss is an upset no draw-protection could have caught.

### Bank Builder Lane B — LOST (value)
- **Under 2.5 (−186, totals, model 0.6095) → LOST.** Mexico–England was a 5-goal track meet. The
  model's low-score lean (61%) was simply wrong for an open, end-to-end knockout game.
- **BTTS Yes (−150, model 0.5552) → WON.** Both scored in Brazil–Norway.
- **Verdict:** the lane died on the **totals** leg — the same market family that has repeatedly
  failed on draw-traps and now on an over. Totals remain the least reliable team market we trade.

### Moonshot A & B — LOST
- Both cards led with **Brazil (DNB) −315**, so both died on the same Brazil upset. High-variance
  product, $25 flat, working as designed (one bad leg ends a longshot).

## Learning signals — proven / directional / insufficient
1. **Double chance is still the anchor — DO NOT down-weight (insufficient sample).** One loss in nine,
   and that loss was a −500 favourite losing outright (a ~17–22% tail). Reacting to a single upset by
   trusting DC less would be textbook overfitting. **No change.**
2. **Totals remain the weakest team market — directional, already encoded.** The July-5 Under 2.5
   miss reinforces the pattern behind the existing totals penalty (survival-lane totals weighting was
   already reduced on 2026-07-04). One more miss does not newly justify a bigger constant on a small
   sample; the existing penalty stands and is *reinforced*, not increased. **No new constant.**
3. **BTTS Yes won once — insufficient sample.** Improves the BTTS record marginally; still the market
   with the least evidence. **No change.**
4. **Heavy-favourite overconfidence in knockout variance — directional.** Brazil (−500) out; this is
   the recurring "knockout games carry more 90′ variance than favourite prices imply" theme. The
   product already hedges it structurally (double chance instead of moneyline for the survival lane).
   **No weight change; the structure already answers it.**

## What actually changed today (operational discipline, not a weight)
The justified improvement is **selection discipline, not a re-weighting**: on the thin July-6 2-game
slate the value lane's only in-band legs were two BTTS selections the model prices at ~market (no real
edge) in the weakest settled family. Rather than sell a negative-to-fair card as "value," **Lane B was
made a NO-PLAY** with an explicit reason, and only the disciplined survival Lane A (two draw-protected
double-chance legs from different same-day games) was activated. This is the no-forced-card rule doing
its job — the single most repeatable lesson from the settled record is *skip the weak card*.

## Bottom line
July-5 was an **upset-driven loss** (a −500 favourite lost outright) plus a **totals miss**. Neither
justifies a model weight change on this sample — the double-chance family stays the anchor, totals stay
the known weak spot, and the honest response is tighter selection discipline, which is now applied.
Canonical record moved 17-12 → **17-14** through official settlement only; the ladder restarts and the
climb continues.
