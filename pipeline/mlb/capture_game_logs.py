"""MLB per-game batter and pitcher box lines, archived by date (MS-2a). PRIVATE research input.

WHY IT EXISTS. MS-2 (architecture audit Part II) replaces E3's batter inputs, which today are the demoted
E1 prop projections, with independent point-in-time batter and pitcher talent. That needs every player's
game lines for 2023-2026 with a date on each, so an estimate "as of D" can fold only games before D. The
repo has none of it: E1 fetches season game logs live at run time and keeps nothing, and the pregame
feature archive starts 2026-07-22.

SOURCE. The MLB Stats API, the free source the board and settlement already use (mlb_stats.py). Two calls:
`/schedule?date=` (via mlb_stats.fetch_schedule) and `/game/{gamePk}/boxscore` per final game. That host is
blocked from the cloud sandbox and reachable from GitHub Actions, so this runs in
.github/workflows/mlb-game-logs.yml. Tests run offline from saved fixtures (`--fixtures-dir`).

WHAT IS WRITTEN. data/internal/mlb/game-logs/<season>/<YYYY-MM-DD>.json, one file per date:
    games[]      one record per final game, with capturedAt, both teams, and every batter and pitcher line
    gaps[]       a final game whose box lines could not be captured, or a game not final yet, with the
                 reason and capturedAt. A gap is MISSING data, never zero: no rows are written for it.
    notPlayed[]  postponed / cancelled / suspended games, with the schedule's status. Not a gap: there is
                 nothing to capture.
    runs[]       one entry per capture run (capturedAt, counts).
Nothing public reads these files. `productEligible: false` on every file.

APPEND-ONLY. A game already in `games` is never rewritten, even if the provider later corrects a box line
(the first capture is the record; a correction would be a new, separately dated capture design). A run may
only ADD: new games (including ones that were gaps before), new gaps, new notPlayed entries, a new run. Old
gap entries stay as history; `openGaps` is the derived list still unresolved. The writer refuses (exit 3)
if a write would drop or change an existing record.

MISSING IS NOT ZERO. A stat the provider did not send is written as null and named in the row's
`missingFields`; it is never filled with 0. Totals are not derived when an input is missing.

Run (Actions):  python3 -m pipeline.mlb.capture_game_logs --date 2026-10-06
                python3 -m pipeline.mlb.capture_game_logs --backfill-start 2023-03-30 --backfill-end 2023-10-01 --max-days 40
Offline:        python3 -m pipeline.mlb.capture_game_logs --date 2026-10-06 --fixtures-dir <dir> --out-root <dir>
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
from typing import Any, Callable

REPO = pathlib.Path(__file__).resolve().parent.parent.parent
DEFAULT_OUT_ROOT = REPO / "data" / "internal" / "mlb" / "game-logs"
SCHEMA_VERSION = 1
SOURCE = "mlb-statsapi"

# Regular season and postseason only. Spring training ("S") and exhibitions ("E") are not talent evidence
# for this purpose and would roughly double the archive.
CAPTURED_GAME_TYPES = {"R", "F", "D", "L", "W"}
NOT_PLAYED_STATES = ("postponed", "cancelled", "canceled", "suspended")

BATTING_FIELDS = {
    "pa": "plateAppearances", "ab": "atBats", "h": "hits", "doubles": "doubles", "triples": "triples",
    "hr": "homeRuns", "bb": "baseOnBalls", "ibb": "intentionalWalks", "hbp": "hitByPitch", "so": "strikeOuts",
    "r": "runs", "rbi": "rbi", "sb": "stolenBases", "cs": "caughtStealing", "sf": "sacFlies", "sh": "sacBunts",
    "gidp": "groundIntoDoublePlay", "tb": "totalBases",
}
PITCHING_FIELDS = {
    "bf": "battersFaced", "h": "hits", "r": "runs", "er": "earnedRuns", "bb": "baseOnBalls",
    "ibb": "intentionalWalks", "hbp": "hitByBatsman", "so": "strikeOuts", "hr": "homeRuns",
    "pitches": "numberOfPitches", "strikes": "strikes",
}


class CaptureRefused(Exception):
    """A write would break append-only, or the input is unusable. Exit 3."""


def _int_or_none(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.strip().lstrip("-").isdigit():
        return int(v.strip())
    return None


def outs_from_innings(ip: Any) -> int | None:
    """'5.2' → 17 outs. The decimal is thirds, not tenths. None if absent or malformed."""
    if ip is None:
        return None
    s = str(ip).strip()
    if not s or s in ("-", "--"):
        return None
    whole, _, frac = s.partition(".")
    if not whole.isdigit() or (frac and frac not in ("0", "1", "2")):
        return None
    return int(whole) * 3 + (int(frac) if frac else 0)


def _stat_block(raw: dict, fields: dict[str, str]) -> tuple[dict, list[str]]:
    out, missing = {}, []
    for key, api in fields.items():
        v = _int_or_none(raw.get(api))
        out[key] = v
        if v is None:
            missing.append(key)
    return out, missing


def _team_meta(side: dict) -> dict:
    t = side.get("team") or {}
    return {"teamId": t.get("id"), "teamAbbr": t.get("abbreviation")}


def batter_rows(side: dict) -> list[dict]:
    """Every player who batted (PA > 0) or holds a batting-order slot. Order follows the box batting order."""
    players = side.get("players") or {}
    order = [f"ID{pid}" for pid in (side.get("batters") or [])]
    seen, rows = set(), []
    for key in order + sorted(players.keys()):
        if key in seen or key not in players:
            continue
        seen.add(key)
        rec = players[key]
        bat = (rec.get("stats") or {}).get("batting") or {}
        slot = rec.get("battingOrder")
        pa = _int_or_none(bat.get("plateAppearances"))
        if not bat or (not slot and not pa):
            continue
        stats, missing = _stat_block(bat, BATTING_FIELDS)
        person = rec.get("person") or {}
        rows.append({
            "playerId": person.get("id"),
            "name": person.get("fullName"),
            "battingOrder": str(slot) if slot else None,  # "100" = starter in slot 1; "101" = first sub there
            "position": (rec.get("position") or {}).get("abbreviation"),
            **stats,
            "missingFields": missing,
        })
    return rows


def pitcher_rows(side: dict) -> list[dict]:
    """Pitchers in the order they appeared; the first is the starter."""
    players = side.get("players") or {}
    rows = []
    for i, pid in enumerate(side.get("pitchers") or []):
        rec = players.get(f"ID{pid}") or {}
        pit = (rec.get("stats") or {}).get("pitching") or {}
        stats, missing = _stat_block(pit, PITCHING_FIELDS)
        outs = _int_or_none(pit.get("outs"))
        if outs is None:
            outs = outs_from_innings(pit.get("inningsPitched"))
        if outs is None:
            missing.append("outs")
        person = rec.get("person") or {}
        rows.append({
            "playerId": person.get("id", pid),
            "name": person.get("fullName"),
            "appearanceOrder": i + 1,
            "isStarter": i == 0,
            "outs": outs,
            **stats,
            "missingFields": missing,
        })
    return rows


def classify(game: dict) -> str:
    """'final' | 'not_played' | 'not_final' from the schedule's status block."""
    status = game.get("status") or {}
    detailed = str(status.get("detailedState") or "").lower()
    if any(s in detailed for s in NOT_PLAYED_STATES):
        return "not_played"
    if status.get("abstractGameState") == "Final" or status.get("codedGameState") == "F":
        return "final"
    return "not_final"


