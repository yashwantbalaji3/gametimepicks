"""
Settle pending leans against final box scores.

This is a framework for real settlement — it does as much as it can given
what's currently wired into the pipeline, and clearly documents what's
missing so Batch 4 can finish it.

What this script does today:
  1. Reads the most recent board.json and existing hit_rates.json
  2. Filters to leans with status == "Pending"
  3. For each pending lean, attempts to fetch the player's actual stat
     for the game date via the NBA provider chain
  4. Marks each lean Won / Lost / Push based on actual vs. line
  5. Recomputes hit_rates.json summaries (overall, by market, by confidence)
  6. Appends settled leans to the recentSettled list

What's still TODO (Batch 4):
  - The board today does NOT carry game_id on each lean. We work around this
    by matching player_id + date against today's box scores. If the same player
    plays again on the same UTC date in another timezone (rare for NBA), this
    is ambiguous. game_id wiring upstream resolves it cleanly.
  - This script currently runs against the same NBA provider chain used for
    the daily board. If demo mode is active, settlement no-ops (we don't have
    fictitious box scores to settle against).

Idempotency:
  Safe to run multiple times. Already-settled leans (status != "Pending") are
  skipped. Re-running the same day re-saves hit_rates.json with the same
  numbers but a refreshed timestamp.
"""
from __future__ import annotations

import argparse
import json
import logging
from collections import defaultdict
from pathlib import Path

from . import config as C
from .fetch_nba_data import fetch_player_game_logs
from .providers import now_iso


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("gtp.settle")


# ---------------------------------------------------------------------------
# Settlement logic
# ---------------------------------------------------------------------------
def actual_value_for(player_id: int, game_date: str, market: str) -> float | None:
    """Look up the player's actual stat for the given game date.

    Returns None if no logs are returned (player didn't play, provider
    couldn't find the game, or we're in demo mode where box scores aren't
    available).
    """
    logs, source = fetch_player_game_logs(player_id, last_n=10)
    for g in logs:
        if g.game_date == game_date:
            return float(getattr(g, market.lower()))
    return None


def status_for(actual: float, line: float, lean: str) -> str:
    """Resolve Won / Lost / Push given the actual vs. line and our lean side."""
    if actual == line:
        return "Push"
    if lean == "Over":
        return "Won" if actual > line else "Lost"
    if lean == "Under":
        return "Won" if actual < line else "Lost"
    # No Play leans don't get a result
    return "Void"


# ---------------------------------------------------------------------------
# Hit-rate aggregation
# ---------------------------------------------------------------------------
def recompute_breakdowns(settled: list[dict]) -> dict:
    """Given a flat list of settled lean records, return overall + by-market +
    by-confidence breakdowns matching HitRateBreakdown shape."""
    settled = [s for s in settled if s.get("status") in ("Won", "Lost", "Push")]
    total = len(settled)
    won = sum(1 for s in settled if s["status"] == "Won")
    lost = sum(1 for s in settled if s["status"] == "Lost")
    push = sum(1 for s in settled if s["status"] == "Push")
    decisive = won + lost
    hit_rate = (won / decisive) if decisive > 0 else 0.0
    overall = {
        "label": "All Tracked Leans",
        "total": total, "won": won, "lost": lost, "push": push,
        "hitRate": round(hit_rate, 3),
    }

    by_market = _bucket(settled, key=lambda s: _market_label(s["market"]))
    by_conf = _bucket(settled, key=lambda s: s["confidence"])
    return {"overall": overall, "byMarket": by_market, "byConfidence": by_conf}


_MARKET_LABELS = {"PTS": "Points", "REB": "Rebounds", "AST": "Assists"}


def _market_label(m: str) -> str:
    return _MARKET_LABELS.get(m, m)


