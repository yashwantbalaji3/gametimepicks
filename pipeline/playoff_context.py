"""NBA playoff context — pure observability layer.

Given a `gameId` + date, derive the playoff context block that the audit
and the `/nba/board` team-projection card consume. The module is
**read-only**: it does not change projections, does not change settlement,
does not change scoring confidence. Every field is either derivable from
on-disk data (`pipeline/overrides/playoff_series.json` + `app/public/data/
boards/<date>.json`) or honestly returned as `None`.

Why a separate module:
  * `game_context.py` (PR #62) already handles date-derived
    `isPlayoff` / `seasonPhase` / `dayOfWeek`. This module sits beside
    it and adds *NBA-playoff-specific* fields without modifying
    `game_context.py`'s contract.
  * Keeping the context derivation outside `generate_daily_board.py`
    means future audit work can call it post-hoc against settled rows.

Fields:
  - round            "ECF" | "WCF" | "NBAFinals" | "PI" | None
  - gameNumber       int (1-7) | None
  - seriesShort      "CLE-NY" alphabetical pair | None
  - eliminationFlag  bool | None — true when at least one team faces elim
  - homeTeam         "NY"
  - awayTeam         "CLE"
  - isHome           bool — derived per-lean from team vs homeTeam
  - priorGameInSeries  gameId of the prior game in the same series, or None
  - notes            operator-supplied free-text

Used by:
  * `pipeline/team_projection.py` — to label the projection card with
    the round/game number.
  * future audit module — to slice settled hit rates by playoff round.

Honesty rules:
  * Missing fields → `None`, never invented.
  * The manual override file is the single source of truth for round +
    gameNumber + homeTeam mapping. Updating it requires explicit
    operator action.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date as _date
from typing import Any

# Single override file — updated by the operator as playoff games land.
OVERRIDE_PATH = os.path.join(
    "pipeline", "overrides", "playoff_series.json"
)

# NBA 2025-26 playoffs began 2026-04-18 (matches game_context.py).
NBA_PLAYOFFS_START = _date(2026, 4, 18)


@dataclass(frozen=True)
class PlayoffContext:
    """Read-only playoff context for a single NBA game.

    Every field is JSON-serialisable. None means "not derivable from
    on-disk data" — never silently defaulted, never fabricated.
    """

    gameId: str
    dateIso: str
    isPlayoff: bool
    seasonPhase: str
    round: str | None = None
    gameNumber: int | None = None
    seriesShort: str | None = None
    eliminationFlag: bool | None = None
    homeTeam: str | None = None
    awayTeam: str | None = None
    priorGameInSeries: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "gameId": self.gameId,
            "dateIso": self.dateIso,
            "isPlayoff": self.isPlayoff,
            "seasonPhase": self.seasonPhase,
            "round": self.round,
            "gameNumber": self.gameNumber,
            "seriesShort": self.seriesShort,
            "eliminationFlag": self.eliminationFlag,
            "homeTeam": self.homeTeam,
            "awayTeam": self.awayTeam,
            "priorGameInSeries": self.priorGameInSeries,
            "notes": self.notes,
        }

    def is_home_for(self, team_abbr: str | None) -> bool | None:
        """Return True/False if `team_abbr` matches a known home/away
        for this game; `None` if the team mapping is unknown."""
        if not team_abbr or not self.homeTeam or not self.awayTeam:
            return None
        if team_abbr == self.homeTeam:
            return True
        if team_abbr == self.awayTeam:
            return False
        return None


def _load_overrides(path: str = OVERRIDE_PATH) -> dict[str, Any]:
    """Load the operator-curated playoff-series override file.

    Returns the empty mapping if the file is missing or malformed —
    callers then fall back to the date-derived context only.
    """
    if not os.path.exists(path):
        return {"games": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or "games" not in data:
            return {"games": {}}
        return data
    except (OSError, json.JSONDecodeError):
        return {"games": {}}


def _parse_iso_date(value: str) -> _date:
    return _date.fromisoformat(value)


def derive_playoff_context(
    *,
    game_id: str,
    date_iso: str,
    overrides_path: str = OVERRIDE_PATH,
) -> PlayoffContext:
    """Pure-function context derivation.

    All inputs are caller-provided; no I/O beyond reading the
    operator-curated override file. Returns a fully-populated
    `PlayoffContext` with `None` for fields the override doesn't cover.
    """
    d = _parse_iso_date(date_iso)
    is_playoff = d >= NBA_PLAYOFFS_START
    base = {
        "gameId": str(game_id),
        "dateIso": date_iso,
        "isPlayoff": is_playoff,
        "seasonPhase": "playoff" if is_playoff else "regular_season",
    }

    overrides = _load_overrides(overrides_path)
    entry = overrides.get("games", {}).get(str(game_id))
    if entry is None:
        return PlayoffContext(**base)

    return PlayoffContext(
        **base,
        round=entry.get("round"),
        gameNumber=entry.get("gameNumber"),
        seriesShort=entry.get("seriesShort"),
        eliminationFlag=entry.get("eliminationFlag"),
        homeTeam=entry.get("homeTeam"),
        awayTeam=entry.get("awayTeam"),
        priorGameInSeries=_resolve_prior_game(
            entry.get("seriesShort"),
            entry.get("gameNumber"),
            overrides,
        ),
        notes=entry.get("notes"),
    )


def _resolve_prior_game(
    series_short: str | None,
    game_number: int | None,
    overrides: dict[str, Any],
) -> str | None:
    """Find the previous game in the same series.

    Pure derivation across the override file: return the `gameId` whose
    `seriesShort` matches and whose `gameNumber == game_number - 1`.
    Returns `None` for Game 1 or when no prior game is mapped.
    """
    if not series_short or not isinstance(game_number, int) or game_number <= 1:
        return None
    target_number = game_number - 1
    for gid, entry in overrides.get("games", {}).items():
        if (
            entry.get("seriesShort") == series_short
            and entry.get("gameNumber") == target_number
        ):
            return str(gid)
    return None
