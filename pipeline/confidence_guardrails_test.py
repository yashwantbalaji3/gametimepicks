"""
Phase 8.3 — deterministic tests for pipeline.confidence_guardrails.

Verifies:
  - R1: no_logs → insufficient_data + No Play
  - R2: extreme edge + thin sample → no_play (suppress)
  - R3: High + < 8 logs → Medium
  - R4: High/Medium + < 5 logs → Low
  - R4 takes priority over R3 (lower threshold = stricter cap)
  - No rule triggers when evidence is sufficient
  - _originalConfidence / _guardrail / _guardrailAt audit fields set
  - Idempotent — re-running on adjusted leans does not double-stamp
  - apply_to_leans summary aggregates by rule correctly
  - Confidence is only ever DOWNGRADED (never upgraded)
"""
from __future__ import annotations

import sys

GREEN = "\033[0;32m"
RED = "\033[0;31m"
DIM = "\033[2m"
BLUE = "\033[0;34m"
GOLD = "\033[0;33m"
RESET = "\033[0m"

from . import confidence_guardrails as CG


class Suite:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def assert_eq(self, a, b, name):
        if a == b:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            self.failures.append(f"{name}: expected {b!r}, got {a!r}")
            print(f"  {RED}✗{RESET} {name}")
            print(f"    expected: {b!r}")
            print(f"    got:      {a!r}")

    def assert_in(self, k, c, name):
        if k in c:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}: {k!r} missing")

    def assert_true(self, cond, name):
        if cond:
            self.passed += 1
            print(f"  {GREEN}✓{RESET} {name}")
        else:
            self.failed += 1
            print(f"  {RED}✗{RESET} {name}")


def L(*, conf="High", lean="Over", edge=5.0, recent10=None):
    """Lean factory."""
    return {
        "id": "test-lean",
        "playerName": "P",
        "playerId": 1,
        "market": "PTS",
        "line": 22.5,
        "lean": lean,
        "edgePct": edge,
        "confidence": conf,
        "recent10": recent10 if recent10 is not None else [10, 12, 14, 16, 18, 20, 22, 24, 26, 28],
    }


def test_R1_no_logs(s: Suite):
    print(f"\n  {BLUE}─── R1: no logs → insufficient_data + No Play ───{RESET}")
    out = CG.downgrade_lean(L(conf="High", recent10=[]))
    s.assert_eq(out["confidence"], "insufficient_data", "empty recent10 → insufficient_data")
    s.assert_eq(out["lean"], "No Play", "empty recent10 → lean=No Play")
    s.assert_eq(out["_guardrail"], "R1_no_logs_insufficient_data", "rule stamped")
    s.assert_eq(out["_originalConfidence"], "High", "original High preserved")

    # Missing recent10 entirely
    lean = {"confidence": "Medium", "lean": "Over", "edgePct": 4}
    out2 = CG.downgrade_lean(lean)
    s.assert_eq(out2["confidence"], "insufficient_data", "missing recent10 → insufficient_data")

    # All-NaN / non-numeric recent10
    out3 = CG.downgrade_lean(L(conf="High", recent10=[None, "abc", float("nan")]))
    s.assert_eq(out3["confidence"], "insufficient_data",
                "garbage recent10 (no numeric values) → insufficient_data")


def test_R2_extreme_edge_thin(s: Suite):
    print(f"\n  {BLUE}─── R2: extreme edge + thin sample → suppress ───{RESET}")
    # 35% edge with 6 logs → R2
    out = CG.downgrade_lean(L(conf="High", edge=35.0, recent10=[20, 22, 24, 26, 28, 30]))
    s.assert_eq(out["confidence"], "no_play", "35% edge + 6 logs → no_play")
    s.assert_eq(out["lean"], "No Play", "lean → No Play")
    s.assert_eq(out["_guardrail"], "R2_extreme_edge_thin_sample", "R2 stamped")

    # Negative edge (Under) — same rule
    out_neg = CG.downgrade_lean(L(conf="High", edge=-32.0, lean="Under",
                                  recent10=[10, 12, 14, 16]))
    s.assert_eq(out_neg["confidence"], "no_play", "-32% edge + 4 logs → no_play")

    # 35% edge with 10 logs (sufficient sample) — R2 should NOT trigger
    out_safe = CG.downgrade_lean(L(conf="High", edge=35.0,
                                   recent10=[20, 22, 24, 26, 28, 30, 32, 34, 36, 38]))
    s.assert_eq(out_safe["confidence"], "High", "35% edge + 10 logs → High preserved (R2 not triggered)")
    s.assert_eq(out_safe.get("_guardrail"), None, "no rule stamped")


