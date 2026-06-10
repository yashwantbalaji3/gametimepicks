"""
Feature engineering — turn raw game logs into per-player features used by the
scoring model.

Inputs: list[GameLog] for a player (most recent first)
Outputs: dict[str, float] of features

The features are intentionally simple and explainable:

  - last5_pts / last5_reb / last5_ast       — rolling averages
  - last10_pts / last10_reb / last10_ast
  - season_pts / season_reb / season_ast    — uses all available logs
  - home_pts / away_pts                     — split averages
  - minutes_trend                           — slope of minutes over last 10
  - games_played_window                     — sample-size sanity check
  - dispersion_pts / dispersion_reb / dispersion_ast — std dev for σ in normal model

This module is pure — it doesn't touch the network or the registry. All
inputs come from upstream callers, which means it's trivial to test.
"""
from __future__ import annotations

import math
from statistics import mean, pstdev
from typing import Sequence

from .providers import GameLog


def _avg(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(mean(values))


def _std(values: Sequence[float], floor: float = 1.0) -> float:
    """Population std with a floor to avoid sigma=0 degeneracies."""
    if len(values) < 2:
        return floor
    s = float(pstdev(values))
    return max(s, floor)


def _slope(values: Sequence[float]) -> float:
    """Simple OLS slope of values over their indices (oldest = 0).

    Returns 0 if fewer than 3 data points.
    """
    n = len(values)
    if n < 3:
        return 0.0
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(values) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, values))
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return 0.0
    return num / den


def build_player_features(logs: list[GameLog]) -> dict[str, float]:
    """logs are newest-first (consistent with provider output)."""
    if not logs:
        return _empty_features()

    # Newest-first → reverse for time-ordered analysis where needed
    chrono = list(reversed(logs))

    pts = [g.pts for g in logs]
    reb = [g.reb for g in logs]
    ast = [g.ast for g in logs]
    minutes = [g.minutes for g in logs]
    # Expanded box-score markets (ESPN-sourced). Feature keys are lowercased to
    # match score_model's `last5_{market_lower}` lookup ("3PM"->"3pm", etc.).
    fg3 = [getattr(g, "fg3m", 0) for g in logs]
    blk = [getattr(g, "blk", 0) for g in logs]
    stl = [getattr(g, "stl", 0) for g in logs]
    pra = [g.pts + g.reb + g.ast for g in logs]

    last5_pts = pts[:5]
    last5_reb = reb[:5]
    last5_ast = ast[:5]

    last10_pts = pts[:10]
    last10_reb = reb[:10]
    last10_ast = ast[:10]

    home_pts = [g.pts for g in logs if g.home_away == "Home"]
    away_pts = [g.pts for g in logs if g.home_away == "Away"]
    home_reb = [g.reb for g in logs if g.home_away == "Home"]
    away_reb = [g.reb for g in logs if g.home_away == "Away"]
    home_ast = [g.ast for g in logs if g.home_away == "Home"]
    away_ast = [g.ast for g in logs if g.home_away == "Away"]

    minutes_trend = _slope([g.minutes for g in chrono[-10:]])

    return {
        "games_played_window": float(len(logs)),

        "last5_pts": _avg(last5_pts),
        "last5_reb": _avg(last5_reb),
        "last5_ast": _avg(last5_ast),
        "last5_min": _avg(minutes[:5]),

        "last10_pts": _avg(last10_pts),
        "last10_reb": _avg(last10_reb),
        "last10_ast": _avg(last10_ast),
        "last10_min": _avg(minutes[:10]),

        "season_pts": _avg(pts),
        "season_reb": _avg(reb),
        "season_ast": _avg(ast),
        "season_min": _avg(minutes),

        "home_pts": _avg(home_pts),
        "home_reb": _avg(home_reb),
        "home_ast": _avg(home_ast),
        "away_pts": _avg(away_pts),
        "away_reb": _avg(away_reb),
        "away_ast": _avg(away_ast),

        "minutes_trend": minutes_trend,

        # Expanded markets — same 0.45/0.35/0.20 (last5/last10/season) shape, keyed by
        # lowercased market ("3pm","pra","blk","stl"). No home/away split for these
        # (smaller samples); project_stat falls back to base when a split key is absent.
        "last5_3pm": _avg(fg3[:5]), "last10_3pm": _avg(fg3[:10]), "season_3pm": _avg(fg3),
        "last5_pra": _avg(pra[:5]), "last10_pra": _avg(pra[:10]), "season_pra": _avg(pra),
        "last5_blk": _avg(blk[:5]), "last10_blk": _avg(blk[:10]), "season_blk": _avg(blk),
        "last5_stl": _avg(stl[:5]), "last10_stl": _avg(stl[:10]), "season_stl": _avg(stl),

        # Dispersion floors are calibrated to realistic NBA per-game variance.
        # Without these floors a tightly-clustered 5-game window produces
        # σ≈2 and z-scores that yield wild model probabilities (e.g. 85%+).
        # Real per-player game-to-game std-dev is roughly 6 / 3 / 2.5.
        "dispersion_pts": _std(last10_pts, floor=6.0),
        "dispersion_reb": _std(last10_reb, floor=3.0),
        "dispersion_ast": _std(last10_ast, floor=2.5),
        # Volatile defense props get higher relative floors (conservative — fewer
        # confident calls); PRA is a sum so its floor is larger.
        "dispersion_3pm": _std(fg3[:10], floor=1.6),
        "dispersion_pra": _std(pra[:10], floor=9.0),
        "dispersion_blk": _std(blk[:10], floor=1.1),
        "dispersion_stl": _std(stl[:10], floor=1.1),
    }


