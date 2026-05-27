"""Confirmed signal policy layer over daily audit JSON (PR #118).

The model learning loop has three layers:

    1. `pipeline.audit_daily` — writes a per-date postmortem JSON
       (committed in PR #117).

    2. `pipeline.audit_signal_policy` — THIS module. Reads the last N
       postmortems in a rolling window, counts how many days each
       recommendation has fired, and emits a compact
       `app/public/data/audit/policy.json` describing which signals
       are CONFIRMED enough to act on.

    3. A future PR consumes the confirmed signals to apply bounded,
       demotion-only adjustments to the optimizer / display layer.

Honesty rules (very deliberate)
-------------------------------
- **One bad slate must NEVER move the model.** Model-changing signals
  require at least `days_required` confirming days in the rolling
  window. Default is 3 of the last 7. With less data, the policy
  emits `confirmed: false` and downstream consumers must no-op.

- **Demotion only, never promotion.** A signal can lower a market
  weight or tighten a guard. It can NEVER raise either. The
  `weightMultiplier` is clamped to `[FLOOR, 1.0]`. FLOOR is 0.70.

- **Bounded strength.** Even with all confirming days, no single
  signal can knock a market more than 30% below baseline in one PR.

- **The longshot lane is the lone UI-only exception.** It already
  ships collapsed on the homepage; the policy can confirm that
  display caution with just 1 day because nothing about the model's
  scoring changes.

- **Missing or malformed JSON never crashes.** Each malformed file
  becomes a warning. Empty input → no confirmed signals.

- **Unknown recommendation IDs are reported, not silently dropped.**
  They land in `warnings` so a future audit_daily rule can be wired
  in without breaking older policy.json consumers.

CLI
---
    python -m pipeline.audit_signal_policy
    python -m pipeline.audit_signal_policy --window-days 7 --days-required 3
    python -m pipeline.audit_signal_policy --dry-run
    python -m pipeline.audit_signal_policy \\
        --input-dir app/public/data/audit/daily \\
        --output app/public/data/audit/policy.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = REPO_ROOT / "app" / "public" / "data" / "audit" / "daily"
DEFAULT_OUTPUT = REPO_ROOT / "app" / "public" / "data" / "audit" / "policy.json"

# ---------------------------------------------------------------------------
# Policy constants — intentionally conservative defaults.
# ---------------------------------------------------------------------------

# Rolling window we look back over.
DEFAULT_WINDOW_DAYS = 7
# Confirming-days threshold for MODEL-CHANGING signals.
DEFAULT_DAYS_REQUIRED = 3
# Hard floor for any market weight multiplier. A market can never go
# below this fraction of its baseline weight, regardless of how many
# bad days pile up.
WEIGHT_FLOOR = 0.70
# Per-confirming-day step the multiplier drops by. Bounded at FLOOR.
# 3 days confirming → 0.85. 4 days → 0.80. 5 days → 0.75. Clamped.
WEIGHT_STEP_PER_DAY = 0.05
# UI-only signal: confirms with 1 day because nothing about scoring
# moves. (The longshot lane is already collapsed on the homepage.)
UI_ONLY_DAYS_REQUIRED = 1

# Recognized recommendation IDs from audit_daily. Anything else lands
# in `warnings`. Keep this in sync with `pipeline/audit_daily.py`.
_KNOWN_REC_IDS = {
    "mixed_sport_downrank",
    "samegame_nba_cap_conservative",
    "longshot_keep_collapsed",
    "dnp_guard_strengthen",
    # Per-market follows `market_<KEY>_weak` pattern — handled below.
}

_MARKET_REC_RE = re.compile(r"^market_(?P<market>[A-Za-z0-9_]+)_weak$")


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def _list_audit_files(input_dir: Path, window_days: int) -> list[Path]:
    """Return up to `window_days` most-recent YYYY-MM-DD.json files in
    `input_dir`, sorted newest-first. Missing directory → []."""
    if not input_dir.exists():
        return []
    files: list[tuple[str, Path]] = []
    for p in input_dir.iterdir():
        if not p.is_file():
            continue
        if not re.match(r"^\d{4}-\d{2}-\d{2}\.json$", p.name):
            continue
        files.append((p.stem, p))
    # Newest first.
    files.sort(key=lambda t: t[0], reverse=True)
    return [p for _, p in files[:window_days]]


def _load_audit(path: Path, warnings: list[str]) -> dict[str, Any] | None:
    """Defensive load. Returns None on parse error and appends a
    warning; never raises."""
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        warnings.append(f"unreadable audit file {path.name}: {e.__class__.__name__}")
        return None


# ---------------------------------------------------------------------------
# Signal counting
# ---------------------------------------------------------------------------


def _count_signals(
    audits: list[dict[str, Any]],
    warnings: list[str],
) -> tuple[
    dict[str, int],          # generic signal fires by id
    dict[str, int],          # market-specific fires by upper-case key
]:
    """Walk each audit's `recommendations[]` and count how many days
    each known signal fired. Returns `(generic_fires, market_fires)`.

    Each AUDIT (i.e. each day) contributes at most ONE fire per
    signal id — we count days, not raw recommendation entries. This
    matters because in theory a future audit_daily could emit the
    same id twice.
    """
    generic_fires: dict[str, int] = defaultdict(int)
    market_fires: dict[str, int] = defaultdict(int)

    for audit in audits:
        recs = audit.get("recommendations") or []
        if not isinstance(recs, list):
            continue
        seen_today_generic: set[str] = set()
        seen_today_markets: set[str] = set()
        for r in recs:
            if not isinstance(r, dict):
                continue
            rec_id = r.get("id")
            if not isinstance(rec_id, str) or not rec_id:
                continue
            m = _MARKET_REC_RE.match(rec_id)
            if m:
                key = m.group("market")
                if key not in seen_today_markets:
                    market_fires[key] += 1
                    seen_today_markets.add(key)
                continue
            if rec_id in _KNOWN_REC_IDS:
                if rec_id not in seen_today_generic:
                    generic_fires[rec_id] += 1
                    seen_today_generic.add(rec_id)
                continue
            # Unknown id — surfaced once per day so a future audit
            # rule can be wired in without silently breaking.
            warnings.append(f"unknown recommendation id ignored: {rec_id}")

    return dict(generic_fires), dict(market_fires)


# ---------------------------------------------------------------------------
# Confirmation + strength math
# ---------------------------------------------------------------------------


def _confirm_signal(
    fires: int,
    days_required: int,
    *,
    ui_only: bool = False,
) -> bool:
    """A signal is confirmed iff it fired on at least `days_required`
    days in the window. UI-only signals use a relaxed threshold
    (default 1 day) because they never touch optimizer scoring.

    Below the threshold, `confirmed: false` — downstream consumers
    MUST no-op."""
    if ui_only:
        return fires >= UI_ONLY_DAYS_REQUIRED
    return fires >= days_required


def _market_weight_multiplier(fires: int, days_required: int) -> float:
    """Compute a bounded demotion multiplier for a market.

    Returns 1.0 (no change) until the market has fired on at least
    `days_required` days. After that, drops by `WEIGHT_STEP_PER_DAY`
    per confirming day, floored at WEIGHT_FLOOR.

    Examples (days_required=3, step=0.05, floor=0.70):
        fires=2  → 1.00  (not confirmed)
        fires=3  → 0.85  (3 * 0.05 demotion baseline once confirmed)
        fires=4  → 0.80
        fires=5  → 0.75
        fires=6  → 0.70  (floor reached)
        fires=7  → 0.70  (still floor)

    NOTE: This is demotion-only. The multiplier can never exceed 1.0.
    """
    if fires < days_required:
        return 1.0
    raw = 1.0 - WEIGHT_STEP_PER_DAY * fires
    return round(max(WEIGHT_FLOOR, min(1.0, raw)), 4)


# ---------------------------------------------------------------------------
# Top-level builder
# ---------------------------------------------------------------------------


def build_policy(
    *,
    input_dir: Path | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    days_required: int = DEFAULT_DAYS_REQUIRED,
    audits: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Pure builder — pass `audits` directly for unit tests, or pass
    `input_dir` for the real disk-backed path. Returns the policy
    JSON dict.

    `confirmed` at the TOP level is true iff ANY model-changing
    signal in the window is confirmed. UI-only signals do NOT flip
    the top-level confirmed flag (they're advisory, not active).
    """
    warnings: list[str] = []
    dates: list[str] = []

    if audits is None:
        if input_dir is None:
            input_dir = DEFAULT_INPUT_DIR
        files = _list_audit_files(input_dir, window_days)
        audits = []
        for f in files:
            a = _load_audit(f, warnings)
            if a is None:
                continue
            audits.append(a)
            d = a.get("date") or f.stem
            if isinstance(d, str):
                dates.append(d)
    else:
        for a in audits:
            d = a.get("date")
            if isinstance(d, str):
                dates.append(d)

    # Newest-first audit ordering keeps the dates list deterministic.
    dates.sort(reverse=True)

    generic_fires, market_fires = _count_signals(audits, warnings)

    days_available = len(audits)

    # Generic signals.
    mixed = generic_fires.get("mixed_sport_downrank", 0)
    samegame = generic_fires.get("samegame_nba_cap_conservative", 0)
    dnp = generic_fires.get("dnp_guard_strengthen", 0)
    longshot = generic_fires.get("longshot_keep_collapsed", 0)

    mixed_confirmed = _confirm_signal(mixed, days_required)
    samegame_confirmed = _confirm_signal(samegame, days_required)
    dnp_confirmed = _confirm_signal(dnp, days_required)
    longshot_confirmed = _confirm_signal(longshot, days_required, ui_only=True)

    # Market demotions — one entry per market that has fired at least
    # once across the window. Each row carries its confirmed flag +
    # bounded multiplier.
    market_demotions: dict[str, dict[str, Any]] = {}
    for market_key, fires in sorted(market_fires.items()):
        confirmed = _confirm_signal(fires, days_required)
        market_demotions[market_key] = {
            "fires": fires,
            "daysRequired": days_required,
            "confirmed": confirmed,
            "weightMultiplier": _market_weight_multiplier(fires, days_required),
        }

    any_model_changing_confirmed = bool(
        mixed_confirmed
        or samegame_confirmed
        or dnp_confirmed
        or any(v["confirmed"] for v in market_demotions.values())
    )

    return {
        "_disclaimer": (
            "Confirmed-signal policy over the daily audit window — "
            "see docs/MODEL_LEARNING_LOOP.md. Demotion only; one bad "
            "slate cannot move the model."
        ),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "window": {
            "daysAvailable": days_available,
            "daysRequired": days_required,
            "windowDays": window_days,
            "dates": dates,
        },
        "confirmed": any_model_changing_confirmed,
        "signals": {
            "mixedSportDownrank": {
                "fires": mixed,
                "daysRequired": days_required,
                "confirmed": mixed_confirmed,
                "strength": _strength(mixed, days_required) if mixed_confirmed else 0,
            },
            "sameGameNbaCap": {
                "fires": samegame,
                "daysRequired": days_required,
                "confirmed": samegame_confirmed,
                "strength": _strength(samegame, days_required) if samegame_confirmed else 0,
            },
            "marketDemotions": market_demotions,
            "dnpGuardStrengthen": {
                "fires": dnp,
                "daysRequired": days_required,
                "confirmed": dnp_confirmed,
                "strength": _strength(dnp, days_required) if dnp_confirmed else 0,
            },
            "longshotKeepCollapsed": {
                "fires": longshot,
                "daysRequired": UI_ONLY_DAYS_REQUIRED,
                "confirmed": longshot_confirmed,
            },
        },
        "warnings": warnings,
    }


