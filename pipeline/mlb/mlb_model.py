"""Minimal MVP projection model for MLB props.

Design constraints:
  - No NumPy / SciPy / pandas. Stdlib only.
  - Free MLB-StatsAPI game logs are the only input.
  - Be conservative: if the sample is small, downgrade confidence rather than
    invent a number.

Per-market projection (kept transparent — anyone reading the code should be
able to reproduce the number by hand):

  pitcher_strikeouts:
      weighted_per_start = 0.55 * mean(last3 starts K)
                         + 0.45 * mean(season K)
      sigma_K       = max(stdev(season K), 1.6)
      P(Over line)  = 1 - Φ((line - projection) / sigma_K)

  batter_hits / batter_total_bases / batter_hits_runs_rbis:
      stat_per_game = 0.5 * mean(last10 games stat)
                    + 0.5 * mean(season stat per game)
      sigma         = max(stdev(season stat), market_floor)
      market_floor: hits=0.85, total_bases=1.10, hrr=1.20
      P(Over line)  = 1 - Φ((line - projection) / sigma)

  Anything else: insufficient_data (no projection).

Confidence tiers mirror the NBA model:
  - High      edge ≥ 5.0 pp
  - Medium    edge ≥ 2.5 pp
  - Low       edge < 2.5 pp
  - insufficient_data when <3 games of log data or sigma is undefined

R5 guardrail (mirrors the NBA "anomaly" cap):
  - Edge ≥ 25 pp is automatically capped to Low + flagged as "r5_model_anomaly".
"""
from __future__ import annotations

import math
import statistics
from typing import Iterable

EDGE_HIGH_PP = 5.0
EDGE_MEDIUM_PP = 2.5
# R5 anomaly threshold. MLB May 16 settled audit showed the 20-25pp |edge|
# bucket hit 22.2% (2-7 on n=9); 25+pp behaved like a coin flip same as the
# NBA R5 territory. Tighten the MLB cap to 20pp so borderline-anomaly leans
# get the same honest "model anomaly" framing instead of riding the main
# board with full confidence. Conservative move — only adds caution; never
# upgrades a lean. Sample is small (single graded slate) so we tighten the
# cap (which only flags), not the underlying confidence (which would risk
# overfit).
R5_ANOMALY_THRESHOLD_PP = 20.0

# Minimum games of game-log history required to score a player.
MIN_GAMES_PITCHER = 3
MIN_GAMES_BATTER = 5


