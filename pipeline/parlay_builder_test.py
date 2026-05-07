"""
Phase 16 — pipeline.parlay_builder_test

Regression tests for the model-assisted Parlay Builder. Mirrors the rules
in `app/src/lib/parlay-builder.ts` so the Python suite locks the contract:

  - Every leg comes from a real lean. No fabrication.
  - Risk profile drives confidence + edge + recent10 + maxLegs filters.
  - Same-game correlation is detected and surfaced.
  - Conservative is strict; balanced is moderate; aggressive is loose.
  - Player+market deduplication: no parlay has the same player+market twice.
  - Empty pools return empty candidate lists; no fake leg invention.

Zero network. Pure logic tests.
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Python port of the builder rules (must mirror parlay-builder.ts)
# ---------------------------------------------------------------------------

PROFILE_RULES = {
    "conservative": {
        "confidence": ["High"],
        "min_edge_pct": 3,
        "max_legs": 3,
        "min_legs": 2,
        "require_recent10": True,
        "require_valid_player_id": True,
        "max_legs_per_game": 1,
    },
    "balanced": {
        "confidence": ["High", "Medium"],
        "min_edge_pct": 2,
        "max_legs": 4,
        "min_legs": 2,
        "require_recent10": False,
        "require_valid_player_id": True,
        "max_legs_per_game": 2,
    },
    "aggressive": {
        "confidence": ["High", "Medium"],
        "min_edge_pct": 1,
        "max_legs": 5,
        "min_legs": 3,
        "require_recent10": False,
        "require_valid_player_id": False,
        "max_legs_per_game": 3,
    },
}


def normalize_player(name: str) -> str:
    import re
    n = name.lower()
    n = re.sub(r"[^a-z0-9]+", "_", n)
    return n.strip("_")


def leg_score(lean: dict) -> float:
    cw = {"High": 1.0, "Medium": 0.65, "Low": 0.3}.get(lean.get("confidence"), 0.1)
    edge = max(0, min(20, lean.get("edgePct", 0)))
    recent_bonus = 0.15 if (lean.get("recent10") and len(lean["recent10"]) >= 5) else 0
    pid_bonus = 0.1 if lean.get("playerId", 0) > 0 else 0
    return cw * 0.7 + (edge / 20) * 0.3 + recent_bonus + pid_bonus


def is_eligible(lean: dict, rules: dict, opts: dict) -> bool:
    if lean.get("lean") not in ("Over", "Under"):
        return False
    if lean.get("confidence") not in rules["confidence"]:
        return False
    if lean.get("edgePct", 0) < rules["min_edge_pct"]:
        return False
    if rules["require_recent10"]:
        if not lean.get("recent10") or len(lean["recent10"]) < 5:
            return False
    if rules["require_valid_player_id"]:
        if lean.get("playerId", 0) <= 0:
            return False
    if opts.get("selectedGameIds"):
        if lean.get("gameId") not in opts["selectedGameIds"]:
            return False
    if opts.get("selectedMarkets"):
        if lean.get("market") not in opts["selectedMarkets"]:
            return False
    if opts.get("mode") == "selected_players" and opts.get("selectedPlayerNames"):
        target = set(normalize_player(n) for n in opts["selectedPlayerNames"])
        if normalize_player(lean.get("playerName", "")) not in target:
            return False
    return True


def build_candidates(leans: list[dict], opts: dict) -> list[dict]:
    """Mirror of buildParlayCandidates()."""
    rules = PROFILE_RULES[opts["riskProfile"]]
    num_candidates = max(1, min(8, opts.get("numCandidates", 3)))

    eligible = [l for l in leans if is_eligible(l, rules, opts)]

    # Dedupe by player+market
    by_key = {}
    for lean in eligible:
        pkey = f"pid:{lean['playerId']}" if lean.get("playerId", 0) > 0 \
            else f"name:{normalize_player(lean.get('playerName', ''))}"
        k = f"{pkey}|{lean['market']}"
        if k not in by_key or leg_score(lean) > leg_score(by_key[k]):
            by_key[k] = lean

    pool = sorted(by_key.values(), key=leg_score, reverse=True)
    if len(pool) < rules["min_legs"]:
        return []

    candidates = []
    for start in range(min(len(pool), num_candidates * 2)):
        if len(candidates) >= num_candidates:
            break
        c = greedy_build(pool, start, rules, opts["riskProfile"])
        if c and len(c["legs"]) >= rules["min_legs"]:
            sig = candidate_sig(c)
            if not any(candidate_sig(x) == sig for x in candidates):
                candidates.append(c)
    return sorted(candidates, key=lambda c: c["score"], reverse=True)


def greedy_build(pool: list[dict], start: int, rules: dict, risk: str) -> dict | None:
    picked = []
    players_used = set()
    game_count = {}

    order = pool[start:] + pool[:start]
    for lean in order:
        if len(picked) >= rules["max_legs"]:
            break
        pkey = f"pid:{lean['playerId']}" if lean.get("playerId", 0) > 0 \
            else f"name:{normalize_player(lean.get('playerName', ''))}"
        if pkey in players_used:
            continue
        used = game_count.get(lean["gameId"], 0)
        if used >= rules["max_legs_per_game"]:
            continue
        picked.append(lean)
        players_used.add(pkey)
        game_count[lean["gameId"]] = used + 1

    if len(picked) < rules["min_legs"]:
        return None
    unique_games = len(set(l["gameId"] for l in picked))
    has_same_game = unique_games < len(picked)
    avg = sum(leg_score(l) for l in picked) / len(picked)
    return {
        "legs": [{"playerId": l.get("playerId"), "market": l["market"],
                  "line": l["line"], "lean": l["lean"], "gameId": l["gameId"]}
                 for l in picked],
        "uniqueGames": unique_games,
        "hasSameGameLegs": has_same_game,
        "score": avg - (0.08 if has_same_game else 0),
        "riskProfile": risk,
    }


def candidate_sig(c: dict) -> str:
    return "//".join(sorted(
        f"{l['playerId']}|{l['market']}|{l['line']}|{l['lean']}"
        for l in c["legs"]
    ))


# ---------------------------------------------------------------------------
# Helpers to build test leans concisely
# ---------------------------------------------------------------------------

def lean(
    *, name="Player A", pid=1001, market="PTS", side="Over", line=20.0,
    edge=4.0, conf="High", game="GAME-1", odds_over=-110, odds_under=-110,
    recent10=None,
):
    if recent10 is None:
        recent10 = [22, 18, 25, 19, 21, 23, 20]  # 7 logs
    return {
        "playerId": pid,
        "playerName": name,
        "market": market,
        "lean": side,
        "line": line,
        "edge": edge,
        "edgePct": edge,
        "confidence": conf,
        "gameId": game,
        "team": "TEAM",
        "opponent": "OPP",
        "oddsOver": odds_over,
        "oddsUnder": odds_under,
        "recent10": recent10,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def main() -> int:
    asserts = 0

    # ── Test 1: empty input → no candidates ─────────────────────────────
    r = build_candidates([], {"mode": "top_props", "riskProfile": "balanced"})
    assert r == []
    asserts += 1

    # ── Test 2: only 1 lean → no candidates (need at least 2 legs) ──────
    r = build_candidates([lean()], {"mode": "top_props", "riskProfile": "conservative"})
    assert r == []
    asserts += 1

    # ── Test 3: 3 high-conf leans across 3 games → conservative builds ──
    leans = [
        lean(pid=1001, name="Alpha", market="PTS", game="G1"),
        lean(pid=2002, name="Bravo", market="REB", game="G2", line=8.5),
        lean(pid=3003, name="Charlie", market="AST", game="G3", line=6.5),
    ]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert len(r) >= 1, f"expected candidates, got {len(r)}"
    c0 = r[0]
    assert len(c0["legs"]) >= 2
    assert len(c0["legs"]) <= 3  # conservative max
    assert c0["riskProfile"] == "conservative"
    asserts += 4

    # ── Test 4: same player+market deduplication ────────────────────────
    leans = [
        lean(pid=1001, name="Alpha", market="PTS", line=20.5, edge=5),
        lean(pid=1001, name="Alpha", market="PTS", line=21.5, edge=4),  # dup
        lean(pid=2002, name="Bravo", market="REB", game="G2", line=8.5),
        lean(pid=3003, name="Charlie", market="AST", game="G3", line=6.5),
    ]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert len(r) >= 1
    # No candidate should have Alpha+PTS twice
    for c in r:
        sigs = [(l["playerId"], l["market"]) for l in c["legs"]]
        assert len(sigs) == len(set(sigs)), \
            "Same player+market appeared multiple times in candidate"
    asserts += 2

    # ── Test 5: conservative drops Medium-confidence picks ──────────────
    leans = [
        lean(pid=1001, name="Alpha", market="PTS", conf="Medium", game="G1"),
        lean(pid=2002, name="Bravo", market="REB", conf="Medium", game="G2"),
        lean(pid=3003, name="Charlie", market="AST", conf="Medium", game="G3"),
    ]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert r == [], "Conservative must reject Medium-conf legs"
    # Same data with balanced → builds
    r2 = build_candidates(leans, {"mode": "top_props", "riskProfile": "balanced"})
    assert len(r2) >= 1, "Balanced should accept Medium legs"
    asserts += 2

    # ── Test 6: low-edge legs filtered out by minEdgePct ────────────────
    leans = [
        lean(pid=1001, edge=0.5, name="A", market="PTS", game="G1"),  # below all
        lean(pid=2002, edge=2.5, name="B", market="REB", game="G2"),
        lean(pid=3003, edge=4.0, name="C", market="AST", game="G3"),
    ]
    # Conservative needs edge≥3 → only C qualifies → not enough
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert r == []
    # Balanced needs edge≥2 → B and C qualify → builds
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "balanced"})
    assert len(r) >= 1
    asserts += 2

    # ── Test 7: same-game correlation flagged ───────────────────────────
    # All on game G1 → balanced max-legs-per-game=2 → should hit warning
    leans = [
        lean(pid=1001, name="A", market="PTS", game="G1"),
        lean(pid=2002, name="B", market="REB", game="G1"),
        lean(pid=3003, name="C", market="AST", game="G1"),
        lean(pid=4004, name="D", market="PTS", game="G1"),
    ]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "balanced"})
    assert len(r) >= 1
    c = r[0]
    # All legs from same game → must flag correlation
    if len(c["legs"]) >= 2:
        assert c["hasSameGameLegs"] is True
    # Conservative would refuse (maxLegsPerGame=1) → only 1 leg → no candidate
    r2 = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert r2 == [], "Conservative must reject when only 1 game has High picks"
    asserts += 3

    # ── Test 8: aggressive accepts missing recent10 + invalid playerId ──
    leans = [
        lean(pid=0, name="NoId Player", market="PTS", recent10=None, game="G1", conf="Medium"),
        lean(pid=2002, name="B", market="REB", recent10=[1, 2], game="G2", conf="Medium"),
        lean(pid=3003, name="C", market="AST", game="G3", conf="Medium"),
        lean(pid=4004, name="D", market="PTS", game="G4", conf="Medium"),
    ]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "aggressive"})
    assert len(r) >= 1, "Aggressive should accept loose data quality"
    # Conservative refuses (requires both recent10 + valid pid)
    r2 = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert r2 == []
    asserts += 2

    # ── Test 9: selected_players filters legs ──────────────────────────
    leans = [
        lean(pid=1001, name="Alpha", market="PTS", game="G1"),
        lean(pid=2002, name="Bravo", market="REB", game="G2"),
        lean(pid=3003, name="Charlie", market="AST", game="G3"),
        lean(pid=4004, name="Delta", market="PTS", game="G4"),
    ]
    r = build_candidates(leans, {
        "mode": "selected_players",
        "selectedPlayerNames": ["Alpha", "Bravo"],
        "riskProfile": "conservative",
    })
    assert len(r) >= 1
    for c in r:
        for leg_ in c["legs"]:
            assert leg_["playerId"] in (1001, 2002), \
                f"Selected-player filter broke: pid={leg_['playerId']}"
    asserts += 2

    # ── Test 10: selected_games restricts legs ──────────────────────────
    leans = [
        lean(pid=1001, name="A", market="PTS", game="G1"),
        lean(pid=2002, name="B", market="REB", game="G2"),
        lean(pid=3003, name="C", market="AST", game="G3"),
        lean(pid=4004, name="D", market="PTS", game="G4"),
    ]
    r = build_candidates(leans, {
        "mode": "top_props",
        "selectedGameIds": ["G1", "G2"],
        "riskProfile": "balanced",
    })
    assert len(r) >= 1
    for c in r:
        for leg_ in c["legs"]:
            assert leg_["gameId"] in ("G1", "G2")
    asserts += 2

    # ── Test 11: selected_markets restricts to chosen markets ──────────
    leans = [
        lean(pid=1001, name="A", market="PTS", game="G1"),
        lean(pid=2002, name="B", market="REB", game="G2"),
        lean(pid=3003, name="C", market="AST", game="G3"),
        lean(pid=4004, name="D", market="PTS", game="G4"),
    ]
    r = build_candidates(leans, {
        "mode": "top_props",
        "selectedMarkets": ["PTS"],
        "riskProfile": "balanced",
    })
    assert len(r) >= 1
    for c in r:
        assert all(leg_["market"] == "PTS" for leg_ in c["legs"])
    asserts += 2

    # ── Test 12: max-legs per profile is honored ────────────────────────
    leans = [
        lean(pid=i, name=f"P{i}", market="PTS", game=f"G{i}")
        for i in range(1, 11)  # 10 distinct players, 10 distinct games
    ]
    r_cons = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    r_bal = build_candidates(leans, {"mode": "top_props", "riskProfile": "balanced"})
    r_agg = build_candidates(leans, {"mode": "top_props", "riskProfile": "aggressive"})
    for c in r_cons:
        assert len(c["legs"]) <= 3, f"Conservative legs={len(c['legs'])}"
    for c in r_bal:
        assert len(c["legs"]) <= 4, f"Balanced legs={len(c['legs'])}"
    for c in r_agg:
        assert len(c["legs"]) <= 5, f"Aggressive legs={len(c['legs'])}"
    asserts += 3

    # ── Test 13: legs are real (sourced from input leans only) ──────────
    input_leans = [
        lean(pid=1001, name="A", market="PTS", line=20.5, game="G1"),
        lean(pid=2002, name="B", market="REB", line=8.5, game="G2"),
        lean(pid=3003, name="C", market="AST", line=6.5, game="G3"),
    ]
    r = build_candidates(input_leans, {"mode": "top_props", "riskProfile": "conservative"})
    valid_sigs = {(l["playerId"], l["market"], l["line"]) for l in input_leans}
    for c in r:
        for leg_ in c["legs"]:
            sig = (leg_["playerId"], leg_["market"], leg_["line"])
            assert sig in valid_sigs, f"Fabricated leg detected: {sig}"
    asserts += 1

    # ── Test 14: numCandidates capped at 8, defaults to 3 ──────────────
    leans = [lean(pid=i, name=f"P{i}", market="PTS", game=f"G{i}", edge=10) for i in range(1, 21)]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "balanced", "numCandidates": 100})
    assert len(r) <= 8, f"numCandidates cap broken: {len(r)}"
    # Default
    r2 = build_candidates(leans, {"mode": "top_props", "riskProfile": "balanced"})
    assert len(r2) <= 3, f"Default numCandidates broken: {len(r2)}"
    asserts += 2

    # ── Test 15: Phase 16 realistic — May 5 board (24 leans) ───────────
    # Synthesize a slate similar to the sandbox May 5 with high-confidence
    # leans on 4 distinct players. Conservative should produce a 2-3 leg
    # candidate; balanced should produce up to 4.
    leans = [
        lean(pid=1628378, name="Donovan Mitchell", market="PTS", line=22.5, edge=27, game="DET-CLE", conf="High"),
        lean(pid=1628378, name="Donovan Mitchell", market="REB", line=4.5, edge=8, game="DET-CLE", conf="High"),
        lean(pid=1628378, name="Donovan Mitchell", market="AST", line=4.5, edge=5, game="DET-CLE", conf="Medium"),
        lean(pid=1630165, name="Cade Cunningham", market="PTS", line=26.5, edge=15, game="DET-CLE", conf="High"),
        lean(pid=203500, name="Steven Adams", market="REB", line=8.5, edge=20, game="LAL-OKC", conf="High"),
        lean(pid=1641705, name="Chet Holmgren", market="REB", line=8.5, edge=12, game="LAL-OKC", conf="High"),
        lean(pid=1630163, name="LeBron James", market="AST", line=7.5, edge=18, game="LAL-OKC", conf="High"),
    ]
    r = build_candidates(leans, {"mode": "top_props", "riskProfile": "conservative"})
    assert len(r) >= 1, "Conservative should find candidates from realistic May 5 data"
    # Conservative max-legs-per-game=1 → should pick from BOTH games
    top = r[0]
    games = set(leg_["gameId"] for leg_ in top["legs"])
    assert len(games) == len(top["legs"]), \
        f"Conservative violated maxLegsPerGame=1: legs from {len(games)} games, {len(top['legs'])} legs"
    asserts += 2

    # ── Test 16: edge equality boundary ─────────────────────────────────
    # edge=3.0 should pass conservative (≥3). edge=2.99 should fail.
    leans_pass = [
        lean(pid=i, name=f"P{i}", market="PTS", game=f"G{i}", edge=3.0)
        for i in range(1, 4)
    ]
    leans_fail = [
        lean(pid=i, name=f"P{i}", market="PTS", game=f"G{i}", edge=2.99)
        for i in range(1, 4)
    ]
    assert len(build_candidates(leans_pass, {"mode": "top_props", "riskProfile": "conservative"})) >= 1
    assert build_candidates(leans_fail, {"mode": "top_props", "riskProfile": "conservative"}) == []
    asserts += 2

    print(f"\n  ✓ all {asserts} parlayBuilder assertions passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
