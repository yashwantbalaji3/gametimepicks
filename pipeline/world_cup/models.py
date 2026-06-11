"""Provider-neutral World Cup soccer data models (Phase 4).

Pure dataclasses — no I/O. Nullable fields default to None so a provider that
lacks (e.g.) xG never forces a fabricated value: the readiness layer reads the
null and keeps that market fail-closed. Country-role fields are first-class
because the methodology guide requires country role > club role.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class WorldCupFixture:
    match_id: str
    date: str
    kickoff_utc: str
    home_team: str
    away_team: str
    provider_match_id: Optional[str] = None
    fifa_match_id: Optional[str] = None
    stage: Optional[str] = None
    group: Optional[str] = None
    venue: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    status: str = "scheduled"


@dataclass
class TeamStrength:
    team: str
    sample_size: int = 0
    elo_or_rating: Optional[float] = None
    fifa_rank: Optional[int] = None
    recent_form: Optional[str] = None
    goals_for_90: Optional[float] = None
    goals_against_90: Optional[float] = None
    shots_for_90: Optional[float] = None
    shots_against_90: Optional[float] = None
    sot_for_90: Optional[float] = None
    sot_against_90: Optional[float] = None
    corners_for_90: Optional[float] = None
    corners_against_90: Optional[float] = None
    xg_for_90: Optional[float] = None      # nullable — never fabricated
    xg_against_90: Optional[float] = None


@dataclass
class PlayerRole:
    player_id: str
    player_name: str
    team: str
    position: Optional[str] = None
    projected_starter: Optional[bool] = None    # hard gate for player props
    projected_minutes: Optional[float] = None    # hard gate for player props
    recent_minutes: Optional[float] = None
    national_team_minutes: Optional[float] = None
    club_minutes: Optional[float] = None
    shots90: Optional[float] = None
    sot90: Optional[float] = None
    xg90: Optional[float] = None
    xa90: Optional[float] = None
    goals90: Optional[float] = None
    assists90: Optional[float] = None
    set_piece_taker: Optional[bool] = None
    penalty_taker: Optional[bool] = None
    sample_size: int = 0


@dataclass
class MatchFeatures:
    match_id: str
    home_team: str
    away_team: str
    kickoff_utc: str
    market_implied_home: Optional[float] = None
    market_implied_draw: Optional[float] = None
    market_implied_away: Optional[float] = None
    total_line: Optional[float] = None
    over_prob: Optional[float] = None
    under_prob: Optional[float] = None
    home_team_strength: Optional[TeamStrength] = None
    away_team_strength: Optional[TeamStrength] = None
    projected_goals_home: Optional[float] = None
    projected_goals_away: Optional[float] = None
    model_home_prob: Optional[float] = None
    model_draw_prob: Optional[float] = None
    model_away_prob: Optional[float] = None
    confidence: Optional[str] = None
    readiness_flags: dict = field(default_factory=dict)
