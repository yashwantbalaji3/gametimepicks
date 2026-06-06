# June-6 Suggested-Parlay Depth (latest)

> June 6 is not generated yet (no optimizer / publicRiskSections), so displayed
> depth cannot be measured. This records the **honest depth expectation** from
> the known slate shape and the latest real-slate baseline. No padding.

## Expected June-6 depth (once morning-projections runs)
Slate (free schedule): **MLB 15 games, NBA 0 games.**
- **NBA tab: empty (0).** No NBA slate June 6 — honest lack of supply, not a bug.
- **MLB tab + Mixed tab:** the only populated sections. With 15 MLB games there
  is normal supply for Medium/High/Longshot depth; **Low depends on the strict
  gate** (#282) — only legs with L10 ≥ 80%, an odds floor, and no weak
  plus-money qualify, so Low can be thin or empty by design.
- **Mixed** here means mixed-of-MLB-modeled (no NBA leg available to mix).

The 3–5-per-risk-per-sport target is achievable for **MLB** and **Mixed** only;
**NBA cannot meet it** (no slate). That is the correct, honest outcome.

## Latest real-slate baseline (June 5, for reference)
- `publicRiskSections` (nba/mlb/multi): low **0/6/0** · medium **0/6/6** · high
  **0/6/6** · longshot **0/6/6** — MLB + Mixed carry full depth (6 each, the #281
  target-per-bucket), NBA empty (no fresh form → Low fails closed, and the NBA
  slate itself was thin).
- Coverage audit: **PASS** — All (42) ≥ NBA (0) / MLB (24) / Mixed (18); no
  duplicate slips.
- Count consistency: WARN (CASE 1, expected/confusing labels) — generated 120 →
  public-union 42 → displayed 9 (5 Low + 4 Medium), volume-disciplined.

## Honest reasons depth is/will be bounded
- **No NBA slate June 6** (Finals rest day) → NBA = 0.
- **Strict Low gate** keeps Low conservative (can be 0 when form is stale or
  prices are weak) — intended.
- **Volume discipline** caps the *displayed* Suggested view well below the
  available public pool (supply exists; display is deliberately limited).
- No fabricated or padded cards were added to hit a target.

## Action
Re-measure displayed/by-risk depth on the generated June-6 MLB slate; confirm
MLB/Mixed reach 3–5 per risk where supply and the Low gate allow, and that NBA
stays honestly empty.

*Read-only. No paid API, no data/model change.*
