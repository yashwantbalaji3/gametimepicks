"""
Suggested-card settlement — grades the published World Cup parlay cards and the daily
mixed-sport cards from ALREADY-SETTLED official results. Never settles a leg itself:

  - World Cup legs come from app/public/data/world-cup/settlement/latest.json (graded
    from the official 90-minute regulation finals by pipeline.world_cup.settle).
  - MLB legs come from pipeline/validation/mlb_settled_leans.jsonl (graded from official
    MLB Stats API box scores by pipeline.mlb.settle_mlb_results); the mixed-card label is
    resolved back to (playerName, market, side, line) via the optimizer leg pool the card
    was built from — no string-guessing.

Card grading rule (standard parlay):
  - any leg LOST                       → card "lost"
  - else any leg unsettled/pending     → card "pending" (never settled early)
  - else ≥1 win (pushed legs drop out) → card "won"
  - else (all legs pushed)             → card "push"

Writes `result` / `legResults` / `settledAt` / `settlementSource` into the card artifacts
(dated + latest), leaving every pre-game field untouched. Idempotent: settledAt is copied
from the WC settlement artifact's generatedAt, so re-running with the same inputs writes a
byte-identical artifact.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
APPDATA = REPO / "app" / "public" / "data"
WC = APPDATA / "world-cup"
VALIDATION = REPO / "pipeline" / "validation"


def _load(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def load_wc_outcomes() -> tuple[dict, str, str]:
    """(outcome map, settledAt, source) from the WC settlement artifact.

    Map keys: (matchId, market, pickLabel) for parlay-card legs, and
    (pickLabel, matchName) for mixed-card legs — the published mixed legs are
    trimmed to label + sublabel (the "Home vs Away" match name), so the match
    name disambiguates same-label picks across matches.
    """
    doc = _load(WC / "settlement" / "latest.json") or {}
    match_names = {f.get("matchId"): f.get("match") for f in doc.get("finals", [])}
    out = {}
    for g in doc.get("graded", []):
        mid, label = g.get("matchId"), g.get("pick")
        if mid is None or not label:
            continue
        out[(mid, g.get("market"), label)] = g["outcome"]
        out[(label, match_names.get(mid))] = g["outcome"]
    return out, doc.get("generatedAt", ""), doc.get("settlementSource", "")


def load_mlb_outcomes(date: str) -> dict:
    """(playerName, market, side, line) → win/loss/push from the settled MLB leans."""
    out = {}
    path = VALIDATION / "mlb_settled_leans.jsonl"
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get("date") != date or not r.get("graded"):
            continue
        key = (r.get("playerName"), r.get("marketKey"), r.get("lean"), r.get("line"))
        out[key] = (r.get("outcome") or "").lower()
    return out


def load_optimizer_label_index(date: str) -> dict:
    """Mixed-card MLB label → (playerName, market, side, line), rebuilt EXACTLY the way
    pipeline/daily/build_mixed_sport_cards.py constructed the label."""
    doc = _load(APPDATA / "parlays" / "optimizer" / f"{date}.json") or {}
    idx = {}
    for l in (doc.get("legPool", {}) or {}).get("legs", []) or []:
        label = f"{l.get('playerName')} · {l.get('marketLabel') or l.get('market')} {l.get('side', '')} {l.get('line', '')}".strip()
        idx[label] = (l.get("playerName"), l.get("market"), l.get("side"), l.get("line"))
    return idx


def card_result(leg_results: list[str]) -> str:
    """Standard parlay grading from per-leg results."""
    if any(r == "loss" for r in leg_results):
        return "lost"
    if any(r in ("pending", "") for r in leg_results):
        return "pending"
    if any(r == "win" for r in leg_results):
        return "won"
    return "push"


def settle_wc_parlays(date: str, wc_outcomes: dict, settled_at: str, source: str) -> int:
    """Grade the WC parlay cards in place (dated + latest). Returns settled-card count."""
    settled = 0
    for name in (f"{date}.json", "latest.json"):
        path = WC / "parlays" / name
        doc = _load(path)
        if not doc or doc.get("date") != date:
            continue
        for card in doc.get("cards", []):
            results = []
            for leg in card.get("legs", []):
                outcome = wc_outcomes.get((leg.get("matchId"), leg.get("market"), leg.get("pick")), "pending")
                leg["result"] = outcome
                results.append(outcome)
            card["result"] = card_result(results)
            card["settledAt"] = settled_at
            card["settlementSource"] = source
            if card["result"] != "pending":
                settled += 1
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return settled // 2 if settled else 0


def settle_mixed_cards(date: str, wc_outcomes: dict, mlb_outcomes: dict, label_idx: dict,
                       settled_at: str, source: str) -> int:
    """Grade the daily mixed-sport cards in place (dated + latest)."""
    settled = 0
    for name in (f"{date}.json", "latest.json"):
        path = APPDATA / "daily" / "cards" / name
        doc = _load(path)
        if not doc or doc.get("date") != date:
            continue
        for card in doc.get("cards", []):
            results = []
            for leg in card.get("legs", []):
                sport = leg.get("sport")
                outcome = "pending"
                if sport == "world_cup":
                    outcome = wc_outcomes.get((leg.get("label"), leg.get("sublabel")), "pending")
                elif sport in ("mlb", "nba"):
                    key = label_idx.get(leg.get("label"))
                    if key is not None:
                        outcome = mlb_outcomes.get(key, "pending")
                leg["result"] = outcome
                results.append(outcome)
            card["result"] = card_result(results)
            card["settledAt"] = settled_at
            card["settlementSource"] = source
            if card["result"] != "pending":
                settled += 1
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return settled // 2 if settled else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    args = ap.parse_args(argv)

    wc_outcomes, settled_at, wc_source = load_wc_outcomes()
    if not wc_outcomes:
        print("[cards-settle] STOP no settled World Cup outcomes — settle projections first")
        return 2
    mlb_outcomes = load_mlb_outcomes(args.date)
    label_idx = load_optimizer_label_index(args.date)
    source = f"legs: {wc_source or 'world-cup settlement'} + mlb_stats_api box scores"

    wc_count = settle_wc_parlays(args.date, wc_outcomes, settled_at, source)
    mixed_count = settle_mixed_cards(args.date, wc_outcomes, mlb_outcomes, label_idx, settled_at, source)
    print(f"[cards-settle] wc_cards_settled={wc_count} mixed_cards_settled={mixed_count} "
          f"mlb_leg_outcomes={len(mlb_outcomes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
