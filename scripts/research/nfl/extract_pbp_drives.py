#!/usr/bin/env python3
"""
NFL drive table + team-game box score from nflverse play-by-play (Session 13 · Simulation Engine V2).

Feeds the drive-level generative simulator `nfl-drive-sim-v2` (SHADOW). The simulator never reads play-by-play:
it reads parameter tables fitted from THIS script's derived output by `scripts/research/nfl/fit-drive-sim-v2.mjs`,
and its validation reads the team-game box table for correlation / distribution checks.

This script only REDUCES raw rows. It fits nothing, rates nothing and reads nothing a play row does not carry.

Outputs (derived, attributed — nflverse, CC BY 4.0):
  data/internal/research/nfl/sim-v2/drives-v1.json.gz        one row per offensive drive (2015–2025, REG+POST)
  data/internal/research/nfl/sim-v2/team-games-v1.json.gz    one row per team-game box score + period points
  data/internal/research/nfl/sim-v2/extract-receipt.json     source SHA256s, filters, counts

Play filter for a scrimmage play: play_type in {pass, run} (incl. sacks and scrambles) or a qb_kneel / qb_spike,
and not a two-point attempt. Penalties with no play (`no_play`) are not plays.

Raw files live in data/internal/research/nfl/raw/nflverse/pbp/ (git-ignored). Standard library only (the local
pandas build is ABI-broken against NumPy 2; nothing here needs it).

Usage: python3 scripts/research/nfl/extract_pbp_drives.py [--first 2015] [--last 2025]
"""
import argparse
import csv
import gzip
import hashlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PBP = os.path.join(ROOT, "data/internal/research/nfl/raw/nflverse/pbp")
OUT_DIR = os.path.join(ROOT, "data/internal/research/nfl/sim-v2")
FRANCHISE = {"STL": "LA", "SD": "LAC", "OAK": "LV", "JAC": "JAX", "LAR": "LA"}
RESULT = {
    "Touchdown": "TD",
    "Field goal": "FG",
    "Missed field goal": "FG_MISS",
    "Punt": "PUNT",
    "Turnover": "TURNOVER",
    "Turnover on downs": "DOWNS",
    "End of half": "END_HALF",
    "Opp touchdown": "OPP_TD",
    "Safety": "SAFETY",
}


def fnum(v, default=None):
    if v is None or v == "" or v == "NA":
        return default
    try:
        return float(v)
    except ValueError:
        return default


def one(v):
    return v == "1" or v == "1.0"


