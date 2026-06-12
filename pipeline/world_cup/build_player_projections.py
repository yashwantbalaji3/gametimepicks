"""
World Cup PRE-LINEUP player projections.

Uses the sportsbook player universe (build_player_market_universe) as the candidate set, maps
each to an API-Football squad player (real id/name/photo/position), pulls recent national-team
player stats (shots/SOT/goals/assists/minutes) for a real model, and publishes pre-lineup
projections with explicit caveats. NEVER invents players, lineups, photos, or stats. Confirmed
lineups (when posted) upgrade/gate each player via lineupStatus on the next run.

Bounded: squads (1 call/team) + recent player stats (≤ N fixture-player calls/team).
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path

from .providers.api_football import ApiFootballProvider
from .projection_model import poisson_over_under, _pois_pmf
from .build_features import american_to_prob
from .player_identity import match_player, norm_join
from .soccer_policy import parlay_eligibility
from .team_aliases import norm, pair_key

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
RECENT_FIXTURES = 6          # recent finished fixtures to pull player stats from, per team
ATTACK_POS = {"Attacker", "Midfielder"}


def _squad(p: ApiFootballProvider, team_id: int) -> list[dict]:
    data = p._get("/players/squads", {"team": team_id}) or {}
    resp = (data.get("response") or [{}])
    players = (resp[0].get("players") if resp else []) or []
    return [{"id": pl.get("id"), "name": pl.get("name"), "photo": pl.get("photo"),
             "position": pl.get("position")} for pl in players if pl.get("name")]


def _recent_player_stats(p: ApiFootballProvider, team_id: int) -> dict:
    """Aggregate per-player shots/SOT/goals/assists/minutes over recent finished fixtures."""
    fx = (p._get("/fixtures", {"team": team_id, "last": RECENT_FIXTURES}) or {}).get("response", []) or []
    agg: dict = {}
    for f in fx:
        status = ((f.get("fixture") or {}).get("status") or {}).get("short")
        fid = (f.get("fixture") or {}).get("id")
        if status not in ("FT", "AET", "PEN") or not fid:
            continue
        pl = (p._get("/fixtures/players", {"fixture": fid, "team": team_id}) or {}).get("response", []) or []
        for team_block in pl:
            for row in team_block.get("players") or []:
                pid = (row.get("player") or {}).get("id")
                st = (row.get("statistics") or [{}])[0]
                mins = ((st.get("games") or {}).get("minutes")) or 0
                if pid is None or not mins:
                    continue
                a = agg.setdefault(pid, {"apps": 0, "minutes": 0, "shots": 0, "sot": 0, "goals": 0, "assists": 0,
                                          "name": (row.get("player") or {}).get("name"),
                                          "photo": (row.get("player") or {}).get("photo")})
                a["apps"] += 1; a["minutes"] += mins
                a["shots"] += ((st.get("shots") or {}).get("total")) or 0
                a["sot"] += ((st.get("shots") or {}).get("on")) or 0
                a["goals"] += ((st.get("goals") or {}).get("total")) or 0
                a["assists"] += ((st.get("goals") or {}).get("assists")) or 0
    for pid, a in agg.items():
        m = a["minutes"] or 1
        a["shots90"] = round(a["shots"] * 90 / m, 3)
        a["sot90"] = round(a["sot"] * 90 / m, 3)
        a["goals90"] = round(a["goals"] * 90 / m, 3)
        a["assists90"] = round(a["assists"] * 90 / m, 3)
    return agg


def _p_at_least_one(rate: float) -> float:
    return 1 - _pois_pmf(0, max(rate, 0.01))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    p = ApiFootballProvider()
    if not p.is_configured():
        print("[wc-player-proj] STOP API_FOOTBALL_KEY not set"); return 2

    try:
        universe = json.loads((DATA / "player-markets" / "latest.json").read_text())
    except Exception:
        print("[wc-player-proj] no player-markets universe"); return 0
    fixtures = json.loads((DATA / "stats" / "normalized-fixtures-latest.json").read_text()).get("fixtures", [])
    fix_by_pair = {pair_key((f["homeTeam"] or {}).get("name"), (f["awayTeam"] or {}).get("name")): f for f in fixtures}
    # lineups (if posted) → confirmed starter set per fixture.
    def lineup_ids(fid):
        ln = (p._get("/fixtures/lineups", {"fixture": fid}) or {}).get("response", []) or []
        starters, subs = set(), set()
        for tb in ln:
            for s in tb.get("startXI") or []:
                pid = (s.get("player") or {}).get("id")
                if pid: starters.add(pid)
            for s in tb.get("substitutes") or []:
                pid = (s.get("player") or {}).get("id")
                if pid: subs.add(pid)
        return starters, subs

    projections, identity, unmatched = [], [], []
    for match in universe.get("matches", []):
        f = fix_by_pair.get(match.get("pair"))
        if not f:
            continue
        home_t, away_t = f["homeTeam"], f["awayTeam"]
        fid = f.get("fixtureId")
        starters, subs = lineup_ids(fid)
        lineups_posted = bool(starters)
        squads = {home_t["id"]: _squad(p, home_t["id"]), away_t["id"]: _squad(p, away_t["id"])}
        stats = {home_t["id"]: _recent_player_stats(p, home_t["id"]),
                 away_t["id"]: _recent_player_stats(p, away_t["id"])}
        # Squad fallback (2026-06-12): API-Football /players/squads is often EMPTY for
        # national teams (June-12 run: Canada/USA/Paraguay all empty → 86 of 88 priced
        # players unmatched). The recent-fixture player stats we already fetched carry
        # every appearing player's real id/name/photo — derive the identity squad from
        # them at ZERO extra calls. Real API-Sports identities only; nothing invented.
        for tid in list(squads.keys()):
            if not squads[tid]:
                squads[tid] = [
                    {"id": pid, "name": a.get("name"),
                     "photo": a.get("photo") or f"https://media.api-sports.io/football/players/{pid}.png",
                     "position": None}
                    for pid, a in stats.get(tid, {}).items() if a.get("name")
                ]
        team_name = {home_t["id"]: home_t["name"], away_t["id"]: away_t["name"]}
        team_logo = {home_t["id"]: home_t.get("logo"), away_t["id"]: away_t.get("logo")}

        # Group sportsbook outcomes by player + market (pick the primary over line).
        by_player: dict = {}
        for o in match.get("players", []):
            by_player.setdefault(o["normName"], {"name": o["playerName"], "markets": {}})["markets"].setdefault(o["market"], []).append(o)

        for nm, pdata in by_player.items():
            # Identify the player against both squads; the matching squad is the team.
            matched, team_id = None, None
            for tid, sq in squads.items():
                m = match_player(pdata["name"], sq)
                if m and (matched is None or {"exact": 3, "high": 2, "medium": 1, "low": 0}[m["matchConfidence"]] >
                          {"exact": 3, "high": 2, "medium": 1, "low": 0}[matched["matchConfidence"]]):
                    matched, team_id = m, tid
            if not matched or matched["matchConfidence"] == "low":
                unmatched.append(pdata["name"]); continue
            pid = matched["id"]
            ps = stats.get(team_id, {}).get(pid, {})
            apps = ps.get("apps", 0)
            pos = matched.get("position")
            role_ok = pos in ATTACK_POS
            # Lineup status.
            if lineups_posted:
                lstatus = "confirmed_starter" if pid in starters else ("confirmed_sub" if pid in subs else "not_in_lineup")
            else:
                lstatus = "pre_lineup_likely" if apps >= 2 else "pre_lineup_unknown"
            if lstatus == "not_in_lineup":
                continue  # confirmed not playing → drop entirely
            identity.append({"sportsbookName": pdata["name"], "apiFootballPlayerId": pid,
                             "canonicalName": matched["name"], "team": team_name[team_id],
                             "matchConfidence": matched["matchConfidence"], "position": pos,
                             "photo": matched.get("photo"), "lineupStatus": lstatus})

            for mk, outs in pdata["markets"].items():
                over = next((o for o in outs if o["side"] in ("over", "yes")), None)
                under = next((o for o in outs if o["side"] == "under"), None)
                if not over:
                    continue
                line = over.get("line")
                # Market prob (de-vig 2-way when under exists; else raw implied).
                mp_over = american_to_prob(over["americanOdds"])
                if under:
                    s = mp_over + american_to_prob(under["americanOdds"])
                    mkt = mp_over / s if s else mp_over
                else:
                    mkt = mp_over
                # Model from recent rates (Poisson). No stats → market-only view (no edge).
                model, have_model = mkt, False
                if apps >= 1:
                    if mk == "player_shots" and line is not None:
                        model = poisson_over_under(ps.get("shots90", 0), line)[0]; have_model = True
                    elif mk == "player_shots_on_target" and line is not None:
                        model = poisson_over_under(ps.get("sot90", 0), line)[0]; have_model = True
                    elif mk == "player_assists":
                        model = _p_at_least_one(ps.get("assists90", 0)); have_model = True
                    elif mk == "player_goal_scorer_anytime":
                        model = _p_at_least_one(ps.get("goals90", 0)); have_model = True
                if have_model:
                    # Pre-lineup samples are tiny → heavy market anchor + a hard cap on how far the
                    # model may deviate, so noisy recent rates can't manufacture absurd edges.
                    model = 0.80 * mkt + 0.20 * model
                    model = max(mkt - 0.06, min(mkt + 0.06, model))
                edge = model - mkt
                pol = parlay_eligibility(market=mk, edge=edge, market_prob=mkt,
                                         american_odds=over["americanOdds"], sample_min=apps,
                                         lineup_ok=(lstatus in ("pre_lineup_likely", "confirmed_starter")),
                                         role_ok=role_ok, is_underdog=False)
                tier = pol["riskTier"]
                # Pre-lineup player props are never Low (Medium/High/Longshot only).
                if lstatus != "confirmed_starter" and tier == "Low":
                    tier = "Medium"
                # Player-prop market-sanity: only eligible on a defensible sample + a non-longshot,
                # non-near-cert market price + a modest (not noise-sized) edge. Otherwise view only.
                sane = (have_model and apps >= 3 and 0.30 <= mkt <= 0.82 and 0.015 <= edge <= 0.06)
                eligible = pol["parlayEligible"] and sane and lstatus != "pre_lineup_unknown"
                projections.append({
                    "id": f"wc_{args.date}_{norm(team_name[team_id])}_{norm_join(pdata['name'])}_{mk}",
                    "sport": "world_cup", "date": args.date, "matchId": fid,
                    "player": {"id": pid, "name": matched["name"], "sportsbookName": pdata["name"],
                               "team": team_name[team_id], "teamLogo": team_logo[team_id],
                               "position": pos, "photo": matched.get("photo")},
                    "market": mk, "line": line, "pick": over["side"],
                    "americanOdds": over["americanOdds"], "bookmaker": over["bookmaker"],
                    "modelProbability": round(model, 4), "marketProbability": round(mkt, 4),
                    "edgePct": round(edge * 100, 2),
                    "public": True, "parlayEligible": bool(eligible),
                    "bankBuilderEligible": False,  # pre-lineup player props never in Bank Builder
                    "projectionStatus": "parlay_eligible" if eligible else (
                        "pre_lineup_public_projection" if have_model else "pre_lineup_market_view"),
                    "riskTier": tier, "confidence": "Low", "lineupStatus": lstatus,
                    "settlementSupport": "automated", "modelHasEvidence": have_model,
                    "factors": [
                        f"Recent: {ps.get('shots90','—')} shots/90, {ps.get('sot90','—')} SOT/90, "
                        f"{ps.get('goals90','—')} goals/90 over {apps} app(s)" if apps else "no recent national-team minutes",
                        f"Position {pos or 'unknown'} · {matched['matchConfidence']} identity match",
                    ],
                    "dataCaveats": [
                        "Pre-lineup projection — confirm starter status before use" if lstatus != "confirmed_starter"
                        else "Confirmed starter (official lineup posted)",
                        "90-minute regulation only; player props grade from official player stats",
                    ],
                })

    public = [x for x in projections if x["public"]]
    eligible = [x for x in projections if x["parlayEligible"]]
    by_market = {}
    for x in projections:
        by_market[x["market"]] = by_market.get(x["market"], 0) + 1
    payload = {
        "generatedAt": now, "sport": "world_cup", "date": args.date,
        "disclaimer": "Pre-lineup player projections from sportsbook-listed players + API-Football "
                      "evidence. Candidates, not confirmed starters until lineups post. Educational/paper.",
        "lineupsPosted": any(x.get("lineupStatus", "").startswith("confirmed") for x in projections),
        "projectionCount": len(projections), "publicCount": len(public),
        "parlayEligibleCount": len(eligible), "byMarket": by_market,
        "matchedPlayers": len(identity), "unmatchedPlayers": sorted(set(unmatched))[:40],
        "matches": projections,
    }
    (DATA / "player-projections").mkdir(parents=True, exist_ok=True)
    (DATA / "player-projections" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "player-projections" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "player-markets").mkdir(parents=True, exist_ok=True)
    (DATA / "player-markets" / "player-identity-latest.json").write_text(json.dumps(
        {"generatedAt": now, "date": args.date, "matched": identity,
         "unmatched": sorted(set(unmatched))}, indent=2) + "\n")
    print(f"[wc-player-proj] calls={p.calls_made} projections={len(projections)} "
          f"eligible={len(eligible)} matched={len(identity)} unmatched={len(set(unmatched))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
