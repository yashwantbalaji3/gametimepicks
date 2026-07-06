"""
Phase 7B-3 — Verify ODDS_API_KEY without burning paid credits.

Usage:
    python -m pipeline.check_odds_key
    python -m pipeline.check_odds_key --verbose
    bash scripts/check_odds_key.sh

Behavior:
    1. Reads ODDS_API_KEY from .env / shell env via pipeline.config
    2. If unset → prints a friendly help message, exits 0, NEVER hits network
    3. If set → calls /v4/sports/?apiKey=KEY (FREE per Odds API docs)
       - Validates key (200 = valid, 401 = invalid)
       - Reports remaining quota from x-requests-remaining header
       - Confirms NBA is in the supported sports list
    4. NEVER prints the key itself — only a length/prefix mask

Exit codes:
    0 — key not configured (informational), OR key is valid
    1 — key is set but invalid / API unreachable / NBA missing
    2 — unexpected error

This is the recommended first step after adding ODDS_API_KEY to .env.
"""
from __future__ import annotations

import argparse
import sys
from typing import Any


def mask_key(key: str) -> str:
    """Return a safe display version of the key. NEVER returns the full key."""
    if not key:
        return "[unset]"
    n = len(key)
    if n < 12:
        return f"[{n}-char key, redacted]"
    return f"{key[:4]}...{key[-4:]} ({n} chars)"


def _ok(msg: str) -> None:
    print(f"  \033[0;32m✓\033[0m {msg}")


def _err(msg: str) -> None:
    print(f"  \033[0;31m✗\033[0m {msg}", file=sys.stderr)


def _info(msg: str) -> None:
    print(f"  \033[0;34m·\033[0m {msg}")


def _warn(msg: str) -> None:
    print(f"  \033[0;33m!\033[0m {msg}")


