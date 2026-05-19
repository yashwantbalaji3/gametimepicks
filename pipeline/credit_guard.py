"""
Pre-flight credit probe + cost gate for paid Odds API runs.

The downstream pipelines (`generate_daily_board`, `mlb.generate_mlb_board`)
each enforce their own per-run caps. This helper is what the orchestration
scripts call BEFORE invoking them so we never start a run we'd refuse
to finish. Pure I/O is one free HTTP HEAD-style probe; everything else
is local math.

Usage (Python):

    from pipeline.credit_guard import check_balance, GuardDecision

    decision = check_balance(
        api_key=os.environ["ODDS_API_KEY"],
        estimated_cost=45,
        max_per_run=75,
        min_remaining=300,
    )
    if not decision.ok:
        print(decision.reason)
        sys.exit(0)  # honest stop, not a failure
    print(f"balance {decision.remaining}, projected after {decision.projected_after}")

Usage (CLI):

    pipeline/.venv/bin/python -m pipeline.credit_guard \\
        --estimated-cost 45 --max-per-run 75 --min-remaining 300

The CLI exits 0 on OK, 1 on STOP, 2 on probe failure.

Honest framing:
  - The probe endpoint (/sports) is free per The Odds API docs.
  - We refuse to run when balance is unknown rather than guess.
  - Estimated costs are derived by the caller from real event counts ×
    real market counts × real region counts — never fabricated.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Callable, Optional


ODDS_BALANCE_PROBE_URL = "https://api.the-odds-api.com/v4/sports/"


@dataclass(frozen=True)
class GuardDecision:
    """The orchestrator caller treats this as a tri-state outcome.

    ok=True  → safe to spend
    ok=False → STOP; reason is operator-visible
    remaining / projected_after are None when the probe couldn't read
    the balance header (network error, 401, malformed response).
    """

    ok: bool
    reason: str
    remaining: Optional[int]
    projected_after: Optional[int]


def _fetch_remaining(
    api_key: str,
    *,
    fetch: Optional[Callable[[str], Optional[dict]]] = None,
) -> Optional[int]:
    """Probe the free /sports endpoint and read `x-requests-remaining`.

    Returns None on any failure. `fetch` is an injection point for tests
    — when None, we use urllib for the real network call.
    """
    if not api_key:
        return None

    if fetch is not None:
        result = fetch(api_key)
        if result is None:
            return None
        remaining_raw = result.get("x-requests-remaining")
        try:
            return int(remaining_raw) if remaining_raw is not None else None
        except (TypeError, ValueError):
            return None

    try:
        import urllib.request

        url = f"{ODDS_BALANCE_PROBE_URL}?apiKey={api_key}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
            # The Odds API stamps balance on every response header.
            remaining_raw = resp.headers.get("x-requests-remaining")
            try:
                return int(remaining_raw) if remaining_raw is not None else None
            except (TypeError, ValueError):
                return None
    except Exception:
        return None


def check_balance(
    *,
    api_key: str,
    estimated_cost: int,
    max_per_run: int = 75,
    min_remaining: int = 300,
    fetch: Optional[Callable[[str], Optional[dict]]] = None,
) -> GuardDecision:
    """Decide whether a paid run is safe.

    Two hard gates:
      1. estimated_cost > max_per_run → STOP (the per-run cap is the
         user-approved cost ceiling; never silently exceed it).
      2. balance - estimated_cost < min_remaining → STOP (the floor
         protects future ops; runs that would drop below the floor are
         refused even when within the per-run cap).

    When balance can't be read (probe failed / no key), we STOP rather
    than assume. Better to skip a run than fabricate a spend.
    """
    if estimated_cost < 0:
        return GuardDecision(
            ok=False,
            reason=f"estimated_cost={estimated_cost} is negative — refusing",
            remaining=None,
            projected_after=None,
        )

    if estimated_cost > max_per_run:
        return GuardDecision(
            ok=False,
            reason=(
                f"estimated cost {estimated_cost} exceeds per-run cap "
                f"{max_per_run} — refusing"
            ),
            remaining=None,
            projected_after=None,
        )

    if not api_key:
        return GuardDecision(
            ok=False,
            reason="ODDS_API_KEY not set — paid run refused",
            remaining=None,
            projected_after=None,
        )

    remaining = _fetch_remaining(api_key, fetch=fetch)
    if remaining is None:
        return GuardDecision(
            ok=False,
            reason="balance probe failed — refusing rather than guessing",
            remaining=None,
            projected_after=None,
        )

    projected_after = remaining - estimated_cost
    if projected_after < min_remaining:
        return GuardDecision(
            ok=False,
            reason=(
                f"projected balance {projected_after} after spending "
                f"{estimated_cost} would drop below floor {min_remaining} "
                f"(current: {remaining})"
            ),
            remaining=remaining,
            projected_after=projected_after,
        )

    return GuardDecision(
        ok=True,
        reason=(
            f"OK · current {remaining} · spend ~{estimated_cost} · "
            f"projected after ~{projected_after} (floor {min_remaining}, "
            f"cap {max_per_run})"
        ),
        remaining=remaining,
        projected_after=projected_after,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Pre-flight credit probe + cost gate for paid Odds API runs."
        )
    )
    parser.add_argument(
        "--estimated-cost",
        type=int,
        required=True,
        help="Caller-derived credit estimate for the planned run.",
    )
    parser.add_argument(
        "--max-per-run",
        type=int,
        default=75,
        help="Hard cap on cost per run (default: 75).",
    )
    parser.add_argument(
        "--min-remaining",
        type=int,
        default=300,
        help="Refuse the run if projected balance falls below this floor "
             "(default: 300).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a JSON line instead of a human-readable status.",
    )
    args = parser.parse_args(argv)

    decision = check_balance(
        api_key=os.environ.get("ODDS_API_KEY", ""),
        estimated_cost=args.estimated_cost,
        max_per_run=args.max_per_run,
        min_remaining=args.min_remaining,
    )

    if args.json:
        # Print a machine-readable line for shell consumption. The reason
        # field is always present so operators can paste it verbatim.
        print(
            json.dumps(
                {
                    "ok": decision.ok,
                    "reason": decision.reason,
                    "remaining": decision.remaining,
                    "projectedAfter": decision.projected_after,
                    "estimatedCost": args.estimated_cost,
                    "maxPerRun": args.max_per_run,
                    "minRemaining": args.min_remaining,
                }
            )
        )
    else:
        marker = "OK " if decision.ok else "STOP"
        print(f"[credit_guard] {marker} {decision.reason}")

    if decision.ok:
        return 0
    # Distinguish "honest refusal" from "probe failure" so CI can react
    # differently if needed.
    if decision.remaining is None and "probe failed" in decision.reason.lower():
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
