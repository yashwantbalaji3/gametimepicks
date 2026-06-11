"""
Bounded World Cup stats discovery via API-Football → normalized artifacts + evidence-driven
readiness. Caps total calls (free tier 100/day); one call per resource; no loops; caches via
the workflow checkout. Writes:
  app/public/data/world-cup/provider-discovery/api_football-<date>.json
  app/public/data/world-cup/stats/normalized-latest.json
  app/public/data/world-cup/stats/readiness-latest.json
Projections are NEVER produced here — only the gates. The projection engine is separate and
only runs when readiness.projectionsAllowed is true.
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path

from .providers.api_football import ApiFootballProvider, WC_LEAGUE_ID, WC_SEASON
from .readiness import compute_readiness, _odds_ready

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
MIN_TEAM_SAMPLE = 2          # need >= 2 finished matches before a team is "ready"
MAX_TEAM_STAT_CALLS = 8      # bound team-statistics probes


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    p = ApiFootballProvider()
    if not p.is_configured():
        print("[wc-stats] STOP API_FOOTBALL_KEY not set"); return 2

    # 1) Today's fixtures (1 call) — team ids come free with the fixtures.
    fx_raw = p._get("/fixtures", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "date": args.date}) or {}
    fixtures = fx_raw.get("response", []) or []
    norm_fixtures, team_ids = [], {}
    for f in fixtures:
        fix, tm = f.get("fixture", {}), f.get("teams", {})
        h, a = tm.get("home") or {}, tm.get("away") or {}
        norm_fixtures.append({
            "providerMatchId": fix.get("id"), "kickoffUtc": fix.get("date"),
            "status": (fix.get("status") or {}).get("short"),
            "homeTeam": h.get("name"), "awayTeam": a.get("name"),
            "homeTeamId": h.get("id"), "awayTeamId": a.get("id"),
            "round": (f.get("league") or {}).get("round"),
        })
        if h.get("id"): team_ids[h["id"]] = h.get("name")
        if a.get("id"): team_ids[a["id"]] = a.get("name")

    # 2) Team strength (bounded) — use the fixture team ids directly (1 call each).
    team_strength = []
    for tid, tname in list(team_ids.items())[:MAX_TEAM_STAT_CALLS]:
        s = (p._get("/teams/statistics", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "team": tid}) or {}).get("response") or {}
        played = (((s.get("fixtures") or {}).get("played") or {}).get("total")) or 0
        goals = s.get("goals") or {}
        team_strength.append({
            "teamId": tid, "team": tname, "played": int(played), "form": s.get("form"),
            "goalsFor90": (((goals.get("for") or {}).get("average") or {}).get("total")),
            "goalsAgainst90": (((goals.get("against") or {}).get("average") or {}).get("total")),
        })

    # 3) Lineups (bounded) — only present near/after kickoff.
    lineups_fixtures = 0
    for f in norm_fixtures[:4]:
        ln = (p._get("/fixtures/lineups", {"fixture": f["providerMatchId"]}) or {}).get("response", []) or []
        if ln:
            lineups_fixtures += 1

    # 4) Evidence → readiness (data-driven, fail-closed).
    evidence = {
        "teamStrengthTeams": sum(1 for t in team_strength if t["played"] >= MIN_TEAM_SAMPLE),
        "lineupsFixtures": lineups_fixtures,
        "playerStatsRows": 0,  # player-stat ingestion deferred until lineups exist
    }
    readiness = compute_readiness(p, odds_ready=_odds_ready(), evidence=evidence)
    readiness["provider"] = "api_football"
    readiness["evidence"] = evidence
    readiness["callsMade"] = p.calls_made

    normalized = {
        "generatedAt": now, "date": args.date, "provider": "api_football",
        "league": WC_LEAGUE_ID, "season": WC_SEASON,
        "fixtures": norm_fixtures, "teamStrength": team_strength,
        "lineupsFixtures": lineups_fixtures, "callsMade": p.calls_made,
    }
    discovery = {
        "generatedAt": now, "date": args.date, "provider": "api_football",
        "callsMade": p.calls_made, "fixturesCovered": len(norm_fixtures),
        "teamsCovered": len(team_ids), "teamStatsProbed": len(team_strength),
        "teamsWithSample": evidence["teamStrengthTeams"], "lineupsFixtures": lineups_fixtures,
        "note": "Bounded API-Football discovery. Projections gate on a real team-stats sample; "
                "early in the tournament (few finished matches) this stays fail-closed honestly.",
    }
    # Diagnostics — only when ZERO fixtures came back, to pin the cause (wrong league id /
    # plan season coverage) without guessing. No secret is ever written.
    if len(norm_fixtures) == 0:
        acct = (p._get("/status", {}) or {}).get("response") or {}
        lg_by_id = (p._get("/leagues", {"id": WC_LEAGUE_ID}) or {}).get("response", []) or []
        lg_search = (p._get("/leagues", {"search": "world cup"}) or {}).get("response", []) or []
        discovery["diagnostics"] = {
            "fixturesQuery": {"league": WC_LEAGUE_ID, "season": WC_SEASON, "date": args.date},
            "rawFixturesResults": fx_raw.get("results") if isinstance(fx_raw, dict) else None,
            "rawFixturesErrors": fx_raw.get("errors") if isinstance(fx_raw, dict) else None,
            "account": {
                "plan": (acct.get("subscription") or {}).get("plan"),
                "active": (acct.get("subscription") or {}).get("active"),
                "requestsLimitDay": (acct.get("requests") or {}).get("limit_day"),
            },
            "leagueId_lookup": [
                {"id": (e.get("league") or {}).get("id"), "name": (e.get("league") or {}).get("name"),
                 "seasonYears": [s.get("year") for s in (e.get("seasons") or [])]}
                for e in lg_by_id[:2]
            ],
            "worldCup_search": [
                {"id": (e.get("league") or {}).get("id"), "name": (e.get("league") or {}).get("name"),
                 "country": (e.get("country") or {}).get("name"),
                 "seasonYears": [s.get("year") for s in (e.get("seasons") or [])]}
                for e in lg_search[:8]
            ],
        }
        discovery["callsMade"] = readiness["callsMade"] = p.calls_made
    (DATA / "provider-discovery").mkdir(parents=True, exist_ok=True)
    (DATA / "stats").mkdir(parents=True, exist_ok=True)
    (DATA / "provider-discovery" / f"api_football-{args.date}.json").write_text(json.dumps(discovery, indent=2) + "\n")
    (DATA / "stats" / "normalized-latest.json").write_text(json.dumps(normalized, indent=2) + "\n")
    (DATA / "stats" / "readiness-latest.json").write_text(json.dumps(readiness, indent=2) + "\n")
    print(f"[wc-stats] calls={p.calls_made} fixtures={len(norm_fixtures)} teams={len(team_ids)} "
          f"teamsWithSample={evidence['teamStrengthTeams']} lineups={lineups_fixtures} "
          f"projectionsAllowed={readiness['projectionsAllowed']} parlayAllowed={readiness['parlayAllowed']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
