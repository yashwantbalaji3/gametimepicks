"""
enrich_with_api_football — attach REAL recent form + group to the odds-backed World Cup
projections, using API-Football (API_FOOTBALL_KEY). Prices stay from The Odds API; this
adds the stat layer the owner asked for: recent form (last-5 across all competitions),
group, and a bumped data-quality grade.

Runs AFTER build_odds_only_projections (reads/writes world-cup/projections/{latest,<date>}.json).
Idempotent. Verified-credential only — no fabrication; if the key is missing or a team can't
be matched, that team simply keeps its odds-only "limited" projection (fail soft, honest).

Recent form source = `/fixtures?team={id}&last=5` (real results across WC + qualifiers +
friendlies) — NOT `/teams/statistics?league=1`, which is thin this early in the tournament.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data" / "world-cup"
API_BASE = "https://v3.football.api-sports.io"
LEAGUE = int(os.environ.get("WC_API_FOOTBALL_LEAGUE", "1"))
SEASON = int(os.environ.get("WC_API_FOOTBALL_SEASON", "2026"))


def af_get(path: str, params: dict, key: str) -> dict:
    url = f"{API_BASE}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-apisports-key": key})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def norm(s: str) -> str:
    return (s or "").strip().lower().replace(" islands", "").replace("ir ", "").replace(".", "")


def team_index(key: str) -> dict[str, int]:
    """name (normalized) -> API-Football team id, for the WC league/season."""
    out: dict[str, int] = {}
    data = af_get("/teams", {"league": LEAGUE, "season": SEASON}, key)
    for row in data.get("response", []):
        t = row.get("team", {})
        if t.get("name") and t.get("id") is not None:
            out[norm(t["name"])] = t["id"]
    return out


def group_index(key: str) -> dict[str, str]:
    """team name (normalized) -> group label (e.g. 'Group G')."""
    out: dict[str, str] = {}
    data = af_get("/standings", {"league": LEAGUE, "season": SEASON}, key)
    resp = data.get("response", [])
    if not resp:
        return out
    for grp in resp[0].get("league", {}).get("standings", []):
        for row in grp:
            nm = row.get("team", {}).get("name")
            grpname = row.get("group")
            if nm and grpname:
                out[norm(nm)] = grpname
    return out


def recent_form(team_id: int, key: str) -> dict | None:
    """Last-5 results across all competitions → {formString, last5:[...]}. Real data only."""
    data = af_get("/fixtures", {"team": team_id, "last": 5}, key)
    rows = data.get("response", [])
    if not rows:
        return None
    last5 = []
    form = []
    for f in rows:
        t, g = f["teams"], f["goals"]
        is_home = t["home"]["id"] == team_id
        us, them = (g["home"], g["away"]) if is_home else (g["away"], g["home"])
        opp = t["away"]["name"] if is_home else t["home"]["name"]
        if us is None or them is None:
            res = "-"
        elif us > them:
            res = "W"
        elif us < them:
            res = "L"
        else:
            res = "D"
        form.append(res)
        last5.append({
            "date": f["fixture"]["date"][:10], "opponent": opp,
            "score": f"{us}-{them}" if us is not None else "—",
            "result": res, "home": is_home, "competition": f["league"]["name"],
        })
    return {"formString": "".join(form), "last5": last5}


def enrich(date: str) -> int:
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    if not key:
        print("[wc-enrich] STOP API_FOOTBALL_KEY not set (Odds-only projections kept).")
        return 2
    pfile = DATA / "projections" / "latest.json"
    if not pfile.exists():
        print("[wc-enrich] no projections to enrich")
        return 2
    proj = json.loads(pfile.read_text())
    names = team_index(key)
    groups = group_index(key)
    form_cache: dict[int, dict | None] = {}

    def form_for(team_name: str) -> dict | None:
        tid = names.get(norm(team_name))
        if tid is None:
            return None
        if tid not in form_cache:
            try:
                form_cache[tid] = recent_form(tid, key)
            except Exception:
                form_cache[tid] = None
        return form_cache[tid]

    enriched = 0
    for m in proj.get("matches", []):
        hf, af = form_for(m["homeTeam"]), form_for(m["awayTeam"])
        grp = groups.get(norm(m["homeTeam"])) or groups.get(norm(m["awayTeam"]))
        if hf:
            m["homeForm"] = hf
        if af:
            m["awayForm"] = af
        if grp:
            m["group"] = grp
        if hf or af:
            m["dataQuality"] = "B"  # odds-backed + recent-form stat layer
            m["statLayer"] = "api_football_recent_form"
            enriched += 1

    proj["strengthSource"] = "api_football_recent_form"
    proj["statProvider"] = "api_football"
    proj["dataQuality"] = "B" if enriched else proj.get("dataQuality", "limited")
    if enriched:
        proj["methodology"] = (proj.get("methodology", "") +
            " Recent form (last-5 across all competitions) and group attached from API-Football; "
            "prices remain from The Odds API.")
    for name in (f"{date}.json", "latest.json"):
        (DATA / "projections" / name).write_text(json.dumps(proj, indent=2) + "\n")
    print(f"[wc-enrich] {date}: enriched {enriched}/{len(proj.get('matches', []))} projections "
          f"with recent form + group ({len(names)} teams, {len(groups)} grouped).")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Attach API-Football recent form + group to WC projections.")
    ap.add_argument("--date", required=True, help="ET slate date YYYY-MM-DD")
    return enrich(ap.parse_args(argv).date)


if __name__ == "__main__":
    raise SystemExit(main())
