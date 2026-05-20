"""NBA team-game projection — aggregate player props into a team view.

Pure-function aggregator. Given an NBA board file (which already
contains per-player `projection` values produced by the existing
scoring model), this module emits a per-game artifact with:

  * each team's primary-rotation projected PTS sum (just the players
    we have on the board — not a true team total because bench-only
    players don't carry props)
  * projected margin + winner
  * a list of contributing players per team
  * playoff context (round / gameNumber / homeTeam / awayTeam) when
    available from `pipeline/playoff_context.py`
  * market spread / moneyline placeholders that are populated **only**
    when the underlying odds are present on disk; never fabricated

What this module deliberately does NOT do:
  * Change any player projection
  * Change any player confidence tier
  * Add a "lean" the model didn't earn
  * Synthesize moneyline / spread when no real odds exist

Honest framing for the UI:
  * The aggregated PTS is the **primary-rotation projected scoring**
    — the sum of just the players who happen to have prop lines.
    Bench scoring is not included. The confidence cap reflects that.
  * If market lines aren't on disk, the artifact carries
    `marketSpread: null`, `marketMoneyline: null`, and the UI shows
    "market line pending" honestly.

Output artifact lives at:
  `app/public/data/nba/team_projections/<date>.json`

So future audit work can join settled actual scores against the
projection and quantify error without re-running the model.
"""
from __future__ import annotations

import json
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from . import playoff_context as PC
from . import team_rosters as TR


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PlayerContribution:
    """One row of the projected-points breakdown for a single team."""

    playerId: int | None
    playerName: str
    market: str
    line: float | None
    projection: float | None
    confidence: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "playerId": self.playerId,
            "playerName": self.playerName,
            "market": self.market,
            "line": self.line,
            "projection": self.projection,
            "confidence": self.confidence,
        }


@dataclass(frozen=True)
class TeamProjection:
    """One team-side row of the per-game projection."""

    teamAbbr: str
    isHome: bool | None
    projectedPts: float
    contributingPlayerCount: int
    contributions: list[PlayerContribution]

    def to_dict(self) -> dict[str, Any]:
        return {
            "teamAbbr": self.teamAbbr,
            "isHome": self.isHome,
            "projectedPts": round(self.projectedPts, 2),
            "contributingPlayerCount": self.contributingPlayerCount,
            "contributions": [c.to_dict() for c in self.contributions],
        }


@dataclass(frozen=True)
class GameProjection:
    """One game's aggregated team projection + market placeholders.

    `confidence` is conservative by design:
      * "low"    — fewer than 6 contributing players per team OR no
                   playoff-context override on file OR a data-quality
                   flag is set
      * "medium" — 6–9 contributing players AND playoff context present
                   AND no data-quality flag
      * "high"   — 10+ contributing players AND playoff context present
                   AND a real market line exists for comparison

    `dataQualityFlag` is `"team_attribution_partial"` when fewer than
    3 contributors are attributed to either side. The May 20 board
    is the canonical example: the upstream `generate_daily_board.py`
    failed to tag the SAS players' team field; the artifact still
    publishes everything we can derive, but the UI uses this flag to
    surface a partial-data note instead of presenting a margin as
    authoritative.
    """

    sport: str
    date: str
    gameId: str
    matchup: str  # e.g. "SA @ OKC"
    home: TeamProjection
    away: TeamProjection
    projectedMargin: float  # home minus away (positive = home favored)
    projectedWinner: str | None
    playoffContext: dict[str, Any]
    marketSpread: float | None
    marketMoneyline: dict[str, int] | None
    confidence: str
    reasons: list[str]
    dataQualityFlag: str | None
    publicDisplayMode: str  # "full" | "withheld"
    generatedAt: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "sport": self.sport,
            "date": self.date,
            "gameId": self.gameId,
            "matchup": self.matchup,
            "home": self.home.to_dict(),
            "away": self.away.to_dict(),
            "projectedMargin": round(self.projectedMargin, 2),
            "projectedWinner": self.projectedWinner,
            "playoffContext": self.playoffContext,
            "marketSpread": self.marketSpread,
            "marketMoneyline": self.marketMoneyline,
            "confidence": self.confidence,
            "reasons": self.reasons,
            "dataQualityFlag": self.dataQualityFlag,
            "publicDisplayMode": self.publicDisplayMode,
            "generatedAt": self.generatedAt,
        }


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def _resolve_team_from_lean(
    lean: dict[str, Any],
    home_team: str | None,
    away_team: str | None,
    player_team_map: dict[int, str] | None = None,
) -> str | None:
    """Return the team abbreviation for a lean.

    Falls back through four trusted sources, in priority order:
      1. The lean's own `team` field (most reliable when populated).
      2. `player_team_map[playerId]` — looked up against the
         `players.json` roster passed in by the caller. This rescues
         leans where the upstream `generate_daily_board.py` failed to
         attribute the player's team (a real production bug seen on
         May 19 NY-side and May 20 SA-side leans).
      3. Static playoff-roster lookup via `pipeline/team_rosters.py`.
         When players.json itself has empty `team` (the actual May 20
         shape — every SAS player came through with team="" because
         the nba_api roster fetch silently dropped them), this static
         map resolves the team from the player name. Only the players
         currently in playoff coverage are mapped; others return None.
      4. None when no trusted source matches.

    **Note on the missing homeAway fallback:** earlier revisions used
    `lean.homeAway` as a last-resort signal. We removed that because
    the upstream pipeline defaults `home_away = "Home"` whenever the
    name→team lookup fails — which means an empty `team` + `homeAway`
    = "Home" is the *exact* signature of a broken attribution, not a
    trustworthy hint. Dropping unattributed leans is more honest than
    routing them to whichever side the pipeline guessed by default.
    """
    team_field = (lean.get("team") or "").strip()
    if team_field:
        return team_field
    pid = lean.get("playerId")
    if player_team_map and isinstance(pid, int):
        mapped = player_team_map.get(pid)
        if mapped:
            return mapped
    # Static-roster rescue. Honest: only the playoff teams in
    # team_rosters.py have entries; anyone else returns None.
    name = (lean.get("playerName") or "").strip()
    if name:
        from_static = TR.team_for_player(name)
        if from_static:
            return from_static
    return None


