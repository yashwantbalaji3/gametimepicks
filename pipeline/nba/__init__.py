"""NBA research-adapter package (Program 062-065, Lane D).

Scope is bounded by docs/NBA_RESEARCH_ADAPTER_READINESS.md: NBA is HISTORICAL_ONLY and the target
level for the 2026-27 season is MARKET_INTELLIGENCE (no model). Nothing in this package produces a
probability, a lean, or a pick, and nothing here touches money artifacts.

Modules:
  board_schema   — persist the ISO tip-off instant and derive per-row research eligibility
                   (prerequisite zero for gate G3); classify empty slates without hiding failures.
  settle_results — the NBA settlement vocabulary: box-score field maps for the four families the
                   legacy whitelist short-circuited, PRA synthesis, lineage fields, quarantine.
"""
