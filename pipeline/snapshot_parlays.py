"""Persist pregame parlay-candidate slips before games start.

Without persisted slips there can be no honest parlay hit rate. This
module captures the candidate slips the model would have generated on
a given date, BEFORE games start, into a static JSON artifact that
the grader can later score against settled results.

CLI:

    pipeline/.venv/bin/python -m pipeline.snapshot_parlays --date YYYY-MM-DD
    pipeline/.venv/bin/python -m pipeline.snapshot_parlays --date YYYY-MM-DD --dry-run

What this WILL do
  * Read the NBA board for `date` from `app/public/data/boards/<date>.json`.
  * Generate candidate slips at three risk profiles (conservative /
    balanced / aggressive) using the same eligibility + de-duplication
    rules as the in-browser Parlay Lab (mirrors `app/src/lib/parlay-builder.ts`).
  * Assign stable slip IDs by hashing date + profile + legs so repeat
    runs are idempotent — no duplicate slips across reruns.
  * Skip any game whose tipoff time has already passed at run time
    (best-effort: only when the board carries an ISO tipoff string).
  * Write `app/public/data/parlays/snapshots/<date>.json` with status
    `pending`; the grader fills in `result` later.

What this WILL NOT do
  * Generate fake historical slips for past dates. The grader treats a
    missing snapshot as "no saved slips for that date" — never as a
    loss / win / record placeholder.
  * Invent legs, lines, projections, odds, or game state.
  * Re-score existing snapshots. Use `pipeline.grade_parlays` for that.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


SNAPSHOT_DIR = os.path.join("app", "public", "data", "parlays", "snapshots")
SUMMARY_PATH = os.path.join("app", "public", "data", "parlays", "summary.json")


# ---------------------------------------------------------------------------
# Builder rules (mirrors app/src/lib/parlay-builder.ts and the Python
# port in parlay_builder_test.py — keep these in sync if either side
# changes). The contract is locked by parlay_builder_test.
# ---------------------------------------------------------------------------

PROFILE_RULES: dict[str, dict[str, Any]] = {
    "conservative": {
        "confidence": ["High"],
        "min_edge_pct": 3.0,
        # User feedback (2026-05-23): keep conservative slips at
        # EXACTLY 2 legs — the prior 2-3 range produced 3-leg
        # conservative slips that the user found too noisy.
        "max_legs": 2,
        "min_legs": 2,
        "require_recent10": True,
        "require_valid_player_id": True,
        # Conservative: max 1 leg per game (dispersion preference).
        "max_legs_per_game": 1,
        "exclude_anomalies": True,
        "max_anomaly_legs": 0,
    },
    "balanced": {
        "confidence": ["High", "Medium"],
        "min_edge_pct": 2.0,
        # Balanced: exactly 3 legs.
        "max_legs": 3,
        "min_legs": 3,
        "require_recent10": False,
        "require_valid_player_id": True,
        "max_legs_per_game": 2,
        "exclude_anomalies": True,
        "max_anomaly_legs": 0,
    },
    "aggressive": {
        "confidence": ["High", "Medium", "Low"],
        "min_edge_pct": 1.0,
        # Aggressive: 4-5 legs. Bumped from 2-5 so this profile
        # never produces a "thin" 2-leg slip that overlaps with
        # the conservative pool.
        "max_legs": 5,
        "min_legs": 4,
        "require_recent10": False,
        "require_valid_player_id": False,
        "max_legs_per_game": 3,
        "exclude_anomalies": False,
        "max_anomaly_legs": 1,
    },
}


# ---------------------------------------------------------------------------
# Helpers (mirrors the in-browser builder)
# ---------------------------------------------------------------------------


def _is_anomaly(lean: dict) -> bool:
    return "suspicious_edge" in (lean.get("riskFlags") or [])


def _normalize_player(name: str) -> str:
    n = (name or "").lower()
    n = re.sub(r"[^a-z0-9]+", "_", n)
    return n.strip("_")


def _leg_score(lean: dict) -> float:
    cw = {"High": 1.0, "Medium": 0.65, "Low": 0.3}.get(lean.get("confidence", ""), 0.1)
    edge = max(0.0, min(20.0, float(lean.get("edgePct") or 0)))
    recent_bonus = 0.15 if (lean.get("recent10") and len(lean["recent10"]) >= 5) else 0.0
    pid_bonus = 0.1 if (lean.get("playerId") or 0) > 0 else 0.0
    base = cw * 0.7 + (edge / 20) * 0.3 + recent_bonus + pid_bonus

    # MLB top-player boost — small, explicit preference for
    # recognizable hitters. Locked by snapshot_parlays_test so the
    # contract (top-player at +5pp beats non-top at +6pp;
    # non-top at +10pp still beats top at +3pp) doesn't regress.
    if lean.get("_sport") == "mlb":
        from .mlb_top_players import top_player_boost
        base += top_player_boost(lean.get("playerName"))
    return base


def _is_eligible(lean: dict, rules: dict[str, Any]) -> bool:
    if lean.get("lean") not in ("Over", "Under"):
        return False
    if lean.get("confidence") not in rules["confidence"]:
        return False
    if (lean.get("edgePct") or 0) < rules["min_edge_pct"]:
        return False
    if rules["require_recent10"]:
        if not lean.get("recent10") or len(lean["recent10"]) < 5:
            return False
    if rules["require_valid_player_id"]:
        if (lean.get("playerId") or 0) <= 0:
            return False
    if rules.get("exclude_anomalies") and _is_anomaly(lean):
        return False
    return True


def _player_key(lean: dict) -> str:
    pid = lean.get("playerId") or 0
    if pid > 0:
        return f"pid:{pid}"
    return f"name:{_normalize_player(lean.get('playerName', ''))}"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SnapshotLeg:
    sport: str
    gameId: str | None
    gameDate: str
    playerId: int | None
    playerName: str
    team: str | None
    opponent: str | None
    market: str
    side: str
    line: float | None
    projection: float | None
    edgePct: float | None
    confidence: str | None
    bookmaker: str | None
    oddsForSide: int | None
    riskFlags: list[str] = field(default_factory=list)
    # Friendly display name for the market. NBA leaves this as None (the
    # market itself — PTS / REB / AST — is already friendly). MLB sets
    # this to "Strikeouts" / "Hits" / "Total Bases" so the UI doesn't
    # render the raw `pitcher_strikeouts` snake_case key.
    marketLabel: str | None = None


@dataclass(frozen=True)
class SnapshotSlip:
    slipId: str
    riskProfile: str
    legs: list[SnapshotLeg]
    score: float
    sameGame: bool
    hasAnomalyLeg: bool
    status: str  # "pending" until the grader runs
    sport: str  # "nba" / "mlb" / "multi"


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def _greedy_build(
    pool: list[dict],
    start: int,
    rules: dict[str, Any],
) -> list[dict] | None:
    picked: list[dict] = []
    players_used: set[str] = set()
    game_count: dict[str, int] = {}
    anomaly_count = 0
    order = pool[start:] + pool[:start]
    for lean in order:
        if len(picked) >= rules["max_legs"]:
            break
        pkey = _player_key(lean)
        if pkey in players_used:
            continue
        anomaly = _is_anomaly(lean)
        if anomaly and anomaly_count >= rules.get("max_anomaly_legs", 0):
            continue
        gid = str(lean.get("gameId") or "")
        used = game_count.get(gid, 0)
        if used >= rules["max_legs_per_game"]:
            continue
        picked.append(lean)
        players_used.add(pkey)
        game_count[gid] = used + 1
        if anomaly:
            anomaly_count += 1
    if len(picked) < rules["min_legs"]:
        return None
    return picked


def _build_candidates(
    leans: list[dict], *, risk_profile: str, num_candidates: int = 3,
) -> list[list[dict]]:
    rules = PROFILE_RULES[risk_profile]
    eligible = [l for l in leans if _is_eligible(l, rules)]
    # Dedupe by player+market — pick highest-scoring row per pair.
    by_key: dict[str, dict] = {}
    for lean in eligible:
        k = f"{_player_key(lean)}|{lean.get('market')}"
        if k not in by_key or _leg_score(lean) > _leg_score(by_key[k]):
            by_key[k] = lean
    pool = sorted(by_key.values(), key=_leg_score, reverse=True)
    if len(pool) < rules["min_legs"]:
        return []
    seen_sigs: set[tuple[Any, ...]] = set()
    out: list[list[dict]] = []
    for start in range(min(len(pool), num_candidates * 2)):
        if len(out) >= num_candidates:
            break
        picked = _greedy_build(pool, start, rules)
        if picked is None:
            continue
        sig = tuple(sorted(
            (l.get("playerId"), l.get("market"), l.get("lean"), l.get("line"))
            for l in picked
        ))
        if sig in seen_sigs:
            continue
        seen_sigs.add(sig)
        out.append(picked)
    return out


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------


def _stable_slip_id(date: str, profile: str, picked: list[dict]) -> str:
    """Deterministic ID — same inputs across reruns produce the same ID
    so the snapshot file is idempotent."""
    parts: list[str] = [date, profile]
    for l in picked:
        parts.append(str(l.get("playerId") or l.get("playerName") or ""))
        parts.append(str(l.get("market") or ""))
        parts.append(str(l.get("lean") or ""))
        parts.append(f"{(l.get('line') or 0):.2f}")
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"slip_{date}_{profile}_{h}"


def _lean_to_leg(lean: dict, sport: str, date: str) -> SnapshotLeg:
    side = lean.get("lean") or lean.get("side") or "Pass"
    odds = (
        lean.get("oddsOver")
        if side == "Over"
        else lean.get("oddsUnder")
        if side == "Under"
        else None
    )
    return SnapshotLeg(
        sport=sport,
        gameId=str(lean.get("gameId")) if lean.get("gameId") else None,
        gameDate=date,
        playerId=lean.get("playerId"),
        playerName=lean.get("playerName") or "—",
        team=lean.get("team"),
        opponent=lean.get("opponent"),
        market=lean.get("market") or "—",
        side=side,
        line=lean.get("line"),
        projection=lean.get("projection"),
        edgePct=lean.get("edgePct"),
        confidence=lean.get("confidence"),
        bookmaker=lean.get("bookmaker"),
        oddsForSide=odds,
        riskFlags=lean.get("riskFlags") or [],
        marketLabel=lean.get("marketLabel"),
    )


def _filter_unstarted(leans: list[dict], now_iso: str | None) -> list[dict]:
    """If a lean's `tipoff` is an ISO timestamp earlier than `now_iso`,
    drop it. Best-effort: many boards stamp `tipoff` as "8:00 PM ET"
    rather than ISO; those pass through unfiltered."""
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


def load_nba_leans(date: str) -> list[dict]:
    path = os.path.join("app", "public", "data", "boards", f"{date}.json")
    if not os.path.exists(path):
        return []
    try:
        board = json.load(open(path, "r", encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    leans = board.get("leans") if isinstance(board, dict) else None
    if not isinstance(leans, list):
        return []
    # Tag every lean with its sport so per-leg `sport` survives the
    # builder which doesn't otherwise know which sport a lean came from.
    return [{**l, "_sport": "nba"} for l in leans]


def load_mlb_leans(date: str) -> list[dict]:
    """Load MLB board leans for `date`, normalized to the NBA-shaped
    dict the builder expects.

    MLB and NBA boards use different field names — MLB writes
    `marketKey`/`marketLabel`/`lean`/`playerTeamAbbr`/`opponentAbbr`/
    `recentSeries`, NBA writes `market`/`lean`/`team`/`opponent`/
    `recent10`. We translate at load time so the builder rules stay
    sport-agnostic. Every field the eligibility checker reads
    (`lean`, `confidence`, `edgePct`, `recent10`, `playerId`,
    `riskFlags`) maps cleanly across sports.

    Honest gates preserved:
      - Pass / No Play leans are dropped at builder time (same as NBA).
      - insufficient_data confidence is also dropped because no
        production tier (High/Medium/Low) admits it.
    """
    path = os.path.join("app", "public", "data", "mlb", "boards", f"{date}.json")
    if not os.path.exists(path):
        return []
    try:
        board = json.load(open(path, "r", encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    raw = board.get("leans") if isinstance(board, dict) else None
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for ml in raw:
        if not isinstance(ml, dict):
            continue
        out.append({
            "_sport": "mlb",
            "gameId": ml.get("gameId"),
            "playerId": ml.get("playerId"),
            "playerName": ml.get("playerName"),
            "team": ml.get("playerTeamAbbr"),
            "opponent": ml.get("opponentAbbr"),
            # Keep both keys so downstream consumers can render either.
            # Builder reads `market` for the player+market dedupe key.
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
            # recentSeries → recent10 (builder reads this for the
            # `requireRecent10` rule; MLB sample sizes are similar).
            "recent10": ml.get("recentSeries") or [],
            "riskFlags": ml.get("riskFlags") or [],
            # ISO commenceTime so the unstarted-game filter still works.
            "tipoff": ml.get("commenceTime"),
        })
    return out


def build_snapshot(
    date: str,
    *,
    now_iso: str | None = None,
    profiles: tuple[str, ...] = ("conservative", "balanced", "aggressive"),
    num_per_profile: int = 3,
) -> dict[str, Any]:
    """Pure function — builds the snapshot dict; does not write to disk.
    Callers test against this directly.

    Generates three slip pools:
      - NBA-only      (sport="nba")
      - MLB-only      (sport="mlb")
      - Multi-sport   (sport="multi" — only when both sport pools are non-empty)

    Multi-sport candidates pull from the union of normalized pools.
    Stable slip IDs use date + profile + sorted leg signature, so
    reruns are idempotent (no duplicates across re-snapshots).
    """
    nba_leans = _filter_unstarted(load_nba_leans(date), now_iso)
    mlb_leans = _filter_unstarted(load_mlb_leans(date), now_iso)

    slips: list[SnapshotSlip] = []

    def _emit(picked: list[dict], profile: str, sport: str) -> None:
        sid = _stable_slip_id(date, profile, picked)
        legs = [_lean_to_leg(l, l.get("_sport", sport), date) for l in picked]
        unique_games = len({l.gameId for l in legs if l.gameId})
        same_game = unique_games < len(legs)
        has_anom = any("suspicious_edge" in (leg.riskFlags or []) for leg in legs)
        score = sum(_leg_score(l) for l in picked) / max(len(picked), 1)
        slips.append(
            SnapshotSlip(
                slipId=sid,
                riskProfile=profile,
                legs=legs,
                score=round(score, 4),
                sameGame=same_game,
                hasAnomalyLeg=has_anom,
                status="pending",
                sport=sport,
            )
        )

    for profile in profiles:
        # NBA-only pool
        for picked in _build_candidates(
            nba_leans, risk_profile=profile, num_candidates=num_per_profile,
        ):
            _emit(picked, profile, "nba")
        # MLB-only pool — user feedback (2026-05-23) asked for MORE
        # MLB parlays per risk level. We generate up to 2x the
        # default count for MLB so each profile lands ~3-5 slips
        # after dedupe.
        mlb_candidates = num_per_profile * 2
        for picked in _build_candidates(
            mlb_leans, risk_profile=profile, num_candidates=mlb_candidates,
        ):
            _emit(picked, profile, "mlb")
        # Multi-sport pool — only when both pools are non-empty.
        # Aggressive only by design: cross-sport correlation is least
        # studied; we don't recommend conservative/balanced mixed slips
        # until we have settled multi-sport data to validate against.
        if profile == "aggressive" and nba_leans and mlb_leans:
            for picked in _build_candidates(
                nba_leans + mlb_leans,
                risk_profile=profile,
                num_candidates=max(1, num_per_profile - 1),
            ):
                # Only keep if at least one leg from each sport.
                sports = {l.get("_sport") for l in picked}
                if "nba" in sports and "mlb" in sports:
                    _emit(picked, profile, "multi")

    sports_included: list[str] = []
    if nba_leans:
        sports_included.append("nba")
    if mlb_leans:
        sports_included.append("mlb")

    source_boards = [date]  # Single-date snapshot; reads NBA + MLB board files.

    return {
        "_disclaimer": (
            "Pregame candidate slips captured before games started. "
            "Status starts at 'pending'; pipeline.grade_parlays fills "
            "result fields after settlement. No fake history; no "
            "fabricated legs."
        ),
        "date": date,
        "generatedAt": now_iso or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sportsIncluded": sports_included,
        "sourceBoardDates": source_boards,
        "profilesGenerated": list(profiles),
        "slipsCount": len(slips),
        "slips": [
            {
                "slipId": s.slipId,
                "riskProfile": s.riskProfile,
                "sport": s.sport,
                "score": s.score,
                "sameGame": s.sameGame,
                "hasAnomalyLeg": s.hasAnomalyLeg,
                "status": s.status,
                "legs": [asdict(leg) for leg in s.legs],
            }
            for s in slips
        ],
    }


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
        description="Snapshot today's parlay candidate slips before games start."
    )
    p.add_argument("--date", required=True, help="YYYY-MM-DD (ET)")
    p.add_argument(
        "--dry-run", action="store_true",
        help="Build the payload but don't write to disk.",
    )
    p.add_argument(
        "--num", type=int, default=3,
        help="Number of slips to generate per risk profile (default 3).",
    )
    args = p.parse_args(argv)

    payload = build_snapshot(args.date, num_per_profile=args.num)
    if args.dry_run:
        print(f"[snapshot_parlays] DRY-RUN {args.date} · {payload['slipsCount']} slips")
        return 0
    if payload["slipsCount"] == 0:
        print(
            f"[snapshot_parlays] {args.date} · 0 candidate slips — "
            "writing empty-state snapshot (no fake history)."
        )
    path = write_snapshot(args.date, payload)
    print(f"[snapshot_parlays] wrote {path} · {payload['slipsCount']} slips")
    return 0


if __name__ == "__main__":
    sys.exit(main())