def game_record(game: dict, box: dict, captured_at: str) -> dict:
    teams = box.get("teams") or {}
    away, home = teams.get("away") or {}, teams.get("home") or {}
    if not (away.get("players") and home.get("players")):
        raise CaptureRefused("boxscore has no player lines for one side")
    return {
        "gamePk": game.get("gamePk"),
        "gameType": game.get("gameType"),
        "gameDate": game.get("gameDate"),
        "doubleHeader": game.get("doubleHeader"),
        "gameNumber": game.get("gameNumber"),
        "venueId": (game.get("venue") or {}).get("id"),
        "status": (game.get("status") or {}).get("detailedState"),
        "capturedAt": captured_at,
        "away": {**_team_meta(away), "batters": batter_rows(away), "pitchers": pitcher_rows(away)},
        "home": {**_team_meta(home), "batters": batter_rows(home), "pitchers": pitcher_rows(home)},
    }


def capture_date(
    date: str,
    fetch_schedule: Callable[[str], list[dict]],
    fetch_boxscore: Callable[[int], dict],
    captured_at: str,
    already: set[int] | None = None,
) -> dict:
    """Pure over its two fetchers. Returns new games / gaps / notPlayed for one date (skipping `already`)."""
    already = already or set()
    games, gaps, not_played = [], [], []
    schedule = fetch_schedule(date)
    for g in schedule:
        pk = g.get("gamePk")
        if g.get("gameType") not in CAPTURED_GAME_TYPES or pk in already:
            continue
        # A game rescheduled to another date appears on both dates' schedules; capture it only on the date
        # it was actually played (officialDate), so one game is never two records.
        if g.get("officialDate") and g.get("officialDate") != date:
            continue
        kind = classify(g)
        if kind == "not_played":
            not_played.append({"gamePk": pk, "status": (g.get("status") or {}).get("detailedState"), "capturedAt": captured_at})
            continue
        if kind == "not_final":
            gaps.append({"gamePk": pk, "reason": "NOT_FINAL_AT_CAPTURE", "status": (g.get("status") or {}).get("detailedState"), "capturedAt": captured_at})
            continue
        try:
            games.append(game_record(g, fetch_boxscore(pk), captured_at))
        except Exception as e:  # one bad box must not lose the rest of the date; it is recorded, not hidden
            gaps.append({"gamePk": pk, "reason": "BOXSCORE_UNAVAILABLE", "detail": str(e)[:200], "capturedAt": captured_at})
    return {"games": games, "gaps": gaps, "notPlayed": not_played, "scheduleGames": len(schedule)}


