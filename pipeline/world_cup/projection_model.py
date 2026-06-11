"""
Pure team-level soccer projection model — Poisson goals anchored to the de-vigged market.

Honesty: this is an INDEPENDENT model (recent-form goals → Poisson H/D/A) BLENDED with the
de-vigged sportsbook prior, with a conservative cap. It is NOT a copy of the market: when real
recent-form evidence exists it moves the probabilities; when the sample is thin the model
weight is small and confidence is capped Low (per the factor guide). Regulation-time only.
No xG is used or invented. Pure — fully unit-testable.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


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


def _model_weight(home: TeamForm, away: TeamForm) -> float:
    """Blend weight for the independent model vs the market prior. Small when the sample is
    thin (early tournament) so we never overstate edge. Capped at 0.35."""
    smin = min(home.sample, away.sample)
    if smin <= 0:
        return 0.0
    return min(0.35, 0.05 * smin)  # 5 matches → 0.25; 7+ → 0.35


def project_match(
    market_hda: tuple[float, float, float],
    home: TeamForm,
    away: TeamForm,
    *,
    total_line: float | None = None,
    market_over: float | None = None,
):
    """Returns a dict with blended moneyline (+ optional total) probs, confidence, factors.
    `market_hda` = de-vigged (home, draw, away). Returns None for moneyline projection when
    there is NO independent evidence (would just echo the market)."""
    w = _model_weight(home, away)
    out: dict = {"modelWeight": round(w, 3), "sampleMin": min(home.sample, away.sample)}
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
        out["sampleSizeWarning"] = min(home.sample, away.sample) < 5
        if total_line is not None and market_over is not None:
            t_over, t_under = poisson_over_under(exp_home + exp_away, total_line)
            out["total"] = {
                "line": total_line,
                "over": (1 - w) * market_over + w * t_over,
                "under": (1 - w) * (1 - market_over) + w * t_under,
            }
    else:
        out["moneyline"] = None  # no independent evidence → market outlook only, NOT a projection
        out["confidence"] = None
        out["sampleSizeWarning"] = True
    return out
