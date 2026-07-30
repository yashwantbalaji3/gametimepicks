"""NBA settlement foundation — market vocabulary, box-score field maps, lineage, quarantine.

WHAT THIS FIXES (docs/NBA_RESEARCH_ADAPTER_READINESS.md §3.4, gate G4)

``pipeline/settle_results.py`` settles NBA player props against a whitelist of three markets. Every
row for a family outside that whitelist short-circuits to ``result="invalid"`` with the reason
"unsupported market" — 903 of 4,592 historical rows, roughly a fifth of the corpus, for families the
book priced and the box score answers unambiguously (3PM, STL, BLK, and PRA, which is a sum of three
numbers already being read).

Three things are true at once and the module has to hold all of them:

  1. The four families ARE settleable. The field maps below are the whole missing piece.
  2. The historical rows must not be restamped. They are the evidence that the short-circuit
     happened; rewriting them would erase the defect while claiming to fix it, and a corpus whose
     invalid rows quietly became wins is a corpus nobody can audit. Hence
     ``EXPANDED_MARKETS_EFFECTIVE_FROM``: the expansion is forward-only, by date, mechanically.
  3. Nothing may be written without lineage. The MLB gate refused 641 rows on a real collision
     (Sprint 049); NBA settlement has never run through one. This module projects NBA settled rows
     into the canonical lineage shape and reuses that validator rather than writing a second one.

NO MODEL. Settling a row says what happened, not that anyone should have predicted it. Nothing here
produces a probability, and the historical NBA model is below coin-flip with publicApproved:false.

Pure: no network, no I/O. The callers own both.
"""
from __future__ import annotations

# ONE settlement implementation per sport, and the lineage contract is sport-independent despite
# living under `pipeline/mlb/` — it takes sport/league as arguments and its allowlist already names
# the NBA sources. Mirroring it here would create the second implementation the SportAdapter
# contract calls a defect (app/src/lib/identity/sport-adapter.ts: "A second implementation is a
# defect, not redundancy").
from pipeline.mlb.settlement_lineage import (  # noqa: F401  (re-exported for NBA callers)
    OFFICIAL_SETTLEMENT_SOURCES,
    SettlementLineageError,
    assert_settlement_lineage,
    derive_event_id,
    validate_settlement_lineage,
)

NBA_SPORT = "nba"
NBA_LEAGUE = "NBA"

# What the legacy whitelist covered. Kept as a named constant because the guard test asserts that
# historical dates still resolve to exactly this tuple.
LEGACY_SUPPORTED_MARKETS = ("PTS", "REB", "AST")

# Families the box score answers. PRA is derived, not fetched — see DERIVED_MARKETS.
SUPPORTED_MARKETS = ("PTS", "REB", "AST", "3PM", "STL", "BLK", "PRA")

# The first slate date on which the expanded whitelist applies. Settlement re-run for any earlier
# date resolves to LEGACY_SUPPORTED_MARKETS, so a 3PM row from 2026-06-05 stays `invalid` with the
# reason it was originally given.
EXPANDED_MARKETS_EFFECTIVE_FROM = "2026-07-30"

# Derived families: computed from components already present in the box score, never fetched.
# PRA is points+rebounds+assists and nothing else — no weighting, no estimation.
DERIVED_MARKETS: dict[str, tuple[str, ...]] = {"PRA": ("PTS", "REB", "AST")}

# ESPN summary box score. `keys` names the columns of each athlete's `stats` array. Most are scalar;
# the three-point column is a combined "made-attempted" cell ("3-7"), so it needs the made side.
# Both spellings are accepted because a scalar key is what the column would be called if ESPN ever
# split it, and failing closed on a rename is better than reading the attempts column.
ESPN_SCALAR_KEY_BY_MARKET: dict[str, tuple[str, ...]] = {
    "PTS": ("points",),
    "REB": ("rebounds",),
    "AST": ("assists",),
    "STL": ("steals",),
    "BLK": ("blocks",),
    "3PM": ("threePointFieldGoalsMade",),
}
ESPN_MADE_ATTEMPTED_KEY_BY_MARKET: dict[str, tuple[str, ...]] = {
    "3PM": ("threePointFieldGoalsMade-threePointFieldGoalsAttempted",),
}

