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

Generation receipt (``generationReceipt``, receiptVersion 1):
    An empty snapshot used to be indistinguishable from a broken one:
    `load_*_leans` return [] for a missing OR unreadable board, and a
    0-slip file looks the same whether the slate had no games, the
    eligibility rules rejected every combination, or the inputs never
    arrived. The receipt records, from the producer, what it read
    (per-sport board presence / parse / date / generatedAt / games /
    leans), the leg pool it built, and per public section the counts the
    section's own filters left and the combinations its search found. It
    classifies the run into one `outcome` and, when nothing was built,
    gives every public section an `emptyReason`. Consumers (the Ask
    projection and its published-artifact guard) accept an empty day
    ONLY on this evidence. The receipt is observability: it never
    changes a slip.

    The snapshot is written atomically (temp file + rename), so a crash
    cannot leave a truncated file that reads as a real day. A run that
    raises writes `run-failures/<date>.json` instead of a snapshot and
    exits non-zero; a later successful run for the date removes it.
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
    NBA_SGP_PROFILE_DEFAULTS,
    PROFILE_RULES_BY_NAME,
    PUBLIC_RISK_SECTION_ORDER,
    OptimizedSlip,
    OptimizerLean,
    generate_nba_sgp_slips,
    generate_public_risk_sections,
    is_eligible,
    leg_score_breakdown,
    normalize_lean,
    optimize,
)
from .parlay_optimizer import _PUBLIC_SECTION_MAX_LEGS_PER_GAME
from .snapshot_parlays import load_nba_leans, load_mlb_leans


OUT_DIR = os.path.join("app", "public", "data", "parlays", "optimizer")
FAILURE_DIR = os.path.join(OUT_DIR, "run-failures")

#: Where the lean loaders read each sport's board (snapshot_parlays). Kept
#: here verbatim so the receipt describes the SAME files the loaders opened.
BOARD_PATHS = {
    "nba": lambda date: os.path.join("app", "public", "data", "boards", f"{date}.json"),
    "mlb": lambda date: os.path.join("app", "public", "data", "mlb", "boards", f"{date}.json"),
}

RECEIPT_VERSION = 1

#: The closed outcome vocabulary of a completed run.
#:   SLIPS_BUILT          at least one public-section slip exists.
#:   NO_QUALIFYING_GAMES  every board read parsed and none lists a game.
#:   NO_ELIGIBLE_SLIPS    games and leans existed; the eligibility rules
#:                        (leg gate, section filters, leg counts, same-game
#:                        cap, price bands) left no slip. Each section says
#:                        which rule emptied it.
#:   INPUTS_WITHOUT_PROPS a board lists games but carries no leans — the
#:                        props/odds input never arrived. NOT a product
#:                        decision; consumers must not read it as one.
#:   INPUTS_UNREADABLE    a board file exists but does not parse.
#:   INPUTS_MISSING       no board exists for any sport.
OUTCOMES = (
    "SLIPS_BUILT",
    "NO_QUALIFYING_GAMES",
    "NO_ELIGIBLE_SLIPS",
    "INPUTS_WITHOUT_PROPS",
    "INPUTS_UNREADABLE",
    "INPUTS_MISSING",
)

#: Why one public section is empty, most structural first.
#:   no_leg_pool                    the leg pool is empty.
#:   structurally_infeasible        minLegs > distinct games x maxLegsPerGame —
#:                                  no slip can satisfy the same-game cap.
#:   insufficient_eligible_legs     fewer legs survive the section's filters
#:                                  than its minimum leg count.
#:   no_priced_compatible_combination  enough legs, but no priced combination
#:                                  passes compatibility + the price band.
#:   selector_dropped_all           combinations existed and the diversity
#:                                  selector kept none — an anomaly.
SECTION_EMPTY_REASONS = (
    "no_leg_pool",
    "structurally_infeasible",
    "insufficient_eligible_legs",
    "no_priced_compatible_combination",
    "selector_dropped_all",
)


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
        # PR #116 — per-game metadata parallel to `recentSeries`.
        # Same chronological order, same length when populated.
        # Empty list when the upstream board didn't attach metadata
        # (legacy snapshots, MLB pre-enrichment, etc.). Never
        # fabricated. The drawer falls back to numeric `recentSeries`
        # when this is empty.
        "recentGames": [dict(g) for g in leg.recentGames],
        "isAnomaly": leg.isAnomaly,
        "isVolatileMlb": leg.isVolatileMlb,
        "starTier": leg.starTier,
        "isStar": leg.starTier != "none",
        # PR `feature/leg-game-time-threading` — real game-time fields
        # from the source board. Both nullable; the frontend prefers
        # `commenceTime` (ISO UTC, MLB) and falls back to `gameTime`
        # (pre-formatted ET string, NBA tipoff) before showing
        # date-only. Never fabricated — `null` means the source board
        # didn't carry a usable time for this game.
        "commenceTime": leg.commenceTime,
        "gameTime": leg.gameTime,
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
        # PR `feature/nba-single-game-parlay-methodology` — explicit
        # single-game flag so the UI can render the "Single-game ·
        # higher variance" chip and the pool-availability banner can
        # branch when NBA-only slips exist on a one-NBA-game slate.
        "singleGame": slip.singleGame,
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


