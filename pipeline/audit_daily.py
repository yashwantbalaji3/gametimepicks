"""Daily model postmortem audit (PR #117 — feature/daily-audit-automation).

Reads the settled optimizer-graded slate for a given date and emits a
compact machine-readable JSON summary at:

    app/public/data/audit/daily/YYYY-MM-DD.json

The audit is the *foundation* for the model learning loop described in
`docs/MODEL_LEARNING_LOOP.md`. This PR only WRITES the audit data —
it does NOT auto-adjust optimizer weights. A follow-up PR can read
the audit JSON and demote underperforming markets / lanes.

Honest contract
---------------
- Pending slips are excluded from `hitRate` denominators (matches the
  existing `pipeline.grade_optimizer` + `optimizer-summary.json`
  convention).
- Pushes are also excluded from denominators — `decisive = wins + losses`.
- Fields we don't have on disk are reported as warnings, never
  invented.
- Recommendations only fire after a per-rule decisive-sample threshold,
  so a sparse slate never produces a confident-sounding signal.
- The output is intentionally compact (one file per date, small
  top-lists capped at 10) so it can be statically served.

Result vocabulary
-----------------
Slip-level `status` from `grade_optimizer`:
    win / loss / push / pending

Leg-level `result`:
    win / loss / push / stats_unavailable / unresolved

A slip is `pending` if any leg is `unresolved` or `stats_unavailable`
AND no leg is `loss`. We surface those slips (and their unresolved
player names) under `dnpUnavailable`.

CLI
---
    python -m pipeline.audit_daily --date 2026-05-25
    python -m pipeline.audit_daily --all
    python -m pipeline.audit_daily --date 2026-05-25 \\
        --output-dir app/public/data/audit/daily
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
GRADED_DIR = REPO_ROOT / "app" / "public" / "data" / "parlays" / "optimizer-graded"
NBA_SETTLED = REPO_ROOT / "app" / "public" / "data" / "results" / "settled_leans.jsonl"
MLB_SETTLED = REPO_ROOT / "app" / "public" / "data" / "mlb" / "results" / "settled_leans.jsonl"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "app" / "public" / "data" / "audit" / "daily"

# Profiles tracked by the optimizer. The "Longshot" lane in the UI
# maps to the `aggressive` profile internally — confirmed by the
# 5/25 audit (all 15 5-leg slips were profile=aggressive).
PROFILES = ("conservative", "balanced", "aggressive", "star_power")

# Slip-level statuses we treat as decisive.
_DECISIVE_STATUSES = ("win", "loss")

# Markets we explicitly track. Anything outside this list still gets a
# `byMarket` bucket — we just don't pre-populate zero rows for it.
_NBA_MARKETS = ("PTS", "REB", "AST", "3PM")
_MLB_MARKETS = ("batter_hits", "batter_total_bases", "pitcher_strikeouts", "batter_hits_runs_rbis")


# ---------------------------------------------------------------------------
# Loading helpers
# ---------------------------------------------------------------------------


def _load_graded(date: str) -> dict[str, Any] | None:
    path = GRADED_DIR / f"{date}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _load_settled_for_date(path: Path, date: str) -> list[dict[str, Any]]:
    """Read JSONL rows filtered to `date`. Returns [] when file missing."""
    if not path.exists():
        return []
    out: list[dict[str, Any]] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get("date") == date:
            out.append(row)
    return out


# ---------------------------------------------------------------------------
# Hit-rate counter
# ---------------------------------------------------------------------------


def _empty_counter() -> dict[str, int | float]:
    return {
        "wins": 0,
        "losses": 0,
        "pushes": 0,
        "pending": 0,
        "decisive": 0,
        "hitRate": 0.0,
    }


def _bump(c: dict[str, int | float], status: str) -> None:
    if status == "win":
        c["wins"] += 1
        c["decisive"] += 1
    elif status == "loss":
        c["losses"] += 1
        c["decisive"] += 1
    elif status == "push":
        c["pushes"] += 1
    elif status == "pending":
        c["pending"] += 1


def _finalize(c: dict[str, int | float]) -> dict[str, int | float]:
    dec = c["decisive"]
    if dec > 0:
        c["hitRate"] = round(c["wins"] / dec, 4)
    else:
        c["hitRate"] = 0.0
    return c


# ---------------------------------------------------------------------------
# Risk-profile derivation
# ---------------------------------------------------------------------------


def _profile_for_slip(slip: dict[str, Any]) -> str:
    """Return the slip's risk profile. Prefers the explicit `profile`
    field; falls back to parsing it out of `slipId` so legacy snapshots
    still bucket correctly. Unknown → "unknown" (never silently
    promoted into a real profile bucket).
    """
    p = slip.get("profile")
    if isinstance(p, str) and p in PROFILES:
        return p
    sid = slip.get("slipId") or ""
    # slipIds look like:  opt_2026-05-25_aggressive_6976b9c408f5
    if isinstance(sid, str):
        for prof in PROFILES:
            if f"_{prof}_" in sid:
                return prof
    return "unknown"


# ---------------------------------------------------------------------------
# Core aggregation
# ---------------------------------------------------------------------------


def _slip_sport_bucket(slip: dict[str, Any]) -> str:
    """The slip's primary `sport` field already encodes nba/mlb/multi.
    `multi` is what the UI calls "Mixed". Honors any future sport
    value by passing it through verbatim."""
    s = slip.get("sport")
    return s if isinstance(s, str) and s else "unknown"


def _is_same_game_nba(slip: dict[str, Any]) -> bool:
    """A slip is "same-game NBA" if the optimizer flagged it
    `sameGame=true` AND at least one leg is NBA. This intentionally
    INCLUDES multi-sport slips whose NBA legs share a game (the
    UI/optimizer treats those as the same correlation risk), and
    excludes MLB-only same-game slips, which have a different
    correlation profile.
    """
    if not slip.get("sameGame"):
        return False
    for leg in slip.get("legs") or []:
        if leg.get("sport") == "nba":
            return True
    return False


def _unresolved_leg_count(slip: dict[str, Any]) -> int:
    n = 0
    for leg in slip.get("legs") or []:
        if leg.get("result") in ("unresolved", "stats_unavailable"):
            n += 1
    return n


def _is_near_miss(slip: dict[str, Any]) -> bool:
    """Lost by EXACTLY one leg, no unresolved legs. We exclude slips
    with unresolved legs so the "near miss" tally is honest — a slip
    that's pending DNP is not a near miss."""
    if slip.get("status") != "loss":
        return False
    legs = slip.get("legs") or []
    if not legs:
        return False
    loss_count = sum(1 for l in legs if l.get("result") == "loss")
    unresolved = _unresolved_leg_count(slip)
    if unresolved > 0:
        return False
    return loss_count == 1