def _fetch_remaining(key: str | None, timeout: float = 10.0) -> int | None:
    """Remaining Odds API credits via the FREE /v4/sports endpoint's x-requests-remaining header.
    Returns an int, or None when it can't be determined (no key, network error, header absent) — the
    caller treats None as 'unknown' and does NOT block (advisory fallback)."""
    if not key:
        return None
    try:
        import requests
        r = requests.get(
            "https://api.the-odds-api.com/v4/sports/",
            params={"apiKey": key}, timeout=timeout,
        )
        if r.status_code != 200:
            return None
        rem = r.headers.get("x-requests-remaining")
        return int(rem) if rem is not None and str(rem).strip().lstrip("-").isdigit() else None
    except Exception:
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check ODDS_API_KEY validity without burning credits.",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Print the full sports list returned by the API.",
    )
    parser.add_argument(
        "--emit-remaining", action="store_true",
        help="Print ONLY the remaining Odds API credits (integer), or 'unknown', then exit. "
             "Machine-readable for the refresh credit-floor guard. Uses the FREE /sports endpoint.",
    )
    parser.add_argument(
        "--min-credits", type=int, default=None,
        help="Fail-closed: exit 3 if remaining credits < this floor (refuse a paid fetch). "
             "If the API does not report remaining credits, this is advisory (exits 0, warns).",
    )
    args = parser.parse_args(argv)

    # Load config (also loads .env)
    try:
        from . import config as C
    except Exception as e:
        _err(f"Could not import pipeline.config: {e}")
        return 2

    # ── Credit-floor guard path (machine-readable; no decorative output on stdout) ──────────────────
    # Uses the FREE /v4/sports endpoint's x-requests-remaining header — costs 0 credits. If the key is
    # unset or the API doesn't report remaining credits, the floor check is ADVISORY (does not block a
    # refresh) so a provider that omits the header can't hard-stop ops. See docs/OWNER_ACTIONS.md.
    if args.emit_remaining or args.min_credits is not None:
        remaining = _fetch_remaining(C.ODDS_API_KEY, C.HTTP_TIMEOUT_SECONDS)
        if args.emit_remaining:
            print(remaining if remaining is not None else "unknown")
        if args.min_credits is not None:
            if remaining is None:
                _warn(f"remaining Odds API credits unknown — floor {args.min_credits} not enforced (advisory)")
                return 0
            if remaining < args.min_credits:
                _err(f"Odds API credits {remaining} < floor {args.min_credits} — refusing paid fetch (fail-closed)")
                return 3
            _ok(f"Odds API credits {remaining} ≥ floor {args.min_credits}")
        return 0

    print("\n\033[0;34m═══ ODDS_API_KEY check (Phase 7B-3) ═══\033[0m\n")

    key = C.ODDS_API_KEY
    if not key:
        _info("ODDS_API_KEY is not configured.")
        print()
        print("  This is fine — the app works without it.")
        print("  Without a key, the board shows the schedule and a")
        print("  'Props unavailable — odds provider not configured' banner.")
        print()
        print("  To enable real player props:")
        print("    1. Sign up at https://the-odds-api.com/ (no card, free tier")
        print("       gives 500 credits/month)")
        print("    2. Add ODDS_API_KEY=<your-key> to .env at the project root")
        print("    3. Re-run this check: python -m pipeline.check_odds_key")
        print("    4. Walkthrough: docs/odds_api_setup.md")
        print()
        return 0

    _info(f"key configured: {mask_key(key)}")
    _info(f"provider: {C.ODDS_PROVIDER}")
    _info(f"markets configured: {C.ODDS_MARKETS}")
    _info(f"regions configured: {C.ODDS_REGIONS}")
    _info(f"bookmakers configured: {C.ODDS_BOOKMAKERS}")
    _info(f"per-run event cap: {C.ODDS_MAX_EVENTS_PER_RUN}")
    _info(f"cache TTL: {C.ODDS_CACHE_TTL_MINUTES} min")
    _info(f"dry-run mode: {C.ODDS_DRY_RUN}")
    print()

    # Validate by hitting /v4/sports/?apiKey=KEY (FREE per Odds API docs).
    # This endpoint:
    #   - Costs 0 credits (per the API docs)
    #   - Returns 401 on invalid key
    #   - Returns the full list of supported sports — confirms NBA available
    #   - Returns x-requests-remaining header for quota inspection
    try:
        import requests
    except ImportError as e:
        _err(f"requests not installed: {e}")
        _info("Try: pip install -r pipeline/requirements.txt")
        return 2

    print("  \033[0;34m·\033[0m calling /v4/sports/ (FREE — no credits charged)...")

    try:
        r = requests.get(
            "https://api.the-odds-api.com/v4/sports/",
            params={"apiKey": key, "all": "true"},
            timeout=C.HTTP_TIMEOUT_SECONDS,
        )
    except requests.exceptions.RequestException as e:
        _err(f"Network error: {e}")
        _info("Check your internet connection and try again.")
        return 1

    if r.status_code == 401:
        _err("Key is invalid (HTTP 401). Double-check ODDS_API_KEY in .env.")
        _info(
            "If you just signed up, allow a minute for the key to activate.\n"
            "  If the issue persists, regenerate the key on the dashboard:\n"
            "    https://the-odds-api.com/account/"
        )
        return 1

    if r.status_code == 429:
        _err("Rate limited (HTTP 429). The Odds API is throttling requests.")
        _info("Wait a few minutes and try again.")
        return 1

    if r.status_code >= 500:
        _err(f"The Odds API returned {r.status_code}. Try again later.")
        return 1

    if r.status_code != 200:
        _err(f"Unexpected status {r.status_code}: {r.text[:200]}")
        return 1

    # Parse response
    try:
        sports = r.json()
    except Exception as e:
        _err(f"Could not parse response JSON: {e}")
        return 1

    if not isinstance(sports, list):
        _err(f"Unexpected response shape: {type(sports).__name__}")
        return 1

    nba_entry = next(
        (s for s in sports if isinstance(s, dict) and s.get("key") == "basketball_nba"),
        None,
    )
    nba_active = bool(nba_entry and nba_entry.get("active"))

    _ok("key is valid (HTTP 200)")

    if nba_entry:
        if nba_active:
            _ok("NBA available and active in The Odds API catalog")
        else:
            _warn("NBA listed but currently inactive (off-season?)")
    else:
        _err("NBA (basketball_nba) is NOT in the sports list — unexpected")
        return 1

    # Quota
    rem = r.headers.get("x-requests-remaining")
    used = r.headers.get("x-requests-used")
    last = r.headers.get("x-requests-last")
    print()
    if rem is not None or used is not None:
        print("  \033[0;34m═══ Quota ═══\033[0m")
        if rem is not None:
            _info(f"credits remaining: {rem}")
        if used is not None:
            _info(f"credits used so far: {used}")
        if last is not None:
            _info(f"last call cost: {last} (this call should be 0)")

    # Cost preview for the user's current settings
    print()
    print("  \033[0;34m═══ Cost forecast ═══\033[0m")
    cost_per_event = max(1, len(C.ODDS_MARKETS)) * max(1, len(C.ODDS_REGIONS))
    full_run = C.ODDS_MAX_EVENTS_PER_RUN * cost_per_event
    _info(
        f"estimated worst-case credits per pipeline run: {full_run} "
        f"({C.ODDS_MAX_EVENTS_PER_RUN} events × {len(C.ODDS_MARKETS)} markets × "
        f"{len(C.ODDS_REGIONS)} regions = {full_run})"
    )
    if rem is not None:
        try:
            runs = int(rem) // full_run if full_run > 0 else 0
            _info(f"approx. {runs} more pipeline runs at current settings")
        except (ValueError, TypeError):
            pass
    _info("the cache means re-running within the TTL window costs 0")
    _info(f"current cache TTL: {C.ODDS_CACHE_TTL_MINUTES} min")

    print()
    print("  \033[0;34m═══ Next steps ═══\033[0m")
    print("    1. Dry-run the pipeline (still 0 credits — calls /events only):")
    print("       ODDS_DRY_RUN=true bash scripts/run_pipeline.sh")
    print("    2. Inspect the resulting board:")
    print("       python -m pipeline.diagnose")
    print("    3. When ready, do a real run (uses credits):")
    print("       bash scripts/run_pipeline.sh")
    print("    4. Inspect cache between runs:")
    print("       python -m pipeline.cache_inspect")
    print()

    if args.verbose:
        print("  \033[0;34m═══ Sports catalog (--verbose) ═══\033[0m")
        for s in sports:
            if isinstance(s, dict):
                key_ = s.get("key", "?")
                title = s.get("title", "?")
                active = s.get("active", False)
                marker = "✓" if active else " "
                print(f"    [{marker}] {key_:35s} {title}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