def _empty_features() -> dict[str, float]:
    return {
        "games_played_window": 0.0,
        "last5_pts": 0.0, "last5_reb": 0.0, "last5_ast": 0.0, "last5_min": 0.0,
        "last10_pts": 0.0, "last10_reb": 0.0, "last10_ast": 0.0, "last10_min": 0.0,
        "season_pts": 0.0, "season_reb": 0.0, "season_ast": 0.0, "season_min": 0.0,
        "home_pts": 0.0, "home_reb": 0.0, "home_ast": 0.0,
        "away_pts": 0.0, "away_reb": 0.0, "away_ast": 0.0,
        "minutes_trend": 0.0,
        "dispersion_pts": 5.0, "dispersion_reb": 2.0, "dispersion_ast": 2.0,
        "last5_3pm": 0.0, "last10_3pm": 0.0, "season_3pm": 0.0,
        "last5_pra": 0.0, "last10_pra": 0.0, "season_pra": 0.0,
        "last5_blk": 0.0, "last10_blk": 0.0, "season_blk": 0.0,
        "last5_stl": 0.0, "last10_stl": 0.0, "season_stl": 0.0,
        "dispersion_3pm": 1.6, "dispersion_pra": 9.0,
        "dispersion_blk": 1.1, "dispersion_stl": 1.1,
    }


def build_trend_payload(logs: list[GameLog]) -> dict:
    """Build the per-player block written to trends.json."""
    last5 = logs[:5]
    last10 = logs[:10]

    def avg_block(window: list[GameLog]) -> dict[str, float]:
        if not window:
            return {"pts": 0.0, "reb": 0.0, "ast": 0.0, "minutes": 0.0}
        return {
            "pts": round(_avg([g.pts for g in window]), 1),
            "reb": round(_avg([g.reb for g in window]), 1),
            "ast": round(_avg([g.ast for g in window]), 1),
            "minutes": round(_avg([g.minutes for g in window]), 1),
        }

    home = [g for g in logs if g.home_away == "Home"]
    away = [g for g in logs if g.home_away == "Away"]

    def split_block(window: list[GameLog]) -> dict[str, float]:
        if not window:
            return {"pts": 0.0, "reb": 0.0, "ast": 0.0}
        return {
            "pts": round(_avg([g.pts for g in window]), 1),
            "reb": round(_avg([g.reb for g in window]), 1),
            "ast": round(_avg([g.ast for g in window]), 1),
        }

    return {
        "last5": avg_block(last5),
        "last10": avg_block(last10),
        "season": avg_block(logs),
        "homeAvg": split_block(home),
        "awayAvg": split_block(away),
        "recentGames": [
            {
                "date": g.game_date,
                "opponent": g.opponent_abbr,
                "homeAway": g.home_away,
                "minutes": int(g.minutes),
                "pts": int(g.pts),
                "reb": int(g.reb),
                "ast": int(g.ast),
            }
            for g in logs[:10]
        ],
    }
