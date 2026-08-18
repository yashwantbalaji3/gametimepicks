"""
build_odds — fetch real UFC/MMA moneyline odds from The Odds API and write the
UFC odds artifact. ODDS ONLY — never emits picks/projections/parlays.

Credit-guarded (caps events per run). FAIL-CLOSED: missing key / no events / any
error → a valid artifact with oddsReady=false + blockers (never crashes the page).

Run:
  python -m pipeline.ufc.build_odds --dry-run            # free events list + cost estimate
  python -m pipeline.ufc.build_odds --max-events 3       # paid h2h fetch for next N events
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "app" / "public" / "data" / "ufc" / "odds-latest.json"
PER_EVENT_CREDITS = 1  # 1 market (h2h) × 1 region


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _empty(blockers: list[str], **extra) -> dict:
    out = {
        "generatedAt": _now_iso(), "sportKey": "mma_mixed_martial_arts",
        "eventCount": 0, "marketCount": 0, "bouts": [], "oddsReady": False,
        "blockers": blockers, "creditCost": 0, "creditsRemaining": None,
    }
    out.update(extra)
    return out


def build(max_events: int, dry_run: bool, regions: str = "us") -> dict:
    from .providers.oddsapi import (
        fetch_events, fetch_event_odds, parse_h2h, UfcOddsError,
    )
    try:
        events = fetch_events()
    except UfcOddsError as e:
        return _empty([f"odds fetch unavailable: {e}"])
    except Exception as e:  # network/HTTP — fail closed
        return _empty([f"odds events fetch error: {type(e).__name__}"])

    # next-card first (soonest commence_time)
    events = sorted(events, key=lambda e: e.get("commence_time") or "")
    upcoming = events[:max_events]
    if not upcoming:
        return _empty(["no upcoming MMA events from provider"], eventCount=0)

    if dry_run:
        return _empty(
            ["dry-run: no paid fetch"],
            eventCount=len(upcoming),
            estimatedCreditCost=len(upcoming) * PER_EVENT_CREDITS,
            events=[{"id": e.get("id"), "commenceTime": e.get("commence_time"),
                     "home": e.get("home_team"), "away": e.get("away_team")} for e in upcoming],
        )

    # ── SUPERSEDED: this per-event path may no longer spend ─────────────────────────────────────
    #
    # UFC odds acquisition was authorised on 2026-08-18 under docs/receipts/ODDS_AUTHORIZATION_UFC.md,
    # and that receipt names the BULK endpoint as the only route in scope. This function predates it
    # and buys one credit PER BOUT: the July 2026 capture paid 20 credits for a card the bulk route
    # prices for 1. It also carries no receipt check, no cumulative ledger and no ceiling, so a run
    # here spends entirely outside the guarantee the receipt exists to give.
    #
    # It is left in place (its parsing and artifact shape are still referenced) but refuses to make
    # a paid call. The authorised path is app/scripts/ufc/capture-ufc-odds.mjs.
    raise SystemExit(
        "REFUSED: the per-event UFC odds path is out of scope under "
        "docs/receipts/ODDS_AUTHORIZATION_UFC.md (bulk endpoint only, h2h only, 500-credit ceiling).\n"
        "It costs one credit per bout where the authorised bulk call prices the whole card for one, "
        "and it consults neither the receipt nor the cumulative ledger.\n"
        "Use: node app/scripts/ufc/capture-ufc-odds.mjs --apply"
    )

    bouts: list[dict] = []
    credit_cost = 0
    remaining = None
    blockers: list[str] = []
    for e in upcoming:
        try:
            payload, headers = fetch_event_odds(e.get("id"), regions=regions, markets="h2h")
            credit_cost += PER_EVENT_CREDITS
            remaining = headers.get("x-requests-remaining", remaining)
            bout = parse_h2h(payload)
            if bout:
                bouts.append(bout)
        except Exception as ex:
            blockers.append(f"event {e.get('id')}: {type(ex).__name__}")

    odds_ready = len(bouts) > 0
    if not odds_ready and not blockers:
        blockers.append("no two-sided H2H markets available yet")
    return {
        "generatedAt": _now_iso(), "sportKey": "mma_mixed_martial_arts",
        "eventCount": len(upcoming), "marketCount": len(bouts), "bouts": bouts,
        "oddsReady": odds_ready, "blockers": blockers,
        "creditCost": credit_cost, "creditsRemaining": remaining,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-events", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--regions", default="us")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    payload = build(args.max_events, args.dry_run, args.regions)
    # Tag each bout pregame (fetched strictly before its commence time) — only
    # pregame odds are eligible for the backtest (no post-start / settled-line leak).
    fetched = payload.get("generatedAt")
    for b in payload.get("bouts", []):
        ct = b.get("commenceTime")
        b["pregame"] = bool(fetched and ct and fetched < ct)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    # Immutable, timestamped snapshot for backtest accumulation (never overwritten).
    if not args.dry_run and payload.get("bouts"):
        snap_dir = out.parent / "odds-snapshots"
        snap_dir.mkdir(parents=True, exist_ok=True)
        ts = (fetched or "").replace(":", "-")
        snap = snap_dir / f"odds-{ts}.json"
        if not snap.exists():
            snap.write_text(json.dumps(payload, indent=2) + "\n")
            print(f"wrote snapshot {snap}")
    print(f"wrote {out} → oddsReady={payload['oddsReady']} bouts={payload.get('marketCount')} "
          f"credits={payload.get('creditCost')} remaining={payload.get('creditsRemaining')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