def _board_evidence(sport: str, date: str, leans_loaded: int) -> dict[str, Any]:
    """What the producer can say about one sport's board input, read from
    the same path its loader opened. Never infers a value it did not read."""
    path = BOARD_PATHS[sport](date)
    ev: dict[str, Any] = {
        "board": path.replace(os.sep, "/"),
        "present": os.path.exists(path),
        "parsed": False,
        "date": None,
        "generatedAt": None,
        "scheduleAvailable": None,
        "propsAvailable": None,
        "pendingReason": None,
        "games": None,
        "leans": None,
        "leansLoaded": leans_loaded,
    }
    if not ev["present"]:
        return ev
    try:
        with open(path, "r", encoding="utf-8") as f:
            doc = json.load(f)
    except (OSError, json.JSONDecodeError):
        return ev
    if not isinstance(doc, dict):
        return ev
    ev["parsed"] = True
    ev["date"] = doc.get("generatedFor") or doc.get("date")
    ev["generatedAt"] = doc.get("generatedAt")
    ev["scheduleAvailable"] = doc.get("scheduleAvailable")
    ev["propsAvailable"] = doc.get("propsAvailable")
    ev["pendingReason"] = doc.get("pendingReason")
    games = doc.get("games")
    ev["games"] = len(games) if isinstance(games, list) else None
    leans = doc.get("leans")
    ev["leans"] = len(leans) if isinstance(leans, list) else None
    return ev


def _section_empty_reason(diag: dict[str, Any], distinct_games: int, total_legs: int) -> str:
    if total_legs == 0:
        return "no_leg_pool"
    if diag["minLegs"] > distinct_games * diag["maxLegsPerGame"]:
        return "structurally_infeasible"
    if diag["eligibleLegs"]["all"] < diag["minLegs"]:
        return "insufficient_eligible_legs"
    if diag["candidates"]["all"] == 0:
        return "no_priced_compatible_combination"
    return "selector_dropped_all"


def build_generation_receipt(
    *,
    date: str,
    generated_at: str,
    inputs: dict[str, dict[str, Any]],
    leg_pool: list[dict[str, Any]],
    public_sections: dict[str, dict[str, list[Any]]],
    diagnostics: dict[str, Any],
) -> dict[str, Any]:
    """Pure: classify a completed run from what it read and what it built."""
    distinct_games = len({l.get("gameId") for l in leg_pool if l.get("gameId")})
    sections: dict[str, Any] = {}
    public_slips = 0
    for key, by_sport in public_sections.items():
        # "all" is a view over the sport cuts (it repeats their slips), so the
        # count is over the sport cuts only — the same rule the consumers use.
        n = sum(len(v) for sport, v in by_sport.items() if sport != "all")
        public_slips += n
        diag = diagnostics.get(key) or {
            "minLegs": None, "maxLegs": None, "maxLegsPerGame": _PUBLIC_SECTION_MAX_LEGS_PER_GAME,
            "eligibleLegs": {"all": 0, "nba": 0, "mlb": 0}, "candidates": {"all": 0, "nba": 0, "mlb": 0},
        }
        sections[key] = {
            **diag,
            "slips": n,
            "emptyReason": None if n else _section_empty_reason(diag, distinct_games, len(leg_pool)),
        }

    present = [ev for ev in inputs.values() if ev["present"]]
    games = sum(ev["games"] or 0 for ev in present if ev["parsed"])
    leans = sum(ev["leansLoaded"] for ev in inputs.values())
    if public_slips > 0:
        outcome = "SLIPS_BUILT"
    elif not present:
        outcome = "INPUTS_MISSING"
    elif any(not ev["parsed"] for ev in present):
        outcome = "INPUTS_UNREADABLE"
    elif games == 0 and leans == 0:
        outcome = "NO_QUALIFYING_GAMES"
    elif leans == 0:
        outcome = "INPUTS_WITHOUT_PROPS"
    else:
        outcome = "NO_ELIGIBLE_SLIPS"

    return {
        "receiptVersion": RECEIPT_VERSION,
        "producer": "pipeline.snapshot_optimizer",
        "status": "completed",
        "date": date,
        "generatedAt": generated_at,
        "outcome": outcome,
        "inputs": inputs,
        "legPool": {"totalLegs": len(leg_pool), "distinctGames": distinct_games},
        "publicSlips": public_slips,
        "publicSections": sections,
    }


