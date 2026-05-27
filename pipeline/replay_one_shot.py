"""Retrospective experimental model replay (PR #122).

Generates a clearly-labeled "what the model would have produced if
the same-game cap were relaxed for a single-game slate" snapshot for
a past date. Reads ONLY the pregame board file — never the
settled-leans file — so no final outcomes leak into selection.

The replay is **not official**. It writes to a separate path
(`app/public/data/parlays/replay/<date>.json`), keeps its own
graded file (`replay-graded/<date>.json`), and is never folded into
`optimizer-summary.json` or the official lifetime hit rate.

Why this exists
---------------
On a 1-NBA-game slate like 2026-05-26 (the NBA Finals series-clinching
window) plus 0 MLB props (credit-guard refusal), every official
profile required legs from ≥ 2 different games (`max_legs_per_game=1`
on Conservative/Star Power, 2 on Balanced, 3 on Aggressive). With one
game, no 2+ leg parlay forms. The official snapshot honestly emits
0 slips, and that's the right behavior for live picks — same-game
stacks correlate in blowouts (5/25 audit: same-game NBA went 1W-21L,
4.5%).

But users asked: "what would the model have suggested if it could
stack within that one game?" That question is legitimate. The
replay answers it honestly:

  - Same `parlay_optimizer.optimize()` math.
  - Same eligibility gates (DNP guard, edge thresholds, confidence).
  - Same lean pool (pregame board, untouched).
  - **One rule relaxed:** `max_legs_per_game` lifted so multi-leg
    same-game stacks can form. Documented in `ruleOverrides`.

The output is graded against the actual settled stats so users can
see the answer in full. Honest about both the question and the
constraint.

CLI
---
    python -m pipeline.replay_one_shot --date 2026-05-26
    python -m pipeline.replay_one_shot --date 2026-05-26 --dry-run

Output
------
    app/public/data/parlays/replay/<date>.json
    app/public/data/parlays/replay-graded/<date>.json
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

from .grade_optimizer import grade_optimizer_payload
from .parlay_optimizer import PROFILE_RULES_BY_NAME, ProfileRules
from .snapshot_optimizer import build_optimizer_snapshot

REPLAY_DIR = os.path.join("app", "public", "data", "parlays", "replay")
REPLAY_GRADED_DIR = os.path.join(
    "app", "public", "data", "parlays", "replay-graded"
)

# The single rule we relax for this variant. The official optimizer
# keeps these caps small (1 on Conservative/Star Power, 2 on Balanced,
# 3 on Aggressive) because same-game NBA stacks underperformed on the
# 5/25 audit. Lifting them HERE lets the replay produce slips on a
# 1-game slate; lifting them in the official optimizer would be the
# wrong response to the audit. Both signals are honest, just answering
# different questions.
_RULE_OVERRIDES = {
    "conservative": {"max_legs_per_game": 2},
    "balanced": {"max_legs_per_game": 3},
    "aggressive": {"max_legs_per_game": 4},
    "star_power": {"max_legs_per_game": 2},
}


def _apply_overrides() -> dict[str, ProfileRules]:
    """Return a fresh PROFILE_RULES_BY_NAME with overrides applied.
    The caller is responsible for restoring the original mapping."""
    new: dict[str, ProfileRules] = {}
    for profile, rules in PROFILE_RULES_BY_NAME.items():
        overrides = _RULE_OVERRIDES.get(profile)
        new[profile] = (
            dataclasses.replace(rules, **overrides) if overrides else rules
        )
    return new


def _provenance(date: str) -> dict[str, Any]:
    """Metadata block that travels with the replay payload + graded
    file. Captures the rule deltas explicitly so a future audit can
    re-derive the experiment without re-reading this script."""
    return {
        "replayType": "single_slate_same_game_relaxed",
        "sourceDate": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "official": False,
        "shownLive": False,
        "includedInOfficialHitRate": False,
        "pregameOnly": True,
        "ruleset": "parlay_optimizer.PROFILE_RULES_BY_NAME with overrides",
        "ruleOverrides": {
            profile: {
                "max_legs_per_game": {
                    "official": PROFILE_RULES_BY_NAME[profile].max_legs_per_game,
                    "replay": _RULE_OVERRIDES[profile]["max_legs_per_game"],
                }
            }
            for profile in _RULE_OVERRIDES
        },
        "rationale": (
            "Same-game cap relaxed so multi-leg slips can form on a "
            "single-NBA-game slate. The official optimizer keeps the "
            "cap small because same-game NBA stacks went 1W-21L (5%) "
            "on the 2026-05-25 settled audit — lifting the cap in the "
            "official model would be the wrong response. This replay "
            "answers a different question: what would the model have "
            "suggested with that constraint relaxed?"
        ),
        "label": (
            "Retrospective model replay · generated after the slate "
            "from pregame inputs · not shown live · not included in "
            "official public hit rate."
        ),
    }


def build_replay_payload(date: str, *, num_candidates: int = 8) -> dict[str, Any]:
    """Build the replay snapshot for `date`. Temporarily swaps in the
    relaxed-rule profiles around the optimizer call; always restores
    the originals before returning so no other caller sees a polluted
    rules table."""
    original = dict(PROFILE_RULES_BY_NAME)
    overridden = _apply_overrides()
    PROFILE_RULES_BY_NAME.clear()
    PROFILE_RULES_BY_NAME.update(overridden)
    try:
        payload = build_optimizer_snapshot(date, num_candidates=num_candidates)
    finally:
        PROFILE_RULES_BY_NAME.clear()
        PROFILE_RULES_BY_NAME.update(original)
    payload["_disclaimer"] = (
        "RETROSPECTIVE MODEL REPLAY — NOT OFFICIAL. Generated after "
        "the slate from pregame inputs with the same-game cap "
        "relaxed. Not included in official public hit rate. See "
        "`replayMeta.ruleOverrides` for the exact rule diff."
    )
    payload["replayMeta"] = _provenance(date)
    return payload


def write_replay(date: str, payload: dict[str, Any]) -> str:
    os.makedirs(REPLAY_DIR, exist_ok=True)
    path = os.path.join(REPLAY_DIR, f"{date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)
    return path


def write_replay_graded(date: str, graded: dict[str, Any]) -> str:
    os.makedirs(REPLAY_GRADED_DIR, exist_ok=True)
    path = os.path.join(REPLAY_GRADED_DIR, f"{date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(graded, f, indent=2, default=str)
    return path


_STATUS_KEY = {
    "win": "wins",
    "loss": "losses",
    "push": "pushes",
    "pending": "pending",
}


def _replay_summary(graded: dict[str, Any]) -> dict[str, Any]:
    """Per-replay summary (W/L/P/pending + per-profile + per-sport
    breakdown) so the UI can render the headline without re-grading."""
    totals = {"wins": 0, "losses": 0, "pushes": 0, "pending": 0, "decisive": 0}
    by_profile: dict[str, dict[str, int]] = {}
    by_sport: dict[str, dict[str, int]] = {}
    for slip in graded.get("uniqueSlips") or []:
        status = slip.get("status") or "pending"
        key = _STATUS_KEY.get(status, "pending")
        totals[key] += 1
        if key in ("wins", "losses"):
            totals["decisive"] += 1
        prof = slip.get("profile") or "unknown"
        sport = slip.get("sport") or "unknown"
        by_profile.setdefault(prof, {"wins": 0, "losses": 0, "pushes": 0, "pending": 0})
        by_sport.setdefault(sport, {"wins": 0, "losses": 0, "pushes": 0, "pending": 0})
        by_profile[prof][key] += 1
        by_sport[sport][key] += 1
    hit_rate = round(totals["wins"] / totals["decisive"], 4) if totals["decisive"] else 0.0
    return {**totals, "hitRate": hit_rate, "byProfile": by_profile, "bySport": by_sport}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--num-candidates", type=int, default=8)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print summary without writing files.",
    )
    args = p.parse_args(argv)

    payload = build_replay_payload(args.date, num_candidates=args.num_candidates)
    total = payload["totalSlips"]

    if total == 0:
        print(
            f"[replay_one_shot] {args.date} · 0 replay slips even with "
            f"relaxed rules — pool too small. Not writing."
        )
        return 0

    if args.dry_run:
        print(
            f"[replay_one_shot] {args.date} dry-run · {total} replay "
            f"slips would be written"
        )
        return 0

    snap_path = write_replay(args.date, payload)
    print(f"[replay_one_shot] {args.date} · {total} replay slips → {snap_path}")

    # Grade in-place using the existing grader (pure; reads the
    # canonical settled rows). Append the replay summary block so the
    # UI doesn't need to re-derive it.
    graded = grade_optimizer_payload(payload)
    graded["replayMeta"] = payload["replayMeta"]
    graded["replaySummary"] = _replay_summary(graded)
    graded["_disclaimer"] = payload["_disclaimer"]
    graded_path = write_replay_graded(args.date, graded)
    s = graded["replaySummary"]
    print(
        f"[replay_one_shot] graded → {graded_path} · "
        f"{s['wins']}W-{s['losses']}L-{s['pushes']}P-{s['pending']} pending · "
        f"hitRate {s['hitRate']:.1%} on {s['decisive']} decisive"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