def test_R3_high_capped_medium(s: Suite):
    print(f"\n  {BLUE}─── R3: High + 5-7 logs → Medium ───{RESET}")
    out = CG.downgrade_lean(L(conf="High", edge=5.0, recent10=[10, 12, 14, 16, 18, 20]))
    s.assert_eq(out["confidence"], "Medium", "High with 6 logs → Medium")
    s.assert_eq(out["_guardrail"], "R3_thin_sample_capped_medium", "R3 stamped")
    s.assert_eq(out["_originalConfidence"], "High", "original recorded")

    # Exactly 7 logs — still capped (threshold is 8)
    out7 = CG.downgrade_lean(L(conf="High", edge=5.0,
                               recent10=[10, 12, 14, 16, 18, 20, 22]))
    s.assert_eq(out7["confidence"], "Medium", "7 logs → still capped at Medium")


def test_R4_capped_low(s: Suite):
    print(f"\n  {BLUE}─── R4: High/Medium + < 5 logs → Low ───{RESET}")
    out_h = CG.downgrade_lean(L(conf="High", edge=5.0, recent10=[10, 12, 14]))
    s.assert_eq(out_h["confidence"], "Low", "High + 3 logs → Low")
    s.assert_eq(out_h["_guardrail"], "R4_thin_sample_capped_low", "R4 stamped")

    out_m = CG.downgrade_lean(L(conf="Medium", edge=5.0, recent10=[10, 12, 14, 16]))
    s.assert_eq(out_m["confidence"], "Low", "Medium + 4 logs → Low")
    s.assert_eq(out_m["_guardrail"], "R4_thin_sample_capped_low", "R4 stamped")

    # Exactly 5 logs — R4 boundary (5 is the minimum)
    out5 = CG.downgrade_lean(L(conf="High", edge=5.0,
                               recent10=[10, 12, 14, 16, 18]))
    s.assert_eq(out5["confidence"], "Medium",
                "5 logs → not R4 (boundary), falls to R3 → Medium")


def test_no_rule_triggers(s: Suite):
    print(f"\n  {BLUE}─── No rule triggers → confidence preserved ───{RESET}")
    # High with 10 logs, modest edge
    out = CG.downgrade_lean(L(conf="High", edge=5.0,
                              recent10=[10, 12, 14, 16, 18, 20, 22, 24, 26, 28]))
    s.assert_eq(out["confidence"], "High", "10 logs + 5% edge → High preserved")
    s.assert_eq(out.get("_guardrail"), None, "no rule stamped")

    # Medium with 6 logs (R3 only applies to High; Medium with 6 logs is fine)
    out_m = CG.downgrade_lean(L(conf="Medium", edge=4.0,
                                recent10=[10, 12, 14, 16, 18, 20]))
    s.assert_eq(out_m["confidence"], "Medium", "Medium + 6 logs → Medium preserved")

    # Low — never adjusted upward; thin sample not relevant for Low
    out_l = CG.downgrade_lean(L(conf="Low", edge=2.0, recent10=[10, 12]))
    s.assert_eq(out_l["confidence"], "Low", "Low + 2 logs → still Low (R1 doesn't apply, has logs)")

    # insufficient_data — no rule should re-adjust
    out_id = CG.downgrade_lean(L(conf="insufficient_data", lean="No Play", edge=None,
                                 recent10=[]))
    s.assert_eq(out_id["confidence"], "insufficient_data",
                "already insufficient_data → no double-adjust")


