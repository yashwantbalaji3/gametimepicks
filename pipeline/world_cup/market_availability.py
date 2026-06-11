"""
World Cup requested-market availability matrix (pure).

Defines the markets the product must support and derives a per-market status from the empirical
probe results (which odds each provider actually returns + which feature data exists). The point
is that NO requested market is ever silently missing — each has an explicit status + reason.
"""
from __future__ import annotations

# The Odds API market keys we map our market ids to (per-event endpoint for player props).
REQUESTED_MARKETS = [
    {"key": "moneyline_90", "label": "Moneyline (90-min H/D/A)", "kind": "team",
     "oddsKey": "h2h", "oddsProvider": "odds_api"},
    {"key": "match_total_goals", "label": "Total goals", "kind": "team",
     "oddsKey": "totals", "oddsProvider": "odds_api"},
    {"key": "match_total_corners", "label": "Total corners", "kind": "team",
     "oddsKey": "alternate_totals_corners", "oddsProvider": "odds_api"},
    {"key": "player_total_shots", "label": "Player total shots", "kind": "player",
     "oddsKey": "player_shots", "oddsProvider": "odds_api"},
    {"key": "player_shots_on_target", "label": "Player shots on target", "kind": "player",
     "oddsKey": "player_shots_on_target", "oddsProvider": "odds_api"},
    {"key": "player_assists", "label": "Player assists", "kind": "player",
     "oddsKey": "player_assists", "oddsProvider": "odds_api"},
    {"key": "anytime_goalscorer", "label": "Anytime goalscorer", "kind": "player",
     "oddsKey": "player_goal_scorer_anytime", "oddsProvider": "odds_api"},
]

# Public status vocabulary (UI maps these to friendly chips).
STATUS_LIVE = "live"                                  # published active projection(s)
STATUS_RESEARCH = "research_only"                     # model ran, below publish threshold
STATUS_WAITING_ODDS = "waiting_on_odds"               # odds source has it but none today
STATUS_WAITING_LINEUPS = "waiting_on_lineups"         # player market; lineups/minutes not posted
STATUS_WAITING_FEATURES = "waiting_on_provider_stats" # need provider feature history (corners)
STATUS_UNAVAILABLE = "unavailable_from_provider"      # provider does not offer these odds
STATUS_WAITING_EDGE = "waiting_on_edge_threshold"     # odds+data ready, no edge cleared


def market_status(
    market: dict,
    *,
    odds_ready: bool,
    data_ready: bool,
    lineups_ready: bool = False,
    odds_supported_by_provider: bool = True,
    has_active_projection: bool = False,
    has_research_projection: bool = False,
) -> dict:
    """Derive a single requested-market's status + reason. Order: provider-support → odds today →
    (player) lineups → feature data → edge/publish state."""
    is_player = market["kind"] == "player"
    if not odds_supported_by_provider:
        status, reason, ready = (STATUS_UNAVAILABLE,
                                 f"current odds provider does not offer {market['label']} odds for the World Cup", False)
    elif not odds_ready:
        status, reason, ready = (STATUS_WAITING_ODDS,
                                 f"no {market['label']} odds posted for today's matches yet", False)
    elif is_player and not lineups_ready:
        status, reason, ready = (STATUS_WAITING_LINEUPS,
                                 "player prop odds present but lineups/minutes not posted yet", False)
    elif not data_ready:
        status, reason, ready = (STATUS_WAITING_FEATURES,
                                 f"odds present but no defensible feature source for {market['label']} yet", False)
    elif has_active_projection:
        status, reason, ready = (STATUS_LIVE, "published — passed all gates", True)
    elif has_research_projection:
        status, reason, ready = (STATUS_RESEARCH,
                                 "model ran on real data but the edge is below the publish threshold", True)
    else:
        status, reason, ready = (STATUS_WAITING_EDGE,
                                 "odds + data ready; awaiting an edge that clears the publish gate", True)
    return {
        "key": market["key"], "label": market["label"], "kind": market["kind"],
        "oddsProvider": market["oddsProvider"],
        "oddsReady": bool(odds_ready and odds_supported_by_provider),
        "dataReady": bool(data_ready), "lineupsReady": bool(lineups_ready) if is_player else None,
        "projectionReady": ready, "status": status, "reason": reason,
    }


def build_availability(probe: dict) -> dict:
    """`probe` maps market key → {oddsReady, dataReady, lineupsReady, oddsSupported, active, research}.
    Returns the full matrix. Defaults are conservative (fail-closed)."""
    markets = {}
    for m in REQUESTED_MARKETS:
        p = probe.get(m["key"], {})
        markets[m["key"]] = market_status(
            m,
            odds_ready=p.get("oddsReady", False),
            data_ready=p.get("dataReady", False),
            lineups_ready=p.get("lineupsReady", False),
            odds_supported_by_provider=p.get("oddsSupported", True),
            has_active_projection=p.get("active", False),
            has_research_projection=p.get("research", False),
        )
    complete = all(v["status"] == STATUS_LIVE for v in markets.values())
    return {"markets": markets, "requestedMarketsComplete": complete}