def _strength(fires: int, days_required: int) -> int:
    """Coarse 1-3 strength integer for non-market signals. Lets a
    consumer apply a soft / firmer adjustment without inventing
    fractional weights for every category. Bounded at 3."""
    if fires < days_required:
        return 0
    return min(3, 1 + (fires - days_required))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input-dir",
        default=str(DEFAULT_INPUT_DIR),
        help="Directory of daily audit JSONs (default: app/public/data/audit/daily).",
    )
    p.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Where to write policy.json.",
    )
    p.add_argument(
        "--window-days",
        type=int,
        default=DEFAULT_WINDOW_DAYS,
        help=f"Rolling window in days (default: {DEFAULT_WINDOW_DAYS}).",
    )
    p.add_argument(
        "--days-required",
        type=int,
        default=DEFAULT_DAYS_REQUIRED,
        help=(
            "Confirming days required for model-changing signals "
            f"(default: {DEFAULT_DAYS_REQUIRED})."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the policy summary without writing the file.",
    )
    args = p.parse_args(argv)

    policy = build_policy(
        input_dir=Path(args.input_dir),
        window_days=args.window_days,
        days_required=args.days_required,
    )

    summary = {
        "daysAvailable": policy["window"]["daysAvailable"],
        "daysRequired": policy["window"]["daysRequired"],
        "dates": policy["window"]["dates"],
        "confirmed": policy["confirmed"],
        "confirmedSignals": [
            name
            for name, sig in policy["signals"].items()
            if name != "marketDemotions" and sig.get("confirmed")
        ] + [
            f"market:{m}"
            for m, v in policy["signals"]["marketDemotions"].items()
            if v.get("confirmed")
        ],
        "warnings": policy["warnings"],
    }

    if args.dry_run:
        print(json.dumps(summary, indent=2))
        return 0

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(policy, indent=2, ensure_ascii=False))
    # Display path as repo-relative when it falls under REPO_ROOT,
    # otherwise just show the absolute path. Tests pass tempdirs
    # outside the repo and we don't want that to crash the print.
    try:
        display_path = out_path.relative_to(REPO_ROOT)
    except ValueError:
        display_path = out_path
    print(
        f"audit_signal_policy: {summary['daysAvailable']}/{summary['daysRequired']} "
        f"confirming days · confirmed={policy['confirmed']} → {display_path}"
    )
    if summary["confirmedSignals"]:
        print(f"  confirmed signals: {summary['confirmedSignals']}")
    if policy["warnings"]:
        print(f"  warnings: {policy['warnings']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
