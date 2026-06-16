"""
bank_builder_v2_eligibility — the Bank Builder V2 SURVIVAL gate.

Bank Builder is not a normal parlay generator. Parlay Lab can surface good edges across the
risk spectrum; Bank Builder may only use elite, low-fragility, high-data-quality legs. After
Run #2 went 0/2 on volatile single-player props (a hitless 1+-hit prop, a star beating a low
Under, and a DNP void), V2 scores every candidate leg on a separate SURVIVAL score and refuses
to launch a new run unless the slate genuinely offers enough independent, non-fragile legs.

This module is PURE and unit-tested. `survival_score(leg)` takes one normalized candidate leg
(the dict shape produced by build_dual_bank_builder.{wc_legs,mlb_legs}) and returns a breakdown;
`evaluate_pool(legs)` classifies the pool and decides whether two differentiated lanes can launch.

No fabrication: every input field comes from real odds / official stat artifacts. A leg with no
recent-form data scores 0 on that dimension (it is not invented).
"""
from __future__ import annotations

import re
from typing import Any

# ── thresholds (conservative; tuned to current data availability) ────────────────────────────
# The strongest legit June-16 legs (WC double-chance/DNB favourites) score ~80-90; volatile
# single-player MLB props score ~30-55 and never clear the bar. 80 keeps the gate strict without
# being unreachable for genuinely low-variance team markets.
ELIGIBLE_THRESHOLD = 80
WATCHLIST_THRESHOLD = 70

# A Dual run needs TWO lanes, each two legs from DIFFERENT games (intra-lane non-correlation) and
# each lane carrying at least one World Cup leg from today's slate. Lanes may share a game across
# lanes (we PREFER game-disjoint and reward it), so a launch needs eligible legs across >=3 games.
LANE_LEGS = 2
LANES = 2
MIN_DISTINCT_GAMES = 3  # enough for two lanes when cross-lane game sharing is allowed
# Per-lane combined-decimal band. Floor is survival-first (two short-priced favourites combine to a
# modest but high-probability return); upper bound still rejects longshot stacking.
LANE_DECIMAL_LO, LANE_DECIMAL_HI = 1.12, 2.60
MIN_LANE_JOINT_PROB = 0.50
REQUIRE_WORLD_CUP_LEG_PER_LANE = True

DATA_QUALITY_POINTS = {"A": 15, "B": 11, "C": 6, "D": 0, "LIMITED": 0}

# Market-type suitability for Bank Builder (0-25). Team markets that cover multiple outcomes are
# the most survivable; single-player props are capped low and lean on the volatility/DNP penalties.
MARKET_TYPE_POINTS = {
    "double_chance": 25,       # covers 2 of 3 outcomes — most survivable
    "draw_no_bet": 22,         # draw refunds — strong favourite, low downside
    "moneyline_90": 14,        # single outcome, no draw cover
    "match_total_goals": 12,
    "match_total": 12,
    "totals": 12,
    "btts": 8,
    "pitcher_strikeouts": 12,  # announced probable starter, distribution-stable
    "batter_hits": 11,         # only the 0.5 / Under lines reach here (gated upstream)
    "batter_total_bases": 9,
    "batter_hits_runs_rbis": 9,
    "player_goal_scorer_anytime": 6,
    "player_shots_on_target": 6,
    "player_shots": 6,
    "player_assists": 6,
}

# Volatility penalty by market family (single-game / single-player variance).
VOLATILITY_PENALTY = {
    "team": 0,
    "pitcher": 8,   # one start, but K distribution is comparatively stable
    "hitter": 18,   # one bad plate-appearance script ends it
    "soccer_player": 22,
}

TEAM_MARKETS = {"double_chance", "draw_no_bet", "moneyline_90", "match_total_goals",
                "match_total", "totals", "btts"}
PITCHER_MARKETS = {"pitcher_strikeouts"}
HITTER_MARKETS = {"batter_hits", "batter_total_bases", "batter_hits_runs_rbis"}
SOCCER_PLAYER_MARKETS = {"player_goal_scorer_anytime", "player_shots_on_target",
                         "player_shots", "player_assists"}


