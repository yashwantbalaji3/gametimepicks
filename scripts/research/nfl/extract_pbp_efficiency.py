#!/usr/bin/env python3
"""
NFL team-game offensive/defensive efficiency from nflverse play-by-play (P295).

Feeds candidate matchup-totals-v3-play-efficiency in
data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json.

Why plays and not points: a final score is ONE noisy number per game; a game has ~130 scrimmage
plays, and expected points added (EPA) per play settles far faster than points per game. This
script only reduces raw play rows to per-team-game sums. It computes no rating, fits nothing, and
reads no outcome beyond what a play row carries — the replay decides what those sums mean.

Play filter (frozen in the preregistration): pass == 1 or rush == 1, EPA present, both teams
present, and not a kneel, spike, two-point attempt or deleted play.

Raw files live in data/internal/research/nfl/raw/nflverse/pbp/ (git-ignored; nflverse, CC BY 4.0).
Writes data/internal/research/nfl/replay/team-game-efficiency-v1.json (derived table, attributed).

Usage: python3 scripts/research/nfl/extract_pbp_efficiency.py
"""
import hashlib
import json
import os
import sys

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PBP = os.path.join(ROOT, "data/internal/research/nfl/raw/nflverse/pbp")
OUT = os.path.join(ROOT, "data/internal/research/nfl/replay/team-game-efficiency-v1.json")
SEASONS = range(1999, 2026)

# Relocations keep one rating stream per franchise; the replay applies the same map to games.csv.
FRANCHISE = {"STL": "LA", "SD": "LAC", "OAK": "LV", "JAC": "JAX", "LAR": "LA"}
COLS = ["game_id", "season", "posteam", "defteam", "epa", "pass", "rush",
        "qb_kneel", "qb_spike", "two_point_attempt", "play_deleted"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


rows = []
sources = []
per_season = {}
for season in SEASONS:
    path = os.path.join(PBP, f"play_by_play_{season}.csv.gz")
    if not os.path.exists(path):
        sys.exit(f"REFUSED: missing {path}")
    header = pd.read_csv(path, nrows=0).columns
    use = [c for c in COLS if c in header]
    missing_required = {"game_id", "posteam", "defteam", "epa", "pass", "rush"} - set(use)
    if missing_required:
        sys.exit(f"REFUSED: {season} lacks {sorted(missing_required)}")
    df = pd.read_csv(path, usecols=use, low_memory=False)

    keep = ((df["pass"] == 1) | (df["rush"] == 1)) & df["epa"].notna() & df["posteam"].notna() & df["defteam"].notna()
    for flag in ("qb_kneel", "qb_spike", "two_point_attempt", "play_deleted"):
        if flag in df:
            keep &= df[flag].fillna(0) != 1
    plays = df[keep]

    off = plays.groupby(["game_id", "posteam", "defteam"]).agg(plays=("epa", "size"), epa=("epa", "sum")).reset_index()
    by_side = {(r.game_id, r.posteam): r for r in off.itertuples(index=False)}
    for r in off.itertuples(index=False):
        opp = by_side.get((r.game_id, r.defteam))
        rows.append({
            "gameId": r.game_id,
            "season": season,
            "team": FRANCHISE.get(r.posteam, r.posteam),
            "oPlays": int(r.plays),
            "oEpa": round(float(r.epa), 4),
            # defence = the opponent's offence in the same game; absent if the opponent ran no counted play
            "dPlays": int(opp.plays) if opp is not None else 0,
            "dEpa": round(float(opp.epa), 4) if opp is not None else 0.0,
        })
    per_season[season] = {"games": int(off["game_id"].nunique()), "countedPlays": int(len(plays)), "rawRows": int(len(df))}
    sources.append({"file": os.path.basename(path), "bytes": os.path.getsize(path), "sha256": sha256(path)})
    print(f"{season}: {per_season[season]['games']} games, {per_season[season]['countedPlays']} counted plays", flush=True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump({
        "schemaVersion": 1,
        "artifact": "nfl-team-game-efficiency",
        "dataClass": "PRIVATE_RESEARCH",
        "attribution": "Data: nflverse (https://github.com/nflverse), licensed CC BY 4.0. Derived per-team-game sums; raw play-by-play is not redistributed here.",
        "playFilter": "pass==1 or rush==1; epa present; posteam and defteam present; not qb_kneel, qb_spike, two_point_attempt or play_deleted",
        "franchiseMap": FRANCHISE,
        "sources": sources,
        "perSeason": per_season,
        "rows": rows,
    }, f, separators=(",", ":"))
print(f"wrote {len(rows)} team-game rows -> {os.path.relpath(OUT, ROOT)}")