def _bucket(records: list[dict], *, key) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        groups[key(r)].append(r)
    out = []
    for label, items in sorted(groups.items()):
        won = sum(1 for r in items if r["status"] == "Won")
        lost = sum(1 for r in items if r["status"] == "Lost")
        push = sum(1 for r in items if r["status"] == "Push")
        decisive = won + lost
        out.append({
            "label": label,
            "total": len(items),
            "won": won, "lost": lost, "push": push,
            "hitRate": round((won / decisive) if decisive > 0 else 0.0, 3),
        })
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Settle pending leans against box scores")
    parser.add_argument("--data-dir", default=None)
    args = parser.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else C.DATA_OUT
    board_path = data_dir / "board.json"
    hr_path = data_dir / "hit_rates.json"

    if not board_path.exists():
        log.error(f"No board.json at {board_path}. Run generate_daily_board first.")
        return 1

    board = json.loads(board_path.read_text())

    # Demo mode → no-op (we don't have real box scores to settle against)
    if board.get("isDemo"):
        log.info("Board is demo mode — no real games to settle. Touching timestamp only.")
        if hr_path.exists():
            hr = json.loads(hr_path.read_text())
            hr["generatedAt"] = now_iso()
            hr_path.write_text(json.dumps(hr, indent=2))
        return 0

    # Real mode — attempt settlement
    pending = [l for l in board.get("leans", []) if l.get("status") == "Pending"]
    log.info(f"Found {len(pending)} pending leans on {board.get('generatedFor')}")

    settled_count = 0
    new_settled_records: list[dict] = []

    for lean in pending:
        actual = actual_value_for(
            player_id=int(lean["playerId"]),
            game_date=lean["date"],
            market=lean["market"],
        )
        if actual is None:
            # Game hasn't finished or player didn't play. Leave as Pending.
            continue

        new_status = status_for(actual, float(lean["line"]), lean["lean"])
        lean["status"] = new_status
        lean["actualValue"] = actual
        settled_count += 1

        new_settled_records.append({
            "date": lean["date"],
            "playerName": lean["playerName"],
            "market": lean["market"],
            "line": lean["line"],
            "lean": lean["lean"],
            "confidence": lean["confidence"],
            "actualValue": actual,
            "status": new_status,
        })

    log.info(f"Settled {settled_count} leans (newly resolved this run)")

    # Save the updated board
    board_path.write_text(json.dumps(board, indent=2))

    # Update hit_rates.json
    if hr_path.exists():
        hr = json.loads(hr_path.read_text())
    else:
        hr = {
            "generatedAt": now_iso(),
            "isDemo": False,
            "dateRange": board.get("generatedFor", ""),
            "overall": {"label": "All Tracked Leans", "total": 0, "won": 0, "lost": 0, "push": 0, "hitRate": 0.0},
            "byMarket": [],
            "byConfidence": [],
            "calibration": [],
            "recentSettled": [],
        }

    # Append newly settled, dedupe by (date, player, market) + cap to 50
    existing_keys = {
        (r["date"], r["playerName"], r["market"]) for r in hr.get("recentSettled", [])
    }
    fresh = [
        r for r in new_settled_records
        if (r["date"], r["playerName"], r["market"]) not in existing_keys
    ]
    hr["recentSettled"] = (fresh + hr.get("recentSettled", []))[:50]

    # Recompute aggregate breakdowns over ALL settled history we have
    # (recentSettled is the running log of decided leans)
    breakdowns = recompute_breakdowns(hr["recentSettled"])
    hr["overall"] = breakdowns["overall"]
    hr["byMarket"] = breakdowns["byMarket"]
    hr["byConfidence"] = breakdowns["byConfidence"]
    hr["isDemo"] = False
    hr["generatedAt"] = now_iso()
    hr.pop("sampleNote", None)  # drop the sample note once we have real data

    hr_path.write_text(json.dumps(hr, indent=2))
    log.info(f"Updated hit_rates.json — overall {hr['overall']['hitRate']:.1%} on {hr['overall']['total']} leans")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