def _market_family(market: str | None) -> str:
    if market in TEAM_MARKETS:
        return "team"
    if market in PITCHER_MARKETS:
        return "pitcher"
    if market in HITTER_MARKETS:
        return "hitter"
    if market in SOCCER_PLAYER_MARKETS:
        return "soccer_player"
    return "other"


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _base_model_points(leg: dict) -> float:
    """0-35 from model probability (the survival anchor) with a small positive-edge nudge."""
    prob = leg.get("modelProbability")
    if not isinstance(prob, (int, float)):
        return 0.0
    # 0.55 -> 0 pts, 0.95 -> 35 pts
    pts = _clamp((prob - 0.55) / (0.95 - 0.55), 0, 1) * 35
    edge = leg.get("edgePct")
    if isinstance(edge, (int, float)) and edge > 0:
        pts += min(edge * 100 if edge < 1 else edge, 5) * 0.6  # small bonus, capped ~3
    return round(min(pts, 35), 2)


def _data_quality_points(leg: dict) -> float:
    dq = str(leg.get("dataQuality", "")).strip().upper() or "D"
    return float(DATA_QUALITY_POINTS.get(dq, 0))


def _odds_band_points(leg: dict) -> float:
    """0-10. SURVIVAL rewards short-priced favourites and penalises longshots (the return-vs-
    survival tension is resolved in lane construction, not here)."""
    odds = leg.get("americanOdds")
    if not isinstance(odds, (int, float)) or odds == 0:
        return 0.0
    if odds <= -300:
        return 10.0
    if odds <= -150:
        return 9.0
    if odds <= 120:
        return 7.0
    if odds <= 200:
        return 4.0
    return 1.0  # longshot


def _recent_form(leg: dict) -> tuple[float, dict]:
    """0-15 consistency points + a display dict {hits, of, rate} or {available: False}.
    MLB: share of recent games that cleared this exact line. WC: share of the picked side's last-5
    that were favourable for the market (W or D for double chance; W for DNB/moneyline)."""
    fam = _market_family(leg.get("market"))
    if fam in ("hitter", "pitcher", "soccer_player"):
        games = leg.get("recentGames") or []
        vals = []
        for g in games:
            if isinstance(g, dict) and g.get("value") is not None:
                vals.append(float(g["value"]))
            elif isinstance(g, (int, float)):
                vals.append(float(g))
        if not vals:
            return 0.0, {"available": False}
        line = leg.get("line")
        side = leg.get("side")
        if isinstance(line, (int, float)) and side in ("Over", "Under"):
            cleared = sum(1 for v in vals if (v > line if side == "Over" else v < line))
        else:
            cleared = sum(1 for v in vals if v >= 1)  # default: "did the event happen"
        rate = cleared / len(vals)
        return round(rate * 15, 2), {"available": True, "hits": cleared, "of": len(vals),
                                     "rate": round(rate, 3)}
    if fam == "team":
        pick = (leg.get("pick") or "")
        home, away = leg.get("homeTeam"), leg.get("awayTeam")
        form = None
        if home and home.lower() in pick.lower():
            form = leg.get("homeForm")
        elif away and away.lower() in pick.lower():
            form = leg.get("awayForm")
        last5 = (form or {}).get("last5") or []
        results = [str(r.get("result", "")).upper()[:1] for r in last5 if isinstance(r, dict)]
        results = [r for r in results if r in ("W", "D", "L")]
        if not results:
            return 0.0, {"available": False}
        market = leg.get("market")
        favourable = {"W", "D"} if market == "double_chance" else {"W"}
        good = sum(1 for r in results if r in favourable)
        rate = good / len(results)
        return round(rate * 15, 2), {"available": True, "hits": good, "of": len(results),
                                     "rate": round(rate, 3)}
    return 0.0, {"available": False}


def _lineup_confirmed(leg: dict) -> bool:
    status = str(leg.get("lineupStatus", "")).strip().lower()
    return status in ("confirmed", "starting", "posted", "in_lineup")


