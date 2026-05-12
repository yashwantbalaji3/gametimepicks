"""
Player resolver — map Odds API player names to canonical NBA.com playerIds.

Why this exists
---------------
Before this module, generate_daily_board.py built `name_to_pid` from
team-roster lookups. Some roster providers return non-NBA-canonical IDs.
Spot check: a provider returned id=1630224 for "Anthony Edwards", but in
nba_api's static index 1630224 is Jalen Green. The pipeline then fetched
Jalen Green's game logs and attributed them to Edwards. That kind of
cross-identity bug is much worse than missing data.

Resolution strategy (in order, first hit wins):
  1. Manual alias file (pipeline/player_aliases.json) — for names where
     normalize() can't bridge the gap. Empty by default.
  2. nba_api.stats.static.players exact-match against normalized name,
     restricted to is_active=True. Single canonical source of truth.
  3. Return 0. Caller marks confidence='insufficient_data', no lean fires.

Never returns a non-zero playerId we are not confident in. False positives
(wrong player) are strictly worse than false negatives (missing data).

This module is pure. No network calls. nba_api.stats.static.players is
a bundled Python list that ships with the nba_api package.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Optional, Tuple

ResolveResult = Tuple[int, str]


def normalize_name(name: str) -> str:
    """Aggressive but suffix-preserving name normalization.

    Steps:
      - Unicode NFD decompose, drop combining marks  (Dončić -> Doncic)
      - Replace curly apostrophe U+2019 with straight '
      - Lowercase
      - Remove all chars that aren't a-z, 0-9, space, or apostrophe
      - Collapse whitespace
      - DO NOT strip suffixes (Jr/Sr/II/III/IV). Different player IDs.

    Why preserve suffixes: "Tim Hardaway" and "Tim Hardaway Jr." are two
    different NBA players with different playerIds. Stripping suffix
    would alias them and produce silent cross-identity bugs identical
    to the Edwards/Jalen Green bug this module exists to fix.
    """
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFD", name)
    no_accents = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    s = no_accents.replace("\u2019", "'").replace("\u2018", "'").replace("\u02BC", "'")
    s = s.lower()
    s = re.sub(r"[^a-z0-9' ]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


_STATIC_INDEX_CACHE: Optional[dict] = None


def _load_static_index() -> dict:
    """Load nba_api's static player list and build a normalized index."""
    global _STATIC_INDEX_CACHE
    if _STATIC_INDEX_CACHE is not None:
        return _STATIC_INDEX_CACHE

    from nba_api.stats.static import players as static_players

    by_id: dict = {}
    active_buckets: dict = {}
    all_buckets: dict = {}

    for p in static_players.get_players():
        pid = int(p["id"])
        full = p["full_name"]
        is_active = bool(p.get("is_active"))
        norm = normalize_name(full)
        by_id[pid] = full
        if not norm:
            continue
        all_buckets.setdefault(norm, []).append((pid, is_active))
        if is_active:
            active_buckets.setdefault(norm, []).append(pid)

    active = {}
    active_collisions = []
    for norm, pids in active_buckets.items():
        if len(pids) == 1:
            active[norm] = pids[0]
        else:
            active_collisions.append((norm, pids))

    all_unique = {}
    for norm, entries in all_buckets.items():
        pids = [pid for pid, _ in entries]
        if len(set(pids)) == 1:
            all_unique[norm] = pids[0]

    _STATIC_INDEX_CACHE = {
        "active": active,
        "all": all_unique,
        "by_id": by_id,
        "active_collisions": active_collisions,
    }
    return _STATIC_INDEX_CACHE


_ALIAS_CACHE: Optional[dict] = None


def _load_aliases(alias_path: Optional[Path] = None) -> dict:
    """Load the manual alias file. Returns normalized_name -> player_id."""
    global _ALIAS_CACHE
    if _ALIAS_CACHE is not None and alias_path is None:
        return _ALIAS_CACHE
    if alias_path is None:
        alias_path = Path(__file__).parent / "player_aliases.json"
    if not alias_path.exists():
        result = {}
    else:
        with open(alias_path) as f:
            raw = json.load(f)
        result = {
            normalize_name(k): int(v)
            for k, v in (raw.get("aliases") or {}).items()
            if isinstance(v, (int, str)) and str(v).isdigit()
        }
    _ALIAS_CACHE = result
    return result


def resolve_player_id(
    name: str, *, alias_path: Optional[Path] = None
) -> ResolveResult:
    """Resolve a player name to (player_id, confidence).

    Returns (0, "unknown") when no confident match is found. NEVER returns
    a guess.

    Confidence levels:
      - "alias": matched a manual override in player_aliases.json
      - "exact": matched an active player in nba_api's static index
      - "unknown": no confident match (caller should leave playerId=0)
    """
    if not name:
        return (0, "unknown")
    norm = normalize_name(name)
    if not norm:
        return (0, "unknown")

    aliases = _load_aliases(alias_path)
    if norm in aliases:
        return (aliases[norm], "alias")

    index = _load_static_index()
    if norm in index["active"]:
        return (index["active"][norm], "exact")

    return (0, "unknown")


def reset_caches():
    """Test helper. Drops both the static index and alias caches."""
    global _STATIC_INDEX_CACHE, _ALIAS_CACHE
    _STATIC_INDEX_CACHE = None
    _ALIAS_CACHE = None
