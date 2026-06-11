"""
Hybrid soccer parlay policy (2026-06-11).

Three SEPARATE gates so the product is useful without faking certainty:
  A. public visibility — handled by projection_model.classify_v2 (show the probability view).
  B. PARLAY eligibility — this module: soccer-specific, market-by-market thresholds that are
     LOWER than the old single 3%/2.5% wall (which produced zero cards) but still real, with
     the risk tier reflecting variance and correct caveats.
  C. Bank Builder eligibility — strictest: only conservative Low-risk team markets.

Pure + fully unit-testable.
"""
from __future__ import annotations

# Market-sanity floors (mirrors projection_model).
EXTREME_UNDERDOG_PROB = 0.15
MODERATE_UNDERDOG_PROB = 0.18

# Parlay edge thresholds by market (probability points, e.g. 0.012 = 1.2pts).
ML_FAV_DRAW_EDGE = 0.012
ML_MODERATE_DOG_EDGE = 0.025
ML_EXTREME_DOG_EDGE = 0.04
DOUBLE_CHANCE_EDGE = 0.010
TOTAL_GOALS_EDGE = 0.0125
CORNERS_EDGE_LOWMED = 0.020
CORNERS_EDGE_HIGH = 0.015
CORNERS_SAMPLE_LOWMED = 5
CORNERS_SAMPLE_HIGH = 4
PLAYER_SHOTS_EDGE = 0.015
PLAYER_SOT_EDGE = 0.015
PLAYER_ASSIST_EDGE = 0.02
GOALSCORER_EDGE = 0.02

NEVER_LOW = {"player_assists", "anytime_goalscorer"}


def risk_tier_for_odds(american: int | float | None) -> str:
    """Variance-based risk tier from the leg's American price."""
    if american is None:
        return "Medium"
    o = float(american)
    if o <= -150:
        return "Low"
    if o <= 120:
        return "Medium"
    if o <= 300:
        return "High"
    return "Longshot"


def parlay_eligibility(
    *,
    market: str,
    edge: float,
    market_prob: float,
    american_odds: int | float | None,
    sample_min: int = 0,
    corner_sample: int | None = None,
    is_underdog: bool = False,
    lineup_ok: bool = False,
    role_ok: bool = False,
) -> dict:
    """Return {parlayEligible, riskTier, bankBuilderEligible, reason}. Edge is model-minus-market
    in probability points (e.g. 0.013). Never eligible if the gate's data prerequisites fail."""
    tier = risk_tier_for_odds(american_odds)
    eligible = False
    reason = ""

    if market == "moneyline_90":
        if is_underdog and market_prob < EXTREME_UNDERDOG_PROB:
            eligible, tier, reason = False, "Longshot", "extreme underdog — view only, never a suggested ML pick"
        elif is_underdog and market_prob < MODERATE_UNDERDOG_PROB:
            eligible = edge >= ML_EXTREME_DOG_EDGE
            tier = "Longshot"
            reason = "extreme-ish underdog: Longshot only" if eligible else f"underdog edge {edge*100:+.1f}% < {ML_EXTREME_DOG_EDGE*100:.0f}%"
        elif is_underdog:
            eligible = edge >= ML_MODERATE_DOG_EDGE
            tier = "High" if tier in ("Low", "Medium") else tier
            reason = "moderate underdog edge clears" if eligible else f"underdog edge {edge*100:+.1f}% < {ML_MODERATE_DOG_EDGE*100:.1f}%"
        else:  # favourite or draw
            eligible = edge >= ML_FAV_DRAW_EDGE
            reason = "favourite/draw edge clears hybrid threshold" if eligible else f"edge {edge*100:+.1f}% < {ML_FAV_DRAW_EDGE*100:.1f}%"
    elif market == "double_chance":
        eligible = edge >= DOUBLE_CHANCE_EDGE
        reason = "double-chance edge clears" if eligible else f"edge {edge*100:+.1f}% < {DOUBLE_CHANCE_EDGE*100:.1f}%"
    elif market == "match_total_goals":
        eligible = edge >= TOTAL_GOALS_EDGE and sample_min >= 5
        reason = "total-goals edge clears" if eligible else (
            f"edge {edge*100:+.1f}% < {TOTAL_GOALS_EDGE*100:.2f}%" if edge < TOTAL_GOALS_EDGE else "sample < 5")
    elif market == "match_total_corners":
        cs = corner_sample or 0
        if cs >= CORNERS_SAMPLE_LOWMED and edge >= CORNERS_EDGE_LOWMED:
            eligible = True
        elif cs >= CORNERS_SAMPLE_HIGH and edge >= CORNERS_EDGE_HIGH:
            eligible, tier = True, "High" if tier in ("Low", "Medium") else tier
        reason = "corner edge+sample clears" if eligible else f"corner edge {edge*100:+.1f}% / sample {cs} below tiered threshold"
    elif market == "player_shots":
        eligible = lineup_ok and edge >= PLAYER_SHOTS_EDGE
        reason = "player shots clears (lineup + edge)" if eligible else ("no lineup/minutes" if not lineup_ok else f"edge {edge*100:+.1f}% < {PLAYER_SHOTS_EDGE*100:.1f}%")
    elif market == "player_shots_on_target":
        eligible = lineup_ok and role_ok and edge >= PLAYER_SOT_EDGE
        tier = "High" if tier == "Low" else tier
        reason = "player SOT clears" if eligible else ("no lineup/role" if not (lineup_ok and role_ok) else "edge below threshold")
    elif market == "player_assists":
        eligible = lineup_ok and role_ok and edge >= PLAYER_ASSIST_EDGE
        tier = "High" if tier in ("Low", "Medium") else tier
        reason = "assists clears (role evidence)" if eligible else "assists require lineup + creative role + edge"
    elif market == "anytime_goalscorer":
        eligible = lineup_ok and role_ok and edge >= GOALSCORER_EDGE
        tier = "Longshot" if tier in ("Low", "Medium") else tier
        reason = "goalscorer clears (attacker role)" if eligible else "goalscorer requires lineup + attacking role + edge"

    # Never Low-risk for goalscorer/assists.
    if market in NEVER_LOW and tier == "Low":
        tier = "High"

    # Bank Builder: strictest — Low-risk conservative team markets only, never high-variance props.
    bank_ok = bool(
        eligible and tier == "Low"
        and market in {"moneyline_90", "double_chance", "match_total_goals", "match_total_corners"}
        and not (market == "moneyline_90" and is_underdog)
    )
    return {"parlayEligible": bool(eligible), "riskTier": tier,
            "bankBuilderEligible": bank_ok, "reason": reason}