def survival_score(leg: dict) -> dict:
    """Score one candidate leg (pure). Returns survivalScore (0-100), tier, eligible, the positive
    component breakdown, the penalties, hit-rate display, rejectionReasons and whySelected."""
    fam = _market_family(leg.get("market"))
    market = leg.get("market")

    base = _base_model_points(leg)
    market_pts = float(MARKET_TYPE_POINTS.get(market, 0))
    form_pts, hit_rate = _recent_form(leg)
    odds_pts = _odds_band_points(leg)
    dq_pts = _data_quality_points(leg)

    components = {
        "baseModel": base,            # 0-35
        "marketType": market_pts,     # 0-25
        "recentForm": form_pts,       # 0-15
        "oddsBand": odds_pts,         # 0-10
        "dataQuality": dq_pts,        # 0-15
    }

    rejection_reasons: list[str] = []
    penalties: dict[str, float] = {}

    # volatility
    vol = VOLATILITY_PENALTY.get(fam, 12)
    if vol:
        penalties["volatility"] = -float(vol)

    # DNP / lineup — player props with no confirmed lineup carry the Run #2 risk.
    if fam in ("hitter", "soccer_player"):
        if not _lineup_confirmed(leg):
            penalties["dnpLineup"] = -30.0
            rejection_reasons.append("player prop without a confirmed lineup (DNP / rest risk)")
    elif fam == "pitcher":
        if not _lineup_confirmed(leg):
            penalties["dnpLineup"] = -6.0  # probable starter — low but non-zero scratch risk

    # data-quality floor
    dq = str(leg.get("dataQuality", "")).strip().upper()
    if dq in ("", "D", "LIMITED", "C"):
        rejection_reasons.append(f"data quality below the Bank Builder floor (got {dq or 'unknown'})")

    # longshot odds
    odds = leg.get("americanOdds")
    if isinstance(odds, (int, float)) and odds > 160:
        rejection_reasons.append(f"odds longer than the Bank Builder band ({int(odds):+d})")

    # explicit fragile-market block (defence in depth; gated upstream too)
    pick = (leg.get("pick") or "")
    if market == "batter_hits" and re.search(r"Over\s*(1\.5|2\.5|[2-9])", pick):
        rejection_reasons.append("high-variance MLB Over 1.5+ hits prop")

    raw = sum(components.values()) + sum(penalties.values())
    score = round(_clamp(raw), 2)

    if score >= ELIGIBLE_THRESHOLD and not rejection_reasons:
        tier = "eligible"
    elif score >= WATCHLIST_THRESHOLD and not rejection_reasons:
        tier = "watchlist"
    else:
        tier = "not_eligible"

    eligible = tier == "eligible"
    why = []
    if eligible:
        if fam == "team":
            why.append(f"low-variance team market ({leg.get('marketLabel', market)})")
        if isinstance(leg.get("modelProbability"), (int, float)):
            why.append(f"model {leg['modelProbability']*100:.0f}% to hold")
        if hit_rate.get("available"):
            why.append(f"recent form {hit_rate['hits']}/{hit_rate['of']}")

    return {
        "pick": leg.get("pick"),
        "sport": leg.get("sport"),
        "gameId": leg.get("gameId"),
        "gameLabel": leg.get("gameLabel"),
        "market": market,
        "marketLabel": leg.get("marketLabel"),
        "americanOdds": leg.get("americanOdds"),
        "modelProbability": leg.get("modelProbability"),
        "marketFamily": fam,
        "survivalScore": score,
        "tier": tier,
        "eligible": eligible,
        "components": components,
        "penalties": penalties,
        "hitRate": hit_rate,
        "rejectionReasons": rejection_reasons,
        "whySelected": why,
    }


def _decimal(leg: dict) -> float:
    o = leg.get("americanOdds")
    if not isinstance(o, (int, float)) or o == 0:
        return 1.0
    return 1 + (o / 100 if o > 0 else 100 / abs(o))


def _valid_lane(a: dict, b: dict) -> bool:
    """A lane = two eligible legs from DIFFERENT games, in the decimal band, above the joint-prob
    floor, with at least one World Cup leg."""
    if a["gameId"] == b["gameId"]:
        return False
    if not (LANE_DECIMAL_LO <= _decimal(a) * _decimal(b) <= LANE_DECIMAL_HI):
        return False
    if a["modelProbability"] * b["modelProbability"] < MIN_LANE_JOINT_PROB:
        return False
    if REQUIRE_WORLD_CUP_LEG_PER_LANE and not (a["sport"] == "world_cup" or b["sport"] == "world_cup"):
        return False
    return True


