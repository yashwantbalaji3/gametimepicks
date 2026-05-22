"""Persist pregame curated projections before games start.

The homepage / sport pages render a "Tonight's curated projections"
rail picked by `app/src/lib/curated-projections.ts::selectCuratedPicks`.
Without persistence we have no way to grade those picks honestly —
this CLI freezes today's curated set BEFORE games begin, so the
grader can later score them against settled results.

CLI:

    pipeline/.venv/bin/python -m pipeline.snapshot_curated --date YYYY-MM-DD
    pipeline/.venv/bin/python -m pipeline.snapshot_curated --date YYYY-MM-DD --dry-run

What this WILL do
  * Read NBA + MLB boards for `date`.
  * Apply the same selection rules as the UI helper:
    - Over/Under only (no Pass)
    - market floors (NBA REB ≥3pp; PTS/AST ≥5pp; MLB Hits/TB ≥4pp;
      MLB K ≥5pp)
    - skip insufficient_data / no_play
    - skip anomaly-flagged leans (|edge| > 25pp NBA / 20pp MLB)
    - skip calibration-inverted (sport, tier) combos (currently MLB
      High based on settled-row audit; rebuilt from
      model_audit.json each run)
    - max 6 picks total, 3 per sport
  * Assign stable picks by hashing date + leg key so reruns are
    idempotent.
  * Write `app/public/data/curated/snapshots/<date>.json` with
    status `pending`; grader fills `result` later.
  * Skip games whose ISO commenceTime / tipoff has already passed
    at run time (best effort).

What this WILL NOT do
  * Generate fake historical curated picks for past dates.
  * Invent picks for sports without a projection pipeline.
  * Promise a hit rate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Any


SNAPSHOT_DIR = os.path.join("app", "public", "data", "curated", "snapshots")
SUMMARY_PATH = os.path.join("app", "public", "data", "curated", "summary.json")
AUDIT_PATH = os.path.join("app", "public", "data", "audit", "model_audit.json")


# Mirrors app/src/lib/confidence-calibration.ts. Kept here so the
# Python snapshot can apply the same calibration gates without a TS
# round-trip. The test suite locks the rules against the TS table.
_THIN_SAMPLE = 60
_INVERTED_MARGIN_PP = 0.015  # 1.5 pp
_STRONG_HITRATE = 0.57
_STRONG_MIN_SAMPLE = 100


@dataclass(frozen=True)
class MarketRule:
    """Per-(sport, market) gating, mirroring the TS curated helper."""
    sport: str
    market: str
    min_edge_pct: float
    reason_tag: str  # "strong-market" / "watchlist" / "high-variance"
    reason_label: str
    score_boost: float = 0.0


_MARKET_RULES: dict[str, MarketRule] = {
    "nba:REB": MarketRule("nba", "REB", 3.0, "strong-market", "Strong market", 0.5),
    "nba:PTS": MarketRule("nba", "PTS", 5.0, "watchlist", "Watchlist"),
    "nba:AST": MarketRule("nba", "AST", 5.0, "watchlist", "Watchlist"),
    "mlb:batter_hits": MarketRule("mlb", "batter_hits", 4.0, "watchlist", "Watchlist", 0.1),
    "mlb:batter_total_bases": MarketRule("mlb", "batter_total_bases", 4.0, "watchlist", "Watchlist"),
    "mlb:pitcher_strikeouts": MarketRule("mlb", "pitcher_strikeouts", 5.0, "high-variance", "High-variance"),
    "mlb:batter_hits_runs_rbis": MarketRule("mlb", "batter_hits_runs_rbis", 4.0, "watchlist", "Watchlist"),
}


@dataclass(frozen=True)
class CuratedLeg:
    sport: str
    gameId: str | None
    gameDate: str
    playerId: int | None
    playerName: str
    team: str | None
    opponent: str | None
    market: str
    marketLabel: str | None
    side: str
    line: float | None
    projection: float | None
    edgePct: float | None
    confidence: str | None
    bookmaker: str | None
    oddsForSide: int | None
    reasonTag: str
    reasonLabel: str
    health: str  # "strong" / "watch" / "thin" / "inverted" / "unknown"
    score: float
    riskFlags: list[str] = field(default_factory=list)


def _read_json(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        return json.load(open(path, "r", encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _audit_health(sport: str, tier: str | None) -> str:
    """Reproduce the calibration helper's classifyTier logic against
    the live `model_audit.json`. Falls back to "unknown" when the
    audit is missing or the tier isn't recorded."""
    if not tier:
        return "unknown"
    audit = _read_json(AUDIT_PATH)
    if not audit:
        return "unknown"
    sport_row = (audit.get("sports") or {}).get(sport) or {}
    by_conf = sport_row.get("byConfidence") or []
    table: dict[str, dict] = {r["label"]: r for r in by_conf if r.get("label")}
    row = table.get(tier)
    if not row:
        return "unknown"
    decisive = row.get("decisive") or (row.get("wins", 0) + row.get("losses", 0))
    hit_rate = row.get("hitRate")
    if hit_rate is None and decisive > 0:
        hit_rate = row.get("wins", 0) / decisive

    if decisive < _THIN_SAMPLE:
        return "thin"

    if tier == "High":
        rivals = [
            (lbl, r)
            for lbl, r in table.items()
            if lbl != tier
            and lbl not in ("insufficient_data", "no_play")
        ]
        rivals = [
            (lbl, r)
            for lbl, r in rivals
            if (r.get("decisive") or r.get("wins", 0) + r.get("losses", 0)) >= _THIN_SAMPLE
        ]
        if len(rivals) >= 2:
            all_beat = True
            for _, r in rivals:
                d = r.get("decisive") or r.get("wins", 0) + r.get("losses", 0)
                rhr = r.get("hitRate") or (r.get("wins", 0) / d if d > 0 else 0.0)
                if rhr - (hit_rate or 0) < _INVERTED_MARGIN_PP:
                    all_beat = False
                    break
            if all_beat:
                return "inverted"

    if (hit_rate or 0) >= _STRONG_HITRATE and decisive >= _STRONG_MIN_SAMPLE:
        return "strong"
    return "watch"


