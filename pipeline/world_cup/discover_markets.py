"""
Bounded World Cup market-availability discovery.

Empirically probes which requested markets are actually purchasable/buildable TODAY:
  - The Odds API per-EVENT endpoint for player props + corners (the aggregate /odds endpoint
    can't return player props), one bounded call per market-group per today event.
  - API-Football for corner feature history (fixture statistics) + posted lineups.
Then writes app/public/data/world-cup/markets/availability-latest.json via the pure
market_availability matrix. No market is ever silently missing; each has a status + reason.

Bounded: events list (1) + player-prop probe (today events) + corner probe + a single
corner-feature stats probe + lineup checks. Records credits/calls. Never loops.
"""
from __future__ import annotations

import argparse, json, os
from datetime import datetime, timezone
from pathlib import Path

from .odds_api import _http_get, API_BASE, load_schedule_for_date, _norm
from .market_availability import build_availability, REQUESTED_MARKETS
from .providers.api_football import ApiFootballProvider
from .team_aliases import pair_key

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "app" / "public" / "data" / "world-cup"
SPORT = "soccer_fifa_world_cup"
PLAYER_ODDS_KEYS = ["player_shots", "player_shots_on_target", "player_assists", "player_goal_scorer_anytime"]
CORNER_ODDS_KEY = "alternate_totals_corners"


def _events(api_key: str) -> tuple[list[dict], dict]:
    code, data, headers = _http_get(f"{API_BASE}/sports/{SPORT}/events", {"apiKey": api_key})
    rem = headers.get("x-requests-remaining") if headers else None
    return (data if isinstance(data, list) else []), {"code": code, "remaining": rem}


def _event_markets(api_key: str, event_id: str, markets: str) -> tuple[set[str], int]:
    """Return the set of market keys actually present (with ≥1 outcome) + the http code."""
    code, data, _ = _http_get(
        f"{API_BASE}/sports/{SPORT}/events/{event_id}/odds",
        {"apiKey": api_key, "regions": "us", "markets": markets, "oddsFormat": "american"},
    )
    present: set[str] = set()
    if code == 200 and isinstance(data, dict):
        for bk in data.get("bookmakers") or []:
            for m in bk.get("markets") or []:
                if m.get("outcomes"):
                    present.add(m.get("key"))
    return present, code


def _projection_states() -> dict:
    """Per team-market: whether an active or research(model-ran) projection exists."""
    out = {"moneyline_90": {"active": False, "research": False},
           "match_total_goals": {"active": False, "research": False}}
    try:
        for p in json.loads((DATA / "projections" / "latest.json").read_text()).get("matches", []):
            mk = p.get("market")
            if mk in out:
                if p.get("projectionStatus") == "active":
                    out[mk]["active"] = True
                elif p.get("projectionStatus"):
                    out[mk]["research"] = True  # model ran (gated/research)
    except Exception:
        pass
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    odds_key = os.environ.get("ODDS_API_KEY")
    af = ApiFootballProvider()
    diag = {"oddsApi": {"connected": bool(odds_key)}, "apiFootball": {"connected": af.is_configured()}}

    today = load_schedule_for_date(args.date)
    today_pairs = {pair_key(m.get("home"), m.get("away")) for m in today}

    # --- The Odds API per-event probe (player props + corners) ---
    player_supported, corner_supported, credits = set(), False, {"remaining": None}
    odds_events = []
    if odds_key:
        evs, meta = _events(odds_key)
        credits["remaining"] = meta.get("remaining")
        odds_events = [e for e in evs if pair_key(e.get("home_team"), e.get("away_team")) in today_pairs]
        for ev in odds_events[:2]:  # bounded: today's matches only
            present, _ = _event_markets(odds_key, ev["id"], ",".join(PLAYER_ODDS_KEYS))
            player_supported |= present
            corners, ccode = _event_markets(odds_key, ev["id"], CORNER_ODDS_KEY)
            if CORNER_ODDS_KEY in corners:
                corner_supported = True
        diag["oddsApi"]["todayEvents"] = len(odds_events)
        diag["oddsApi"]["playerMarketsFound"] = sorted(player_supported)
        diag["oddsApi"]["cornerMarketFound"] = corner_supported

    # --- API-Football: lineups + corner feature history (bounded) ---
    lineups_ready, corner_features = False, False
    af_calls = 0
    if af.is_configured():
        try:
            norm = json.loads((DATA / "stats" / "normalized-fixtures-latest.json").read_text()).get("fixtures", [])
        except Exception:
            norm = []
        for f in norm[:2]:
            fid = f.get("fixtureId")
            if fid:
                ln = (af._get("/fixtures/lineups", {"fixture": fid}) or {}).get("response", []) or []
                af_calls += 1
                if ln:
                    lineups_ready = True
        # Corner-feature probe: one recent finished fixture of a today team → stats has Corner Kicks?
        if norm:
            tid = (norm[0].get("homeTeam") or {}).get("id")
            if tid:
                recent = (af._get("/fixtures", {"team": tid, "last": 1}) or {}).get("response", []) or []
                af_calls += 1
                if recent:
                    rid = (recent[0].get("fixture") or {}).get("id")
                    stats = (af._get("/fixtures/statistics", {"fixture": rid}) or {}).get("response", []) or []
                    af_calls += 1
                    for team_stats in stats:
                        for s in team_stats.get("statistics") or []:
                            if (s.get("type") or "").lower().startswith("corner") and s.get("value") is not None:
                                corner_features = True
    diag["apiFootball"]["calls"] = af_calls

    states = _projection_states()
    # Build the probe input per requested market.
    probe = {}
    for m in REQUESTED_MARKETS:
        k = m["key"]
        if k == "moneyline_90":
            probe[k] = {"oddsSupported": True, "oddsReady": True, "dataReady": True,
                        **states["moneyline_90"]}
        elif k == "match_total_goals":
            probe[k] = {"oddsSupported": True, "oddsReady": True, "dataReady": True,
                        **states["match_total_goals"]}
        elif k == "match_total_corners":
            probe[k] = {"oddsSupported": corner_supported, "oddsReady": corner_supported,
                        "dataReady": corner_features}
        else:  # player markets
            present = m["oddsKey"] in player_supported
            probe[k] = {"oddsSupported": present, "oddsReady": present,
                        "dataReady": af.is_configured(), "lineupsReady": lineups_ready}

    matrix = build_availability(probe)
    payload = {
        "generatedAt": now, "date": args.date,
        "providers": {
            "oddsApi": {"connected": bool(odds_key), "sportKey": SPORT,
                        "creditsRemaining": credits["remaining"]},
            "apiFootball": {"connected": af.is_configured(), "plan": "pro", "calls": af_calls},
        },
        "diagnostics": diag,
        **matrix,
    }
    (DATA / "markets").mkdir(parents=True, exist_ok=True)
    (DATA / "markets" / f"availability-{args.date}.json").write_text(json.dumps(payload, indent=2) + "\n")
    (DATA / "markets" / "availability-latest.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(f"[wc-markets] players={sorted(player_supported)} corners={corner_supported} "
          f"lineups={lineups_ready} cornerFeatures={corner_features} afCalls={af_calls} "
          f"complete={matrix['requestedMarketsComplete']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
