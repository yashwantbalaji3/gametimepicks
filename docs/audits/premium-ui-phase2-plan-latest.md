# Premium UI Phase 2 — Implementation Plan (latest)

> Controlled second visual pass. No data/model/grading/workflow changes; no
> banned/V2 copy; no layout regressions.

## Audit reality (verified in code)
The foundation is already mature: layered body background (gold radial ambient +
masked dot texture, NOT flat), parlay-card hover lift + gold glow + transitions +
reduced-motion, risk-tier accent lanes (#300), sport icons on tabs, focus/AA
handling, honest empty states. Most Phase-1 "deferred" items already exist.

## Genuinely-additive, safe, on-brief change this pass
**Sport accent system** (the user's Phase 9; currently sport tabs are gold-when-
active for ALL sports — no sport identity):
- Add `--sport-all/-mlb/-nba/-mixed` tokens (gold / sky-blue / rose / teal).
  Distinct from the risk lanes and applied on SPORT elements (tabs, sport-bucket
  chip) — risk colors stay on risk elements, so the two systems don't muddy
  (like a real sportsbook: colored sport tabs + colored risk lanes).
- Apply to the active sport filter tab background (dark text stays AA-legible)
  and the per-card sport-bucket chip.

## Deliberately NOT doing (avoid over-design / regression on a working product)
Background gradient (already present), card hover (already present), hero/
projections structural rewrites (high blast radius, subjective). These need the
user's specific direction/reference rather than blind churn — noted for a future
pass.

## Validation
tsc + app tests + build; browser QA 375/768/1280/1440 (0 overflow, 0 console);
banned-copy scan; scope = app/src + docs only.