def _is_anomaly(sport: str, lean: dict) -> bool:
    if "suspicious_edge" in (lean.get("riskFlags") or []):
        return True
    e = abs(float(lean.get("edgePct") or 0))
    cap = 20.0 if sport == "mlb" else 25.0
    return e > cap


def _confidence_weight(conf: str | None) -> float:
    return {"High": 1.0, "Medium": 0.85, "Low": 0.4}.get(conf or "", 0.0)


def _eligible_score(sport: str, lean: dict) -> tuple[float, MarketRule] | None:
    side = lean.get("lean") or lean.get("side")
    if side not in ("Over", "Under"):
        return None
    edge = lean.get("edgePct")
    if not isinstance(edge, (int, float)):
        return None
    if _is_anomaly(sport, lean):
        return None

    market_key = lean.get("marketKey") or lean.get("market")
    if not market_key:
        return None
    rule = _MARKET_RULES.get(f"{sport}:{market_key}")
    if not rule:
        return None

    abs_edge = abs(float(edge))
    if abs_edge < rule.min_edge_pct:
        return None

    conf = lean.get("confidence")
    health = _audit_health(sport, conf)
    if health == "inverted":
        return None

    cw = _confidence_weight(conf)
    if cw == 0.0:
        return None

    score = (
        cw * 0.55
        + min(1.0, abs_edge / 12.0) * 0.30
        + rule.score_boost
        + (0.15 if health == "strong" else 0.0)
        + (0.05 if health == "thin" else 0.0)
    )
    return score, rule


def _load_nba_leans(date: str) -> list[dict]:
    p = os.path.join("app", "public", "data", "boards", f"{date}.json")
    board = _read_json(p) or {}
    return [{**l, "_sport": "nba"} for l in (board.get("leans") or []) if isinstance(l, dict)]


def _load_mlb_leans(date: str) -> list[dict]:
    p = os.path.join("app", "public", "data", "mlb", "boards", f"{date}.json")
    board = _read_json(p) or {}
    out: list[dict] = []
    for ml in board.get("leans") or []:
        if not isinstance(ml, dict):
            continue
        out.append({
            "_sport": "mlb",
            "gameId": ml.get("gameId"),
            "playerId": ml.get("playerId"),
            "playerName": ml.get("playerName"),
            "team": ml.get("playerTeamAbbr"),
            "opponent": ml.get("opponentAbbr"),
            "market": ml.get("marketKey"),
            "marketLabel": ml.get("marketLabel") or ml.get("marketKey"),
            "lean": ml.get("lean"),
            "line": ml.get("line"),
            "projection": ml.get("projection"),
            "edgePct": ml.get("edgePct"),
            "confidence": ml.get("confidence"),
            "oddsOver": ml.get("oddsOver"),
            "oddsUnder": ml.get("oddsUnder"),
            "bookmaker": ml.get("bookmaker"),
            "riskFlags": ml.get("riskFlags") or [],
            "tipoff": ml.get("commenceTime"),
        })
    return out


