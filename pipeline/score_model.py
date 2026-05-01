"""
Scoring model — turns features + line + odds into a model lean.

The model is intentionally simple and explainable:

  projection = 0.45 * last5_avg + 0.35 * last10_avg + 0.20 * season_avg
             + home/away adjustment

  P(over)    = 1 - Φ((line - projection) / σ)
  where Φ is the standard normal CDF, σ is the recent dispersion of the stat.

Implied probability is computed from American odds, then de-vigged using the
two-sided overround. Edge = model_prob - implied_prob (in percentage points).

Confidence tiers are assigned by edge magnitude AND data-quality sanity check
(games_played_window must be >= MIN_GAMES_FOR_HIGH for High).

This module has no I/O — it's a pure transformation. That makes it cheap to
unit-test and means the orchestrator can call it on every (player, market)
combo without coordination.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from . import config as C


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------
WEIGHT_LAST5 = 0.45
WEIGHT_LAST10 = 0.35
WEIGHT_SEASON = 0.20

# Home/away nudge (gentle — splits are noisy with small samples)
HOME_AWAY_BLEND = 0.30   # blend home/away avg this much into projection

MIN_GAMES_FOR_HIGH = 8
MIN_GAMES_FOR_MEDIUM = 5


# ---------------------------------------------------------------------------
# Output shape
# ---------------------------------------------------------------------------
@dataclass
class ScoredProp:
    market: str
    line: float
    projection: float
    model_probability: float       # P(prop hits given the chosen lean)
    implied_probability: float     # de-vigged
    edge_pct: float                # percentage points
    lean: Literal["Over", "Under", "No Play"]
    confidence: Literal["High", "Medium", "Low"]
    reason: str


# ---------------------------------------------------------------------------
# Probability math
# ---------------------------------------------------------------------------
def _normal_cdf(x: float) -> float:
    """Standard normal CDF using erf."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def american_to_probability(odds: int) -> float:
    """American odds → implied probability (NOT de-vigged)."""
    if odds > 0:
        return 100.0 / (odds + 100.0)
    return -odds / (-odds + 100.0)


def devig_two_way(p_over: float, p_under: float) -> tuple[float, float]:
    """Given two raw implied probabilities for over/under, remove vig
    proportionally so they sum to 1.0."""
    total = p_over + p_under
    if total <= 0:
        return 0.5, 0.5
    return p_over / total, p_under / total


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------
def project_stat(features: dict[str, float], market: str, home_away: str) -> float:
    """Returns the projected stat value for the player on the given market."""
    market_lower = market.lower()  # "pts" / "reb" / "ast"
    last5 = features.get(f"last5_{market_lower}", 0.0)
    last10 = features.get(f"last10_{market_lower}", 0.0)
    season = features.get(f"season_{market_lower}", 0.0)

    base = WEIGHT_LAST5 * last5 + WEIGHT_LAST10 * last10 + WEIGHT_SEASON * season

    # Home/away adjustment — blend in the relevant split
    split_key = "home" if home_away == "Home" else "away"
    split_avg = features.get(f"{split_key}_{market_lower}", base)
    if split_avg > 0:
        adjusted = (1 - HOME_AWAY_BLEND) * base + HOME_AWAY_BLEND * split_avg
    else:
        adjusted = base

    return adjusted


def dispersion_for(features: dict[str, float], market: str) -> float:
    return features.get(f"dispersion_{market.lower()}", 5.0)


# ---------------------------------------------------------------------------
# Score one prop
# ---------------------------------------------------------------------------
def score_prop(
    features: dict[str, float],
    market: str,
    line: float,
    odds_over: int,
    odds_under: int,
    home_away: str,
    player_name: str = "",
) -> ScoredProp:
    """The headline function. Given features for a player and a sportsbook
    line/odds, produce a ScoredProp."""
    projection = project_stat(features, market, home_away)
    sigma = dispersion_for(features, market)

    # Model P(over) — use a normal approximation around the projection
    z = (line - projection) / sigma
    p_over_model = 1.0 - _normal_cdf(z)
    p_under_model = 1.0 - p_over_model

    # Implied (de-vigged)
    raw_over = american_to_probability(odds_over)
    raw_under = american_to_probability(odds_under)
    p_over_implied, p_under_implied = devig_two_way(raw_over, raw_under)

    # Pick the side with positive edge
    edge_over = (p_over_model - p_over_implied) * 100.0
    edge_under = (p_under_model - p_under_implied) * 100.0

    if edge_over >= edge_under:
        lean = "Over"
        model_prob = p_over_model
        implied_prob = p_over_implied
        edge_pct = edge_over
    else:
        lean = "Under"
        model_prob = p_under_model
        implied_prob = p_under_implied
        edge_pct = edge_under

    # Confidence tier — combine edge magnitude with data-quality gate
    games = features.get("games_played_window", 0.0)
    if edge_pct >= C.EDGE_THRESHOLD_HIGH and games >= MIN_GAMES_FOR_HIGH:
        confidence = "High"
    elif edge_pct >= C.EDGE_THRESHOLD_MEDIUM and games >= MIN_GAMES_FOR_MEDIUM:
        confidence = "Medium"
    elif edge_pct >= C.EDGE_THRESHOLD_MEDIUM:
        # Edge is there but sample size is thin
        confidence = "Low"
    else:
        confidence = "Low"

    # Edge below the medium threshold → No Play
    if edge_pct < C.EDGE_THRESHOLD_MEDIUM:
        lean = "No Play"
        confidence = "Low"

    reason = _build_reason(
        features, market, line, projection, lean, edge_pct, games, home_away
    )

    return ScoredProp(
        market=market,
        line=line,
        projection=round(projection, 2),
        model_probability=round(model_prob, 4),
        implied_probability=round(implied_prob, 4),
        edge_pct=round(edge_pct, 2),
        lean=lean,
        confidence=confidence,
        reason=reason,
    )


# ---------------------------------------------------------------------------
# Reason string
# ---------------------------------------------------------------------------
def _build_reason(
    features: dict[str, float],
    market: str,
    line: float,
    projection: float,
    lean: str,
    edge_pct: float,
    games: float,
    home_away: str,
) -> str:
    market_lower = market.lower()
    last5 = features.get(f"last5_{market_lower}", 0.0)
    last10 = features.get(f"last10_{market_lower}", 0.0)
    minutes_trend = features.get("minutes_trend", 0.0)

    if lean == "No Play":
        return (
            f"Model projection {projection:.1f} sits within "
            f"{abs(projection - line):.1f} of the line {line}. "
            f"No edge above threshold."
        )

    parts = []
    if last5 > 0:
        parts.append(f"last-5 avg {last5:.1f} {market}")
    if last10 > 0 and abs(last10 - last5) > 0.5:
        parts.append(f"last-10 avg {last10:.1f}")
    if minutes_trend > 0.4:
        parts.append("minutes trending up")
    elif minutes_trend < -0.4:
        parts.append("minutes trending down")
    if home_away == "Home":
        parts.append("playing at home")
    if games < MIN_GAMES_FOR_HIGH:
        parts.append(f"thin sample ({int(games)} games)")

    detail = "; ".join(parts) if parts else "model projection vs line"
    return f"{lean} {line}: projection {projection:.1f} ({edge_pct:+.1f}pp edge). {detail}."
