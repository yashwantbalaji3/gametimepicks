"""
Manual news overrides — reader module.

Phase 7B-1 free-only stack: instead of an automated news/injury feed, the
operator (you) maintains a JSON file of manually-confirmed signals at:

    pipeline/manual_overrides/news_signals.json

Each entry has:
  - provenance (sourceName, sourceType, sourceUrl)
  - subject (playerName, team, optional gameId)
  - classification (updateType, impact, confidence)
  - model action (none / flag_risk / reduce_minutes / increase_usage /
                 remove_from_board / manual_review_required)
  - lifecycle (createdAt, expiresAt, manuallyConfirmed=True)

This module:
  - Loads + parses the JSON safely (returns empty list on any failure)
  - Filters expired signals
  - Provides match() helper to find signals applying to a (player, team, game)

It does NOT:
  - Scrape, fetch, or auto-ingest from any external source
  - Mutate the JSON file
  - Make claims about signal accuracy (that's the operator's job)

See docs/news_overrides.md for the operator workflow.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

log = logging.getLogger("gtp.manual_overrides")

# ---------------------------------------------------------------------------
# Default file locations
# ---------------------------------------------------------------------------
THIS_DIR = Path(__file__).resolve().parent
DEFAULT_PATH = THIS_DIR / "news_signals.json"
SCHEDULE_OVERRIDES_PATH = THIS_DIR / "schedule_overrides.json"


# ---------------------------------------------------------------------------
# Allowed enums
# ---------------------------------------------------------------------------
SOURCE_TYPES = {"official", "reporter", "provider", "manual"}
UPDATE_TYPES = {
    "injury", "trade", "lineup", "minutes", "rest",
    "transaction", "coaching", "personal", "other",
}
IMPACT_LEVELS = {"low", "medium", "high"}
MODEL_ACTIONS = {
    "none",
    "flag_risk",
    "reduce_minutes",
    "increase_usage",
    "remove_from_board",
    "manual_review_required",
}


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------
@dataclass
class NewsSignal:
    """A single manually-confirmed news signal."""
    id: str
    createdAt: str          # ISO 8601 with timezone
    expiresAt: str          # ISO 8601 with timezone
    sourceName: str
    sourceType: str         # one of SOURCE_TYPES
    sourceUrl: str
    playerName: str         # may be "" for team-wide signals
    team: str               # team abbreviation
    gameId: str | None
    updateType: str         # one of UPDATE_TYPES
    note: str
    confidence: float       # 0.0 - 1.0
    impact: str             # one of IMPACT_LEVELS
    modelAction: str        # one of MODEL_ACTIONS
    manuallyConfirmed: bool = True
    sourceReliability: float = 0.85   # default; operator may override

    def to_json(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def _validate(raw: dict) -> NewsSignal | None:
    """Return a NewsSignal or None if malformed. Logs why on failure."""
    try:
        # Required fields
        for field_name in ("id", "createdAt", "expiresAt", "sourceName",
                           "sourceType", "playerName", "team",
                           "updateType", "note", "modelAction"):
            if field_name not in raw:
                log.warning(f"signal missing required field '{field_name}': "
                            f"{raw.get('id', '<no-id>')}")
                return None

        # Enum checks
        if raw["sourceType"] not in SOURCE_TYPES:
            log.warning(f"signal {raw['id']}: invalid sourceType "
                        f"'{raw['sourceType']}' (allowed: {SOURCE_TYPES})")
            return None
        if raw["updateType"] not in UPDATE_TYPES:
            log.warning(f"signal {raw['id']}: invalid updateType "
                        f"'{raw['updateType']}' (allowed: {UPDATE_TYPES})")
            return None
        impact = raw.get("impact", "medium")
        if impact not in IMPACT_LEVELS:
            log.warning(f"signal {raw['id']}: invalid impact '{impact}'")
            return None
        if raw["modelAction"] not in MODEL_ACTIONS:
            log.warning(f"signal {raw['id']}: invalid modelAction "
                        f"'{raw['modelAction']}'")
            return None

        return NewsSignal(
            id=str(raw["id"]),
            createdAt=str(raw["createdAt"]),
            expiresAt=str(raw["expiresAt"]),
            sourceName=str(raw["sourceName"]),
            sourceType=str(raw["sourceType"]),
            sourceUrl=str(raw.get("sourceUrl", "")),
            playerName=str(raw["playerName"]),
            team=str(raw["team"]).upper(),
            gameId=str(raw["gameId"]) if raw.get("gameId") else None,
            updateType=str(raw["updateType"]),
            note=str(raw["note"]),
            confidence=float(raw.get("confidence", 0.7)),
            impact=str(impact),
            modelAction=str(raw["modelAction"]),
            manuallyConfirmed=bool(raw.get("manuallyConfirmed", True)),
            sourceReliability=float(raw.get("sourceReliability", 0.85)),
        )
    except (TypeError, ValueError, KeyError) as e:
        log.warning(f"signal validation error: {e}")
        return None


def _is_expired(signal: NewsSignal, now: datetime) -> bool:
    try:
        expires = datetime.fromisoformat(signal.expiresAt)
        # Make tz-aware comparison safe
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires <= now
    except (ValueError, TypeError):
        # Malformed date → treat as expired so we don't apply it
        log.warning(f"signal {signal.id}: malformed expiresAt "
                    f"'{signal.expiresAt}' — treating as expired")
        return True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def load_signals(path: Path | None = None) -> list[NewsSignal]:
    """Load and validate all non-expired signals from the JSON file.

    Returns an empty list if the file is missing, malformed, or empty —
    the pipeline is expected to function regardless.
    """
    p = path or DEFAULT_PATH
    if not p.exists():
        log.info(f"manual overrides file not found at {p} — skipping")
        return []

    try:
        raw = json.loads(p.read_text())
    except json.JSONDecodeError as e:
        log.warning(f"manual overrides file is not valid JSON: {e}")
        return []

    if not isinstance(raw, dict) or "signals" not in raw:
        log.warning(f"manual overrides file missing top-level 'signals' key")
        return []

    signals_raw = raw.get("signals") or []
    if not isinstance(signals_raw, list):
        log.warning("manual overrides 'signals' is not a list")
        return []

    now = datetime.now(timezone.utc)
    valid: list[NewsSignal] = []
    expired_count = 0
    invalid_count = 0

    for entry in signals_raw:
        signal = _validate(entry)
        if signal is None:
            invalid_count += 1
            continue
        if _is_expired(signal, now):
            expired_count += 1
            continue
        valid.append(signal)

    log.info(f"manual overrides: {len(valid)} active, "
             f"{expired_count} expired, {invalid_count} invalid")
    return valid


def signals_for_lean(
    signals: Sequence[NewsSignal],
    *,
    player_name: str,
    team: str,
    game_id: str | None = None,
) -> list[NewsSignal]:
    """Return the subset of signals that apply to a given lean.

    Match rules (in order, most specific first):
      1. signal.playerName matches player_name → match
      2. signal.team matches team AND signal.playerName == "" → team-wide
      3. signal.gameId matches game_id (if both present) → game-wide

    A signal can match more than one rule; we return all matching signals.
    """
    out: list[NewsSignal] = []
    pn = player_name.strip().lower()
    tm = team.strip().upper()
    for s in signals:
        s_pn = s.playerName.strip().lower()
        s_tm = s.team.strip().upper()
        # Player-specific
        if s_pn and s_pn == pn:
            out.append(s)
            continue
        # Team-wide (no player set)
        if not s_pn and s_tm == tm:
            out.append(s)
            continue
        # Game-wide
        if game_id and s.gameId and s.gameId == game_id:
            out.append(s)
    return out


def aggregate_model_action(signals: Sequence[NewsSignal]) -> str:
    """Reduce a list of signals to a single model action.

    Priority: remove_from_board > manual_review_required > flag_risk
              > reduce_minutes > increase_usage > none

    If the lean has competing actions (e.g. remove_from_board AND
    increase_usage), the most conservative action wins.
    """
    if not signals:
        return "none"
    priorities = [
        "remove_from_board",
        "manual_review_required",
        "flag_risk",
        "reduce_minutes",
        "increase_usage",
        "none",
    ]
    actions = {s.modelAction for s in signals}
    for action in priorities:
        if action in actions:
            return action
    return "none"


def signals_to_json(signals: Iterable[NewsSignal]) -> list[dict]:
    """Serialize signals for inclusion in board.json output."""
    return [s.to_json() for s in signals]


# ---------------------------------------------------------------------------
# Phase 7B-1.2 — Manual schedule overrides
# ---------------------------------------------------------------------------
@dataclass
class ManualScheduleEntry:
    """One date's worth of manually-verified games."""
    date: str                       # YYYY-MM-DD
    sourceType: str                 # always "manual_schedule_override"
    sourceName: str                 # operator label, e.g. "User-verified"
    sourceUrl: str                  # where the operator confirmed the games
    games: list[dict]               # game dicts in board.json shape