def _unresolved_players(slip: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for leg in slip.get("legs") or []:
        if leg.get("result") in ("unresolved", "stats_unavailable"):
            out.append({
                "playerName": leg.get("playerName"),
                "team": leg.get("team"),
                "sport": leg.get("sport"),
                "market": leg.get("market"),
                "result": leg.get("result"),
            })
    return out


# ---------------------------------------------------------------------------
# Recommendation engine
# ---------------------------------------------------------------------------


def _recommendations(
    by_profile: dict[str, dict[str, int | float]],
    sport_bucket: dict[str, dict[str, int | float]],
    same_game_nba: dict[str, int | float],
    mixed_sport: dict[str, int | float],
    by_market: dict[str, dict[str, int | float]],
    dnp_count: int,
) -> list[dict[str, str]]:
    """Each recommendation has:
    - `id`: stable string a follow-up PR can key off
    - `severity`: info / warn
    - `message`: human-readable text
    Recommendations are intentionally gated by per-rule sample
    thresholds so a sparse slate doesn't generate confident-sounding
    advice.
    """
    recs: list[dict[str, str]] = []

    # Mixed-sport underperformance
    ms_dec = mixed_sport.get("decisive", 0)
    if ms_dec >= 10 and mixed_sport.get("hitRate", 0.0) < 0.20:
        recs.append({
            "id": "mixed_sport_downrank",
            "severity": "warn",
            "message": (
                f"Mixed-sport slips went {mixed_sport['wins']}-{mixed_sport['losses']} "
                f"({mixed_sport['hitRate']:.0%}). Keep Mixed separate and "
                f"downrank it on first paint."
            ),
        })

    # Same-game NBA stacks
    sg_dec = same_game_nba.get("decisive", 0)
    if sg_dec >= 10 and same_game_nba.get("hitRate", 0.0) < 0.20:
        recs.append({
            "id": "samegame_nba_cap_conservative",
            "severity": "warn",
            "message": (
                f"Same-game NBA stacks went {same_game_nba['wins']}-{same_game_nba['losses']} "
                f"({same_game_nba['hitRate']:.0%}). Keep the same-game cap conservative."
            ),
        })

    # Per-market underperformance
    for market_key, c in by_market.items():
        dec = c.get("decisive", 0)
        if dec >= 5 and c.get("hitRate", 0.0) < 0.45:
            recs.append({
                "id": f"market_{market_key}_weak",
                "severity": "warn",
                "message": (
                    f"{market_key} market went {c['wins']}-{c['losses']} "
                    f"({c['hitRate']:.0%}) — require stronger recent signal."
                ),
            })

    # Longshot lane (aggressive profile)
    agg = by_profile.get("aggressive") or {}
    if agg.get("decisive", 0) >= 10 and agg.get("wins", 0) == 0:
        recs.append({
            "id": "longshot_keep_collapsed",
            "severity": "warn",
            "message": (
                f"Longshot lane went 0-{agg.get('losses', 0)}. "
                f"Keep the lane collapsed by default."
            ),
        })

    # DNP / availability tail
    if dnp_count >= 5:
        recs.append({
            "id": "dnp_guard_strengthen",
            "severity": "warn",
            "message": (
                f"{dnp_count} slips left pending on DNP/unavailable legs — "
                f"strengthen the DNP guard."
            ),
        })

    return recs


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------


def audit(
    date: str,
    *,
    graded: dict[str, Any] | None = None,
    nba_settled: list[dict[str, Any]] | None = None,
    mlb_settled: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Pure aggregator — accepts pre-loaded inputs so tests can pass
    fixtures without touching disk. Returns the audit-JSON dict.
    """
    warnings: list[str] = []

    if graded is None:
        graded = _load_graded(date)
    if graded is None:
        warnings.append(f"optimizer-graded file missing for {date}")
        return _empty_payload(date, warnings)

    slips: list[dict[str, Any]] = graded.get("uniqueSlips") or []
    if not slips:
        warnings.append("uniqueSlips empty — nothing to summarize")
        return _empty_payload(date, warnings)

    if nba_settled is None:
        nba_settled = _load_settled_for_date(NBA_SETTLED, date)
    if mlb_settled is None:
        mlb_settled = _load_settled_for_date(MLB_SETTLED, date)

    # ----- slip-level summary -----
    summary = _empty_counter()
    by_profile: dict[str, dict[str, int | float]] = {p: _empty_counter() for p in PROFILES}
    by_sport: dict[str, dict[str, int | float]] = defaultdict(_empty_counter)
    by_slip_size: dict[str, dict[str, int | float]] = defaultdict(_empty_counter)
    same_game_nba = _empty_counter()
    mixed_sport = _empty_counter()
    nba_containing = _empty_counter()
    mlb_containing = _empty_counter()
    by_player_decisive: dict[str, dict[str, int | float]] = defaultdict(_empty_counter)
    by_team_decisive: dict[str, dict[str, int | float]] = defaultdict(_empty_counter)

    dnp_unavailable_count = 0
    dnp_players: list[dict[str, Any]] = []
    dnp_seen: set[tuple] = set()
    near_misses: list[dict[str, Any]] = []

    for slip in slips:
        status = slip.get("status")
        profile = _profile_for_slip(slip)
        sport = _slip_sport_bucket(slip)
        legs = slip.get("legs") or []

        _bump(summary, status)
        if profile in by_profile:
            _bump(by_profile[profile], status)
        else:
            by_profile.setdefault(profile, _empty_counter())
            _bump(by_profile[profile], status)
        _bump(by_sport[sport], status)
        _bump(by_slip_size[str(len(legs))], status)

        if sport == "multi":
            _bump(mixed_sport, status)
        if _is_same_game_nba(slip):
            _bump(same_game_nba, status)

        # NBA / MLB-containing: any leg from that sport. Multi slips
        # show up in both buckets.
        leg_sports = {l.get("sport") for l in legs}
        if "nba" in leg_sports:
            _bump(nba_containing, status)
        if "mlb" in leg_sports:
            _bump(mlb_containing, status)

        if _is_near_miss(slip):
            near_misses.append({
                "slipId": slip.get("slipId"),
                "profile": profile,
                "sport": sport,
                "losingLeg": next(
                    (
                        {
                            "playerName": l.get("playerName"),
                            "market": l.get("market"),
                            "side": l.get("side"),
                            "line": l.get("line"),
                            "finalStat": l.get("finalStat"),
                        }
                        for l in legs
                        if l.get("result") == "loss"
                    ),
                    None,
                ),
            })

        # DNP/unavailable = pending slips with ≥1 unresolved leg. Losing
        # slips with unresolved legs are excluded — their result was
        # determined by a losing leg, not by the DNP. We still collect
        # the unresolved player names from any slip so the
        # `players` list is informative.
        if _unresolved_leg_count(slip) > 0:
            if slip.get("status") == "pending":
                dnp_unavailable_count += 1
            for p in _unresolved_players(slip):
                key = (p.get("playerName"), p.get("market"))
                if key not in dnp_seen:
                    dnp_seen.add(key)
                    dnp_players.append(p)

    # ----- leg-level: byMarket / byPlayer / byTeam -----
    # We attribute leg-level W/L only to legs whose own `result` is
    # decisive (win/loss). Unresolved/stats_unavailable legs are
    # excluded from the denominator, mirroring the slip rule.
    by_market: dict[str, dict[str, int | float]] = defaultdict(_empty_counter)
    for slip in slips:
        for leg in slip.get("legs") or []:
            result = leg.get("result")
            market = leg.get("market") or "unknown"
            player = leg.get("playerName") or "unknown"
            team = leg.get("team") or "unknown"
            if result in _DECISIVE_STATUSES:
                _bump(by_market[market], result)
                _bump(by_player_decisive[player], result)
                _bump(by_team_decisive[team], result)
            elif result == "push":
                by_market[market]["pushes"] += 1
                by_player_decisive[player]["pushes"] += 1
                by_team_decisive[team]["pushes"] += 1

    # Finalize hit rates
    for c in (summary, same_game_nba, mixed_sport, nba_containing, mlb_containing):
        _finalize(c)
    for d in (by_profile, by_sport, by_slip_size, by_market, by_player_decisive, by_team_decisive):
        for c in d.values():
            _finalize(c)

    # Top losing players (decisive only, ranked by losses then count)
    top_losing_players = sorted(
        (
            {"name": name, **counts}
            for name, counts in by_player_decisive.items()
            if counts["losses"] > 0
        ),
        key=lambda r: (-r["losses"], r["name"]),
    )[:10]
    top_losing_markets = sorted(
        (
            {"market": m, **counts}
            for m, counts in by_market.items()
            if counts["losses"] > 0
        ),
        key=lambda r: (-r["losses"], r["market"]),
    )[:10]

    # Reconcile settled-row counts (sanity check, surfaces a warning
    # if a sport has zero settled rows for the date — graded file
    # might be stale).
    if nba_settled is not None and not nba_settled and nba_containing["decisive"] > 0:
        warnings.append("nba settled_leans rows empty for date but graded NBA slips present")
    if mlb_settled is not None and not mlb_settled and mlb_containing["decisive"] > 0:
        warnings.append("mlb settled_leans rows empty for date but graded MLB slips present")

    recommendations = _recommendations(
        by_profile,
        by_sport,
        same_game_nba,
        mixed_sport,
        by_market,
        dnp_unavailable_count,
    )

    return {
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {**summary, "totalSlips": len(slips)},
        "byProfile": _strip_zero(by_profile),
        "bySportBucket": {
            **_strip_zero(by_sport),
            "nbaContaining": nba_containing,
            "mlbContaining": mlb_containing,
        },
        "bySlipSize": _strip_zero(by_slip_size),
        "byMarket": _strip_zero(by_market),
        "byPlayer": {
            name: c
            for name, c in by_player_decisive.items()
            if c["wins"] + c["losses"] > 0
        },
        "byTeam": {
            name: c
            for name, c in by_team_decisive.items()
            if c["wins"] + c["losses"] > 0
        },
        "sameGameNba": same_game_nba,
        "mixedSport": mixed_sport,
        "dnpUnavailable": {
            "count": dnp_unavailable_count,
            "players": dnp_players[:25],
        },
        "nearMisses": {
            "count": len(near_misses),
            "slips": near_misses[:10],
        },
        "topLosingPlayers": top_losing_players,
        "topLosingMarkets": top_losing_markets,
        "recommendations": recommendations,
        "warnings": warnings,
        "_disclaimer": (
            "Educational analytics only. Daily postmortem of the "
            "settled slate — see docs/MODEL_LEARNING_LOOP.md."
        ),
    }


def _empty_payload(date: str, warnings: list[str]) -> dict[str, Any]:
    return {
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {**_empty_counter(), "totalSlips": 0},
        "byProfile": {},
        "bySportBucket": {},
        "bySlipSize": {},
        "byMarket": {},
        "byPlayer": {},
        "byTeam": {},
        "sameGameNba": _empty_counter(),
        "mixedSport": _empty_counter(),
        "dnpUnavailable": {"count": 0, "players": []},
        "nearMisses": {"count": 0, "slips": []},
        "topLosingPlayers": [],
        "topLosingMarkets": [],
        "recommendations": [],
        "warnings": warnings,
        "_disclaimer": (
            "Educational analytics only. Daily postmortem of the "
            "settled slate — see docs/MODEL_LEARNING_LOOP.md."
        ),
    }


def _strip_zero(d: dict[str, dict[str, int | float]]) -> dict[str, dict[str, int | float]]:
    """Drop counter buckets that saw zero slips so the JSON stays
    compact — but keep the named PROFILES so the consumer can rely
    on every profile key existing."""
    out: dict[str, dict[str, int | float]] = {}
    for k, v in d.items():
        if k in PROFILES:
            out[k] = v
            continue
        if v["wins"] + v["losses"] + v["pushes"] + v["pending"] > 0:
            out[k] = v
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _all_graded_dates() -> list[str]:
    if not GRADED_DIR.exists():
        return []
    return sorted(
        p.stem for p in GRADED_DIR.glob("*.json")
        if p.stem and not p.stem.startswith("_")
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="YYYY-MM-DD")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run audit for every graded date on disk.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Where to write the audit JSON.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print summary without writing to disk.",
    )
    args = parser.parse_args(argv)

    if not args.date and not args.all:
        parser.error("must pass --date YYYY-MM-DD or --all")

    dates = _all_graded_dates() if args.all else [args.date]
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rc = 0
    for d in dates:
        payload = audit(d)
        target = out_dir / f"{d}.json"
        if args.dry_run:
            print(json.dumps({
                "date": d,
                "summary": payload["summary"],
                "recommendations": [r["id"] for r in payload["recommendations"]],
                "warnings": payload["warnings"],
            }, indent=2))
            continue
        target.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
        s = payload["summary"]
        recs = [r["id"] for r in payload["recommendations"]]
        print(
            f"audit_daily: {d} → {target.relative_to(REPO_ROOT)} | "
            f"{s['wins']}W-{s['losses']}L-{s['pushes']}P-{s['pending']} pending | "
            f"hitRate {s['hitRate']:.1%} | recs: {recs or 'none'}"
        )
        if payload["warnings"]:
            print(f"  warnings: {payload['warnings']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
