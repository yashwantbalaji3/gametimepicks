"""Game-context feature derivation.

Persisted, observability-only context that the audit framework can
correlate against settled outcomes. **Nothing in this module changes
projection logic.** It exists so future audit work can ask questions
like "do high-leverage playoff games hit worse than mid-season games"
without retroactively re-deriving features.

Scope, honestly described:

  Fields currently derivable from data already on disk:
    * dateIso            — the slate date (echoed for convenience)
    * month              — 1..12, from the slate date
    * dayOfWeek          — 0=Mon..6=Sun
    * isPlayoff          — True when date >= 2026-04-19 (NBA playoff
                            start); a coarse, honest derivation
    * seasonPhase        — "playoff" | "regular_season"

  Fields the user fast-tracked into PR #62 but which require upstream
  data sources not yet wired:
    * seriesState        — needs nba_api PlayoffSeries lookup; null
                            until PR #64 wires it
    * eliminationFlag    — derived from seriesState; null for now
    * paceProjection     — needs nba_api LeagueDashTeamStats; null
                            until that loader lands
    * parkFactor (MLB)   — needs a venue → factor map; null for now

Treat the placeholder fields as schema reservations. They are emitted
on every row so downstream consumers can rely on the shape, and so a
later PR that fills them does not need a migration step.

The module deliberately does not import any nba_api or odds-fetch
client. It is pure-function, safe to run at any time, no I/O.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as _date
from typing import Any


# NBA 2025-26 playoffs began on 2026-04-18 (per the season calendar).
# This is the only date constant in the module; bumping it next season
# is the only maintenance the cutoff requires.
NBA_PLAYOFFS_START = _date(2026, 4, 18)


@dataclass(frozen=True)
class GameContext:
    """Audit-observable context for a single settled row.

    Every field is JSON-serialisable. None means "not yet derivable
    from on-disk data" — never silently defaulted, never fabricated.
    """

    dateIso: str
    month: int
    dayOfWeek: int
    isPlayoff: bool
    seasonPhase: str
    seriesState: str | None = None
    eliminationFlag: bool | None = None
    paceProjection: float | None = None
    parkFactor: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "dateIso": self.dateIso,
            "month": self.month,
            "dayOfWeek": self.dayOfWeek,
            "isPlayoff": self.isPlayoff,
            "seasonPhase": self.seasonPhase,
            "seriesState": self.seriesState,
            "eliminationFlag": self.eliminationFlag,
            "paceProjection": self.paceProjection,
            "parkFactor": self.parkFactor,
        }


def _parse_iso_date(value: str) -> _date:
    """Strict YYYY-MM-DD parser.

    Anything else raises so the caller learns about bad data instead of
    silently inheriting wrong context.
    """
    return _date.fromisoformat(value)


def derive_basic_context(date_iso: str) -> GameContext:
    """Date-only context. Pure function, no external lookups.

    Used as the base layer for both NBA and MLB. Future PRs layer
    sport-specific data on top of this without changing the shape.
    """
    d = _parse_iso_date(date_iso)
    is_playoff = d >= NBA_PLAYOFFS_START
    return GameContext(
        dateIso=date_iso,
        month=d.month,
        dayOfWeek=d.weekday(),  # 0=Mon, 6=Sun
        isPlayoff=is_playoff,
        seasonPhase="playoff" if is_playoff else "regular_season",
    )


def derive_nba_context(date_iso: str) -> GameContext:
    """NBA context.

    Currently identical to `derive_basic_context`. Placeholder so the
    seriesState / eliminationFlag / paceProjection wiring lands here
    once nba_api PlayoffSeries + LeagueDashTeamStats are loaded.
    """
    return derive_basic_context(date_iso)


def derive_mlb_context(date_iso: str) -> GameContext:
    """MLB context.

    Currently identical to `derive_basic_context`. Placeholder so the
    parkFactor wiring lands here once the venue lookup table is added.
    """
    base = derive_basic_context(date_iso)
    # MLB doesn't enter its postseason until October; force seasonPhase
    # to regular_season for May 2026 so isPlayoff is honest per sport.
    return GameContext(
        dateIso=base.dateIso,
        month=base.month,
        dayOfWeek=base.dayOfWeek,
        isPlayoff=False,
        seasonPhase="regular_season",
        # the placeholder fields remain None — same shape, different
        # interpretation when their loader ships
    )