def load_schedule_override(
    date: str,
    path: Path | None = None,
) -> ManualScheduleEntry | None:
    """Return the manual schedule entry for a given date, or None.

    Used as a safety net by the orchestrator when nba_api returns empty/fails
    for a date that has known games. Returns None if the file is missing,
    malformed, or has no entry for this date — caller decides what to do.
    """
    p = path or SCHEDULE_OVERRIDES_PATH
    if not p.exists():
        return None

    try:
        raw = json.loads(p.read_text())
    except json.JSONDecodeError as e:
        log.warning(f"schedule_overrides.json invalid JSON: {e}")
        return None

    if not isinstance(raw, dict) or "schedules" not in raw:
        log.warning("schedule_overrides.json missing top-level 'schedules' key")
        return None

    schedules = raw.get("schedules") or []
    if not isinstance(schedules, list):
        return None

    for entry in schedules:
        if not isinstance(entry, dict):
            continue
        if entry.get("date") != date:
            continue
        # Validate minimal shape — every game needs the keys board.json expects
        games_raw = entry.get("games")
        if not isinstance(games_raw, list):
            log.warning(f"schedule override for {date}: games is not a list")
            return None
        required_keys = {
            "gameId", "tipoff", "homeTeamAbbr", "homeTeamFull",
            "awayTeamAbbr", "awayTeamFull", "status",
        }
        valid_games: list[dict] = []
        for g in games_raw:
            if not isinstance(g, dict):
                continue
            missing = required_keys - g.keys()
            if missing:
                log.warning(
                    f"schedule override for {date}: game missing keys {missing}"
                )
                continue
            valid_games.append({**g, "date": date})

        return ManualScheduleEntry(
            date=date,
            sourceType=str(entry.get("sourceType", "manual_schedule_override")),
            sourceName=str(entry.get("sourceName", "User-verified")),
            sourceUrl=str(entry.get("sourceUrl", "")),
            games=valid_games,
        )

    return None


def has_schedule_overrides_file(path: Path | None = None) -> bool:
    """Returns True if a schedule_overrides.json exists at all."""
    p = path or SCHEDULE_OVERRIDES_PATH
    return p.exists()