def build_optimizer_snapshot(
    date: str,
    *,
    num_candidates: int = 8,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
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

    # Pre-compute NBA single-game eligibility. The SGP path only runs
    # when the slate has exactly one unique NBA game AND the standard
    # NBA-only bucket comes back empty for the profile (because of the
    # per-profile `max_legs_per_game` arithmetic). When both conditions
    # hold we backfill the bucket with explicit single-game NBA slips
    # that carry `singleGame=True` so the UI labels them as higher
    # variance.
    nba_game_ids = {l.get("gameId") for l in nba if l.get("gameId")}
    nba_single_game = len(nba_game_ids) == 1

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

        # PR `feature/nba-single-game-parlay-methodology` —
        # explicit NBA single-game backfill. ONLY fires when:
        #   1. NBA pool has at least 2 legs (otherwise no slip is
        #      possible),
        #   2. The slate has exactly one unique NBA game,
        #   3. Standard NBA-only generation returned empty,
        #   4. The profile is whitelisted in NBA_SGP_PROFILE_DEFAULTS
        #      (conservative/Anchor is intentionally excluded — its
        #      "Lower-variance builds" framing would be contradicted
        #      by stacking two legs from one matchup).
        if (
            nba
            and nba_single_game
            and not buckets[profile]["nba"]
            and profile in NBA_SGP_PROFILE_DEFAULTS
        ):
            sgp_slips = generate_nba_sgp_slips(
                nba,
                profile=profile,
                date=date,
            )
            buckets[profile]["nba"] = [_slip_to_payload(s) for s in sgp_slips]
            # Also surface them under the "all" bucket if it's currently
            # smaller than the standard cap and we have room — keeps
            # the All filter consistent with the NBA tab.
            if sgp_slips:
                payloads = [_slip_to_payload(s) for s in sgp_slips]
                existing = buckets[profile]["all"]
                seen_ids = {s.get("slipId") for s in existing}
                for p in payloads:
                    if p.get("slipId") not in seen_ids:
                        existing.append(p)

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
        "generatedAt": generated_at,
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

    # PR `fix/public-risk-range-leg-counts` (2026-05-28) — generate
    # the public risk sections (Low / Medium / High / Longshot) by
    # leg count + combined odds, sourced from the already-qualified
    # legPool. Stored under `publicRiskSections` so the UI can render
    # the user-spec'd sections without retro-fitting the internal
    # profile buckets above (those keep producing slips for the
    # internal optimizer record; this layer sits on top of them).
    section_diagnostics: dict[str, Any] = {}
    public_sections = generate_public_risk_sections(
        leg_pool,
        date=date,
        diagnostics=section_diagnostics,
    )
    payload["publicRiskSections"] = {
        section_key: {
            sport_key: [_slip_to_payload(s) for s in slips]
            for sport_key, slips in by_sport.items()
        }
        for section_key, by_sport in public_sections.items()
    }
    # Observability: record whether the learned selection policy was applied for
    # this slate (set as a side-effect of generate_public_risk_sections), or the
    # fail-closed fallback reason. Pure metadata — does not affect the slips.
    try:
        from .parlay_optimizer import selection_policy_metadata
        payload["learningPolicy"] = selection_policy_metadata()
    except Exception:
        payload["learningPolicy"] = {"learningPolicyLoaded": False, "learningPolicyApplied": False}
    # Written LAST, from what this run actually read and built: its presence
    # is the claim that the run completed.
    payload["generationReceipt"] = build_generation_receipt(
        date=date,
        generated_at=generated_at,
        inputs={
            "nba": _board_evidence("nba", date, len(nba)),
            "mlb": _board_evidence("mlb", date, len(mlb)),
        },
        leg_pool=leg_pool,
        public_sections=payload["publicRiskSections"],
        diagnostics=section_diagnostics,
    )
    return payload


def _write_json_atomic(path: str, payload: dict[str, Any]) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)
    os.replace(tmp, path)


def write_snapshot(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{date}.json")
    _write_json_atomic(path, payload)
    # A completed run supersedes an earlier failed attempt for the same date.
    failure = os.path.join(FAILURE_DIR, f"{date}.json")
    if os.path.exists(failure):
        os.remove(failure)
    return path


def write_failure(date: str, exc: BaseException) -> str:
    """Record a run that raised. It is NOT a snapshot (consumers that read
    `optimizer/<date>.json` never see it); it lets the Ask guard tell a failed
    run from one that never happened."""
    os.makedirs(FAILURE_DIR, exist_ok=True)
    path = os.path.join(FAILURE_DIR, f"{date}.json")
    _write_json_atomic(path, {
        "receiptVersion": RECEIPT_VERSION,
        "producer": "pipeline.snapshot_optimizer",
        "status": "failed",
        "date": date,
        "attemptedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "errorType": type(exc).__name__,
        "message": str(exc)[:200],
    })
    return path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--num-candidates", type=int, default=8)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    try:
        payload = build_optimizer_snapshot(args.date, num_candidates=args.num_candidates)
    except Exception as exc:  # noqa: BLE001 — recorded, then surfaced as a non-zero exit
        if not args.dry_run:
            path = write_failure(args.date, exc)
            print(f"[snapshot_optimizer] {args.date} FAILED ({type(exc).__name__}) → {path}", file=sys.stderr)
        raise
    total = payload["totalSlips"]
    outcome = payload["generationReceipt"]["outcome"]
    if args.dry_run:
        print(f"[snapshot_optimizer] {args.date} dry-run · {total} slips would be written · {outcome}")
        return 0
    path = write_snapshot(args.date, payload)
    print(f"[snapshot_optimizer] {args.date} · {total} slips · {outcome} → {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
