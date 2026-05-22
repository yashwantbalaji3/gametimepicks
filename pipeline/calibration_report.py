"""Calibration counterfactual report.

Re-runs configurable edge floors + confidence filters across the
already-settled rows on disk and reports the resulting hit rate
*without* changing any production code. Pure read-only analysis —
the model is unchanged, no fields are mutated, no projections are
regenerated.

Why this matters
================
The handoff notes that NBA PTS at 52.0% on 252 decisive rows behaves
like a coin flip while NBA REB at 59.0% on 229 has real signal. The
question that follows is: would a market-specific edge floor (e.g.
"only count PTS picks with |edge| >= 5pp") materially improve the
combined hit rate? This CLI answers that question *honestly* without
shipping any scoring change.

Why this is safe
================
* Read-only against `app/public/data/results/settled_leans.jsonl` and
  `app/public/data/mlb/results/settled_leans.jsonl`.
* Never edits the model, the guardrails, or any other pipeline file.
* No fake claims — the output only states actual filtered hit rates
  on the existing settled sample. Sample size is reported next to
  every bucket so callers see immediately when N is small.
* No projections are emitted; this is a counterfactual *audit*, not
  a backtest. (A real backtest needs historical odds line snapshots
  the project does not yet store — see BACKTEST_PLAN.md.)

CLI examples
============

    pipeline/.venv/bin/python -m pipeline.calibration_report

    pipeline/.venv/bin/python -m pipeline.calibration_report --sport nba

    pipeline/.venv/bin/python -m pipeline.calibration_report \\
        --min-edge-pp 5 --confidence High

    pipeline/.venv/bin/python -m pipeline.calibration_report \\
        --market REB --min-edge-pp 3

    pipeline/.venv/bin/python -m pipeline.calibration_report \\
        --by-market --by-confidence

Exit code is always 0 on success; non-zero only on real I/O failure.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
NBA_SETTLED = REPO_ROOT / "app" / "public" / "data" / "results" / "settled_leans.jsonl"
MLB_SETTLED = (
    REPO_ROOT / "app" / "public" / "data" / "mlb" / "results" / "settled_leans.jsonl"
)


def _iter_jsonl(path: Path) -> Iterable[dict]:
    """Yield rows from a JSONL file. Returns empty iterator if missing."""
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                # Skip malformed lines silently — this is an analysis tool,
                # not a validator. Real corruption is caught upstream.
                continue


# MLB settled rows use slightly different keys than NBA: `outcome`
# ("Win"/"Loss"/"Push") instead of `result`, `lean` ("Over"/"Under")
# instead of `side`, and `marketKey` (e.g. "pitcher_strikeouts") instead
# of `market`. Normalize so the rest of the report is sport-agnostic.
_MLB_OUTCOME_TO_RESULT = {
    "Win": "win",
    "Loss": "loss",
    "Push": "push",
    "win": "win",
    "loss": "loss",
    "push": "push",
}


def _normalize_row(row: dict, sport: str) -> dict:
    """Return a copy of the row keyed by the NBA-flavored field names
    the report uses internally. Idempotent: re-running on an already
    normalized row is a no-op."""
    out = dict(row)
    out.setdefault("sport", sport)
    if "result" not in out:
        oc = out.get("outcome")
        if isinstance(oc, str):
            out["result"] = _MLB_OUTCOME_TO_RESULT.get(oc, oc.lower())
    if "side" not in out and "lean" in out:
        out["side"] = out.get("lean")
    if "market" not in out:
        # Prefer the human-readable `marketLabel` for MLB so per-market
        # buckets read as "Strikeouts" rather than "pitcher_strikeouts".
        out["market"] = out.get("marketLabel") or out.get("marketKey")
    return out


def _row_passes(
    row: dict,
    *,
    min_edge_pp: float | None,
    confidence_filter: set[str] | None,
    market_filter: set[str] | None,
    side_filter: set[str] | None,
    exclude_anomalies: bool,
) -> bool:
    """Apply CLI filters to one settled row. Returns True if it should
    be counted in the filtered hit-rate aggregate."""
    if confidence_filter is not None:
        if row.get("confidence") not in confidence_filter:
            return False
    if market_filter is not None:
        if row.get("market") not in market_filter:
            return False
    if side_filter is not None:
        if row.get("side") not in side_filter:
            return False
    if min_edge_pp is not None:
        ep = row.get("edgePct")
        if ep is None or abs(float(ep)) < min_edge_pp:
            return False
    if exclude_anomalies:
        # Anomalies live in `riskFlags`. Most settled rows don't carry
        # the flag explicitly because the snapshot path normalizes it
        # away; mirror the rule by treating |edge| > the same threshold
        # the guardrails use (25pp NBA / 20pp MLB) as anomaly-like.
        flags = row.get("riskFlags") or []
        if "suspicious_edge" in flags:
            return False
        ep = row.get("edgePct")
        sport = (row.get("sport") or "").lower()
        if ep is not None:
            cap = 20.0 if sport == "mlb" else 25.0
            if abs(float(ep)) > cap:
                return False
    return True


def _aggregate(rows: Iterable[dict]) -> dict:
    """Aggregate raw settled rows into wins/losses/pushes counts."""
    w = l = p = 0
    for row in rows:
        r = row.get("result")
        if r == "win":
            w += 1
        elif r == "loss":
            l += 1
        elif r == "push":
            p += 1
    decisive = w + l
    return {
        "wins": w,
        "losses": l,
        "pushes": p,
        "decisive": decisive,
        "hitRate": (w / decisive) if decisive > 0 else None,
    }


def _format_pct(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v * 100:.1f}%"


def _print_summary(label: str, agg: dict) -> None:
    print(
        f"  {label:<28}  "
        f"{agg['wins']}-{agg['losses']}"
        f"{(' on ' + str(agg['decisive']) + ' decisive') if agg['decisive'] else ''}"
        f"{(' · ' + _format_pct(agg['hitRate'])) if agg['hitRate'] is not None else ''}"
    )


def _run_for_sport(
    sport: str,
    settled_path: Path,
    *,
    min_edge_pp: float | None,
    confidence_filter: set[str] | None,
    market_filter: set[str] | None,
    side_filter: set[str] | None,
    exclude_anomalies: bool,
    by_market: bool,
    by_confidence: bool,
) -> None:
    if not settled_path.exists():
        print(f"\n{sport.upper()}: no settled rows on disk yet ({settled_path}).")
        return

    raw_rows = [_normalize_row(r, sport) for r in _iter_jsonl(settled_path)]
    if not raw_rows:
        print(f"\n{sport.upper()}: settled file is empty ({settled_path}).")
        return

    filtered = [
        row
        for row in raw_rows
        if _row_passes(
            row,
            min_edge_pp=min_edge_pp,
            confidence_filter=confidence_filter,
            market_filter=market_filter,
            side_filter=side_filter,
            exclude_anomalies=exclude_anomalies,
        )
    ]

    print(f"\n{sport.upper()} — {len(raw_rows)} settled rows on disk")
    if filtered != raw_rows:
        print(
            f"  Filter: "
            f"min_edge_pp={min_edge_pp}, "
            f"confidence={sorted(confidence_filter) if confidence_filter else 'all'}, "
            f"market={sorted(market_filter) if market_filter else 'all'}, "
            f"side={sorted(side_filter) if side_filter else 'all'}, "
            f"exclude_anomalies={exclude_anomalies}"
        )
    overall = _aggregate(filtered)
    _print_summary("Overall (filtered)", overall)

    if by_market:
        by_m: dict[str, list[dict]] = defaultdict(list)
        for row in filtered:
            by_m[row.get("market", "?")].append(row)
        print("  By market:")
        for market in sorted(by_m.keys()):
            _print_summary(f"    {market}", _aggregate(by_m[market]))

    if by_confidence:
        by_c: dict[str, list[dict]] = defaultdict(list)
        for row in filtered:
            by_c[row.get("confidence", "?")].append(row)
        print("  By confidence:")
        for conf in sorted(by_c.keys()):
            _print_summary(f"    {conf}", _aggregate(by_c[conf]))


def _parse_set_arg(value: str | None) -> set[str] | None:
    if value is None:
        return None
    items = [v.strip() for v in value.split(",") if v.strip()]
    return set(items) if items else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Counterfactual calibration report against already-settled "
            "rows. Pure read-only analysis; the model itself is never "
            "touched. Use to test whether a tighter edge floor or "
            "confidence filter would meaningfully change the hit rate "
            "on the existing sample."
        )
    )
    parser.add_argument(
        "--sport",
        choices=["nba", "mlb", "both"],
        default="both",
        help="Which sport's settled rows to evaluate.",
    )
    parser.add_argument(
        "--min-edge-pp",
        type=float,
        default=None,
        help="Drop rows whose |edgePct| is below this percentage-point floor.",
    )
    parser.add_argument(
        "--confidence",
        default=None,
        help='Comma-separated list of confidence tiers to keep (e.g. "High" or "High,Medium").',
    )
    parser.add_argument(
        "--market",
        default=None,
        help='Comma-separated list of markets to keep (e.g. "REB" or "PTS,REB").',
    )
    parser.add_argument(
        "--side",
        default=None,
        help='Comma-separated list of sides to keep (e.g. "Over").',
    )
    parser.add_argument(
        "--exclude-anomalies",
        action="store_true",
        help="Drop rows flagged as suspicious_edge or beyond R5 anomaly cap.",
    )
    parser.add_argument(
        "--by-market",
        action="store_true",
        help="Also print a per-market breakdown of the filtered rows.",
    )
    parser.add_argument(
        "--by-confidence",
        action="store_true",
        help="Also print a per-confidence-tier breakdown of the filtered rows.",
    )
    args = parser.parse_args(argv)

    confidence_filter = _parse_set_arg(args.confidence)
    market_filter = _parse_set_arg(args.market)
    side_filter = _parse_set_arg(args.side)

    print("Calibration counterfactual report")
    print("---------------------------------")
    print(
        "Read-only re-aggregation of already-settled rows. The model has "
        "NOT been retrained. Sample sizes are reported next to every "
        "bucket so small-N cases are obvious."
    )

    if args.sport in ("nba", "both"):
        _run_for_sport(
            "nba",
            NBA_SETTLED,
            min_edge_pp=args.min_edge_pp,
            confidence_filter=confidence_filter,
            market_filter=market_filter,
            side_filter=side_filter,
            exclude_anomalies=args.exclude_anomalies,
            by_market=args.by_market,
            by_confidence=args.by_confidence,
        )
    if args.sport in ("mlb", "both"):
        _run_for_sport(
            "mlb",
            MLB_SETTLED,
            min_edge_pp=args.min_edge_pp,
            confidence_filter=confidence_filter,
            market_filter=market_filter,
            side_filter=side_filter,
            exclude_anomalies=args.exclude_anomalies,
            by_market=args.by_market,
            by_confidence=args.by_confidence,
        )

    print()
    print(
        "Reminder: a tighter filter that produces a higher hit rate on N=20 "
        "is NOT evidence of model improvement — it's a smaller, possibly "
        "biased sample. See BACKTEST_PLAN.md for the path to honest "
        "out-of-sample backtesting."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