def team(t):
    return FRANCHISE.get(t, t)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def blank_box(game, side, tm, opp):
    return {
        "g": game["g"], "s": game["s"], "st": game["st"], "wk": game["wk"], "tm": tm, "opp": opp, "home": side == "home",
        "passAtt": 0, "cmp": 0, "passYds": 0, "sacks": 0, "sackYds": 0, "scrambles": 0, "rushAtt": 0, "rushYds": 0,
        "kneels": 0, "spikes": 0, "plays": 0, "passTd": 0, "rushTd": 0, "int": 0, "fumLost": 0,
        "fgAtt": 0, "fgMade": 0, "xpAtt": 0, "xpMade": 0, "twoAtt": 0, "twoMade": 0, "safetiesFor": 0,
        "nonOffTd": 0, "drives": 0, "periodPts": {},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--first", type=int, default=2015)
    ap.add_argument("--last", type=int, default=2025)
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    drives_out, boxes_out, sources = [], [], {}
    for season in range(args.first, args.last + 1):
        path = os.path.join(PBP, f"play_by_play_{season}.csv.gz")
        if not os.path.exists(path):
            print(f"missing {path}", file=sys.stderr)
            sys.exit(2)
        sources[os.path.basename(path)] = sha256(path)
        games = {}
        with gzip.open(path, "rt", newline="") as f:
            for row in csv.DictReader(f):
                gid = row["game_id"]
                g = games.get(gid)
                if g is None:
                    home, away = team(row["home_team"]), team(row["away_team"])
                    g = games[gid] = {
                        "g": gid, "s": season, "st": row["season_type"], "wk": int(fnum(row["week"], 0)),
                        "home": home, "away": away, "drives": {}, "order": [],
                        "box": {}, "lastHome": 0, "lastAway": 0, "final": None,
                    }
                    g["box"][home] = blank_box(g, "home", home, away)
                    g["box"][away] = blank_box(g, "away", away, home)

                qtr = int(fnum(row["qtr"], 0))
                hs, as_ = fnum(row["total_home_score"]), fnum(row["total_away_score"])
                # Period points: attribute every score change to the quarter it happened in (qtr 5 = OT).
                if hs is not None and as_ is not None:
                    dh, da = hs - g["lastHome"], as_ - g["lastAway"]
                    if dh:
                        p = g["box"][g["home"]]["periodPts"]
                        p[str(qtr)] = p.get(str(qtr), 0) + dh
                    if da:
                        p = g["box"][g["away"]]["periodPts"]
                        p[str(qtr)] = p.get(str(qtr), 0) + da
                    g["lastHome"], g["lastAway"] = hs, as_
                    g["final"] = (hs, as_)

                pos = team(row["posteam"]) if row["posteam"] else None
                ptype = row["play_type"]
                if pos is None or pos not in g["box"]:
                    continue
                box = g["box"][pos]
                deff = g["box"][g["away"] if pos == g["home"] else g["home"]]

                # Kicking and conversion tallies (not scrimmage plays).
                if ptype == "field_goal":
                    box["fgAtt"] += 1
                    if row["field_goal_result"] == "made":
                        box["fgMade"] += 1
                if ptype == "extra_point":
                    box["xpAtt"] += 1
                    if row["extra_point_result"] == "good":
                        box["xpMade"] += 1
                if one(row["two_point_attempt"]):
                    box["twoAtt"] += 1
                    if row["two_point_conv_result"] == "success":
                        box["twoMade"] += 1
                    continue
                if one(row["safety"]):
                    deff["safetiesFor"] += 1
                if one(row["return_touchdown"]) and row["td_team"]:
                    tdt = team(row["td_team"])
                    if tdt in g["box"]:
                        g["box"][tdt]["nonOffTd"] += 1

                is_scrim = ptype in ("pass", "run", "qb_kneel", "qb_spike")
                drive_no = row["fixed_drive"]
                if not is_scrim or not drive_no:
                    continue

                key = (pos, drive_no)
                d = g["drives"].get(key)
                if d is None:
                    diff = (fnum(row["posteam_score"], 0) or 0) - (fnum(row["defteam_score"], 0) or 0)
                    d = g["drives"][key] = {
                        "g": gid, "s": season, "st": row["season_type"], "pos": pos, "home": pos == g["home"],
                        "d": int(fnum(drive_no, 0)), "q": qtr,
                        "t0": fnum(row["game_seconds_remaining"]), "h0": fnum(row["half_seconds_remaining"]),
                        "diff": diff, "y0": fnum(row["yardline_100"]),
                        "res": RESULT.get(row["fixed_drive_result"], "OTHER"),
                        "plays": 0, "passAtt": 0, "cmp": 0, "sacks": 0, "scrambles": 0, "rushAtt": 0, "kneels": 0,
                        "spikes": 0, "passYds": 0, "rushYds": 0, "netYds": 0, "t1": None, "tdType": None,
                    }
                    g["order"].append(key)
                d["t1"] = fnum(row["game_seconds_remaining"])
                yds = fnum(row["yards_gained"], 0) or 0
                d["plays"] += 1
                box["plays"] += 1
                if ptype == "qb_kneel":
                    d["kneels"] += 1; box["kneels"] += 1
                elif ptype == "qb_spike":
                    d["spikes"] += 1; box["spikes"] += 1
                elif one(row["sack"]):
                    d["sacks"] += 1; box["sacks"] += 1; box["sackYds"] += -yds
                elif one(row["qb_scramble"]):
                    d["scrambles"] += 1; box["scrambles"] += 1
                    d["rushYds"] += yds; box["rushYds"] += yds
                elif ptype == "pass":
                    d["passAtt"] += 1; box["passAtt"] += 1
                    if one(row["complete_pass"]):
                        d["cmp"] += 1; box["cmp"] += 1
                        d["passYds"] += yds; box["passYds"] += yds
                    if one(row["interception"]):
                        box["int"] += 1
                elif ptype == "run":
                    d["rushAtt"] += 1; box["rushAtt"] += 1
                    d["rushYds"] += yds; box["rushYds"] += yds
                d["netYds"] += yds
                if one(row["fumble_lost"]):
                    box["fumLost"] += 1
                if one(row["pass_touchdown"]) and not one(row["return_touchdown"]):
                    d["tdType"] = "PASS"; box["passTd"] += 1
                elif one(row["rush_touchdown"]) and not one(row["return_touchdown"]):
                    d["tdType"] = "RUSH"; box["rushTd"] += 1

        for gid, g in games.items():
            if g["final"] is None:
                continue
            order = g["order"]
            for i, key in enumerate(order):
                d = g["drives"][key]
                # Duration = clock from this drive's first play to the next drive's first play (or last play here).
                nxt = g["drives"][order[i + 1]]["t0"] if i + 1 < len(order) else d["t1"]
                d["dur"] = None if d["t0"] is None or nxt is None else max(0.0, d["t0"] - nxt)
                del d["t1"]
                g["box"][d["pos"]]["drives"] += 1
                drives_out.append(d)
            hs, as_ = g["final"]
            for side, tm in (("home", g["home"]), ("away", g["away"])):
                b = g["box"][tm]
                b["pts"] = hs if side == "home" else as_
                b["oppPts"] = as_ if side == "home" else hs
                boxes_out.append(b)
        print(f"{season}: {len(games)} games", file=sys.stderr)

    def dump(name, rows):
        p = os.path.join(OUT_DIR, name)
        # mtime=0 keeps the gzip bytes deterministic across reruns.
        with open(p, "wb") as raw:
            with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as z:
                z.write(json.dumps(rows, separators=(",", ":"), sort_keys=True).encode())
        return p

    dump("drives-v1.json.gz", drives_out)
    dump("team-games-v1.json.gz", boxes_out)
    receipt = {
        "script": "scripts/research/nfl/extract_pbp_drives.py",
        "source": "nflverse play-by-play (CC BY 4.0)",
        "seasons": [args.first, args.last],
        "sources": sources,
        "counts": {"drives": len(drives_out), "teamGames": len(boxes_out)},
        "filters": "scrimmage = pass/run/kneel/spike, two-point attempts excluded; franchise map " + json.dumps(FRANCHISE),
    }
    with open(os.path.join(OUT_DIR, "extract-receipt.json"), "w") as f:
        json.dump(receipt, f, indent=2, sort_keys=True)
        f.write("\n")
    print(json.dumps(receipt["counts"]))


if __name__ == "__main__":
    main()