def _phi(x: float) -> float:
    """Standard normal CDF via math.erf."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _safe_mean(values: Iterable[float], default: float = 0.0) -> float:
    vals = [float(v) for v in values]
    if not vals:
        return default
    return sum(vals) / len(vals)


def _safe_stdev(values: Iterable[float], default: float) -> float:
    vals = [float(v) for v in values]
    if len(vals) < 2:
        return default
    try:
        s = statistics.pstdev(vals)
        return s if s > 0 else default
    except statistics.StatisticsError:
        return default


# ---------------------------------------------------------------------------
# Extracting per-game numbers from raw MLB Stats API game-log entries
# ---------------------------------------------------------------------------
def pitcher_strikeouts_series(game_logs: list[dict]) -> list[int]:
    """Return chronological list of K per appearance (oldest → newest)."""
    out: list[int] = []
    for g in game_logs:
        stat = g.get("stat", {}) or {}
        k = stat.get("strikeOuts")
        if k is None:
            continue
        try:
            out.append(int(k))
        except (TypeError, ValueError):
            continue
    return out


def batter_stat_series(game_logs: list[dict], stat_key: str) -> list[float]:
    """Generic per-game series for a single batter stat.

    stat_key options: "hits", "totalBases".
    For "hrr" (hits+runs+rbi), pass stat_key="hrr" and we compute the sum.
    """
    out: list[float] = []
    for g in game_logs:
        stat = g.get("stat", {}) or {}
        if stat_key == "hrr":
            try:
                v = (
                    float(stat.get("hits", 0) or 0)
                    + float(stat.get("runs", 0) or 0)
                    + float(stat.get("rbi", 0) or 0)
                )
            except (TypeError, ValueError):
                continue
        else:
            raw = stat.get(stat_key)
            if raw is None:
                continue
            try:
                v = float(raw)
            except (TypeError, ValueError):
                continue
        # Only include games where the batter actually appeared (AB or PA > 0)
        try:
            pa = float(stat.get("plateAppearances", 0) or 0)
            ab = float(stat.get("atBats", 0) or 0)
        except (TypeError, ValueError):
            pa, ab = 0.0, 0.0
        if pa <= 0 and ab <= 0:
            continue
        out.append(v)
    return out


# ---------------------------------------------------------------------------
# Per-market projection
# ---------------------------------------------------------------------------
def project_pitcher_strikeouts(game_logs: list[dict]) -> dict:
    """Return projection dict for pitcher_strikeouts.

    Shape:
      {"projection": float | None, "sigma": float, "samples": int,
       "last3Mean": float | None, "seasonMean": float | None,
       "insufficient": bool, "recentSeries": list[int]}
    """
    series = pitcher_strikeouts_series(game_logs)
    n = len(series)
    if n < MIN_GAMES_PITCHER:
        return {
            "projection": None,
            "sigma": 0.0,
            "samples": n,
            "last3Mean": None,
            "seasonMean": None,
            "insufficient": True,
            "recentSeries": series,
        }
    last3 = series[-3:]
    last3_mean = _safe_mean(last3)
    season_mean = _safe_mean(series)
    projection = 0.55 * last3_mean + 0.45 * season_mean
    sigma = max(_safe_stdev(series, default=1.6), 1.6)
    return {
        "projection": round(projection, 2),
        "sigma": round(sigma, 2),
        "samples": n,
        "last3Mean": round(last3_mean, 2),
        "seasonMean": round(season_mean, 2),
        "insufficient": False,
        "recentSeries": series,
    }


# Sigma floors for batter markets (per Phase 2 design notes).
_BATTER_SIGMA_FLOOR = {
    "batter_hits": 0.85,
    "batter_total_bases": 1.10,
    "batter_hits_runs_rbis": 1.20,
}


def project_batter_market(game_logs: list[dict], market_key: str) -> dict:
    """Project a batter market from game logs.

    market_key: "batter_hits" | "batter_total_bases" | "batter_hits_runs_rbis".
    """
    if market_key == "batter_hits":
        series = batter_stat_series(game_logs, "hits")
    elif market_key == "batter_total_bases":
        series = batter_stat_series(game_logs, "totalBases")
    elif market_key == "batter_hits_runs_rbis":
        series = batter_stat_series(game_logs, "hrr")
    else:
        return {
            "projection": None,
            "sigma": 0.0,
            "samples": 0,
            "last10Mean": None,
            "seasonMean": None,
            "insufficient": True,
            "recentSeries": [],
        }

    n = len(series)
    if n < MIN_GAMES_BATTER:
        return {
            "projection": None,
            "sigma": 0.0,
            "samples": n,
            "last10Mean": None,
            "seasonMean": None,
            "insufficient": True,
            "recentSeries": series,
        }
    last10 = series[-10:]
    last10_mean = _safe_mean(last10)
    season_mean = _safe_mean(series)
    projection = 0.5 * last10_mean + 0.5 * season_mean
    floor = _BATTER_SIGMA_FLOOR.get(market_key, 1.0)
    sigma = max(_safe_stdev(series, default=floor), floor)
    return {
        "projection": round(projection, 2),
        "sigma": round(sigma, 2),
        "samples": n,
        "last10Mean": round(last10_mean, 2),
        "seasonMean": round(season_mean, 2),
        "insufficient": False,
        "recentSeries": series,
    }


# ---------------------------------------------------------------------------
# Edge + confidence
# ---------------------------------------------------------------------------
def model_over_probability(projection: float, line: float, sigma: float) -> float:
    """P(actual > line) under N(projection, sigma)."""
    if sigma <= 0:
        return 0.5
    z = (line - projection) / sigma
    return 1.0 - _phi(z)


def grade(
    projection: float | None,
    line: float,
    sigma: float,
    implied_over: float,
    implied_under: float,
    *,
    samples: int = 0,
) -> dict:
    """Return lean + edge + confidence given a projection and the market.

    All probabilities are 0..1; edges are reported in percentage points.
    Pass `samples` (recent-log count) to enable the honest contextTag
    derivation; defaults to 0 so callers that don't yet pass it still
    work (contextTag will simply stay None or fall to sample-watch).
    """
    if projection is None or sigma is None or sigma <= 0:
        return {
            "lean": "Pass",
            "confidence": "insufficient_data",
            "modelProbOver": None,
            "modelProbUnder": None,
            "edgePctOver": None,
            "edgePctUnder": None,
            "edgePct": None,
            "riskFlags": ["insufficient_data"],
            "contextTag": None,
        }
    p_over = model_over_probability(projection, line, sigma)
    p_under = 1.0 - p_over
    edge_over_pp = (p_over - implied_over) * 100.0
    edge_under_pp = (p_under - implied_under) * 100.0
    if edge_over_pp >= edge_under_pp:
        lean = "Over"
        edge_pp = edge_over_pp
    else:
        lean = "Under"
        edge_pp = edge_under_pp

    risk: list[str] = []
    if edge_pp >= EDGE_HIGH_PP:
        confidence = "High"
    elif edge_pp >= EDGE_MEDIUM_PP:
        confidence = "Medium"
    else:
        confidence = "Low"
    if edge_pp >= R5_ANOMALY_THRESHOLD_PP:
        confidence = "Low"
        risk.append("r5_model_anomaly")

    return {
        "lean": lean,
        "confidence": confidence,
        "modelProbOver": round(p_over, 4),
        "modelProbUnder": round(p_under, 4),
        "edgePctOver": round(edge_over_pp, 2),
        "edgePctUnder": round(edge_under_pp, 2),
        "edgePct": round(edge_pp, 2),
        "riskFlags": risk,
        # Honest context tag — pure derivation from confidence + riskFlags.
        # NBA leans receive the same tag via pipeline.confidence_guardrails.
        "contextTag": _mlb_context_tag(confidence, risk, samples),
    }


def _mlb_context_tag(
    confidence: str,
    risk_flags: list[str],
    samples: int,
) -> str | None:
    """Derive the same five-state honest context tag NBA uses, with MLB's
    sample-size scale (batter min 5, pitcher min 3). Returns one of:
    'model-anomaly' | 'sample-watch' | 'recent-form-backed' | 'clean' |
    None (insufficient_data / no_play / unknown)."""
    if "r5_model_anomaly" in risk_flags or "suspicious_edge" in risk_flags:
        return "model-anomaly"
    if confidence not in ("High", "Medium", "Low"):
        return None
    # Match the NBA scale where 8+ logs is "recent-form-backed". MLB
    # batter logs grow to 10 the same way; pitcher logs are smaller so a
    # pitcher with 3..4 starts lands in "sample-watch" naturally.
    if 5 <= samples <= 7:
        return "sample-watch"
    if confidence == "High" and samples >= 8:
        return "recent-form-backed"
    if confidence in ("High", "Medium") and samples >= 8:
        return "clean"
    return None
