"""Precompute optimizer outputs and persist them to disk for the
Parlay Lab to consume.

This complements `pipeline.snapshot_parlays` (which uses the legacy
greedy builder) with the new `parlay_optimizer` rules. The output
schema is a superset — every slip carries its rationale, correlation
penalty, and per-sport bucket — so the UI can render explanations as
well as the slip itself.

CLI:
    pipeline/.venv/bin/python -m pipeline.snapshot_optimizer --date YYYY-MM-DD

Writes:
    app/public/data/parlays/optimizer/<date>.json

The file lists slips grouped by (profile, sport) so the homepage
carousel + Parlay Lab builder can pick the bucket they need without
re-running an optimizer in the browser.

Honest behavior:
    - If the eligible pool is empty for a (profile, sport) the bucket
      stays empty. We never invent slips.
    - Same-date reruns are idempotent — slipIds are content-hashed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from .parlay_optimizer import (
    optimize,
    OptimizedSlip,
    OptimizerLean,
    normalize_lean,
    is_eligible,
    leg_score_breakdown,
    PROFILE_RULES_BY_NAME,
)
from .snapshot_parlays import load_nba_leans, load_mlb_leans


OUT_DIR = os.path.join("app", "public", "data", "parlays", "optimizer")


_PROFILES = ("conservative", "balanced", "aggressive", "star_power")
_SPORTS = ("nba", "mlb", "multi", "all")

# Profile used as the canonical scoring lens for `legPool` metadata
# attached to each leg. Balanced is neutral — it sits between the
# Conservative and Aggressive gate strictness, and uses no Star Power
# market overrides. The custom-parlay builder reads these legScores so
# the user's slip is scored with the same model the optimizer uses,
# without duplicating the formula in TypeScript.
_LEG_POOL_PROFILE = "balanced"


def _leg_to_payload(leg: OptimizerLean) -> dict[str, Any]:
    """Serialize a normalized OptimizerLean. Attaches the per-leg
    scoring breakdown for `_LEG_POOL_PROFILE` so the custom builder
    has the model's view of this leg without re-running anything."""
    rules = PROFILE_RULES_BY_NAME[_LEG_POOL_PROFILE]
    breakdown = leg_score_breakdown(leg, rules)
    return {
        "sport": leg.sport,
        "leanId": leg.leanId,
        "gameId": leg.gameId,
        "playerId": leg.playerId,
        "playerName": leg.playerName,
        "team": leg.team,
        "opponent": leg.opponent,
        "market": leg.market,
        "marketLabel": leg.marketLabel,
        "side": leg.side,
        "line": leg.line,
        "projection": leg.projection,
        "edgePct": leg.edgePct,
        "confidence": leg.confidence,
        "bookmaker": leg.bookmaker,
        "oddsForSide": leg.oddsForSide,
        "recent10Count": leg.recent10Count,
        "recentSeries": list(leg.recentSeries),
        "isAnomaly": leg.isAnomaly,
        "isVolatileMlb": leg.isVolatileMlb,
        "starTier": leg.starTier,
        "isStar": leg.starTier != "none",
        # Per-leg scoring metadata for the custom parlay builder.
        # Computed against the canonical (`_LEG_POOL_PROFILE`) profile
        # so the client's slip score mirrors the optimizer's view
        # without duplicating any formula.
        "legScore": round(float(breakdown["legScore"]), 4),
        "marketStabilityWeight": breakdown["marketWeight"],
        "starBoost": breakdown["starBoost"],
        "scoreBreakdown": breakdown,
    }


def _slip_to_payload(slip: OptimizedSlip) -> dict[str, Any]:
    legs = [_leg_to_payload(leg) for leg in slip.legs]
    return {
        "slipId": slip.slipId,
        "profile": slip.profile,
        "sport": slip.sport,
        "legs": legs,
        "sameGame": slip.sameGame,
        "hasAnomalyLeg": slip.hasAnomalyLeg,
        "score": round(slip.score, 4),
        "correlationPenalty": round(slip.correlationPenalty, 4),
        "rationale": slip.rationale,
    }


