"""First touchdown of every 2014-2025 game from nflverse play-by-play (git-ignored raw, read-only).

Output per game: first TD play (in play_id order), scorer gsis id, scoring team, class OFF (a rushing/receiving
or offensive-recovery touchdown credited to a player of the possessing team) or DEF_ST (interception/fumble return,
kick/punt return, blocked kick), or NONE (no touchdown in the game). Also per game: total TDs, number of DEF_ST TDs.
Usage: python3 -I 02_pbp_first_td.py <pbpDir> <outJson>
"""
import csv, gzip, json, sys

pbp_dir, out_path = sys.argv[1], sys.argv[2]
csv.field_size_limit(10**9)
games = {}
for season in range(2014, 2026):
    with gzip.open(f"{pbp_dir}/play_by_play_{season}.csv.gz", "rt", newline="") as fh:
        rd = csv.DictReader(fh)
        for r in rd:
            gid = r["game_id"]
            g = games.get(gid)
            if g is None:
                g = games[gid] = {"gameId": gid, "season": season, "seasonType": r["season_type"], "home": r["home_team"], "away": r["away_team"],
                                  "first": None, "tds": 0, "defSt": 0, "offByPlayer": {}}
            if r["touchdown"] not in ("1", "1.0"):
                continue
            pass_td = r["pass_touchdown"] in ("1", "1.0")
            rush_td = r["rush_touchdown"] in ("1", "1.0")
            ret_td = r["return_touchdown"] in ("1", "1.0")
            td_team = r["td_team"]
            off = pass_td or rush_td or (td_team == r["posteam"] and not ret_td and r["play_type"] not in ("kickoff", "punt"))
            cls = "OFF" if off else "DEF_ST"
            g["tds"] += 1
            if cls == "DEF_ST":
                g["defSt"] += 1
            else:
                pid = r["td_player_id"]
                g["offByPlayer"][pid] = g["offByPlayer"].get(pid, 0) + 1
            if g["first"] is None:
                g["first"] = {"playId": int(float(r["play_id"])), "qtr": r["qtr"], "class": cls, "tdTeam": td_team, "playerId": r["td_player_id"] or None,
                              "playerName": r["td_player_name"] or None, "desc": r["desc"][:160]}
for g in games.values():
    if g["first"] is None:
        g["first"] = {"class": "NONE"}
json.dump({"source": f"{pbp_dir}/play_by_play_2014..2025.csv.gz (nflverse, CC BY 4.0)", "games": list(games.values())}, open(out_path, "w"))
from collections import Counter
print(len(games), Counter(g["first"]["class"] for g in games.values()), sum(g["tds"] for g in games.values()))
