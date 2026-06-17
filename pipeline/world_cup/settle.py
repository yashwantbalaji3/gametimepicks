"""
World Cup settlement — grades PUBLIC (active) model picks from the official FULL-TIME
regulation score. 90-minute markets only; extra time / penalties are excluded (we read the
FT regulation result, never AET/PEN). Market Outlook is informational and is NEVER settled.

Score sources (first available wins):
  1. `--scores <path>` — an operator-verified official-scores artifact (fetched from the ESPN
     FIFA World Cup scoreboard/summary APIs — the same official-source family used for prior
     NBA settlements). Each entry carries matchId, homeGoals, awayGoals, status == "FT".
  2. API-Football `/fixtures` (requires API_FOOTBALL_KEY) when no scores file is given.

Pure grading core (grade_moneyline / grade_total / grade_double_chance) is unit-tested;
`main()` is the bounded runner (grades only finished matches). Idempotent: never alters
pre-game odds/lines, only writes graded results for finished matches — re-running with the
same inputs produces the same graded output.
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path

from .providers.api_football import ApiFootballProvider

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
FINISHED = ("FT", "AET", "PEN")  # match is over; we still grade on regulation goals only

# Double-chance picks cover two of the three 90-minute outcomes; the pick loses
# only when the single uncovered outcome lands.
DOUBLE_CHANCE_COVERS = {
    "home_or_draw": ("home", "draw"),
    "away_or_draw": ("away", "draw"),
    "home_or_away": ("home", "away"),
    # standard 1X2 double-chance codes (the form the projection artifact uses)
    "1X": ("home", "draw"),
    "X2": ("away", "draw"),
    "12": ("home", "away"),
}


def _regulation_result(home_goals: int, away_goals: int) -> str:
    if home_goals > away_goals:
        return "home"
    if home_goals < away_goals:
        return "away"
    return "draw"


def grade_moneyline(pick_side: str, home_goals: int, away_goals: int) -> str:
    """Grade a 90-minute 3-way moneyline from the regulation score. Draw is a real outcome."""
    return "win" if pick_side == _regulation_result(home_goals, away_goals) else "loss"


def grade_double_chance(pick: str, home_goals: int, away_goals: int) -> str:
    """Grade a 90-minute double chance from the regulation score.

    `pick` ∈ {home_or_draw, away_or_draw, home_or_away}. A "team A or team B"
    pick (home_or_away) LOSES on a draw — the draw is the one uncovered outcome.
    Unknown pick formats are never guessed: returns "ungradeable".
    """
    covers = DOUBLE_CHANCE_COVERS.get(pick)
    if covers is None:
        return "ungradeable"
    return "win" if _regulation_result(home_goals, away_goals) in covers else "loss"


def grade_total(pick: str, line: float, home_goals: int, away_goals: int) -> str:
    """Grade an over/under total from regulation goals. `pick` ∈ {over, under}; .5 lines never push."""
    total = home_goals + away_goals
    if total == line:
        return "push"
    over = total > line
    if pick == "over":
        return "win" if over else "loss"
    return "win" if not over else "loss"


DNB_SIDE = {"home": "home", "1": "home", "away": "away", "2": "away"}


def grade_draw_no_bet(pick: str, home_goals: int, away_goals: int) -> str:
    """Grade a 90-minute draw-no-bet. A draw VOIDS the bet (stake refunded → push)."""
    side = DNB_SIDE.get(str(pick).lower())
    if side is None:
        return "ungradeable"
    result = _regulation_result(home_goals, away_goals)
    if result == "draw":
        return "push"  # draw no bet → refund
    return "win" if result == side else "loss"


def grade_btts(pick: str, home_goals: int, away_goals: int) -> str:
    """Grade both-teams-to-score (yes/no) from regulation goals."""
    both = home_goals > 0 and away_goals > 0
    p = str(pick).lower()
    if p not in ("yes", "no"):
        return "ungradeable"
    if p == "yes":
        return "win" if both else "loss"
    return "win" if not both else "loss"


def grade_pick(pick: dict, home_goals: int, away_goals: int) -> str | None:
    """Dispatch a projection pick to its market grader. None = unsupported market."""
    market = pick.get("market")
    if market == "moneyline_90":
        return grade_moneyline(pick["pick"], home_goals, away_goals)
    if market == "double_chance":
        return grade_double_chance(pick["pick"], home_goals, away_goals)
    if market == "match_total_goals":
        return grade_total(pick["pick"], pick["line"], home_goals, away_goals)
    if market == "draw_no_bet":
        return grade_draw_no_bet(pick["pick"], home_goals, away_goals)
    if market == "btts":
        return grade_btts(pick["pick"], home_goals, away_goals)
    return None


def _regulation_goals(fixture: dict) -> tuple[int, int] | None:
    """Regulation (FT) goals from an API-Football fixture, or None if not finished/parseable."""
    status = ((fixture.get("fixture") or {}).get("status") or {}).get("short")
    if status not in FINISHED:
        return None
    g = fixture.get("goals") or {}
    h, a = g.get("home"), g.get("away")
    if not isinstance(h, int) or not isinstance(a, int):
        return None
    return h, a


def load_official_scores(path: Path) -> dict:
    """Load an operator-verified official-scores artifact → {matchId: match-entry}.

    Only entries with status == "FT" and integer goals are accepted — an unfinished
    or malformed entry is dropped, never guessed.
    """
    doc = json.loads(Path(path).read_text())
    out = {}
    for m in doc.get("matches", []):
        h, a = m.get("homeGoals"), m.get("awayGoals")
        if m.get("status") in FINISHED and isinstance(h, int) and isinstance(a, int) and m.get("matchId") is not None:
            out[m["matchId"]] = m
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--scores", help="path to an operator-verified official-scores JSON (skips API-Football)")
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pf = DATA / "projections" / "latest.json"
    projections = json.loads(pf.read_text()).get("matches", []) if pf.exists() else []
    # ONLY grade parlay-eligible picks (the ones published as suggested legs) — never public-only
    # probability views, never research/gated, never the market outlook.
    gradeable = [p for p in projections if p.get("parlayEligible") is True and p.get("pick")]
    if not gradeable:
        print("[wc-settle] no public/active World Cup picks to settle — nothing graded")
        (DATA / "settlement").mkdir(parents=True, exist_ok=True)
        (DATA / "settlement" / "latest.json").write_text(json.dumps(
            {"generatedAt": now, "date": args.date, "graded": [], "note": "no public picks"}, indent=2) + "\n")
        return 0

    scores_by_match: dict = {}
    source = "api_football"
    calls = 0
    provider = None
    if args.scores:
        scores_by_match = load_official_scores(Path(args.scores))
        source = "espn_scoreboard (official FT scores, operator-verified)"
        if not scores_by_match:
            print("[wc-settle] STOP scores file has no finished matches"); return 2
    else:
        provider = ApiFootballProvider()
        if not provider.is_configured():
            print("[wc-settle] STOP API_FOOTBALL_KEY not set (or pass --scores)"); return 2

    fixture_cache, graded, finals = {}, [], {}
    for pick in gradeable:
        mid = pick.get("matchId")
        if mid is None:
            continue
        if args.scores:
            entry = scores_by_match.get(mid)
            reg = (entry["homeGoals"], entry["awayGoals"]) if entry else None
        else:
            if mid not in fixture_cache:
                resp = (provider._get("/fixtures", {"id": mid}) or {}).get("response", []) or []
                fixture_cache[mid] = resp[0] if resp else None
            fx = fixture_cache[mid]
            reg = _regulation_goals(fx) if fx else None
        if reg is None:
            continue  # not finished yet — never settled early
        h, a = reg
        outcome = grade_pick(pick, h, a)
        if outcome is None or outcome == "ungradeable":
            continue
        if mid not in finals:
            finals[mid] = {
                "matchId": mid,
                "match": f"{pick.get('homeTeam', '')} vs {pick.get('awayTeam', '')}".strip(),
                "regulationScore": f"{h}-{a}",
            }
            if args.scores and mid in scores_by_match:
                m = scores_by_match[mid]
                if isinstance(m.get("corners"), dict):
                    finals[mid]["corners"] = m["corners"]
        graded.append({"id": pick["id"], "matchId": mid, "market": pick["market"],
                       "pick": pick.get("pickLabel"), "regulationScore": f"{h}-{a}", "outcome": outcome})

    calls = provider.calls_made if provider else 0
    artifact = {
        "generatedAt": now,
        "date": args.date,
        "calls": calls,
        "settlementSource": source,
        "finals": sorted(finals.values(), key=lambda f: str(f["matchId"])),
        "graded": graded,
    }
    (DATA / "settlement").mkdir(parents=True, exist_ok=True)
    payload = json.dumps(artifact, indent=2, ensure_ascii=False) + "\n"
    (DATA / "settlement" / "latest.json").write_text(payload)
    (DATA / "settlement" / f"{args.date}.json").write_text(payload)
    print(f"[wc-settle] graded={len(graded)} finals={len(finals)} calls={calls} source={source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
