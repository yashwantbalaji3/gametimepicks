"""Unit tests for the stepped Bank Builder settlement graders (pure, no I/O)."""
from pipeline.settlement.settle_stepped_bank_builder import (
    grade_moneyline, grade_total, grade_double_chance, grade_dnb, grade_leg, card_result,
)


def test_moneyline_official_results():
    # Argentina 2-0 Austria → Argentina ML hits.
    assert grade_moneyline("Argentina", "Argentina", "Austria", 2, 0) == "won"
    # Picking the loser / a draw loses.
    assert grade_moneyline("Austria", "Argentina", "Austria", 2, 0) == "lost"
    assert grade_moneyline("Argentina", "Argentina", "Austria", 1, 1) == "lost"


def test_total_under_over_and_push():
    # France 3-0 Iraq = 3 goals → Under 3.5 hits, Over 3.5 misses.
    assert grade_total("under", 3.5, 3) == "won"
    assert grade_total("over", 3.5, 3) == "lost"
    # Over 2.5 with 3 goals hits.
    assert grade_total("over", 2.5, 3) == "won"
    # Exact integer line → push/void.
    assert grade_total("under", 3.0, 3) == "void"
    assert grade_total("over", 2.0, 2) == "void"


def test_double_chance():
    assert grade_double_chance("Ghana or Draw", "England", "Ghana", 1, 1) == "won"   # draw
    assert grade_double_chance("Ghana or Draw", "England", "Ghana", 0, 2) == "won"   # Ghana wins
    assert grade_double_chance("Ghana or Draw", "England", "Ghana", 3, 0) == "lost"  # England wins


def test_dnb():
    assert grade_dnb("Algeria", "Jordan", "Algeria", 0, 1) == "won"
    assert grade_dnb("Algeria", "Jordan", "Algeria", 1, 1) == "void"
    assert grade_dnb("Algeria", "Jordan", "Algeria", 2, 0) == "lost"


def test_grade_leg_pending_when_not_final():
    scores = {"jordan|algeria": {"hs": 0, "as": 0, "final": False, "status": "NS"}}
    leg = {"marketType": "moneyline_90", "participantName": "Algeria", "homeTeam": "Jordan", "awayTeam": "Algeria"}
    assert grade_leg(leg, scores)["result"] == "pending"


def test_grade_leg_official_lane_b():
    scores = {
        "argentina|austria": {"hs": 2, "as": 0, "final": True, "status": "FT"},
        "france|iraq": {"hs": 3, "as": 0, "final": True, "status": "FT"},
    }
    arg = {"marketType": "moneyline_90", "participantName": "Argentina", "homeTeam": "Argentina", "awayTeam": "Austria"}
    tot = {"marketType": "match_total_goals", "side": "under", "line": 3.5, "homeTeam": "France", "awayTeam": "Iraq"}
    assert grade_leg(arg, scores)["result"] == "won"
    assert grade_leg(tot, scores)["result"] == "won"


def test_card_result_logic():
    assert card_result(["won", "won"]) == "won"
    assert card_result(["won", "lost"]) == "lost"
    assert card_result(["won", "pending"]) == "pending"      # Lane A: Egypt won + Algeria pending
    assert card_result(["won", "needs_review"]) == "pending"
    assert card_result(["won", "void"]) == "won"             # void drops
    assert card_result(["void", "void"]) == "push"
