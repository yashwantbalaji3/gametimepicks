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
    project_ensemble, classify_v2, poisson_over_under, UNDERDOG_MARKET_FLOOR,
)
from .build_features import is_underdog_side, american_to_prob
from .soccer_policy import parlay_eligibility
from .team_strength import points_for, rank_for, strength_expected_goals, opponent_adjust
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
    corner_cache = {}
    teams_with_sample = 0
    # Real corner-total odds (from discover_markets), keyed by team pair. Empty if not fetched.
    try:
        corner_odds = json.loads((DATA / "markets" / "corner-odds-latest.json").read_text()).get("byPair", {})
    except Exception:
        corner_odds = {}
    try:
        dc_odds = json.loads((DATA / "markets" / "double-chance-odds-latest.json").read_text()).get("byPair", {})
    except Exception:
        dc_odds = {}
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

        # --- Strength prior (real FIFA points) + opponent-adjusted recent form ---
        home_pts, away_pts = points_for(g["home"]), points_for(g["away"])
        strength_missing = home_pts is None or away_pts is None
        strength_exp = strength_expected_goals(home_pts, away_pts) if not strength_missing else None
        adj_h = opponent_adjust(hf.get("goalsFor90"), hf.get("goalsAgainst90"), hf.get("opponents"))
        adj_a = opponent_adjust(af.get("goalsFor90"), af.get("goalsAgainst90"), af.get("opponents"))
        sample_min = min(hf.get("played") or 0, af.get("played") or 0)
        opp_cov = min(adj_h.get("coverage") or 0.0, adj_a.get("coverage") or 0.0)
        form_exp = None
        if adj_h.get("attack") is not None and adj_a.get("attack") is not None:
            form_exp = (max((adj_h["attack"] + adj_a["defense"]) / 2, 0.15),
                        max((adj_a["attack"] + adj_h["defense"]) / 2, 0.15))

        proj = project_ensemble(
            market_hda, strength_exp=strength_exp, form_exp=form_exp,
            sample_min=sample_min, opp_coverage=opp_cov,
            total_line=totals.get("line"), market_over=totals.get("overPct"),
        )
        # No independent evidence at all (no strength AND no form) → market outlook only.
        if not proj.get("usedStrength") and not proj.get("usedForm"):
            continue
        opp_adj = bool(proj.get("usedForm")) and opp_cov > 0
        wts = proj.get("weights", {})
        ml = proj["moneyline"]
        sides = [
            ("home", g["home"], ml["home"], market_hda[0], res.get("homeOdds")),
            ("draw", "Draw", ml["draw"], market_hda[1], res.get("drawOdds")),
            ("away", g["away"], ml["away"], market_hda[2], res.get("awayOdds")),
        ]
        # ML headline pick = best model edge AMONG sides that clear market sanity (>= floor), so
        # an extreme underdog (e.g. South Africa 11%) can never be the headline pick.
        sane = [s for s in sides if s[3] is not None and s[3] >= UNDERDOG_MARKET_FLOOR]
        pick_pool = sane or sides
        pick_side, pick_name, mp, mkt, odds = max(pick_pool, key=lambda s: s[2] - s[3])
        # Public PROBABILITY VIEW — all three outcomes (model vs market). Always shown.
        ml_outcomes = [
            {"label": s[1], "side": s[0], "modelProbability": round(s[2], 4),
             "marketProbability": round(s[3], 4), "americanOdds": s[4]}
            for s in sides
        ]
        ml_public, _ev2, ml_status, ml_reason = classify_v2(
            market_prob=mkt, model_prob=mp, market_type="moneyline_90",
            sample_min=sample_min, is_underdog=is_underdog_side(odds, mkt),
            strength_missing=strength_missing,
        )
        # Hybrid parlay eligibility (soccer-specific thresholds, lower than the old wall).
        ml_pol = parlay_eligibility(
            market="moneyline_90", edge=mp - mkt, market_prob=mkt, american_odds=odds,
            sample_min=sample_min, is_underdog=is_underdog_side(odds, mkt),
        )
        ml_eligible = ml_pol["parlayEligible"]
        if ml_eligible:
            ml_status = "parlay_eligible"; ml_reason = ml_pol["reason"]
        hr, ar = rank_for(g["home"]), rank_for(g["away"])
        strength_factor = (
            f"FIFA strength: {g['home']} {f'#{hr}' if hr else 'unranked'} ({home_pts or '—'}) vs "
            f"{g['away']} {f'#{ar}' if ar else 'unranked'} ({away_pts or '—'})"
        )
        ensemble_factor = (
            f"Ensemble weights — market {wts.get('market')}, strength {wts.get('strength')}, "
            f"form {wts.get('form')} (opponent coverage {round(opp_cov*100)}%)"
        )
        common = {
            "sport": "world_cup", "date": args.date,
            "matchId": (fx.get("fixture") or {}).get("id"),
            "homeTeam": g["home"], "awayTeam": g["away"],
            "kickoffUtc": (fx.get("fixture") or {}).get("date"),
            "homeLogo": home_t.get("logo"), "awayLogo": away_t.get("logo"),
            "regulationOnly": True, "sampleSizeWarning": proj.get("sampleSizeWarning", True),
            "opponentStrengthCoverage": round(opp_cov, 2),
            "provider": "api_football", "oddsProvider": "odds_api", "modelVersion": "wc-ensemble-v2",
        }
        projections.append({
            **common,
            "id": f"wc_{args.date}_{norm(g['home'])}_{norm(g['away'])}_ml",
            "market": "moneyline_90", "pick": pick_side if ml_eligible else None,
            "pickLabel": pick_name if ml_eligible else None, "line": None,
            "americanOdds": odds, "bookmaker": res.get("bookmaker"),
            "modelProbability": round(mp, 4), "marketProbability": round(mkt, 4),
            "edgePct": round((mp - mkt) * 100, 2), "outcomes": ml_outcomes,
            "confidence": proj.get("confidence"),
            "projectionStatus": ml_status, "public": ml_public, "parlayEligible": ml_eligible,
            "bankBuilderEligible": ml_pol["bankBuilderEligible"], "statusReason": ml_reason,
            "settlementSupport": "automated",
            "riskTier": ml_pol["riskTier"],
            "factors": [
                strength_factor,
                f"Opponent-adjusted form: {g['home']} att {adj_h.get('attack')} / {g['away']} att {adj_a.get('attack')}",
                ensemble_factor,
            ],
            "caveats": ["90-minute regulation only (Draw is a real outcome; no extra time/penalties)",
                        "Early-tournament sample; confidence capped Low", ml_reason],
            "notes": ["90-minute regulation only (Draw is a real outcome; no extra time/penalties)", ml_reason],
        })
        # Double chance — model probs derived from the ensemble H/D/A; real DC odds from The Odds API.
        dco = dc_odds.get(pk)
        if dco and all(k in dco for k in ("home_or_draw", "away_or_draw", "home_or_away")):
            dc_model = {
                "home_or_draw": ml["home"] + ml["draw"], "away_or_draw": ml["away"] + ml["draw"],
                "home_or_away": ml["home"] + ml["away"],
            }
            raw = {k: american_to_prob(dco[k]) for k in dc_model}
            tot = sum(raw.values()) or 1.0
            dc_market = {k: v * 2 / tot for k, v in raw.items()}  # de-vig: 3 DC bets cover 2× the outcomes
            dc_labels = {"home_or_draw": f"{g['home']} or Draw", "away_or_draw": f"{g['away']} or Draw",
                         "home_or_away": f"{g['home']} or {g['away']}"}
            dc_sides = [(k, dc_labels[k], dc_model[k], dc_market[k], dco[k]) for k in dc_model]
            dpick, dlabel, dmp, dmkt, dodds = max(dc_sides, key=lambda s: s[2] - s[3])
            dc_pol = parlay_eligibility(market="double_chance", edge=dmp - dmkt, market_prob=dmkt,
                                        american_odds=dodds, sample_min=sample_min, is_underdog=False)
            dc_eligible = dc_pol["parlayEligible"]
            projections.append({
                **common,
                "id": f"wc_{args.date}_{norm(g['home'])}_{norm(g['away'])}_dc",
                "market": "double_chance", "pick": dpick if dc_eligible else None,
                "pickLabel": dlabel if dc_eligible else None, "line": None,
                "americanOdds": dodds, "bookmaker": dco.get("bookmaker"),
                "modelProbability": round(dmp, 4), "marketProbability": round(dmkt, 4),
                "edgePct": round((dmp - dmkt) * 100, 2),
                "outcomes": [{"label": s[1], "side": s[0], "modelProbability": round(s[2], 4),
                              "marketProbability": round(s[3], 4), "americanOdds": s[4]} for s in dc_sides],
                "confidence": "Low",
                "projectionStatus": "parlay_eligible" if dc_eligible else "public_projection_no_edge",
                "public": True, "parlayEligible": dc_eligible,
                "bankBuilderEligible": dc_pol["bankBuilderEligible"], "settlementSupport": "automated",
                "statusReason": dc_pol["reason"], "riskTier": dc_pol["riskTier"],
                "factors": [f"Model {dlabel} {round(dmp*100)}% vs market {round(dmkt*100)}%",
                            "Double chance derived from the ensemble Home/Draw/Away — real DC odds",
                            ensemble_factor],
                "caveats": ["90-minute regulation only (Draw is a real outcome; no extra time/penalties)", dc_pol["reason"]],
                "notes": ["90-minute regulation only (covers two of three results)", dc_pol["reason"]],
            })
        # Match total goals — public Over/Under probability view.
        if proj.get("total"):
            t = proj["total"]
            over_edge = t["over"] - (totals.get("overPct") or 0)
            tside, tprob, tmkt, todds = ("over", t["over"], totals.get("overPct"), totals.get("overOdds")) if over_edge >= 0 else ("under", t["under"], totals.get("underPct"), totals.get("underOdds"))
            t_public, _tv2, t_status, t_reason = classify_v2(
                market_prob=tmkt or 0, model_prob=tprob, market_type="match_total_goals",
                sample_min=sample_min, is_underdog=False, strength_missing=strength_missing,
            )
            t_pol = parlay_eligibility(
                market="match_total_goals", edge=tprob - (tmkt or 0), market_prob=tmkt or 0,
                american_odds=todds, sample_min=sample_min, is_underdog=False)
            t_eligible = t_pol["parlayEligible"]
            if t_eligible:
                t_status = "parlay_eligible"; t_reason = t_pol["reason"]
            t_outcomes = [
                {"label": f"Over {t['line']}", "side": "over", "modelProbability": round(t["over"], 4),
                 "marketProbability": round(totals.get("overPct") or 0, 4), "americanOdds": totals.get("overOdds")},
                {"label": f"Under {t['line']}", "side": "under", "modelProbability": round(t["under"], 4),
                 "marketProbability": round(totals.get("underPct") or 0, 4), "americanOdds": totals.get("underOdds")},
            ]
            projections.append({
                **common,
                "id": f"wc_{args.date}_{norm(g['home'])}_{norm(g['away'])}_total",
                "market": "match_total_goals", "pick": tside if t_eligible else None,
                "pickLabel": f"{tside.title()} {t['line']}" if t_eligible else None,
                "line": t["line"], "americanOdds": todds, "bookmaker": res.get("bookmaker"),
                "modelProbability": round(tprob, 4), "marketProbability": round(tmkt or 0, 4),
                "edgePct": round((tprob - (tmkt or 0)) * 100, 2), "outcomes": t_outcomes,
                "confidence": "Low",
                "projectionStatus": t_status, "public": t_public, "parlayEligible": t_eligible,
                "bankBuilderEligible": t_pol["bankBuilderEligible"], "statusReason": t_reason,
                "settlementSupport": "automated",
                "riskTier": t_pol["riskTier"],
                "factors": [
                    f"Market total {t['line']} — model {round(t['over']*100)}% Over vs market {round((totals.get('overPct') or 0)*100)}%",
                    ensemble_factor,
                ],
                "caveats": ["90-minute regulation goals only", t_reason],
                "notes": ["90-minute regulation goals only", t_reason],
            })

        # --- Total corners (real corner odds + recent corner rates) ---
        co = corner_odds.get(pk)
        if co and co.get("line") is not None:
            def corners_for(tid):
                if tid not in corner_cache:
                    corner_cache[tid] = p.recent_corners(tid, last=20, target=10)
                return corner_cache[tid]
            hc, ac = corners_for(home_t.get("id")), corners_for(away_t.get("id"))
            if hc.get("cornersFor90") is not None and ac.get("cornersFor90") is not None:
                exp_corners = ((hc["cornersFor90"] + ac["cornersAgainst90"]) / 2
                               + (ac["cornersFor90"] + hc["cornersAgainst90"]) / 2)
                devig = american_to_prob(co["overOdds"]) + american_to_prob(co["underOdds"])
                mkt_over = american_to_prob(co["overOdds"]) / devig if devig else 0.5
                model_over = poisson_over_under(exp_corners, co["line"])[0]
                c_sample = min(hc.get("played") or 0, ac.get("played") or 0)
                # Blend: corner sample is thin → anchor to market (0.65 market / 0.35 model).
                blend_over = 0.65 * mkt_over + 0.35 * model_over
                c_over_edge = blend_over - mkt_over
                cside, cprob, cmkt, codds = (("over", blend_over, mkt_over, co["overOdds"])
                                             if c_over_edge >= 0 else
                                             ("under", 1 - blend_over, 1 - mkt_over, co["underOdds"]))
                c_public, _cv2, c_status, c_reason = classify_v2(
                    market_prob=cmkt, model_prob=cprob, market_type="match_total_corners",
                    sample_min=c_sample, is_underdog=False, corner_sample=c_sample,
                )
                c_pol = parlay_eligibility(
                    market="match_total_corners", edge=cprob - cmkt, market_prob=cmkt,
                    american_odds=codds, corner_sample=c_sample, is_underdog=False)
                c_eligible = c_pol["parlayEligible"]
                if c_eligible:
                    c_status = "parlay_eligible"; c_reason = c_pol["reason"]
                c_outcomes = [
                    {"label": f"Over {co['line']}", "side": "over", "modelProbability": round(blend_over, 4),
                     "marketProbability": round(mkt_over, 4), "americanOdds": co["overOdds"]},
                    {"label": f"Under {co['line']}", "side": "under", "modelProbability": round(1 - blend_over, 4),
                     "marketProbability": round(1 - mkt_over, 4), "americanOdds": co["underOdds"]},
                ]
                projections.append({
                    **common,
                    "id": f"wc_{args.date}_{norm(g['home'])}_{norm(g['away'])}_corners",
                    "market": "match_total_corners", "pick": cside if c_eligible else None,
                    "pickLabel": f"{cside.title()} {co['line']} corners" if c_eligible else None,
                    "line": co["line"], "americanOdds": codds, "bookmaker": co.get("bookmaker"),
                    "modelProbability": round(cprob, 4), "marketProbability": round(cmkt, 4),
                    "edgePct": round((cprob - cmkt) * 100, 2), "outcomes": c_outcomes,
                    "confidence": "Low", "cornerSample": c_sample,
                    "projectionStatus": c_status, "public": c_public, "parlayEligible": c_eligible,
                    "bankBuilderEligible": c_pol["bankBuilderEligible"], "statusReason": c_reason,
                    "settlementSupport": "automated",
                    "riskTier": c_pol["riskTier"],
                    "factors": [
                        f"Recent corners: {g['home']} {hc.get('cornersFor90')}/{hc.get('cornersAgainst90')} for/against (last {hc.get('played')})",
                        f"Recent corners: {g['away']} {ac.get('cornersFor90')}/{ac.get('cornersAgainst90')} for/against (last {ac.get('played')})",
                        f"Model expected {round(exp_corners,1)} corners vs market line {co['line']} ({c_sample}-match corner sample)",
                    ],
                    "caveats": ["90-minute regulation corners only", c_reason],
                    "notes": ["90-minute regulation corners only", c_reason],
                })

    public_projs = [p for p in projections if p.get("public")]
    eligible = [p for p in projections if p.get("parlayEligible")]
    status_counts = {}
    for _pp in projections:
        status_counts[_pp["projectionStatus"]] = status_counts.get(_pp["projectionStatus"], 0) + 1
    avg_cov = round(sum(p.get("opponentStrengthCoverage", 0) for p in projections) / len(projections), 2) if projections else 0.0
    payload = {
        "generatedAt": now, "sport": "world_cup", "date": args.date,
        "modelVersion": "wc-ensemble-v2",
        "provider": "api_football", "oddsProvider": "odds_api",
        "strengthSource": "FIFA/Coca-Cola World Ranking (2026-06-10)",
        "disclaimer": "GameTime Picks model projections — 90-minute regulation only. Educational/paper, not betting advice.",
        "methodology": "Ensemble: de-vigged market prior (0.60) + FIFA-points strength prior (0.25) "
                       "+ opponent-adjusted recent form (0.15). Public PROBABILITY VIEWS are shown "
                       "for every game/market with real odds + features; PARLAY ELIGIBILITY is "
                       "stricter (edge + sample + market sanity).",
        "matchCount": len(today_games), "projectionCount": len(projections),
        "publicCount": len(public_projs), "parlayEligibleCount": len(eligible),
        "public": len(public_projs) > 0,
        "opponentStrengthCoverage": avg_cov, "statusCounts": status_counts,
        "matches": projections,
    }
    (DATA / "projections").mkdir(parents=True, exist_ok=True)
    (DATA / "projections" / f"{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "projections" / "latest.json").write_text(json.dumps(payload, indent=2) + "\n")

    # Update readiness. projectionsPublic = any public probability view exists (visibility);
    # parlay eligibility is tracked separately and gates the suggested-cards surface.
    rd = json.loads((DATA / "stats" / "readiness-latest.json").read_text())
    rd["teamStatsReady"] = teams_with_sample > 0
    rd["teamProjectionsReady"] = len(projections) > 0
    rd["projectionsAllowed"] = len(projections) > 0
    rd["projectionsPublic"] = len(public_projs) > 0
    rd["parlayEligibleCount"] = len(eligible)
    rd["methodologyReviewRequired"] = len(public_projs) == 0
    rd["fixturesReady"] = len(normalized_fixtures) > 0
    rd["teamLogosReady"] = any(f["homeTeam"].get("logo") for f in normalized_fixtures)
    rd["evidence"] = {**rd.get("evidence", {}), "teamFormTeams": teams_with_sample,
                      "projections": len(projections), "publicProjections": len(public_projs),
                      "parlayEligible": len(eligible), "projectionStatusCounts": status_counts}
    rd["projectionReasons"] = [] if eligible else [
        "public probability views are shown; no leg cleared the stricter parlay-eligibility gate (edge/sample)"]
    (DATA / "stats" / "readiness-latest.json").write_text(json.dumps(rd, indent=2) + "\n")
    (DATA / "stats" / "normalized-fixtures-latest.json").write_text(json.dumps({"generatedAt": now, "date": args.date, "fixtures": normalized_fixtures}, indent=2) + "\n")
    print(f"[wc-proj] calls={p.calls_made} games={len(today_games)} projections={len(projections)} "
          f"public={len(public_projs)} parlayEligible={len(eligible)} teamsWithForm={teams_with_sample}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