def merge_append_only(existing: dict | None, date: str, fresh: dict, captured_at: str) -> dict:
    """Add `fresh` to `existing` without changing any existing record. Raises CaptureRefused otherwise."""
    doc = json.loads(json.dumps(existing)) if existing else {
        "schemaVersion": SCHEMA_VERSION, "artifact": "mlb-game-logs", "dataClass": "RESEARCH_INPUT",
        "public": False, "productEligible": False, "source": SOURCE, "date": date,
        "firstCapturedAt": captured_at, "games": [], "gaps": [], "notPlayed": [], "runs": [],
    }
    if doc.get("date") != date:
        raise CaptureRefused(f"file date {doc.get('date')} does not match {date}")
    have = {g["gamePk"] for g in doc["games"]}
    added = [g for g in fresh["games"] if g["gamePk"] not in have]
    doc["games"].extend(added)
    known_np = {n["gamePk"] for n in doc["notPlayed"]}
    doc["notPlayed"].extend(n for n in fresh["notPlayed"] if n["gamePk"] not in known_np)
    doc["gaps"].extend(fresh["gaps"])
    captured = {g["gamePk"] for g in doc["games"]} | {n["gamePk"] for n in doc["notPlayed"]}
    open_gaps = sorted({x["gamePk"] for x in doc["gaps"]} - captured)
    doc["openGaps"] = open_gaps
    doc["complete"] = not open_gaps
    doc["runs"].append({"capturedAt": captured_at, "scheduleGames": fresh.get("scheduleGames"), "gamesAdded": len(added), "gapsRecorded": len(fresh["gaps"]), "notPlayedAdded": len(fresh["notPlayed"])})
    assert_append_only(existing, doc)
    return doc


def assert_append_only(before: dict | None, after: dict) -> None:
    if not before:
        return
    for key in ("games", "gaps", "notPlayed", "runs"):
        b, a = before.get(key) or [], after.get(key) or []
        if a[: len(b)] != b:
            raise CaptureRefused(f"append-only violated: existing {key} records changed or removed")
    for key in ("firstCapturedAt", "date", "source"):
        if before.get(key) != after.get(key):
            raise CaptureRefused(f"append-only violated: {key} changed")


def date_path(out_root: pathlib.Path, date: str) -> pathlib.Path:
    return out_root / date[:4] / f"{date}.json"


