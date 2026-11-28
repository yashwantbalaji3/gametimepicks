"""Data-integrity probe (no outcomes read): are injury-report rows provably pregame?
Compares each row's date_modified to the team's kickoff (games.csv gameday+gametime, America/New_York)."""
import csv, sys, json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
R = "/Users/yashwantbalaji/Downloads/gametimepicks/data/internal/research/nfl/raw/nflverse"
ET = ZoneInfo("America/New_York")
kick = {}
for g in csv.DictReader(open(f"{R}/games.csv")):
    s = int(g["season"])
    if s < 2022 or s > 2025: continue
    t = datetime.strptime(g["gameday"] + " " + (g["gametime"] or "13:00"), "%Y-%m-%d %H:%M").replace(tzinfo=ET).astimezone(timezone.utc)
    for team in (g["home_team"], g["away_team"]):
        kick[(s, g["game_type"], int(g["week"]), team)] = t
out = {}
for y in (2022, 2023, 2024, 2025):
    rows = list(csv.DictReader(open(f"{R}/injuries_{y}.csv")))
    cols = list(rows[0].keys())
    st = {"rows": len(rows), "hasDateModified": "date_modified" in cols}
    if st["hasDateModified"]:
        for subset, f in (("all", lambda r: True), ("QB", lambda r: r["position"] == "QB"), ("QB_OutOrDoubtful", lambda r: r["position"] == "QB" and r["report_status"] in ("Out", "Doubtful"))):
            pre = post = nokick = blank = 0; hrs = []
            for r in rows:
                if not f(r): continue
                k = kick.get((y, r["game_type"], int(r["week"]), r["team"]))
                if k is None: nokick += 1; continue
                if not r["date_modified"]: blank += 1; continue
                dm = datetime.fromisoformat(r["date_modified"].replace("Z", "+00:00"))
                if dm < k: pre += 1; hrs.append((k - dm).total_seconds() / 3600)
                else: post += 1
            hrs.sort()
            st[subset] = {"pregame": pre, "atOrAfterKickoff": post, "noKickoffMatch": nokick, "blankStamp": blank,
                          "hoursBeforeKickoff_p5_p50_p95": [round(hrs[int(q * (len(hrs) - 1))], 1) for q in (0.05, 0.5, 0.95)] if hrs else None}
    else:
        st["columns"] = cols
    out[y] = st
print(json.dumps(out, indent=1))
