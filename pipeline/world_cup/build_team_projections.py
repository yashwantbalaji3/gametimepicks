"""
World Cup team-level projections (90-minute moneyline + match total) for a date.

Bounded API-Football usage: fixtures for the ET date + next UTC date (≤2 calls) → map to
today's schedule games → recent form per involved team (≤1 call/team). A pure Poisson model
(projection_model) anchored to the de-vigged Odds-API market is applied ONLY where real
recent-form evidence exists. Writes projections + updated readiness. NEVER projects a fixture
that can't map to odds, and never echoes the market without independent form (returns no pick).
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone, timedelta
from pathlib import Path

from .providers.api_football import ApiFootballProvider, WC_LEAGUE_ID, WC_SEASON
from .projection_model import (
    project_match, TeamForm, classify_projection, UNDERDOG_MARKET_FLOOR,
)
from .build_features import is_underdog_side
from .team_aliases import norm, pair_key

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"


def _american_to_prob(o):
    return (100.0 / (o + 100.0)) if o > 0 else (-o / (-o + 100.0))


def _risk_tier(american: int) -> str:
    if american < 100:
        return "Low"
    if american < 250:
        return "Medium"
    if american < 600:
        return "High"
    return "Longshot"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    p = ApiFootballProvider()
    if not p.is_configured():
        print("[wc-proj] STOP API_FOOTBALL_KEY not set"); return 2

    # Schedule's today (ET) games + the Odds-API outlook.
    sched = json.loads((DATA / "schedule.json").read_text()).get("matches", [])
    today_games = [m for m in sched if m.get("date") == args.date]
    outlook = json.loads((DATA / "market-outlook-latest.json").read_text())
    outlook_by_pair = {pair_key(m.get("homeTeam"), m.get("awayTeam")): m for m in outlook.get("matches", [])}

    # API-Football fixtures: ET date + next UTC date (covers late-night kickoffs). ≤2 calls.
    nxt = (datetime.fromisoformat(args.date) + timedelta(days=1)).date().isoformat()
    fixtures = []
    for d in (args.date, nxt):
        fixtures += (p._get("/fixtures", {"league": WC_LEAGUE_ID, "season": WC_SEASON, "date": d}) or {}).get("response", []) or []
    fix_by_pair = {}
    for f in fixtures:
        tm = f.get("teams") or {}
        h, a = tm.get("home") or {}, tm.get("away") or {}
        fix_by_pair[pair_key(h.get("name"), a.get("name"))] = f

    projections, normalized_fixtures, form_cache = [], [], {}
    teams_with_sample = 0
    for g in today_games:
        pk = pair_key(g.get("home"), g.get("away"))
        fx = fix_by_pair.get(pk)
        ol = outlook_by_pair.get(pk)
        if not fx or not ol or ol.get("status") != "ready":
            continue
        tm = fx.get("teams") or {}
        home_t, away_t = tm.get("home") or {}, tm.get("away") or {}
        # Recent form (bounded, cached per team).
        def form_for(tid):
            if tid not in form_cache:
                form_cache[tid] = p.recent_form(tid, last=8)
            return form_cache[tid]
        hf, af = form_for(home_t.get("id")), form_for(away_t.get("id"))
        normalized_fixtures.append({
            "fixtureId": (fx.get("fixture") or {}).get("id"), "date": args.date,
            "kickoffUtc": (fx.get("fixture") or {}).get("date"),
            "homeTeam": {"id": home_t.get("id"), "name": home_t.get("name"), "logo": home_t.get("logo")},
            "awayTeam": {"id": away_t.get("id"), "name": away_t.get("name"), "logo": away_t.get("logo")},
            "venue": ((fx.get("fixture") or {}).get("venue") or {}).get("name"),
            "homeForm": hf, "awayForm": af, "source": "api_football",
        })
        if (hf.get("played") or 0) >= 2:
            teams_with_sample += 1
        if (af.get("played") or 0) >= 2:
            teams_with_sample += 1

        res = ol.get("result") or {}
        market_hda = (res.get("homeWinPct"), res.get("drawPct"), res.get("awayWinPct"))
        if None in market_hda:
            continue
        totals = ol.get("totals") or {}
        proj = project_match(
            market_hda,
            TeamForm(hf.get("goalsFor90"), hf.get("goalsAgainst90"), hf.get("played") or 0),
            TeamForm(af.get("goalsFor90"), af.get("goalsAgainst90"), af.get("played") or 0),
            total_line=totals.get("line"), market_over=totals.get("overPct"),
        )
        if not proj.get("moneyline"):
            continue  # no independent evidence → market outlook only, not a projection
        opp_adj = bool(proj.get("opponentAdjusted"))
        sample_min = proj.get("sampleMin", 0)
        ml = proj["moneyline"]
        sides = [
            ("home", g["home"], ml["home"], market_hda[0], res.get("homeOdds")),
            ("draw", "Draw", ml["draw"], market_hda[1], res.get("drawOdds")),
            ("away", g["away"], ml["away"], market_hda[2], res.get("awayOdds")),
        ]
        # ML headline pick = best model edge AMONG sides that clear market sanity (>= floor).
        # This structurally stops an extreme underdog (e.g. South Africa 11%) from ever being the
        # headline pick. If none clears sanity, fall back to best edge overall (it will classify
        # gated_market_sanity and stay non-public).
        sane = [s for s in sides if s[3] is not None and s[3] >= UNDERDOG_MARKET_FLOOR]
        pick_pool = sane or sides
        pick_side, pick_name, mp, mkt, odds = max(pick_pool, key=lambda s: s[2] - s[3])
        ml_status, ml_public, ml_reason = classify_projection(
            market_prob=mkt, model_prob=mp, market_type="moneyline_90",
            sample_min=sample_min, opponent_adjusted=opp_adj,
            is_underdog=is_underdog_side(odds, mkt),
        )
        common = {
            "sport": "world_cup", "date": args.date,
            "matchId": (fx.get("fixture") or {}).get("id"),
            "homeTeam": g["home"], "awayTeam": g["away"],
            "kickoffUtc": (fx.get("fixture") or {}).get("date"),
            "homeLogo": home_t.get("logo"), "awayLogo": away_t.get("logo"),
            "regulationOnly": True, "sampleSizeWarning": proj.get("sampleSizeWarning", True),
            "provider": "api_football", "oddsProvider": "odds_api",
        }
        projections.append({
            **common,
            "id": f"wc_{args.date}_{norm(g['home'])}_{norm(g['away'])}_ml_{pick_side}",
            "market": "moneyline_90", "pick": pick_side, "pickLabel": pick_name, "line": None,
            "americanOdds": odds, "bookmaker": res.get("bookmaker"),
            "modelProbability": round(mp, 4), "marketProbability": round(mkt, 4),
            "edgePct": round((mp - mkt) * 100, 2),
            "confidence": proj.get("confidence"),
            "projectionStatus": ml_status, "public": ml_public, "statusReason": ml_reason,
            "riskTier": _risk_tier(int(odds)) if odds else "Medium",
            "factors": [
                f"Recent form: {g['home']} {hf.get('goalsFor90')}–{hf.get('goalsAgainst90')} GF/GA per match (last {hf.get('played')})",
                f"Recent form: {g['away']} {af.get('goalsFor90')}–{af.get('goalsAgainst90')} GF/GA per match (last {af.get('played')})",
                f"Model expected goals {proj.get('expGoals',{}).get('home')}–{proj.get('expGoals',{}).get('away')}",
                f"Market-implied {pick_name} {round(mkt*100)}% · model weight {proj.get('modelWeight')}",
            ],
            "notes": ["90-minute regulation only (Draw is a real outcome; no extra time/penalties)",
                      "Market-anchored model; recent form is opponent-unadjusted so its weight is capped low",
                      ml_reason],
        })
        # Match total projection (independent over/under).
        if proj.get("total"):
            t = proj["total"]
            over_edge = t["over"] - (totals.get("overPct") or 0)
            tside, tprob, tmkt, todds = ("over", t["over"], totals.get("overPct"), totals.get("overOdds")) if over_edge >= 0 else ("under", t["under"], totals.get("underPct"), totals.get("underOdds"))
            t_status, t_public, t_reason = classify_projection(
                market_prob=tmkt or 0, model_prob=tprob, market_type="match_total_goals",
                sample_min=sample_min, opponent_adjusted=opp_adj, is_underdog=False,
            )
            projections.append({
                **common,
                "id": f"wc_{args.date}_{norm(g['home'])}_{norm(g['away'])}_total_{tside}",
                "market": "match_total_goals", "pick": tside, "pickLabel": f"{tside.title()} {t['line']}",
                "line": t["line"], "americanOdds": todds, "bookmaker": res.get("bookmaker"),
                "modelProbability": round(tprob, 4), "marketProbability": round(tmkt or 0, 4),
                "edgePct": round((tprob - (tmkt or 0)) * 100, 2),
                "confidence": "Low",
                "projectionStatus": t_status, "public": t_public, "statusReason": t_reason,
                "riskTier": _risk_tier(int(todds)) if todds else "Low",
                "factors": [f"Model expected total {round((proj['expGoals']['home']+proj['expGoals']['away']),2)} goals",
                            f"Market total line {t['line']} (Over {round((totals.get('overPct') or 0)*100)}%) · model weight {proj.get('modelWeight')}"],
                "notes": ["90-minute regulation goals only", t_reason],
            })

    active = [p for p in projections if p.get("projectionStatus") == "active" and p.get("public")]
    status_counts = {}
    for p in projections:
        status_counts[p["projectionStatus"]] = status_counts.get(p["projectionStatus"], 0) + 1
    payload = {
        "generatedAt": now, "sport": "world_cup", "date": args.date,
        "provider": "api_football", "oddsProvider": "odds_api",
        "disclaimer": "GameTime Picks model projections — 90-minute regulation only. Educational/paper, not betting advice.",
        "methodology": "Market-anchored Poisson (market prior >= ~0.89 on opening day; recent-form "
                       "weight capped, reduced when opponent-unadjusted). Market-sanity + sample + "
                       "feature + edge gates; only `active` projections are public.",
        "matchCount": len(today_games), "projectionCount": len(projections),
        "activeCount": len(active), "public": len(active) > 0,
        "methodologyReviewRequired": True, "statusCounts": status_counts,
        "matches": projections,
    }
    (DATA / "projections").mkdir(parents=True, exist_ok=True)
    (DATA / "projections" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "projections" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")

    # Update readiness with the real evidence.
    rd = json.loads((DATA / "stats" / "readiness-latest.json").read_text())
    rd["teamStatsReady"] = teams_with_sample > 0
    rd["teamProjectionsReady"] = len(projections) > 0
    rd["projectionsAllowed"] = len(projections) > 0  # artifacts exist (incl. research/gated)
    # PUBLIC gate (methodology upgrade): only `active` projections may show publicly. On opening
    # day, with opponent-unadjusted thin form, picks classify research_only/gated → 0 active →
    # projectionsPublic=false → public sees Market Outlook + "under review". Honest, not noisy.
    rd["projectionsPublic"] = len(active) > 0
    rd["methodologyReviewRequired"] = True
    rd["fixturesReady"] = len(normalized_fixtures) > 0
    rd["teamLogosReady"] = any(f["homeTeam"].get("logo") for f in normalized_fixtures)
    rd["evidence"] = {**rd.get("evidence", {}), "teamFormTeams": teams_with_sample,
                      "projections": len(projections), "activeProjections": len(active),
                      "projectionStatusCounts": status_counts}
    rd["projectionReasons"] = [] if active else (
        ["projections produced but none cleared the upgraded market-sanity/sample/edge gates "
         "(opponent-unadjusted thin form) → held under methodology review"] if projections
        else ["no mappable fixture+odds with recent-form sample yet"])
    (DATA / "stats" / "readiness-latest.json").write_text(json.dumps(rd, indent=2) + "\n")
    (DATA / "stats" / "normalized-fixtures-latest.json").write_text(json.dumps({"generatedAt": now, "date": args.date, "fixtures": normalized_fixtures}, indent=2) + "\n")
    print(f"[wc-proj] calls={p.calls_made} games={len(today_games)} projections={len(projections)} teamsWithForm={teams_with_sample}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