# nba_api BoxScoreTraditionalV2 column names.
NBA_API_COLUMN_BY_MARKET: dict[str, str] = {
    "PTS": "PTS",
    "REB": "REB",
    "AST": "AST",
    "3PM": "FG3M",
    "STL": "STL",
    "BLK": "BLK",
}

# A settled row for a game the league never played. Distinct from `invalid` (our whitelist refused
# it) and from `stats_unavailable` (the game happened, the numbers did not arrive). Soccer lost 192
# legs to a settler that `continue`d past what it could not grade; a named terminal state is the
# alternative to a silent omission.
QUARANTINED_RESULT = "quarantined"
QUARANTINE_STATUS_TOKENS = ("postpon", "suspend", "cancel", "reschedul")

# Stat-source key -> the official settlement source it maps to. An allowlist: a source nobody
# thought to name has no mapping and therefore cannot pass the lineage gate.
SETTLEMENT_SOURCE_BY_STAT_SOURCE: dict[str, str] = {
    "nba_api": "nba-stats-boxscore",
    "espn": "espn-official-scores",
    "manual_override": "operator-official-input",
}


def supported_markets_for_date(date: str | None) -> tuple[str, ...]:
    """The whitelist in force for a slate date.

    Forward-only by construction. A settlement re-run for a historical date gets the legacy tuple,
    so the 903 rows the short-circuit invalidated stay invalid and stay visible.
    """
    if not date or not isinstance(date, str):
        return LEGACY_SUPPORTED_MARKETS
    return SUPPORTED_MARKETS if date >= EXPANDED_MARKETS_EFFECTIVE_FROM else LEGACY_SUPPORTED_MARKETS


def is_expanded_date(date: str | None) -> bool:
    return supported_markets_for_date(date) is SUPPORTED_MARKETS


# ---------------------------------------------------------------------------
# Box-score extraction
# ---------------------------------------------------------------------------
def _made_of(cell) -> float | None:
    """Read the made side of a 'made-attempted' cell ('3-7' -> 3.0). Fails closed on anything else."""
    try:
        return float(str(cell).strip().split("-")[0])
    except (TypeError, ValueError, AttributeError):
        return None


def _scalar(cell) -> float | None:
    try:
        return float(cell)
    except (TypeError, ValueError):
        return None


def espn_stat_readers(keys: list) -> dict[str, tuple[int, str]]:
    """Map each settleable market to (column index, how to read it) for one ESPN stat group.

    Markets whose column is absent are simply not in the result — an absent column is missing data,
    never a zero.
    """
    out: dict[str, tuple[int, str]] = {}
    keys = list(keys or [])
    for market, names in ESPN_SCALAR_KEY_BY_MARKET.items():
        for name in names:
            if name in keys:
                out[market] = (keys.index(name), "scalar")
                break
    for market, names in ESPN_MADE_ATTEMPTED_KEY_BY_MARKET.items():
        if market in out:
            continue
        for name in names:
            if name in keys:
                out[market] = (keys.index(name), "made_of")
                break
    return out


def extract_espn_stats(stats_row: list, readers: dict[str, tuple[int, str]]) -> dict[str, float]:
    """Read one athlete's stat array into {market: value}, then synthesize derived families."""
    stats: dict[str, float] = {}
    row = list(stats_row or [])
    for market, (index, how) in readers.items():
        if index >= len(row):
            continue
        value = _made_of(row[index]) if how == "made_of" else _scalar(row[index])
        if value is not None:
            stats[market] = value
    return synthesize_derived(stats)


def extract_nba_api_stats(row) -> dict[str, float]:
    """Read one nba_api box-score row (anything with `.get`) into {market: value}."""
    stats: dict[str, float] = {}
    for market, column in NBA_API_COLUMN_BY_MARKET.items():
        value = row.get(column)
        if value is None:
            continue
        if isinstance(value, float) and value != value:  # NaN
            continue
        parsed = _scalar(value)
        if parsed is not None:
            stats[market] = parsed
    return synthesize_derived(stats)


def synthesize_derived(stats: dict[str, float]) -> dict[str, float]:
    """Add derived families whose every component is present.

    A partial sum is not a smaller PRA — it is a wrong one. Missing any component means the family
    is absent, and settlement reports `stats_unavailable` rather than a number built from two thirds
    of a box-score line.
    """
    out = dict(stats)
    for derived, components in DERIVED_MARKETS.items():
        if derived in out:
            continue
        if all(c in out for c in components):
            out[derived] = float(sum(out[c] for c in components))
    return out


