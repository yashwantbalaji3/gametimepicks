"""
Phase 8.3 — confidence guardrails.

Conservative post-processing rules that DOWNGRADE confidence (and
optionally suppress picks) when the supporting evidence is thin.

Design principles:
  - Only ever DOWNGRADE confidence, never upgrade
  - Rules trigger on objective signals (log count, edge magnitude)
  - Each adjustment is recorded in `_guardrail` field for transparency
  - Opt-in: CLI defaults to --dry-run; --apply must be explicit
  - Idempotent: re-running on already-adjusted leans is a no-op
  - Original `confidence` saved to `_originalConfidence` first time

Rules (in order — first match wins):

  R1. no_logs_insufficient_data
      recent10 missing or empty → confidence="insufficient_data",
      lean="No Play"
      Rationale: model can't project without recent stats.

  R2. extreme_edge_thin_sample
      |edgePct| > 30 AND len(recent10) < 8 →
      confidence="no_play", lean="No Play"
      Rationale: a 30%+ edge with <8 games of evidence is far more
      likely a data anomaly than a real signal. Suppress.

  R3. thin_sample_capped_medium
      confidence=="High" AND len(recent10) < 8 →
      confidence="Medium"
      Rationale: High confidence requires at least 8 recent games.

  R4. thin_sample_capped_low
      confidence in ("High","Medium") AND len(recent10) < 5 →
      confidence="Low"
      Rationale: <5 games is too thin for any non-Low label.

  R5. suspicious_edge_cap
      |edgePct| >= 25 (regardless of sample size) →
      confidence="Low", riskFlags includes "suspicious_edge"
      Rationale: efficient sportsbook lines don't leave 25%+ edges on
      the table; a model that thinks otherwise is almost always reading
      stale or wrong features (e.g. regular-season averages during the
      playoffs). Cap rather than suppress so the user still sees the
      lean with an honest "model anomaly" warning. R2 still wins first
      for extreme+thin (genuine suppression).

These thresholds are deliberately conservative starting points based
on common practice. They are NOT calibrated on settled outcomes — true
calibration requires several settled slates (see pipeline.model_diagnostics
for the framework). When you have ~50+ decisive picks, revisit these
numbers based on the by-confidence hit rates.

Usage:
  # Inspect what would change without writing:
  python -m pipeline.confidence_guardrails --date 2026-05-05

  # Actually apply to one date:
  python -m pipeline.confidence_guardrails --date 2026-05-05 --apply

  # Apply to every board file:
  python -m pipeline.confidence_guardrails --all --apply

This script DOES mutate `app/public/data/boards/<date>.json` when --apply
is set. It is an explicit, intentional regeneration. To reverse:
  - re-run `python -m pipeline.generate_daily_board --date <date>`
    (regenerates from scratch, discards guardrail adjustments)
  - or git checkout the board file from your last good commit
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

log = logging.getLogger("gtp.guardrails")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(name)s %(levelname)s %(message)s")


REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"

# Thresholds — exposed at module level so tests + future calibration
# can reference them directly.
EXTREME_EDGE_THRESHOLD_PCT = 30.0
SUSPICIOUS_EDGE_THRESHOLD_PCT = 25.0
HIGH_CONF_MIN_LOGS = 8
MEDIUM_CONF_MIN_LOGS = 5


def _logs_count(lean: dict) -> int:
    r = lean.get("recent10")
    if isinstance(r, list):
        # Count only numeric, finite values — same rule as the extractor
        n = 0
        for v in r:
            if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v:
                n += 1
        return n
    return 0


def downgrade_lean(lean: dict) -> dict:
    """
    Return a deep-copy of `lean` with conservative adjustments applied.
    Pure function. Idempotent.
    """
    out = deepcopy(lean)

    # If we've already adjusted this lean, don't double-adjust.
    if out.get("_guardrail"):
        return out

    n_logs = _logs_count(out)
    edge = out.get("edgePct")
    has_finite_edge = (
        isinstance(edge, (int, float))
        and not isinstance(edge, bool)
        and edge == edge
    )
    current_conf = out.get("confidence")

    # R1: no logs at all → insufficient data + No Play
    if n_logs == 0:
        # PR 8: trends_pending means props-only mode deferred game-log fetch.
        # R1 must NOT downgrade trends_pending → insufficient_data; leave it
        # so the enrichment pass can distinguish "deferred" from "tried & failed".
        if current_conf == "trends_pending":
            return out
        if current_conf != "insufficient_data" or out.get("lean") not in ("No Play", "Pass"):
            _stamp(out, current_conf)
            out["confidence"] = "insufficient_data"
            out["lean"] = "No Play"
            out["_guardrail"] = "R1_no_logs_insufficient_data"
        return out

    # R2: extreme edge + thin sample → suppress entirely.
    # Must run before R5 so genuine no-play suppression isn't softened
    # to a Low cap.
    if has_finite_edge and abs(float(edge)) > EXTREME_EDGE_THRESHOLD_PCT and n_logs < HIGH_CONF_MIN_LOGS:
        _stamp(out, current_conf)
        out["confidence"] = "no_play"
        out["lean"] = "No Play"
        out["_guardrail"] = "R2_extreme_edge_thin_sample"
        return out

    # R5: suspicious extreme edge, ANY sample size. Caps at Low with a
    # risk flag instead of suppressing — the user still sees the lean,
    # but the card knows to render an honest "model anomaly" warning.
    # Only applied when the current confidence is actionable; if news
    # signals already pushed the lean to no_play / insufficient_data,
    # don't second-guess that.
    if (
        has_finite_edge
        and abs(float(edge)) >= SUSPICIOUS_EDGE_THRESHOLD_PCT
        and current_conf in ("High", "Medium", "Low")
    ):
        _stamp(out, current_conf)
        out["confidence"] = "Low"
        out["_guardrail"] = "R5_suspicious_edge"
        # Append to riskFlags without disturbing what was already there.
        flags = out.get("riskFlags")
        if not isinstance(flags, list):
            flags = []
        if "suspicious_edge" not in flags:
            flags = [*flags, "suspicious_edge"]
        out["riskFlags"] = flags
        return out

    # R3 + R4 cascade — if Medium-cap or Low-cap applies, cap accordingly.
    # R4 strictly stronger: <5 logs caps at Low. Run R4 first.
    if current_conf in ("High", "Medium") and n_logs < MEDIUM_CONF_MIN_LOGS:
        _stamp(out, current_conf)
        out["confidence"] = "Low"
        out["_guardrail"] = "R4_thin_sample_capped_low"
        return out

    if current_conf == "High" and n_logs < HIGH_CONF_MIN_LOGS:
        _stamp(out, current_conf)
        out["confidence"] = "Medium"
        out["_guardrail"] = "R3_thin_sample_capped_medium"
        return out

    # No rule triggered
    return out


def _stamp(lean: dict, original_conf) -> None:
    """Record the original confidence for audit, only on first adjustment."""
    if "_originalConfidence" not in lean:
        lean["_originalConfidence"] = original_conf
    if "_guardrailAt" not in lean:
        lean["_guardrailAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")


def apply_to_leans(leans: Iterable[dict]) -> tuple[list[dict], dict]:
    """
    Apply downgrade_lean to every lean.

    Returns (new_leans, summary_dict).
    summary_dict keys:
      - total
      - adjusted (count adjusted by ANY rule)
      - byRule: {rule_name: count}
    """
    new_leans = []
    summary = {"total": 0, "adjusted": 0, "byRule": {}}
    for lean in leans:
        summary["total"] += 1
        adjusted = downgrade_lean(lean)
        if adjusted.get("_guardrail") and adjusted.get("_guardrail") != lean.get("_guardrail"):
            summary["adjusted"] += 1
            rule = adjusted["_guardrail"]
            summary["byRule"][rule] = summary["byRule"].get(rule, 0) + 1
        new_leans.append(adjusted)
    return new_leans, summary


def apply_to_board_file(path: Path, *, apply: bool = False) -> dict:
    """Read board JSON, apply guardrails, write back if --apply."""
    if not path.exists():
        return {"path": str(path), "error": "file not found"}
    try:
        board = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        return {"path": str(path), "error": f"malformed JSON: {e}"}

    leans = board.get("leans") or []
    new_leans, summary = apply_to_leans(leans)
    summary["path"] = str(path)
    summary["dryRun"] = not apply

    if apply and new_leans != leans:
        board["leans"] = new_leans
        board.setdefault("_guardrailsAppliedAt", _iso_now())
        path.write_text(json.dumps(board, indent=2, sort_keys=True))
        summary["written"] = True
    else:
        summary["written"] = False
    return summary


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply conservative confidence guardrails to board leans.")
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--date", help="single date YYYY-MM-DD")
    grp.add_argument("--all", action="store_true", help="every board file")
    parser.add_argument("--apply", action="store_true",
                        help="actually mutate board JSON (default: dry-run, no writes)")
    args = parser.parse_args()

    targets = (
        sorted(BOARDS_DIR.glob("*.json"))
        if args.all
        else [BOARDS_DIR / f"{args.date}.json"]
    )
    if not targets:
        print("  No board files found.")
        return 1

    overall = {"boards": 0, "adjusted": 0, "byRule": {}}
    for path in targets:
        s = apply_to_board_file(path, apply=args.apply)
        overall["boards"] += 1
        if "error" in s:
            print(f"  ✗ {path.name}: {s['error']}")
            continue
        overall["adjusted"] += s.get("adjusted", 0)
        for k, v in s.get("byRule", {}).items():
            overall["byRule"][k] = overall["byRule"].get(k, 0) + v
        tag = " [dry-run]" if s.get("dryRun") else (" [WRITTEN]" if s.get("written") else "")
        print(f"  ✓ {path.name}: {s['adjusted']}/{s['total']} adjusted{tag}")

    print()
    print(f"  Overall: {overall['boards']} boards, {overall['adjusted']} leans adjusted")
    if overall["byRule"]:
        print(f"  By rule:")
        for rule, n in sorted(overall["byRule"].items()):
            print(f"    {rule:42s} {n}")
    if not args.apply:
        print()
        print("  This was a dry-run. To actually write changes, re-run with --apply.")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
