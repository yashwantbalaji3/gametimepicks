# UFC real-card coverage — 7/7 (UFC Freedom 250)

**Full internal coverage achieved; public picks remain gated (backtestReady=false).**

- Event: **UFC Freedom 250: Topuria vs. Gaethje**, 2026-06-15 UTC (June-14 ET), 7 bouts (ESPN, source of truth).
- Odds reconciled (card-only, futures dropped): **7/7** real bouts matched.
- Fighter-stats matched: **7/7** via deterministic name matching (`name_matching.py`).
  Closed the prior Garcia gap: "Steve Garcia Jr." (odds) ↔ "Steve Garcia" (DB)
  resolves as **suffix_stripped + unique**. Ambiguous suffix matches are BLOCKED
  (no loose fuzzy mapping; Jon Jones never maps to Jared Jones).
- Internal moneyline projections: **7** (Topuria 80%, O'Malley 78%, Ruffy 84%,
  Nickal 74%, Lopes 59%, **Pereira/Gane 50/50**, Lewis 23%). All conservative
  (≤4pp shrunk adj), all `publicEligible=0`, "No-play".

## Name-match types (deterministic, conservative)
exact → suffix_stripped (unique only) → normalized_unique (unique only) →
ambiguous (BLOCK) → unmatched (BLOCK). 6 tests cover suffix/ambiguous/accent/
apostrophe/cross-fighter-safety.

## Gate status
readiness=grading-internal; projectionsReady=false, parlayReady=false. Public
launch HELD until a leakage-safe backtest passes (no completed clean-odds rows yet).
