"""Build the IPL contextual projection file for a given match date.

Cricket is **projections-only** — this context file never feeds the
parlay optimizer, custom builder, or Results tracker. It's read by
the `/projections` page to surface team form, key players, venue
trends, and a pre-toss disclaimer alongside the market-derived
moneyline already produced by `pipeline.cricket.fetch_ipl_board`.

What this script automates:
  - Team form (last 5 results for each team, with score lines and W/L)
    pulled from ESPN's free cricket scoreboard endpoint.
  - Head-to-head between the two teams (last meetings from the same
    backward walk).

What this script does NOT automate:
  - Key players to watch — no free, stable, license-clean machine-
    readable source for IPL per-player recent form. We accept a
    `manual` overlay JSON co-located in
    `app/public/data/cricket/context/manual/<date>.json` and merge
    it into the output with explicit `manual: true` flags and a
    `sources` array. If the manual file is missing, the player and
    venue sections render an honest empty state.
  - Venue trends — same reason. Manual overlay only.
  - Toss / playing XI / pitch / weather — never modeled; the UI
    only carries a pre-toss disclaimer.

CLI:
    pipeline/.venv/bin/python -m pipeline.cricket.fetch_ipl_context \
        --date 2026-05-26

Writes:
    app/public/data/cricket/context/<date>.json

Honest failure mode:
    - ESPN scoreboard timeout / 5xx: write a context file with empty
      auto sections + manual overlay only. Never fabricate a result.
    - No manual overlay: emit empty `playerForm` / `venueTrends` so
      the UI can render the "data unavailable" state cleanly.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any


ESPN_BASE = (
    "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard"
)
BOARDS_DIR = os.path.join("app", "public", "data", "cricket", "boards")
OUT_DIR = os.path.join("app", "public", "data", "cricket", "context")
MANUAL_DIR = os.path.join(OUT_DIR, "manual")

# How far back to walk for team form. 28 days covers ~5 matches per
# team in a normal IPL season window.
TEAM_FORM_LOOKBACK_DAYS = 28
TEAM_FORM_MAX_MATCHES = 5
HEAD_TO_HEAD_MAX_MATCHES = 5


# ---------------------------------------------------------------------------
# ESPN cricket scoreboard backwards walk
# ---------------------------------------------------------------------------

def _fetch_espn_date(date_yyyy_mm_dd: str) -> list[dict[str, Any]]:
    iso = date_yyyy_mm_dd.replace("-", "")
    url = f"{ESPN_BASE}?dates={iso}"
    try:
        with urllib.request.urlopen(url, timeout=12) as r:
            return json.load(r).get("events", []) or []
    except Exception as ex:
        print(f"[fetch_ipl_context] ESPN {date_yyyy_mm_dd} error: {ex}",
              file=sys.stderr)
        return []


def _shape_event(event: dict[str, Any], on_date: str) -> dict[str, Any]:
    comp = (event.get("competitions") or [{}])[0]
    status = (comp.get("status") or {}).get("type", {}).get("description")
    competitors = comp.get("competitors", [])
    home = next((c for c in competitors if c.get("homeAway") == "home"), {})
    away = next((c for c in competitors if c.get("homeAway") == "away"), {})
    return {
        "date": on_date,
        "home": (home.get("team") or {}).get("abbreviation"),
        "away": (away.get("team") or {}).get("abbreviation"),
        "homeName": (home.get("team") or {}).get("displayName"),
        "awayName": (away.get("team") or {}).get("displayName"),
        "homeScore": home.get("score"),
        "awayScore": away.get("score"),
        # ESPN reports winner as a string "true"/"false" or omits it.
        "homeWinner": str(home.get("winner")).lower() == "true",
        "awayWinner": str(away.get("winner")).lower() == "true",
        "status": status,
        "shortName": event.get("shortName"),
        "longName": event.get("name"),
    }


def walk_back_events(
    start_yyyy_mm_dd: str, days: int
) -> list[dict[str, Any]]:
    """Walk backward from start_date inclusive, collecting all IPL
    events ESPN returned in that window. Results sorted most-recent
    first. Skipped silently when ESPN refuses a date."""
    start = datetime.strptime(start_yyyy_mm_dd, "%Y-%m-%d")
    out: list[dict[str, Any]] = []
    for delta in range(0, days + 1):
        d = start - timedelta(days=delta)
        date_str = d.strftime("%Y-%m-%d")
        events = _fetch_espn_date(date_str)
        for ev in events:
            shaped = _shape_event(ev, date_str)
            out.append(shaped)
    return out


def recent_form_for_team(
    events: list[dict[str, Any]],
    team_abbr: str,
    limit: int = TEAM_FORM_MAX_MATCHES,
) -> dict[str, Any]:
    """Filter the backwards walk to a team's last `limit` decisive
    matches. Skip scheduled / in-progress entries — they don't tell us
    anything about form."""
    matches: list[dict[str, Any]] = []
    for ev in events:
        if ev.get("status") not in ("Result", "Final", "Game Over"):
            continue
        if team_abbr not in (ev.get("home"), ev.get("away")):
            continue
        is_home = ev.get("home") == team_abbr
        team_won = ev.get("homeWinner") if is_home else ev.get("awayWinner")
        opp = ev.get("away") if is_home else ev.get("home")
        opp_name = ev.get("awayName") if is_home else ev.get("homeName")
        own_score = ev.get("homeScore") if is_home else ev.get("awayScore")
        opp_score = ev.get("awayScore") if is_home else ev.get("homeScore")
        matches.append({
            "date": ev["date"],
            "opponent": opp,
            "opponentName": opp_name,
            "venue": "home" if is_home else "away",
            "result": "W" if team_won else "L",
            "teamScore": own_score,
            "opponentScore": opp_score,
            "summary": ev.get("shortName"),
        })
        if len(matches) >= limit:
            break
    wins = sum(1 for m in matches if m["result"] == "W")
    losses = sum(1 for m in matches if m["result"] == "L")
    return {
        "team": team_abbr,
        "lastN": len(matches),
        "wins": wins,
        "losses": losses,
        "summary": f"{wins}W-{losses}L in last {len(matches)}",
        "matches": matches,
    }


def head_to_head(
    events: list[dict[str, Any]],
    team_a: str,
    team_b: str,
    limit: int = HEAD_TO_HEAD_MAX_MATCHES,
) -> list[dict[str, Any]]:
    """Filter the backwards walk to decisive matches between the two
    teams, most-recent first."""
    out: list[dict[str, Any]] = []
    for ev in events:
        if ev.get("status") not in ("Result", "Final", "Game Over"):
            continue
        teams = {ev.get("home"), ev.get("away")}
        if team_a not in teams or team_b not in teams:
            continue
        is_a_home = ev.get("home") == team_a
        a_won = ev.get("homeWinner") if is_a_home else ev.get("awayWinner")
        out.append({
            "date": ev["date"],
            "teamA": team_a,
            "teamB": team_b,
            "winner": team_a if a_won else team_b,
            "summary": ev.get("shortName"),
            "scoreLine": (
                f"{ev.get('home')} {ev.get('homeScore')} vs "
                f"{ev.get('away')} {ev.get('awayScore')}"
            ),
            "venue": "teamA_home" if is_a_home else "teamA_away",
        })
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------
# Manual overlay merge
# ---------------------------------------------------------------------------

def load_manual_overlay(date: str) -> dict[str, Any]:
    """Read an optional curator-maintained overlay file. The overlay
    is purely additive and carries `manual: true` flags on every
    section it touches. Sources arrays must cite the public reference
    (IPL official site / ESPNcricinfo / Cricbuzz) for every datum."""
    path = os.path.join(MANUAL_DIR, f"{date}.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception as ex:
        print(f"[fetch_ipl_context] manual overlay error: {ex}", file=sys.stderr)
        return {}


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def load_board_match(date: str) -> dict[str, Any] | None:
    p = os.path.join(BOARDS_DIR, f"{date}.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            board = json.load(f)
    except Exception:
        return None
    matches = board.get("matches") or []
    if not matches:
        return None
    return matches[0]


def build_context(date: str) -> dict[str, Any]:
    match = load_board_match(date)
    if not match:
        return {
            "date": date,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "matchId": None,
            "missingBoard": True,
            "teamForm": [],
            "playerForm": [],
            "venueTrends": None,
            "headToHead": [],
            "notes": _default_notes(),
            "sources": [],
        }
    home_abbr = (match.get("home") or {}).get("abbr")
    away_abbr = (match.get("away") or {}).get("abbr")
    venue = match.get("venue")

    events = walk_back_events(date, TEAM_FORM_LOOKBACK_DAYS)
    home_form = recent_form_for_team(events, home_abbr) if home_abbr else None
    away_form = recent_form_for_team(events, away_abbr) if away_abbr else None
    h2h = (
        head_to_head(events, home_abbr, away_abbr)
        if home_abbr and away_abbr
        else []
    )

    overlay = load_manual_overlay(date)

    # Source list — always include ESPN for the auto pulls; merge in
    # any curator-cited sources from the overlay.
    sources: list[dict[str, str]] = [{
        "name": "ESPN cricket scoreboard (league 8048)",
        "url": "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard",
        "covers": "team form + head-to-head (last 28 days)",
    }]
    for s in (overlay.get("sources") or []):
        sources.append(s)

    return {
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "matchId": match.get("matchId"),
        "shortName": match.get("shortName"),
        "venue": venue,
        "teams": {
            "home": match.get("home"),
            "away": match.get("away"),
        },
        # Auto
        "teamForm": [f for f in [home_form, away_form] if f],
        "headToHead": h2h,
        # Manual overlay (may be missing → empty)
        "playerForm": overlay.get("playerForm") or [],
        "venueTrends": overlay.get("venueTrends"),
        "matchupNotes": overlay.get("matchupNotes") or [],
        "notes": _default_notes(),
        "manualOverlayPresent": bool(overlay),
        "sources": sources,
    }


def _default_notes() -> dict[str, str]:
    return {
        "preTossWarning": (
            "Cricket projections are pre-toss. Toss outcome and playing-XI "
            "announcements (typically ~30 minutes before start) can "
            "materially change the read."
        ),
        "pitchWeatherNotModeled": (
            "We do NOT model pitch conditions, weather, or playing XI. "
            "Venue notes below come from public sources cited inline; "
            "they are descriptive, not projections."
        ),
    }


def write_context(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True, help="YYYY-MM-DD (match date)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    payload = build_context(args.date)
    if args.dry_run:
        print(json.dumps(payload, indent=2)[:3000])
        return 0
    path = write_context(args.date, payload)
    n_team_form = len(payload.get("teamForm") or [])
    n_h2h = len(payload.get("headToHead") or [])
    n_players = len(payload.get("playerForm") or [])
    overlay = "yes" if payload.get("manualOverlayPresent") else "no"
    print(
        f"[fetch_ipl_context] {args.date} · teamForm={n_team_form} "
        f"h2h={n_h2h} players={n_players} overlay={overlay} → {path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