# ---------------------------------------------------------------------------
# Quarantine
# ---------------------------------------------------------------------------
def is_quarantined_status(status: str | None) -> bool:
    """Did the league not play this game as scheduled?

    Postponed, suspended, cancelled and rescheduled all mean the same thing to settlement: there is
    no final box score for THIS instance of the game, and there never will be. The resumed game is a
    different event with its own identity and lineage.
    """
    s = (status or "").strip().lower()
    if not s:
        return False
    return any(token in s for token in QUARANTINE_STATUS_TOKENS)


def quarantine_row(base: dict, status: str | None) -> dict:
    """A settled row for a game that did not happen. Never win/loss/push, never pending."""
    return {
        **base,
        "result": QUARANTINED_RESULT,
        "failureReason": f"game not played as scheduled (status {status!r}) — quarantined, not graded",
    }


# ---------------------------------------------------------------------------
# Lineage
# ---------------------------------------------------------------------------
def lineage_row(settled: dict) -> dict | None:
    """Project one NBA settled row into the canonical lineage shape.

    Returns None for rows that were never graded against a source (invalid, stats_unavailable,
    quarantined) — those carry no result to trace, and gating them would report a missing chain for
    a row that correctly refused to produce one.

    `gameId` is the provider's ALIAS, kept alongside the canonical `eventId` so the join stays
    auditable — the inversion Sprint 041 got wrong.
    """
    result = settled.get("result")
    if result not in ("win", "loss", "push"):
        return None

    stat_source = settled.get("settlementSource")
    official = SETTLEMENT_SOURCE_BY_STAT_SOURCE.get(stat_source or "")

    date = settled.get("date")
    teams = [t for t in (settled.get("team"), settled.get("opponent")) if t]
    tipoff_iso = settled.get("tipoffIso")
    event_id = (
        derive_event_id(
            sport=NBA_SPORT,
            league=NBA_LEAGUE,
            participant_names=teams,
            # The instant when the board recorded one; the date otherwise. NBA plays no
            # doubleheaders, so date granularity separates every real game — but it cannot separate
            # a game from its own postponed instance, which is why quarantined rows never get here.
            scheduled_start=tipoff_iso or date,
        )
        if teams
        else None
    )

    return {
        # One settled row per (lean, bookmaker), so the bookmaker belongs in the key. Without it two
        # books' rows on the same prop collapse to one id and the gate reports a duplicate
        # prediction for a batch that is correct.
        "id": settled.get("id")
        or "-".join(
            str(p)
            for p in (
                date,
                settled.get("playerId"),
                settled.get("market"),
                settled.get("line"),
                settled.get("bookmaker"),
            )
        ),
        "eventId": event_id,
        "marketKey": settled.get("market"),
        "outcome": result,
        # Unmapped stat sources pass through unchanged so the lineage gate rejects them by name
        # rather than this function silently dropping the row.
        "settlementSource": official or stat_source,
        "settledAt": settled.get("settledAt"),
        "eventStartTime": tipoff_iso,
        "providerEventId": settled.get("gameId"),
        "gameId": settled.get("gameId"),
    }


def build_lineage_rows(settled_rows: list[dict]) -> list[dict]:
    """Lineage rows for every graded row in a settlement batch."""
    return [r for r in (lineage_row(s) for s in settled_rows) if r is not None]


def assert_nba_settlement_lineage(settled_rows: list[dict], *, date: str) -> None:
    """Fail closed BEFORE the ledger write, on the same validator MLB settlement runs.

    Only rows THIS run produced are gated. Historical rows predate the lineage fields and are
    preserved untouched — rewriting them would destroy the evidence that makes the original
    corruption provable.
    """
    assert_settlement_lineage(build_lineage_rows(settled_rows), date=date)


def dry_run_lineage(settled_rows: list[dict], *, date: str) -> dict:
    """Report what the gate WOULD do, writing nothing.

    The rehearsal path: run the gate over the historical corpus to learn whether it would have
    refused, without touching a single settled row.
    """
    rows = build_lineage_rows(settled_rows)
    violations = validate_settlement_lineage(rows)
    return {
        "date": date,
        "settledRows": len(settled_rows),
        "gradedRows": len(rows),
        "violations": violations,
        "wouldWrite": not violations,
    }