def _filter_unstarted(leans: list[dict], now_iso: str | None) -> list[dict]:
    if now_iso is None:
        return leans
    out: list[dict] = []
    for l in leans:
        tip = l.get("tipoff")
        if isinstance(tip, str) and "T" in tip:
            try:
                if datetime.fromisoformat(tip.replace("Z", "+00:00")) < datetime.fromisoformat(now_iso.replace("Z", "+00:00")):
                    continue
            except ValueError:
                pass
        out.append(l)
    return out


def _lean_to_leg(
    lean: dict, sport: str, date: str, rule: MarketRule, health: str, score: float,
) -> CuratedLeg:
    side = lean.get("lean") or lean.get("side") or ""
    odds = (
        lean.get("oddsOver") if side == "Over"
        else lean.get("oddsUnder") if side == "Under"
        else None
    )
    return CuratedLeg(
        sport=sport,
        gameId=str(lean.get("gameId")) if lean.get("gameId") else None,
        gameDate=date,
        playerId=lean.get("playerId"),
        playerName=lean.get("playerName") or "—",
        team=lean.get("team"),
        opponent=lean.get("opponent"),
        market=lean.get("market") or lean.get("marketKey") or "—",
        marketLabel=lean.get("marketLabel"),
        side=side,
        line=lean.get("line"),
        projection=lean.get("projection"),
        edgePct=lean.get("edgePct"),
        confidence=lean.get("confidence"),
        bookmaker=lean.get("bookmaker"),
        oddsForSide=odds,
        reasonTag=rule.reason_tag,
        reasonLabel=rule.reason_label,
        health=health,
        score=round(score, 4),
        riskFlags=lean.get("riskFlags") or [],
    )


def build_snapshot(
    date: str,
    *,
    now_iso: str | None = None,
    max_picks: int = 6,
    max_per_sport: int = 3,
) -> dict[str, Any]:
    """Pure function. Returns the curated-snapshot payload."""
    nba_leans = _filter_unstarted(_load_nba_leans(date), now_iso)
    mlb_leans = _filter_unstarted(_load_mlb_leans(date), now_iso)

    scored: list[tuple[float, dict, MarketRule, str, str]] = []
    # (score, lean, rule, sport, health)
    for sport, pool in (("nba", nba_leans), ("mlb", mlb_leans)):
        for lean in pool:
            r = _eligible_score(sport, lean)
            if r is None:
                continue
            score, rule = r
            health = _audit_health(sport, lean.get("confidence"))
            scored.append((score, lean, rule, sport, health))

    scored.sort(key=lambda x: -x[0])

    picks: list[CuratedLeg] = []
    sport_counts: dict[str, int] = {"nba": 0, "mlb": 0}
    for score, lean, rule, sport, health in scored:
        if len(picks) >= max_picks:
            break
        if sport_counts.get(sport, 0) >= max_per_sport:
            continue
        picks.append(_lean_to_leg(lean, sport, date, rule, health, score))
        sport_counts[sport] = sport_counts.get(sport, 0) + 1

    sports_included = sorted({p.sport for p in picks})

    return {
        "_disclaimer": (
            "Pregame curated picks captured before games started. "
            "Status starts at 'pending'; pipeline.grade_curated fills "
            "result fields after settlement. No fake history; no "
            "fabricated picks."
        ),
        "date": date,
        "generatedAt": now_iso or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sportsIncluded": sports_included,
        "sourceBoardDates": [date],
        "picksCount": len(picks),
        "picks": [{
            **asdict(p),
            # Stable per-pick id used by the grader to dedupe across reruns.
            "pickId": _stable_pick_id(date, p),
            "status": "pending",
        } for p in picks],
    }


def _stable_pick_id(date: str, leg: CuratedLeg) -> str:
    parts = [
        date,
        str(leg.playerId or leg.playerName),
        leg.market,
        leg.side,
        f"{(leg.line or 0):.2f}",
    ]
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"curated_{date}_{h}"


def write_snapshot(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)
    path = os.path.join(SNAPSHOT_DIR, f"{date}.json")
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)
    return path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Snapshot today's curated projection picks before games start."
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD (ET)")
    p.add_argument("--dry-run", action="store_true",
                   help="Build the payload but don't write to disk.")
    p.add_argument("--max-picks", type=int, default=6)
    p.add_argument("--max-per-sport", type=int, default=3)
    args = p.parse_args(argv)
    payload = build_snapshot(
        args.date,
        max_picks=args.max_picks,
        max_per_sport=args.max_per_sport,
    )
    if args.dry_run:
        print(f"[snapshot_curated] DRY-RUN {args.date} · {payload['picksCount']} picks")
        return 0
    if payload["picksCount"] == 0:
        print(f"[snapshot_curated] {args.date} · 0 picks — writing empty-state snapshot")
    path = write_snapshot(args.date, payload)
    print(f"[snapshot_curated] wrote {path} · {payload['picksCount']} picks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