def _best_lean_per_player_market(
    leans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Collapse duplicates so a single (playerId, market) only counts
    once toward the team total. Picks the lean with the largest
    absolute edge as the canonical row (matches how the homepage
    Trending block already de-dupes)."""
    best: dict[tuple, dict[str, Any]] = {}
    for l in leans:
        if l.get("lean") not in ("Over", "Under"):
            continue
        if l.get("market") != "PTS":  # team total uses PTS only
            continue
        proj = l.get("projection")
        if not isinstance(proj, (int, float)):
            continue
        pid = l.get("playerId")
        if pid is None:
            continue
        key = (pid, l.get("market"))
        edge = abs(l.get("edgePct") or 0.0)
        cur = best.get(key)
        if cur is None or edge > abs(cur.get("edgePct") or 0.0):
            best[key] = l
    return list(best.values())


def _confidence_label(
    home_n: int,
    away_n: int,
    has_playoff_context: bool,
    has_market_line: bool,
    data_quality_flag: str | None,
) -> str:
    if data_quality_flag is not None:
        return "low"
    min_n = min(home_n, away_n)
    if min_n < 6 or not has_playoff_context:
        return "low"
    if min_n >= 10 and has_market_line:
        return "high"
    return "medium"


# A side is "thin" (data-quality concern) when fewer than this many
# distinct players were resolved to it. May 20 SA = 0 → flagged.
DATA_QUALITY_MIN_PER_SIDE = 3


def derive_public_display_mode(
    *,
    home_contributors: int,
    away_contributors: int,
    data_quality_flag: str | None,
) -> str:
    """Decide whether the public UI shows the projected score/margin.

    The public card must suppress the projected score, margin, winner,
    and market-line lean whenever:

      * `dataQualityFlag` is set (e.g. team_attribution_partial), OR
      * either side has zero contributors (no players resolved to it).

    Both conditions catch impossible-looking outputs like the
    May 20 OKC 218.2 / SA 0.0 readout. The artifact still carries
    every raw number for the audit; this function only governs the
    visible card.

    Returns:
      "full"     — render projected score / margin / winner / market.
      "withheld" — render an honest "Team view unavailable" panel.
    """
    if data_quality_flag is not None:
        return "withheld"
    if home_contributors <= 0 or away_contributors <= 0:
        return "withheld"
    return "full"


def project_game(
    *,
    sport: str,
    date: str,
    game: dict[str, Any],
    leans: list[dict[str, Any]],
    odds_lines: dict[str, Any] | None = None,
    player_team_map: dict[int, str] | None = None,
    overrides_path: str = PC.OVERRIDE_PATH,
    now: datetime | None = None,
) -> GameProjection:
    """Build the team-game projection for one game.

    Args:
        sport: "NBA" (kept generic for future MLB version).
        date: YYYY-MM-DD.
        game: the board's game dict — must carry `gameId`,
            `awayTeamAbbr`, `homeTeamAbbr`.
        leans: full list of leans on the board (caller passes the whole
            board.leans; we filter to this game's `gameId` here).
        odds_lines: optional dict with `h2h` / `spreads` markets
            keyed by gameId. Pass `None` when market lines aren't on
            disk — confidence stays low and `marketSpread` / `marketMoneyline`
            stay None.
        overrides_path: path to the playoff-series override file
            (overridable for tests).
        now: pinning for tests; defaults to current UTC.
    """
    now = now or datetime.now(timezone.utc)
    game_id = str(game.get("gameId"))
    matchup = f"{game.get('awayTeamAbbr','?')} @ {game.get('homeTeamAbbr','?')}"

    ctx = PC.derive_playoff_context(
        game_id=game_id,
        date_iso=date,
        overrides_path=overrides_path,
    )
    home_team = ctx.homeTeam or game.get("homeTeamAbbr") or None
    away_team = ctx.awayTeam or game.get("awayTeamAbbr") or None

    # Filter leans to this game + the best lean per (player, market).
    game_leans = [l for l in leans if str(l.get("gameId")) == game_id]
    canonical = _best_lean_per_player_market(game_leans)

    # Split contributions by team.
    contribs_by_team: dict[str, list[PlayerContribution]] = defaultdict(list)
    for l in canonical:
        team = _resolve_team_from_lean(
            l, home_team, away_team, player_team_map=player_team_map,
        )
        if team is None:
            continue
        contribs_by_team[team].append(
            PlayerContribution(
                playerId=l.get("playerId"),
                playerName=l.get("playerName", ""),
                market=l.get("market", ""),
                line=l.get("line"),
                projection=l.get("projection"),
                confidence=l.get("confidence"),
            )
        )

    def _team(team: str | None, expect_home: bool) -> TeamProjection:
        rows = contribs_by_team.get(team or "", [])
        total = sum(r.projection or 0.0 for r in rows)
        is_home = ctx.is_home_for(team) if team else None
        if is_home is None:
            # fall back to the explicit argument when override doesn't
            # know the team mapping (e.g., regular-season games)
            is_home = expect_home if (team and (home_team or away_team)) else None
        return TeamProjection(
            teamAbbr=team or "?",
            isHome=is_home,
            projectedPts=total,
            contributingPlayerCount=len(rows),
            contributions=rows,
        )

    home = _team(home_team, expect_home=True)
    away = _team(away_team, expect_home=False)

    margin = home.projectedPts - away.projectedPts
    winner: str | None
    if margin > 0:
        winner = home.teamAbbr
    elif margin < 0:
        winner = away.teamAbbr
    else:
        winner = None

    # Market line resolution. Only populate when explicit data is
    # present — never fabricate.
    market_spread: float | None = None
    market_moneyline: dict[str, int] | None = None
    if odds_lines:
        per_game = odds_lines.get(game_id) or {}
        if isinstance(per_game.get("spread"), (int, float)):
            market_spread = float(per_game["spread"])
        ml = per_game.get("moneyline")
        if (
            isinstance(ml, dict)
            and "home" in ml
            and "away" in ml
            and isinstance(ml.get("home"), int)
            and isinstance(ml.get("away"), int)
        ):
            market_moneyline = {"home": ml["home"], "away": ml["away"]}

    # Data-quality flag — fires when one side has too few resolved
    # contributors. Surfaces the May 19/20 production bug (team field
    # empty on every SA-side lean) instead of pretending a 218-pt
    # margin is real.
    data_quality_flag: str | None = None
    if (
        home.contributingPlayerCount < DATA_QUALITY_MIN_PER_SIDE
        or away.contributingPlayerCount < DATA_QUALITY_MIN_PER_SIDE
    ):
        data_quality_flag = "team_attribution_partial"

    conf = _confidence_label(
        home_n=home.contributingPlayerCount,
        away_n=away.contributingPlayerCount,
        has_playoff_context=ctx.round is not None,
        has_market_line=market_spread is not None,
        data_quality_flag=data_quality_flag,
    )

    reasons: list[str] = [
        f"Sum of {home.contributingPlayerCount + away.contributingPlayerCount} primary-rotation PTS projections (bench scoring not modeled).",
    ]
    if ctx.round:
        reasons.append(
            f"Playoff context: {ctx.round} Game {ctx.gameNumber} "
            f"({ctx.seriesShort})."
        )
    else:
        reasons.append("No playoff-series override on file for this gameId.")
    if market_spread is None:
        reasons.append("Market spread / moneyline not on disk — comparison pending.")
    if data_quality_flag == "team_attribution_partial":
        reasons.append(
            "Data-quality flag: one team has fewer than "
            f"{DATA_QUALITY_MIN_PER_SIDE} resolved contributors — the "
            "upstream player→team map is incomplete, so the margin is "
            "partial. UI surfaces this honestly instead of treating it "
            "as authoritative."
        )

    public_display_mode = derive_public_display_mode(
        home_contributors=home.contributingPlayerCount,
        away_contributors=away.contributingPlayerCount,
        data_quality_flag=data_quality_flag,
    )

    return GameProjection(
        sport=sport,
        date=date,
        gameId=game_id,
        matchup=matchup,
        home=home,
        away=away,
        projectedMargin=margin,
        projectedWinner=winner,
        playoffContext=ctx.to_dict(),
        marketSpread=market_spread,
        marketMoneyline=market_moneyline,
        confidence=conf,
        reasons=reasons,
        dataQualityFlag=data_quality_flag,
        publicDisplayMode=public_display_mode,
        generatedAt=now.isoformat(timespec="seconds"),
    )


def project_board(
    *,
    sport: str,
    date: str,
    board: dict[str, Any],
    odds_lines: dict[str, Any] | None = None,
    player_team_map: dict[int, str] | None = None,
    overrides_path: str = PC.OVERRIDE_PATH,
    now: datetime | None = None,
) -> list[GameProjection]:
    """Run `project_game` for every game on the board. Pure function."""
    games = board.get("games", []) or []
    leans = board.get("leans", []) or []
    return [
        project_game(
            sport=sport,
            date=date,
            game=g,
            leans=leans,
            odds_lines=odds_lines,
            player_team_map=player_team_map,
            overrides_path=overrides_path,
            now=now,
        )
        for g in games
    ]


def load_player_team_map(
    path: str = os.path.join("app", "public", "data", "players.json"),
) -> dict[int, str]:
    """Read the canonical `players.json` and return `{playerId: team}`.

    Returns an empty mapping when the file is missing or malformed —
    callers will then fall back to `homeAway` only (and accept that
    leans missing both `team` and a roster entry get dropped).
    """
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    players = data.get("players") if isinstance(data, dict) else None
    if not isinstance(players, list):
        return {}
    out: dict[int, str] = {}
    for row in players:
        if not isinstance(row, dict):
            continue
        pid = row.get("playerId")
        team = row.get("team")
        if isinstance(pid, int) and isinstance(team, str) and team:
            out[pid] = team
    return out


def write_team_projection_artifact(
    *,
    date: str,
    projections: list[GameProjection],
    out_dir: str = os.path.join(
        "app", "public", "data", "nba", "team_projections"
    ),
) -> str:
    """Serialise projections to `<out_dir>/<date>.json` atomically."""
    os.makedirs(out_dir, exist_ok=True)
    payload = {
        "_disclaimer": (
            "Aggregated from per-player PTS projections on the matching "
            "/nba/board file. The sum reflects only players who carry "
            "prop lines (bench scoring is not modeled). Market spread / "
            "moneyline are populated only when real odds exist on disk; "
            "never fabricated. Educational only — not betting advice."
        ),
        "sport": "NBA",
        "date": date,
        "generatedAt": projections[0].generatedAt if projections else None,
        "games": [p.to_dict() for p in projections],
    }
    path = os.path.join(out_dir, f"{date}.json")
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)
    return path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    import argparse

    p = argparse.ArgumentParser(
        description="Build the NBA team-game projection artifact for a date."
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument(
        "--board",
        default=None,
        help="Path to the board.json (default: app/public/data/boards/<date>.json)",
    )
    p.add_argument(
        "--out-dir",
        default=os.path.join("app", "public", "data", "nba", "team_projections"),
    )
    args = p.parse_args(argv)

    board_path = args.board or os.path.join(
        "app", "public", "data", "boards", f"{args.date}.json"
    )
    with open(board_path, "r", encoding="utf-8") as f:
        board = json.load(f)

    player_team_map = load_player_team_map()
    projections = project_board(
        sport="NBA",
        date=args.date,
        board=board,
        player_team_map=player_team_map,
    )
    out = write_team_projection_artifact(
        date=args.date, projections=projections, out_dir=args.out_dir
    )
    for g in projections:
        print(
            f"[team_projection] {args.date} {g.matchup} → "
            f"{g.home.teamAbbr} {g.home.projectedPts:.1f} - "
            f"{g.away.projectedPts:.1f} {g.away.teamAbbr} "
            f"(margin {g.projectedMargin:+.1f}, winner "
            f"{g.projectedWinner or 'tie'}, conf {g.confidence})"
        )
    print(f"[team_projection] wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
