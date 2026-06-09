# UFC odds-board UX (June 9)

`/ufc` now shows a **real sportsbook odds board** when `odds-latest.json` is fresh:
per-bout fighters, American moneylines, book, last-updated, and market-implied
probability (de-vig-free single-side). Copy: "Sportsbook market lines · …",
"book lines, not model projections", "model picks stay locked until fighter stats,
grading, and a backtest are connected." The data-readiness ladder shows Odds =
ready; Projections/Parlays = locked. Fail-closed: no fresh odds → board hidden, page
stays polished. No edge, confidence, picks, or banned copy. Build verified
(/ufc prerendered; tsc clean).
