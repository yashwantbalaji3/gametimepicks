"""
ESPN public-scoreboard provider.

Tier: 3 — read-only schedule fallback. Used when nba_api is unreachable or
returns suspiciously empty for a date that has known games. Free, no key, no
auth, no scraping.

Endpoint:
  GET https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD

This is the same JSON endpoint ESPN's public website calls. It is NOT a
mobile-app endpoint and we do NOT scrape any HTML page. ESPN exposes this
publicly at site.api.espn.com — many open-source NBA tools rely on it.

Compliance:
  - We only use site.api.espn.com (the public Site API)
  - We do NOT use undocumented mobile endpoints
  - We do NOT scrape espn.com HTML
  - We cache responses and back off on 429/5xx
  - We respect ENABLE_ESPN_FALLBACK=false to disable entirely

Phase 7B-2.1: implements `fetch_schedule()` with full diagnostic shape so
the orchestrator's `resolve_schedule_for_date` can fall back to it when
nba_api returns empty / fails.

What this provider supports:
  - schedule (the scoreboard endpoint)

What this provider does NOT support — use nba_api instead:
  - rosters
  - player game logs
  - box scores
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .. import config as C
from .base import (
    Game, Player, GameLog,
    NBADataProvider,
    ProviderStatus, ProviderNotImplemented,
    ProviderRequestFailed, ProviderUnavailable,
    now_iso,
)


log = logging.getLogger(__name__)

API_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
# Athlete game logs live on the "web" API (common/v3), a different host.
GAMELOG_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba"

# ESPN team id by ESPN-native abbreviation (fetched from the public teams endpoint).
ESPN_TEAM_ID = {
    "ATL": "1", "BOS": "2", "BKN": "17", "CHA": "30", "CHI": "4", "CLE": "5",
    "DAL": "6", "DEN": "7", "DET": "8", "GS": "9", "HOU": "10", "IND": "11",
    "LAC": "12", "LAL": "13", "MEM": "29", "MIA": "14", "MIL": "15", "MIN": "16",
    "NO": "3", "NY": "18", "OKC": "25", "ORL": "19", "PHI": "20", "PHX": "21",
    "POR": "22", "SAC": "23", "SA": "24", "TOR": "28", "UTAH": "26", "WSH": "27",
}
# Standard (nba_api / odds) abbreviations that differ from ESPN's.
_ABBR_ALIASES = {"GSW": "GS", "NOP": "NO", "NYK": "NY", "SAS": "SA", "UTA": "UTAH",
                 "WAS": "WSH", "NOH": "NO", "PHO": "PHX", "BRK": "BKN"}


def _espn_team_id(team_abbr: str) -> str | None:
    a = (team_abbr or "").strip().upper()
    a = _ABBR_ALIASES.get(a, a)
    return ESPN_TEAM_ID.get(a)


def _stat_indices(labels: list[str]) -> dict[str, int]:
    """Map our markets to column indices by label (robust to column re-ordering)."""
    want = {"MIN": "minutes", "REB": "reb", "AST": "ast", "PTS": "pts"}
    out: dict[str, int] = {}
    for i, lab in enumerate(labels or []):
        if lab in want:
            out[want[lab]] = i
    return out


def _to_int(s) -> int:
    try:
        return int(round(float(str(s).strip())))
    except Exception:
        return 0


def _to_float(s) -> float:
    try:
        return float(str(s).strip())
    except Exception:
        return 0.0


def _parse_roster_athletes(data: dict, team_abbr: str) -> list:
    """ESPN team roster JSON -> list[Player]. Pure (testable offline)."""
    out: list[Player] = []
    for a in (data or {}).get("athletes", []) or []:
        if not isinstance(a, dict):
            continue
        pid = a.get("id")
        name = a.get("displayName") or a.get("fullName")
        if not pid or not name:
            continue
        pos = ((a.get("position") or {}).get("abbreviation")) or ""
        status = ((a.get("status") or {}).get("type")) or (a.get("status") or {}).get("name") or "Active"
        out.append(Player(player_id=_to_int(pid), player_name=str(name),
                          team_abbr=team_abbr, position=str(pos),
                          status=str(status).title() if status else "Active"))
    return out


def _parse_gamelog(data: dict, player_id: int, last_n: int = 10) -> list:
    """ESPN athlete gamelog JSON -> list[GameLog], newest first, postseason then
    regular season, capped at last_n. Pure (testable offline). Never invents rows."""
    if not isinstance(data, dict):
        return []
    idx = _stat_indices(data.get("labels") or [])
    if "pts" not in idx:
        return []
    meta = data.get("events") or {}  # eventId -> {atVs, gameDate, opponent, ...}

    def _flatten(season_types: list, postseason: bool) -> list:
        rows = []
        for s in season_types or []:
            name = (s.get("displayName") or "").lower()
            is_post = "post" in name
            if is_post != postseason:
                continue
            seen_ids = set()
            for cat in s.get("categories") or []:
                for e in cat.get("events") or []:
                    eid = str(e.get("eventId") or "")
                    if not eid or eid in seen_ids:
                        continue
                    seen_ids.add(eid)
                    stats = e.get("stats") or []
                    if len(stats) <= idx["pts"]:
                        continue
                    m = meta.get(eid, {}) if isinstance(meta, dict) else {}
                    opp = m.get("opponent")
                    opp_abbr = opp.get("abbreviation") if isinstance(opp, dict) else (opp or "")
                    home_away = "Home" if m.get("atVs") == "vs" else "Away"
                    gdate = str(m.get("gameDate") or m.get("date") or "")[:10]
                    rows.append(GameLog(
                        player_id=int(player_id),
                        game_date=gdate, opponent_abbr=str(opp_abbr or ""),
                        home_away=home_away,
                        minutes=_to_float(stats[idx["minutes"]]) if "minutes" in idx and len(stats) > idx["minutes"] else 0.0,
                        pts=_to_int(stats[idx["pts"]]),
                        reb=_to_int(stats[idx["reb"]]) if "reb" in idx and len(stats) > idx["reb"] else 0,
                        ast=_to_int(stats[idx["ast"]]) if "ast" in idx and len(stats) > idx["ast"] else 0,
                    ))
        return rows

    season_types = data.get("seasonTypes") or []
    # Collect postseason + regular, then sort by game_date DESC so "recent N" is the
    # genuine most-recent N games regardless of how the API orders its arrays.
    rows = _flatten(season_types, postseason=True) + _flatten(season_types, postseason=False)
    rows.sort(key=lambda g: g.game_date, reverse=True)
    return rows[:last_n]


# ---------------------------------------------------------------------------
# Cache (mirrors odds_api_provider's pattern)
# ---------------------------------------------------------------------------
def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(" ", "_")
    return C.CACHE_DIR / f"espn_{safe}.json"


def _cache_get(key: str) -> object | None:
    """Return cached JSON if fresh, else None. ESPN scoreboard is fast-changing
    near tipoff, so we use a short TTL — 30 minutes by default."""
    path = _cache_path(key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        cached_at = datetime.fromisoformat(payload["cached_at"])
        age_min = (datetime.now(timezone.utc) - cached_at).total_seconds() / 60.0
        ttl_min = 30  # ESPN: short TTL because scoreboard updates often
        if age_min < ttl_min:
            return payload["data"]
    except Exception:
        return None
    return None


def _cache_put(key: str, data: object) -> None:
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(key)
    try:
        path.write_text(json.dumps({
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }))
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------
class EspnProvider(NBADataProvider):
    name = "espn_scoreboard"
    tier = 3
    requires_api_key = False
    supported = {"schedule", "rosters", "game_logs"}

    def __init__(self) -> None:
        self._last_status = "not_run"
        self._last_error: str | None = None
        self._last_run_at: str | None = None

    def get_status(self) -> ProviderStatus:
        enabled = bool(C.ENABLE_ESPN_FALLBACK)
        notes = (
            "ESPN public scoreboard JSON. Free, no auth, no scraping. "
            "Used as a schedule-only fallback when nba_api fails or returns "
            "empty. Set ENABLE_ESPN_FALLBACK=false to disable."
        )
        return ProviderStatus(
            name=self.name,
            kind="nba",
            tier=self.tier,
            enabled=enabled,
            requires_api_key=False,
            api_key_configured=True,
            is_demo=False,
            is_stub=False,
            last_status=self._last_status if enabled else "disabled",
            last_error=self._last_error,
            last_run_at=self._last_run_at,
            notes=notes,
        )

    # ------------------------------------------------------------------
    # Schedule
    # ------------------------------------------------------------------
    def fetch_schedule(self, date: str) -> list[Game]:
        """Fetch schedule from ESPN public scoreboard.

        Args:
            date: YYYY-MM-DD in pipeline TZ

        Raises:
            ProviderUnavailable: if the fallback is disabled
            ProviderRequestFailed: on network/parse errors

        Returns: list of Game (possibly empty)
        """
        if not C.ENABLE_ESPN_FALLBACK:
            raise ProviderUnavailable(
                "ESPN fallback disabled — set ENABLE_ESPN_FALLBACK=true"
            )

        yyyymmdd = date.replace("-", "")
        cache_key = f"scoreboard_{yyyymmdd}"
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return self._parse(cached, date)

        # Two retries on transient errors. ESPN's API is generous but not
        # guaranteed — back off if it complains.
        last_err: Exception | None = None
        try:
            import requests
        except ImportError as e:
            self._mark_err(str(e))
            raise ProviderUnavailable(f"requests not installed: {e}") from e

        for attempt in range(C.HTTP_MAX_RETRIES):
            try:
                r = requests.get(
                    f"{API_BASE}/scoreboard",
                    params={"dates": yyyymmdd, "limit": 1000},
                    timeout=C.HTTP_TIMEOUT_SECONDS,
                    headers={"User-Agent": "GametimePicks/0.5 (+https://github.com/yashwantbalaji3/gametimepicks)"},
                )
                if r.status_code in (429, 503):
                    # Rate limited / overloaded — back off and retry
                    last_err = Exception(f"ESPN status {r.status_code}")
                    if attempt < C.HTTP_MAX_RETRIES - 1:
                        time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
                    continue
                r.raise_for_status()
                data = r.json()
                _cache_put(cache_key, data)
                self._mark_ok()
                return self._parse(data, date)
            except Exception as e:
                last_err = e
                if attempt < C.HTTP_MAX_RETRIES - 1:
                    time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))

        self._mark_err(str(last_err))
        raise ProviderRequestFailed(
            f"ESPN scoreboard request failed: {last_err}"
        )

    def _parse(self, data: dict, date: str) -> list[Game]:
        """Parse the ESPN scoreboard response into our Game dataclasses."""
        if not isinstance(data, dict):
            return []
        events = data.get("events") or []
        games: list[Game] = []
        seen_pairs: set[tuple[str, str]] = set()

        for ev in events:
            if not isinstance(ev, dict):
                continue
            comps = ev.get("competitions") or []
            if not comps:
                continue
            comp = comps[0] if isinstance(comps[0], dict) else None
            if not comp:
                continue
            competitors = comp.get("competitors") or []
            if len(competitors) < 2:
                continue

            home_c = next(
                (c for c in competitors if isinstance(c, dict) and c.get("homeAway") == "home"),
                None,
            )
            away_c = next(
                (c for c in competitors if isinstance(c, dict) and c.get("homeAway") == "away"),
                None,
            )
            if not home_c or not away_c:
                continue
            home_team = home_c.get("team") or {}
            away_team = away_c.get("team") or {}

            home_abbr = str(home_team.get("abbreviation") or "")
            away_abbr = str(away_team.get("abbreviation") or "")
            if not home_abbr or not away_abbr:
                continue

            pair = (home_abbr, away_abbr)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            tipoff_iso = ev.get("date") or comp.get("date") or ""
            tipoff_et = self._format_tipoff_et(tipoff_iso)

            # ESPN's "displayName" is the long form, e.g. "New York Knicks"
            home_full = str(home_team.get("displayName") or home_team.get("name") or "")
            away_full = str(away_team.get("displayName") or away_team.get("name") or "")

            # Status — "Scheduled" / "Postponed" / "Canceled" / "Final" etc
            status_raw = (
                (comp.get("status") or {}).get("type", {}).get("name")
                or "Scheduled"
            )
            # Normalize to our common "Scheduled" / "Final" set
            if "FINAL" in status_raw.upper():
                game_status = "Final"
            elif any(x in status_raw.upper() for x in ("POSTPONED", "CANCEL", "SUSPEND")):
                game_status = status_raw.split("_")[-1].title()
            else:
                game_status = "Scheduled"

            games.append(Game(
                game_id=str(ev.get("id") or comp.get("id") or ""),
                date=date,
                tipoff_et=tipoff_et,
                home_team_abbr=home_abbr,
                home_team_full=home_full,
                away_team_abbr=away_abbr,
                away_team_full=away_full,
                status=game_status,
            ))

        return games

    def _format_tipoff_et(self, iso_utc: str) -> str:
        """Convert ESPN's UTC ISO timestamp to a human-friendly ET string."""
        if not iso_utc:
            return "TBD"
        try:
            iso_clean = iso_utc.replace("Z", "+00:00")
            dt_utc = datetime.fromisoformat(iso_clean)
            dt_et = dt_utc.astimezone(ZoneInfo(C.TIMEZONE))
            # Use a portable time format. %-I works on Linux/macOS but not
            # Windows; strip leading zero manually for cross-platform safety.
            hour_12 = dt_et.strftime("%I").lstrip("0") or "12"
            mins = dt_et.strftime("%M")
            ampm = dt_et.strftime("%p")
            return f"{hour_12}:{mins} {ampm} ET"
        except Exception:
            return "TBD"

    # ------------------------------------------------------------------
    # HTTP helper (requests; retry/backoff; short cache) — reused by roster + gamelog
    # ------------------------------------------------------------------
    def _get_json(self, url: str, cache_key: str, params: dict | None = None) -> dict:
        if not C.ENABLE_ESPN_FALLBACK:
            raise ProviderUnavailable("ESPN fallback disabled — set ENABLE_ESPN_FALLBACK=true")
        cached = _cache_get(cache_key)
        if cached is not None:
            self._mark_ok()
            return cached
        try:
            import requests
        except ImportError as e:
            self._mark_err(str(e))
            raise ProviderUnavailable(f"requests not installed: {e}") from e
        last_err: Exception | None = None
        for attempt in range(C.HTTP_MAX_RETRIES):
            try:
                r = requests.get(
                    url, params=params or {}, timeout=C.HTTP_TIMEOUT_SECONDS,
                    headers={"User-Agent": "GametimePicks/0.5 (+https://github.com/yashwantbalaji3/gametimepicks)"},
                )
                if r.status_code in (429, 503):
                    last_err = Exception(f"ESPN status {r.status_code}")
                    if attempt < C.HTTP_MAX_RETRIES - 1:
                        time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
                    continue
                r.raise_for_status()
                data = r.json()
                _cache_put(cache_key, data)
                self._mark_ok()
                return data
            except Exception as e:  # noqa: BLE001 — bounded retry boundary
                last_err = e
                if attempt < C.HTTP_MAX_RETRIES - 1:
                    time.sleep(C.HTTP_BACKOFF_SECONDS * (attempt + 1))
        self._mark_err(str(last_err))
        raise ProviderRequestFailed(f"ESPN request failed ({url}): {last_err}")

    # ------------------------------------------------------------------
    # Rosters + player game logs (free ESPN JSON; works where stats.nba.com is blocked)
    # ------------------------------------------------------------------
    def fetch_team_roster(self, team_abbr: str) -> list[Player]:
        tid = _espn_team_id(team_abbr)
        if not tid:
            raise ProviderRequestFailed(f"espn: unknown team abbr '{team_abbr}'")
        data = self._get_json(f"{API_BASE}/teams/{tid}/roster", f"roster_{tid}")
        return _parse_roster_athletes(data, team_abbr)

    def fetch_player_game_logs(self, player_id: int, last_n: int = 10) -> list[GameLog]:
        data = self._get_json(f"{GAMELOG_BASE}/athletes/{int(player_id)}/gamelog",
                              f"gamelog_{int(player_id)}")
        logs = _parse_gamelog(data, int(player_id), last_n=last_n)
        if not logs:
            raise ProviderRequestFailed(
                f"espn: no game-log rows parsed for athlete {player_id}")
        return logs

    def fetch_box_score(self, game_id: str) -> list[GameLog]:
        raise ProviderNotImplemented(
            "espn.fetch_box_score — not supported by this provider"
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _mark_ok(self) -> None:
        self._last_status = "ok"
        self._last_error = None
        self._last_run_at = now_iso()

    def _mark_err(self, msg: str) -> None:
        self._last_status = "error"
        self._last_error = msg
        self._last_run_at = now_iso()
