"""
Pure team-level soccer projection model — Poisson goals anchored to the de-vigged market, with
an explicit market-sanity / sample / feature classifier (methodology upgrade 2026-06-11).

Design principles (see docs/audits/world-cup-methodology-review-2026-06-11.md):
  - The market is a STRONG prior, especially on opening day (it already prices team
    strength/talent/rank that thin recent form does not).
  - Recent national-team form may ADJUST the prior, but cannot overwhelm it: the model weight is
    small and shrinks further when there is no opponent-strength adjustment.
  - Extreme underdogs need stricter evidence: a pick is only `active` (public) when it clears
    market-sanity (no sub-15% underdog), sample-size, missing-feature, and minimum-edge gates.
  - It NEVER echoes the market: with no independent form evidence it returns no pick.
  - No xG is used or invented. Draw is modeled explicitly. Regulation time only.

Pure — fully unit-testable.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# --- gate constants ---------------------------------------------------------
UNDERDOG_MARKET_FLOOR = 0.15      # no public ML for an underdog priced below this
MIN_SAMPLE_ACTIVE = 5             # recent finished matches needed for an active pick
MIN_EDGE_ML = 0.03                # 3.0% model-vs-market edge for an active moneyline pick
MIN_EDGE_TOTAL = 0.025            # 2.5% for an active total
MAX_UNDERDOG_LIFT_NO_OPP = 0.03   # cap on an underdog's model lift when opponent-unadjusted
OPENING_DAY_MAX_WEIGHT = 0.18     # hard cap on the independent-model weight early


@dataclass
class TeamForm:
    goals_for_90: float | None
    goals_against_90: float | None
    sample: int


def _pois_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * lam ** k / math.factorial(k)


def poisson_hda(exp_home: float, exp_away: float, max_goals: int = 8) -> tuple[float, float, float]:
    """P(home win), P(draw), P(away win) from independent Poisson goal expectations."""
    ph = pd = pa = 0.0
    for h in range(max_goals + 1):
        for a in range(max_goals + 1):
            p = _pois_pmf(h, max(exp_home, 0.05)) * _pois_pmf(a, max(exp_away, 0.05))
            if h > a:
                ph += p
            elif h == a:
                pd += p
            else:
                pa += p
    s = ph + pd + pa
    return (ph / s, pd / s, pa / s) if s > 0 else (1 / 3, 1 / 3, 1 / 3)


def poisson_over_under(exp_total: float, line: float, max_goals: int = 12) -> tuple[float, float]:
    """P(over line), P(under line) for total goals (line is .5 so no push)."""
    p_under = 0.0
    for g in range(max_goals + 1):
        if g < line:
            p_under += _pois_pmf(g, max(exp_total, 0.1))
    p_under = min(max(p_under, 0.0), 1.0)
    return (1 - p_under, p_under)


def model_weight(home: TeamForm, away: TeamForm, *, opponent_adjusted: bool) -> float:
    """Independent-model blend weight vs the market prior. Small and sample-scaled, hard-capped
    at OPENING_DAY_MAX_WEIGHT, and reduced 40% when the recent form is NOT opponent-adjusted
    (raw goals are easily inflated by weak opposition). The market keeps >= ~0.89 weight."""
    smin = min(home.sample, away.sample)
    if smin <= 0:
        return 0.0
    w = min(OPENING_DAY_MAX_WEIGHT, 0.03 * smin)
    if not opponent_adjusted:
        w *= 0.6
    return w


def classify_projection(
    *,
    market_prob: float,
    model_prob: float,
    market_type: str,
    sample_min: int,
    opponent_adjusted: bool,
    is_underdog: bool,
) -> tuple[str, bool, str]:
    """Return (projectionStatus, isPublic, reason). The ONLY path to `active`/public is clearing
    every gate. Order matters: market-sanity first (kills extreme underdogs), then sample, then
    missing-feature caps, then minimum edge."""
    edge = model_prob - market_prob
    if is_underdog and market_prob < UNDERDOG_MARKET_FLOOR:
        return ("gated_market_sanity", False,
                f"extreme underdog (market {market_prob*100:.0f}% < {UNDERDOG_MARKET_FLOOR*100:.0f}%) — not a model pick")
    if sample_min < MIN_SAMPLE_ACTIVE:
        return ("gated_sample_size", False,
                f"recent-form sample {sample_min} < {MIN_SAMPLE_ACTIVE} — too thin to publish")
    if is_underdog and not opponent_adjusted and edge > MAX_UNDERDOG_LIFT_NO_OPP:
        return ("gated_missing_features", False,
                "underdog model-lift exceeds the cap allowed without opponent-strength adjustment")
    min_edge = MIN_EDGE_ML if market_type == "moneyline_90" else MIN_EDGE_TOTAL
    if edge < min_edge:
        return ("research_only", False,
                f"edge {edge*100:+.1f}% below the {min_edge*100:.1f}% active threshold for {market_type}")
    return ("active", True, "passes market-sanity + sample + feature + edge gates")


def project_match(
    market_hda: tuple[float, float, float],
    home: TeamForm,
    away: TeamForm,
    *,
    total_line: float | None = None,
    market_over: float | None = None,
    opponent_adjusted: bool = False,
):
    """Blended moneyline (+ optional total) probabilities + metadata. Returns None moneyline when
    there is NO independent evidence (would just echo the market). `opponent_adjusted` reflects
    whether the recent-form goals were adjusted for opponent strength (false today → lower weight,
    stricter underdog gating downstream)."""
    w = model_weight(home, away, opponent_adjusted=opponent_adjusted)
    out: dict = {"modelWeight": round(w, 3), "sampleMin": min(home.sample, away.sample),
                 "opponentAdjusted": opponent_adjusted}
    has_form = (
        home.goals_for_90 is not None and home.goals_against_90 is not None
        and away.goals_for_90 is not None and away.goals_against_90 is not None
        and w > 0
    )
    if has_form:
        exp_home = max((home.goals_for_90 + away.goals_against_90) / 2.0, 0.1)
        exp_away = max((away.goals_for_90 + home.goals_against_90) / 2.0, 0.1)
        m_h, m_d, m_a = poisson_hda(exp_home, exp_away)
        ph = (1 - w) * market_hda[0] + w * m_h
        pd = (1 - w) * market_hda[1] + w * m_d
        pa = (1 - w) * market_hda[2] + w * m_a
        s = ph + pd + pa
        out["moneyline"] = {"home": ph / s, "draw": pd / s, "away": pa / s}
        out["expGoals"] = {"home": round(exp_home, 2), "away": round(exp_away, 2)}
        out["confidence"] = "Low"  # early tournament — never High without xG + bigger sample
        out["sampleSizeWarning"] = min(home.sample, away.sample) < MIN_SAMPLE_ACTIVE
        if total_line is not None and market_over is not None:
            t_over, t_under = poisson_over_under(exp_home + exp_away, total_line)
            out["total"] = {
                "line": total_line,
                "over": (1 - w) * market_over + w * t_over,
                "under": (1 - w) * (1 - market_over) + w * t_under,
            }
    else:
        out["moneyline"] = None
        out["confidence"] = None
        out["sampleSizeWarning"] = True
    return out