def test_idempotency(s: Suite):
    print(f"\n  {BLUE}─── Idempotency: re-running on adjusted lean is a no-op ───{RESET}")
    once = CG.downgrade_lean(L(conf="High", edge=5.0,
                               recent10=[10, 12, 14, 16, 18, 20]))
    twice = CG.downgrade_lean(once)
    s.assert_eq(twice["confidence"], once["confidence"], "confidence unchanged on second pass")
    s.assert_eq(twice["_guardrail"], once["_guardrail"], "rule unchanged")
    s.assert_eq(twice["_originalConfidence"], once["_originalConfidence"],
                "_originalConfidence unchanged")
    s.assert_eq(twice["_guardrailAt"], once["_guardrailAt"], "_guardrailAt unchanged")


def test_only_downgrades(s: Suite):
    print(f"\n  {BLUE}─── Confidence ONLY moves down — never up ───{RESET}")
    # Even with great evidence, Low stays Low
    out_low = CG.downgrade_lean(L(conf="Low", edge=5.0,
                                  recent10=[10, 12, 14, 16, 18, 20, 22, 24, 26, 28]))
    s.assert_eq(out_low["confidence"], "Low", "Low + great evidence → still Low (no upgrade)")
    s.assert_eq(out_low.get("_guardrail"), None, "no rule stamped")


def test_apply_to_leans_summary(s: Suite):
    print(f"\n  {BLUE}─── apply_to_leans summary aggregation ───{RESET}")
    leans = [
        L(conf="High", edge=5.0, recent10=[10] * 10),                # untouched
        L(conf="High", edge=5.0, recent10=[10] * 6),                 # R3
        L(conf="High", edge=5.0, recent10=[10] * 3),                 # R4
        L(conf="Medium", edge=5.0, recent10=[10] * 4),               # R4
        L(conf="High", edge=35.0, recent10=[10] * 5),                # R2 (extreme + thin)
        L(conf="High", edge=5.0, recent10=[]),                       # R1
    ]
    new_leans, summary = CG.apply_to_leans(leans)
    s.assert_eq(summary["total"], 6, "total=6")
    s.assert_eq(summary["adjusted"], 5, "adjusted=5 (one untouched)")
    s.assert_eq(summary["byRule"].get("R1_no_logs_insufficient_data"), 1, "R1=1")
    s.assert_eq(summary["byRule"].get("R2_extreme_edge_thin_sample"), 1, "R2=1")
    s.assert_eq(summary["byRule"].get("R3_thin_sample_capped_medium"), 1, "R3=1")
    s.assert_eq(summary["byRule"].get("R4_thin_sample_capped_low"), 2, "R4=2")
    s.assert_eq(len(new_leans), 6, "all 6 leans returned")


def test_audit_fields(s: Suite):
    print(f"\n  {BLUE}─── Audit fields preserved ───{RESET}")
    out = CG.downgrade_lean(L(conf="High", edge=5.0, recent10=[10, 12, 14]))
    s.assert_in("_originalConfidence", out, "_originalConfidence stamped")
    s.assert_eq(out["_originalConfidence"], "High", "original=High recorded")
    s.assert_in("_guardrailAt", out, "_guardrailAt timestamp stamped")
    s.assert_in("_guardrail", out, "_guardrail rule stamped")


def main() -> int:
    print()
    print(f"  {GOLD}Phase 8.3 — confidence guardrails tests{RESET}")
    print(f"  {DIM}zero network · zero file I/O{RESET}")

    s = Suite()
    test_R1_no_logs(s)
    test_R2_extreme_edge_thin(s)
    test_R3_high_capped_medium(s)
    test_R4_capped_low(s)
    test_no_rule_triggers(s)
    test_idempotency(s)
    test_only_downgrades(s)
    test_apply_to_leans_summary(s)
    test_audit_fields(s)

    print()
    if s.failed == 0:
        print(f"  {GREEN}✓ all {s.passed} guardrail assertions passed{RESET}\n")
        return 0
    print(f"  {RED}✗ {s.failed} of {s.passed + s.failed} guardrail assertions FAILED{RESET}")
    for f in s.failures[:10]:
        print(f"  {RED}  {f}{RESET}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
