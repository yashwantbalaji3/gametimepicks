"""
Phase 18 — pipeline.diagnose_props

Operator diagnostic. Tells you exactly what's blocking today/tomorrow
props in plain English, without burning Odds API credits.

Run:
    python -m pipeline.diagnose_props

What it checks:
    1. ODDS_API_KEY environment variable
    2. ENABLE_ODDS_REFRESH variable
    3. ODDS_DRY_RUN flag
    4. Recent boards on disk for today / tomorrow
    5. dataMode of those boards
    6. Whether nba_api appears installed (import-only check, no network)
    7. Workflow file presence + paid-step wired or no-op

Zero network. Zero Odds API credits. Read-only.

Output is plain text suitable for a screenshot in a debugging session.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
import json
import datetime as dt

REPO_ROOT = Path(__file__).resolve().parent.parent
BOARDS_DIR = REPO_ROOT / "app" / "public" / "data" / "boards"
META_PATH = REPO_ROOT / "app" / "public" / "data" / "meta.json"
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "auto-refresh.yml"


def _today_et() -> str:
    """Best-effort ET date without external deps."""
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    except Exception:
        # Approximate: UTC - 4 hours (works during DST)
        return (dt.datetime.utcnow() - dt.timedelta(hours=4)).date().isoformat()


def _load_meta() -> dict:
    if META_PATH.exists():
        try:
            return json.loads(META_PATH.read_text())
        except Exception:
            pass
    return {}


def _board_summary(date: str) -> dict:
    p = BOARDS_DIR / f"{date}.json"
    if not p.exists():
        return {"exists": False}
    try:
        b = json.loads(p.read_text())
        return {
            "exists": True,
            "leans": len(b.get("leans") or []),
            "games": len(b.get("games") or []),
            "dataMode": b.get("dataMode"),
            "generatedAt": b.get("generatedAt"),
        }
    except Exception as e:
        return {"exists": True, "error": str(e)}


def _check_nba_api() -> tuple[bool, str]:
    try:
        import nba_api  # noqa: F401
        return True, "installed"
    except ImportError:
        return False, "not installed (free schedule provider missing)"
    except Exception as e:
        return False, f"import error: {e}"


def _check_workflow() -> tuple[str, str]:
    """Returns ('wired'|'noop'|'missing', detail)."""
    if not WORKFLOW_PATH.exists():
        return "missing", "no auto-refresh.yml workflow file"
    src = WORKFLOW_PATH.read_text()
    if "generate_daily_board" in src and "ENABLE_ODDS_REFRESH" in src:
        return "wired", "paid step calls generate_daily_board"
    if "no-op" in src or "intentionally a no-op" in src:
        return "noop", "paid step is still the Phase 14 placeholder"
    return "unknown", "workflow exists but couldn't classify"


def _print_section(title: str) -> None:
    print()
    print(f"  ── {title} " + "─" * (60 - len(title)))


def main() -> int:
    print()
    print("  ════════════════════════════════════════════════════════════")
    print("    GametimePicks — props blocker diagnostic")
    print("  ════════════════════════════════════════════════════════════")

    today = _today_et()
    tomorrow = (
        dt.date.fromisoformat(today) + dt.timedelta(days=1)
    ).isoformat()
    print()
    print(f"  Real today (ET):  {today}")
    print(f"  Tomorrow (ET):    {tomorrow}")

    # Block 1 — environment
    _print_section("environment")
    odds_key_present = bool(os.environ.get("ODDS_API_KEY"))
    enable = os.environ.get("ENABLE_ODDS_REFRESH", "").strip().lower()
    dry_run = os.environ.get("ODDS_DRY_RUN", "").strip().lower()
    print(f"  ODDS_API_KEY present:        {'✓ yes' if odds_key_present else '✗ no'}")
    print(f"  ENABLE_ODDS_REFRESH:         {enable or '(unset → defaults to false)'}")
    print(f"  ODDS_DRY_RUN:                {dry_run or '(unset → defaults to true)'}")

    # Block 2 — board data
    _print_section("board data on disk")
    for label, date in [("today", today), ("tomorrow", tomorrow), ("primaryDate (meta)", _load_meta().get("primaryDate"))]:
        if not date:
            continue
        s = _board_summary(date)
        if not s.get("exists"):
            print(f"  {label:24s} {date}  (no board file)")
            continue
        print(
            f"  {label:24s} {date}  leans={s.get('leans', 0):3d}  "
            f"games={s.get('games', 0):2d}  mode={s.get('dataMode', '?')}"
        )

    # Block 3 — nba_api
    _print_section("free dependencies")
    ok, detail = _check_nba_api()
    print(f"  nba_api:                     {'✓' if ok else '✗'} {detail}")

    # Block 4 — workflow
    _print_section("auto-refresh workflow")
    status, detail = _check_workflow()
    icon = {"wired": "✓", "noop": "✗", "missing": "✗", "unknown": "?"}.get(status, "?")
    print(f"  paid step status:            {icon} {status} — {detail}")

    # Verdict
    _print_section("verdict")
    blockers = []
    if not odds_key_present:
        blockers.append(
            "ODDS_API_KEY not set in environment. "
            "Add to GitHub Actions secrets + Vercel env vars."
        )
    if enable != "true":
        blockers.append(
            "ENABLE_ODDS_REFRESH ≠ 'true'. "
            "Set repository variable ENABLE_ODDS_REFRESH=true."
        )
    if dry_run == "true":
        blockers.append(
            "ODDS_DRY_RUN=true is the safe default but skips paid /odds "
            "calls. To actually fetch props, set ODDS_DRY_RUN=false."
        )
    if status == "noop":
        blockers.append(
            "Workflow's paid step is the Phase 14 no-op placeholder. "
            "Apply Phase 18 to wire pipeline.generate_daily_board."
        )
    if not ok:
        blockers.append(
            "nba_api not installed in current Python env. Free schedule "
            "fetches will fail. Install with `pip install nba_api`."
        )

    if not blockers:
        print()
        print("  ✓ no blockers detected. If today/tomorrow props are still")
        print("    missing, the next refresh should populate them.")
        print()
        return 0

    print()
    print(f"  ✗ {len(blockers)} blocker(s) detected:")
    print()
    for i, b in enumerate(blockers, 1):
        print(f"    {i}. {b}")
        print()

    print("  Operator next steps:")
    print()
    print("    See docs/ODDS_API_ACTIVATION.md for the safe activation flow.")
    print("    First-time activation should always start with ODDS_DRY_RUN=true")
    print("    to verify the API key works without burning credits.")
    print()
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
