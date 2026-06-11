"""
World Cup team-strength feature layer (methodology upgrade 2026-06-11).

Assembles the feature vector the projection model consumes, in priority of trust:
  1. Market prior      — de-vigged H/D/A + total + price extremity (strongest signal early;
                         it already prices team strength/talent/rank).
  2. Recent form       — API-Football recent national-team goals for/against (real, but raw:
                         NOT opponent-adjusted yet → flagged so the model down-weights it).
  3. Rank / talent      — FIFA rank / Elo / squad value. NO real or curated+sourced provider is
                         wired, so these stay None. We build the interface; we never fake values.
  4. Sample quality    — recent-fixture count, opponent-quality-known flag, recency.
  5. Market sanity      — underdog price floor + extremity, used downstream to gate.

Pure data assembly — no I/O, fully unit-testable.
"""
from __future__ import annotations

from dataclasses import dataclass, field


def american_to_prob(odds: int | float) -> float:
    o = float(odds)
    return (100.0 / (o + 100.0)) if o > 0 else (-o / (-o + 100.0))


def is_underdog_side(american_odds: int | float | None, market_prob: float | None) -> bool:
    """A side is an 'underdog' (needs stricter evidence) when it is plus-money OR priced under
    ~38% — i.e. not the clear favorite. Draws are treated as underdog-like (usually plus-money)."""
    if american_odds is not None and float(american_odds) > 0:
        return True
    if market_prob is not None and market_prob < 0.38:
        return True
    return False


@dataclass
class TeamStrengthFeatures:
    team: str
    # Recent form (real, raw — opponent-unadjusted).
    goals_for_90: float | None
    goals_against_90: float | None
    sample: int
    # Rank / talent interface — null until a real/curated+sourced source is wired (never faked).
    fifa_rank: int | None = None
    elo: float | None = None
    squad_value_proxy: float | None = None


@dataclass
class MatchFeatures:
    home: TeamStrengthFeatures
    away: TeamStrengthFeatures
    # Market prior (de-vigged).
    market_home: float | None = None
    market_draw: float | None = None
    market_away: float | None = None
    market_total_line: float | None = None
    market_over: float | None = None
    # Context.
    stage: str | None = None
    venue: str | None = None
    kickoff_utc: str | None = None
    # Derived quality flags.
    opponent_adjusted: bool = False         # recent form is NOT opponent-adjusted today
    rank_available: bool = False            # no rank/talent source wired
    sample_min: int = 0
    notes: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.sample_min = min(self.home.sample, self.away.sample)
        self.rank_available = any(
            t.fifa_rank is not None or t.elo is not None or t.squad_value_proxy is not None
            for t in (self.home, self.away)
        )
        if not self.rank_available:
            self.notes.append("no FIFA-rank / Elo / talent source wired — market prior carries team strength")
        if not self.opponent_adjusted:
            self.notes.append("recent form is opponent-unadjusted — independent-model weight reduced")


def build_match_features(
    *,
    home_team: str,
    away_team: str,
    home_form: dict,
    away_form: dict,
    market: dict,
    stage: str | None = None,
    venue: str | None = None,
    kickoff_utc: str | None = None,
) -> MatchFeatures:
    """Assemble MatchFeatures from a fixture's recent-form dicts + the Odds-API outlook `market`
    (the `result`/`totals` block). Rank/talent fields stay None (no source)."""
    h = TeamStrengthFeatures(
        team=home_team, goals_for_90=home_form.get("goalsFor90"),
        goals_against_90=home_form.get("goalsAgainst90"), sample=home_form.get("played") or 0,
    )
    a = TeamStrengthFeatures(
        team=away_team, goals_for_90=away_form.get("goalsFor90"),
        goals_against_90=away_form.get("goalsAgainst90"), sample=away_form.get("played") or 0,
    )
    res = market.get("result") or {}
    tot = market.get("totals") or {}
    return MatchFeatures(
        home=h, away=a,
        market_home=res.get("homeWinPct"), market_draw=res.get("drawPct"),
        market_away=res.get("awayWinPct"),
        market_total_line=tot.get("line"), market_over=tot.get("overPct"),
        stage=stage, venue=venue, kickoff_utc=kickoff_utc,
        opponent_adjusted=False,
    )