def _two_lanes(eligible: list[dict]) -> list[dict] | None:
    """Build the best two lanes. Each lane is two eligible legs from different games with >=1 World
    Cup leg; lanes share NO leg, PREFER no shared game (rewarded), and we maximise total survival.
    Returns [laneA, laneB] (highest-survival lane first) or None."""
    by_score = sorted(eligible, key=lambda s: s["survivalScore"], reverse=True)
    n = len(by_score)
    lanes = []
    for i in range(n):
        for j in range(i + 1, n):
            if _valid_lane(by_score[i], by_score[j]):
                pair = (by_score[i], by_score[j])
                lanes.append({
                    "idx": (i, j),
                    "legs": pair,
                    "games": {pair[0]["gameId"], pair[1]["gameId"]},
                    "survival": pair[0]["survivalScore"] + pair[1]["survivalScore"],
                })
    best = None
    best_score = -1.0
    for a in range(len(lanes)):
        for b in range(len(lanes)):
            if a == b:
                continue
            la, lb = lanes[a], lanes[b]
            if set(la["idx"]) & set(lb["idx"]):
                continue  # lanes must share no leg
            disjoint_bonus = 25 if not (la["games"] & lb["games"]) else 0
            score = la["survival"] + lb["survival"] + disjoint_bonus
            if score > best_score:
                best_score = score
                # higher-survival lane is Lane A
                first, second = (la, lb) if la["survival"] >= lb["survival"] else (lb, la)
                best = [list(first["legs"]), list(second["legs"])]
    return best


def evaluate_pool(legs: list[dict]) -> dict:
    """Score the whole candidate pool and decide whether a Dual run may launch. Never launches
    unless two differentiated all-eligible lanes can be built; otherwise returns an 'evaluating'
    decision with the strongest candidates and the exact blockers."""
    scored = [survival_score(l) for l in legs]
    eligible = [s for s in scored if s["eligible"]]
    watchlist = [s for s in scored if s["tier"] == "watchlist"]
    distinct_games = {s["gameId"] for s in eligible}

    decision = "evaluating"
    reasons: list[str] = []
    lanes = None
    min_eligible = LANE_LEGS * LANES  # 4 legs for two two-leg lanes

    if len(eligible) < min_eligible:
        reasons.append(f"only {len(eligible)} eligible legs (need ≥{min_eligible} for two lanes)")
    if len(distinct_games) < MIN_DISTINCT_GAMES:
        reasons.append(f"the strongest non-fragile legs span only {len(distinct_games)} upcoming "
                       f"games — two lanes would both depend on the same teams holding "
                       f"(over-correlated); a differentiated dual run needs ≥{MIN_DISTINCT_GAMES} "
                       f"independent games")
    if len(eligible) >= min_eligible and len(distinct_games) >= MIN_DISTINCT_GAMES:
        lanes = _two_lanes(eligible)
        if lanes:
            decision = "launch"
        else:
            reasons.append("eligible legs could not form two valid lanes (each two legs from "
                           "different games, ≥1 World Cup leg, within the survival-first return band)")

    return {
        "decision": decision,
        "eligibleThreshold": ELIGIBLE_THRESHOLD,
        "watchlistThreshold": WATCHLIST_THRESHOLD,
        "counts": {"scored": len(scored), "eligible": len(eligible),
                   "watchlist": len(watchlist), "distinctEligibleGames": len(distinct_games)},
        "blockers": reasons,
        "lanes": lanes,
        "eligibleLegs": sorted(eligible, key=lambda s: s["survivalScore"], reverse=True),
        "watchlistLegs": sorted(watchlist, key=lambda s: s["survivalScore"], reverse=True),
        "strongestCandidates": sorted(scored, key=lambda s: s["survivalScore"], reverse=True)[:8],
        "allScored": sorted(scored, key=lambda s: s["survivalScore"], reverse=True),
    }


