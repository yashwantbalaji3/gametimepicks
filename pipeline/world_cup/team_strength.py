"""
World Cup team-strength layer — a stabilizing prior from REAL, sourced FIFA ranking points
(app/public/data/world-cup/team-strength/team-strength-latest.json). Never fabricated: a team
not in the source returns None and is gated/capped downstream.

Provides:
  - points_for(name)  → FIFA points (alias-aware) or None
  - rank_for(name)    → FIFA rank or None
  - coverage(names)   → fraction of names with known strength
  - strength_expected_goals(home_pts, away_pts) → (exp_home, exp_away) via an Elo-style
    supremacy mapping of the points difference (independent of the market).
  - opponent_adjust(gf90, ga90, opponents) → opponent-adjusted attack/defense + coverage.

Pure data + pure helpers; the file is read once and cached.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .team_aliases import norm

REPO = Path(__file__).resolve().parents[2]
STRENGTH_PATH = REPO / "app" / "public" / "data" / "world-cup" / "team-strength" / "team-strength-latest.json"

# Reference rating for opponent-adjustment (a mid-tier national team). Scoring vs opponents
# stronger than this counts for more; conceding vs weaker opponents counts for more.
REF_POINTS = 1500.0
# Points difference that maps to ~1.0 goal of expected supremacy (tunable, conservative).
GOAL_SCALE = 300.0
BASE_TOTAL = 2.6  # neutral-venue baseline expected total goals


@lru_cache(maxsize=1)
def _table() -> dict:
    try:
        data = json.loads(STRENGTH_PATH.read_text())
    except Exception:
        return {}
    return {norm(t["team"]): t for t in data.get("teams", [])}


def points_for(name: str | None) -> float | None:
    t = _table().get(norm(name))
    return t.get("fifaPoints") if t else None


def rank_for(name: str | None) -> int | None:
    t = _table().get(norm(name))
    return t.get("fifaRank") if t else None


def coverage(names) -> float:
    names = [n for n in names if n]
    if not names:
        return 0.0
    known = sum(1 for n in names if points_for(n) is not None)
    return known / len(names)


def strength_expected_goals(
    home_pts: float, away_pts: float, *, neutral: bool = True, home_adv_pts: float = 35.0
) -> tuple[float, float]:
    """Expected home/away goals implied purely by the FIFA-points difference (an independent
    strength prior). Neutral venue by default (most WC matches); a small bump for actual hosts."""
    dr = (home_pts - away_pts) + (0.0 if neutral else home_adv_pts)
    supremacy = dr / GOAL_SCALE
    exp_home = max(BASE_TOTAL / 2 + supremacy / 2, 0.15)
    exp_away = max(BASE_TOTAL / 2 - supremacy / 2, 0.15)
    return exp_home, exp_away


def opponent_adjust(gf90: float | None, ga90: float | None, opponents) -> dict:
    """Adjust raw recent goals for the strength of opponents faced. Returns adjusted attack/
    defense and the opponent-strength coverage (fraction of opponents with known points)."""
    pts = [points_for(o) for o in (opponents or [])]
    known = [p for p in pts if p is not None]
    cov = (len(known) / len(pts)) if pts else 0.0
    if not known or gf90 is None or ga90 is None:
        return {"attack": gf90, "defense": ga90, "avgOpponent": None, "coverage": round(cov, 2)}
    avg_opp = sum(known) / len(known)
    factor = avg_opp / REF_POINTS  # >1 vs strong opponents, <1 vs weak
    return {
        "attack": round(gf90 * factor, 3),          # goals vs strong opp worth more
        "defense": round(ga90 / max(factor, 0.5), 3),  # conceding vs strong opp forgiven
        "avgOpponent": round(avg_opp, 1),
        "coverage": round(cov, 2),
    }