def run_date(date: str, out_root: pathlib.Path, fetch_schedule, fetch_boxscore, captured_at: str, dry_run: bool = False) -> dict:
    p = date_path(out_root, date)
    existing = json.loads(p.read_text()) if p.exists() else None
    if existing and existing.get("complete"):
        return {"date": date, "skipped": "complete", "gamesAdded": 0, "openGaps": []}
    already = {g["gamePk"] for g in (existing or {}).get("games", [])} | {n["gamePk"] for n in (existing or {}).get("notPlayed", [])}
    fresh = capture_date(date, fetch_schedule, fetch_boxscore, captured_at, already)
    doc = merge_append_only(existing, date, fresh, captured_at)
    if not dry_run:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(f".json.tmp-{os.getpid()}")
        tmp.write_text(json.dumps(doc, separators=(",", ":"), sort_keys=False) + "\n")
        tmp.replace(p)  # a crash mid-write never leaves a half-written day
    return {"date": date, "gamesAdded": doc["runs"][-1]["gamesAdded"], "openGaps": doc["openGaps"], "complete": doc["complete"]}


def _fixture_fetchers(fx: pathlib.Path):
    def sched(date: str) -> list[dict]:
        f = fx / f"schedule-{date}.json"
        if not f.exists():
            return []
        payload = json.loads(f.read_text())
        return [g for d in payload.get("dates", []) if d.get("date") == date for g in d.get("games", [])]

    def box(pk: int) -> dict:
        f = fx / f"boxscore-{pk}.json"
        if not f.exists():
            raise FileNotFoundError(f"no fixture boxscore for {pk}")
        return json.loads(f.read_text())

    return sched, box


def _live_fetchers():
    from . import mlb_stats  # the board's own client: same host, same retries, same User-Agent

    def box(pk: int) -> dict:
        return mlb_stats._http_get(f"/game/{pk}/boxscore")

    return mlb_stats.fetch_schedule, box


def _dates(start: str, end: str) -> list[str]:
    a, b = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    if b < a:
        raise ValueError("backfill end is before start")
    return [(a + dt.timedelta(days=i)).isoformat() for i in range((b - a).days + 1)]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date", help="YYYY-MM-DD; default = yesterday (UTC)")
    ap.add_argument("--backfill-start")
    ap.add_argument("--backfill-end")
    ap.add_argument("--max-days", type=int, default=0, help="cap dates processed this run (resumable backfill)")
    ap.add_argument("--out-root", default=str(DEFAULT_OUT_ROOT))
    ap.add_argument("--fixtures-dir", help="offline: read schedule-<date>.json / boxscore-<pk>.json from here")
    ap.add_argument("--captured-at", help="override the capture timestamp (tests only)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    if bool(a.backfill_start) != bool(a.backfill_end):
        ap.error("--backfill-start and --backfill-end go together")
    if a.backfill_start:
        dates = _dates(a.backfill_start, a.backfill_end)
    else:
        dates = [a.date or (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)).isoformat()]
    out_root = pathlib.Path(a.out_root)
    sched, box = _fixture_fetchers(pathlib.Path(a.fixtures_dir)) if a.fixtures_dir else _live_fetchers()

    processed, total_added, refused, open_dates = 0, 0, [], []
    for d in dates:
        if a.max_days and processed >= a.max_days:
            break
        p = date_path(out_root, d)
        if p.exists() and json.loads(p.read_text()).get("complete"):
            continue  # complete days cost nothing and do not count against --max-days
        captured_at = a.captured_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        try:
            r = run_date(d, out_root, sched, box, captured_at, dry_run=a.dry_run)
        except CaptureRefused as e:
            refused.append(f"{d}: {e}")
            continue
        except Exception as e:  # schedule unreachable etc. — nothing written for that date, and it says so
            refused.append(f"{d}: schedule fetch failed: {str(e)[:200]}")
            continue
        processed += 1
        total_added += r["gamesAdded"]
        if r["openGaps"]:
            open_dates.append(f"{d} ({len(r['openGaps'])} open)")
        print(f"[game-logs] {d}: +{r['gamesAdded']} games, open gaps {len(r['openGaps'])}")

    print(f"[game-logs] dates processed {processed}, games added {total_added}, dates with open gaps {len(open_dates)}, refused {len(refused)}")
    for line in open_dates:
        print(f"  open: {line}")
    for line in refused:
        print(f"  REFUSED {line}", file=sys.stderr)
    return 3 if refused else 0


if __name__ == "__main__":
    sys.exit(main())