# ── runner: score the real candidate pool for a date and write the public evaluation ──────────
def main(argv=None) -> int:
    import argparse
    import json
    from pathlib import Path
    from datetime import datetime, timezone
    from pipeline.daily.build_dual_bank_builder import mlb_legs, wc_legs, make_lane

    ap = argparse.ArgumentParser(description="Evaluate Bank Builder V2 eligibility for a slate date.")
    ap.add_argument("--date", required=True, help="slate date YYYY-MM-DD")
    ap.add_argument("--launch", action="store_true",
                    help="If the gate returns decision=launch, write Run #3 (archives Run #2). "
                         "Without this flag the run is evaluated only; the settled run is untouched.")
    args = ap.parse_args(argv)

    root = Path(__file__).resolve().parents[2]
    bb = root / "app" / "public" / "data" / "bank-builder"
    now = datetime.now(timezone.utc)

    pool = mlb_legs(now, args.date) + wc_legs(now)
    by_key = {(str(l.get("gameId")), l.get("pick")): l for l in pool}
    res = evaluate_pool(pool)

    # Explicitly surface owner-flagged markets (e.g. the Argentina moneyline) — show they were
    # evaluated and whether they cleared the survival gate, so the decision is transparent.
    notes: list[str] = []
    for s in res["allScored"]:
        pl = (s.get("pick") or "")
        if s.get("market") == "moneyline_90" and "argentina" in pl.lower():
            verdict = "clears" if s["eligible"] else "does NOT clear"
            notes.append(f"Argentina moneyline ({s['americanOdds']:+d}, model "
                         f"{(s.get('modelProbability') or 0)*100:.0f}%) {verdict} the survival gate — "
                         f"score {s['survivalScore']:.0f}. The stronger, less-fragile Argentina legs are "
                         f"Argentina or Draw + Argentina draw-no-bet (they cover a draw).")
            break

    doc = {
        "generatedAt": now.isoformat(), "date": args.date, "model": "bank_builder_v2",
        "decision": res["decision"],
        "headline": ("Bank Builder V2 — qualifying lanes found" if res["decision"] == "launch"
                     else "Bank Builder V2 evaluating — no qualifying launch yet"),
        "eligibleThreshold": res["eligibleThreshold"], "watchlistThreshold": res["watchlistThreshold"],
        "counts": res["counts"], "blockers": res["blockers"], "notes": notes,
        "eligibleLegs": res["eligibleLegs"], "watchlistLegs": res["watchlistLegs"],
        "strongestCandidates": res["strongestCandidates"],
        "poolSize": len(pool),
        "disclaimer": "Paper-only, educational. Survival score is a Bank Builder eligibility gate, "
                      "stricter than Parlay Lab — it rejects fragile single-player props, "
                      "unconfirmed-lineup (DNP) risk, and longshots. No fabrication.",
        "priceSource": "the_odds_api", "statSource": "api_football",
    }
    for name in (f"v2-evaluation-{args.date}.json", "v2-evaluation-latest.json"):
        (bb / name).write_text(json.dumps(doc, indent=2) + "\n")

    print(f"[bbv2] {args.date}: decision={res['decision']} · "
          f"scored {res['counts']['scored']} · eligible {res['counts']['eligible']} "
          f"across {res['counts']['distinctEligibleGames']} games")
    for s in res["strongestCandidates"][:6]:
        print(f"  {s['survivalScore']:5.1f} [{s['tier']:12}] {s['pick']} ({s['marketLabel']}) "
              f"{s['americanOdds']:+d}" + (f"  ✗ {'; '.join(s['rejectionReasons'])}"
                                          if s['rejectionReasons'] else ""))
    for r in res["blockers"]:
        print(f"  · blocker: {r}")

    if res["decision"] == "launch" and args.launch and res["lanes"]:
        # archive the current (settled) run, then write Run #3 from the original eligible legs
        cur = bb / "dual-lanes-latest.json"
        if cur.exists():
            prev = json.loads(cur.read_text())
            (bb / f"dual-lanes-run-{prev.get('runNumber', 2)}.json").write_text(
                json.dumps(prev, indent=2) + "\n")
        lane_defs = [("A", "Lane A", "Lower-variance survival lane"),
                     ("B", "Lane B", "Differentiated survival lane (no shared game)")]
        lanes_out = []
        for (code, nm, thesis), lane in zip(lane_defs, res["lanes"]):
            legs = tuple(by_key[(str(s["gameId"]), s["pick"])] for s in lane)
            built = make_lane(code, nm, thesis, legs,
                              "Both legs cleared the V2 survival gate; lanes are game-disjoint.")
            for leg, s in zip(built["legs"], lane):
                leg["survivalScore"] = s["survivalScore"]
                leg["hitRate"] = s["hitRate"]
            lanes_out.append(built)
        run3 = {
            "generatedAt": now.isoformat(), "date": args.date, "status": "pending",
            "type": "dual_bank_builder", "runStatus": "active", "runNumber": 3, "startDate": args.date,
            "name": "Dual Bank Builder", "step": 1, "stakePerLane": 100, "stepTarget": 200,
            "model": "bank_builder_v2",
            "disclaimer": "Paper-only, educational. Run #3 legs each cleared the Bank Builder V2 "
                          "survival gate. The completed first run ($100 → $10,376.17) and the "
                          "closed Run #2 are unchanged.",
            "lanes": lanes_out, "priceSource": "the_odds_api", "statSource": "api_football",
        }
        for name in (f"dual-lanes-{args.date}.json", "dual-lanes-latest.json"):
            (bb / name).write_text(json.dumps(run3, indent=2) + "\n")
        print(f"[bbv2] LAUNCHED Run #3 — {len(lanes_out)} lanes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