def _build_leg_pool(
    nba_raw: list[dict[str, Any]],
    mlb_raw: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build the leg pool the custom-parlay builder consumes.

    A leg is included if it passes the most permissive profile gate
    (aggressive). That gives the user broad choice — any prop that
    the optimizer would consider for ANY of its lanes is selectable —
    while filtering out the obviously bad legs (Pass side, missing
    confidence, etc).
    """
    rules = PROFILE_RULES_BY_NAME["aggressive"]
    pool: list[dict[str, Any]] = []
    for raw in nba_raw:
        norm = normalize_lean(raw, sport="nba")
        if is_eligible(norm, rules):
            pool.append(_leg_to_payload(norm))
    for raw in mlb_raw:
        norm = normalize_lean(raw, sport="mlb")
        if is_eligible(norm, rules):
            pool.append(_leg_to_payload(norm))
    # Stable order: sport, then descending edge so the search-default
    # surfaces the strongest leans first.
    pool.sort(
        key=lambda l: (
            l.get("sport") or "",
            -(l.get("edgePct") or 0),
            (l.get("playerName") or "").lower(),
        )
    )
    return pool


def build_optimizer_snapshot(
    date: str,
    *,
    num_candidates: int = 8,
) -> dict[str, Any]:
    nba = load_nba_leans(date)
    mlb = load_mlb_leans(date)
    combined = nba + mlb
    leg_pool = _build_leg_pool(nba, mlb)

    # Each bucket holds the top-N candidates from the optimizer.
    buckets: dict[str, dict[str, list[dict[str, Any]]]] = {
        profile: {sport: [] for sport in _SPORTS}
        for profile in _PROFILES
    }

    sport_pools = {
        "nba": nba,
        "mlb": mlb,
        "multi": combined,  # filter optimizer-side
        "all": combined,
    }

    for profile in _PROFILES:
        for sport in _SPORTS:
            pool = sport_pools[sport]
            if not pool:
                continue
            if sport == "multi":
                # multi requires legs from BOTH sports — we build over
                # the combined pool and then drop slips that are
                # actually single-sport so the bucket is honest.
                slips = optimize(pool, profile=profile, num_candidates=num_candidates,
                                 date=date)
                slips = [s for s in slips if s.sport == "multi"]
            else:
                slips = optimize(
                    pool,
                    profile=profile,
                    sport=None if sport == "all" else sport,
                    num_candidates=num_candidates,
                    date=date,
                )
            buckets[profile][sport] = [_slip_to_payload(s) for s in slips]

    total = sum(
        len(slips)
        for prof in buckets.values()
        for slips in prof.values()
    )

    payload = {
        "_disclaimer": (
            "Slips produced by pipeline.parlay_optimizer. Sport-agnostic, "
            "calibration-aware, correlation-suppressing. No fabricated "
            "data — buckets are empty when the eligible pool is too small."
        ),
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "totalSlips": total,
        "buckets": buckets,
        "sourcePools": {
            "nbaCount": len(nba),
            "mlbCount": len(mlb),
        },
        # Leg pool consumed by the custom-parlay builder. Every leg
        # carries the same scoring metadata the optimizer used. The
        # custom builder is NOT officially tracked (not graded into
        # optimizer-summary); it's a "Custom evaluation" surface.
        "legPool": {
            "scoringProfile": _LEG_POOL_PROFILE,
            "totalLegs": len(leg_pool),
            "legs": leg_pool,
        },
    }
    return payload


def write_snapshot(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)
    return path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--num-candidates", type=int, default=8)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    payload = build_optimizer_snapshot(args.date, num_candidates=args.num_candidates)
    total = payload["totalSlips"]
    if args.dry_run:
        print(f"[snapshot_optimizer] {args.date} dry-run · {total} slips would be written")
        return 0
    path = write_snapshot(args.date, payload)
    print(f"[snapshot_optimizer] {args.date} · {total} slips → {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
