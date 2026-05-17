"""Tests for the honest context-tag derivation.

`pipeline.confidence_guardrails.infer_context_tag` should derive a single
display tag from a lean dict using only fields that already exist
(confidence, riskFlags, recent10). It must never invent a label that the
underlying data doesn't already imply.

Coverage:
  - model-anomaly wins over everything when suspicious_edge / r5 flag set
  - recent-form-backed for High + 8+ logs
  - clean for Medium + 8+ logs and no anomaly
  - sample-watch for High/Medium/Low with 5..7 logs
  - None for insufficient_data / no_play / unknown confidence
  - attach_context_tag mutates the dict only when a tag is returned
  - apply_to_leans pipeline auto-attaches the tag after guardrails
"""
from __future__ import annotations

from pipeline.confidence_guardrails import (
    apply_to_leans,
    attach_context_tag,
    infer_context_tag,
)


GREEN = "\033[0;32m"
RED = "\033[0;31m"
RESET = "\033[0m"


def assert_eq(actual, expected, label: str) -> None:
    ok = actual == expected
    mark = "✓" if ok else "✗"
    color = GREEN if ok else RED
    print(f"  {color}{mark}{RESET} {label}")
    if not ok:
        print(f"      expected: {expected!r}")
        print(f"      actual:   {actual!r}")
        raise AssertionError(label)


def main() -> None:
    print("\n─── infer_context_tag — single-rule classification ───")

    # model-anomaly wins (NBA flag)
    assert_eq(
        infer_context_tag({
            "confidence": "Low",
            "riskFlags": ["suspicious_edge"],
            "recent10": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        }),
        "model-anomaly",
        "model-anomaly wins when suspicious_edge flag set",
    )

    # model-anomaly wins (MLB flag)
    assert_eq(
        infer_context_tag({
            "confidence": "Low",
            "riskFlags": ["r5_model_anomaly"],
            "recent10": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        }),
        "model-anomaly",
        "model-anomaly wins when r5_model_anomaly flag set",
    )

    # recent-form-backed: High + 8+ logs + no anomaly
    assert_eq(
        infer_context_tag({
            "confidence": "High",
            "riskFlags": [],
            "recent10": list(range(8)),
        }),
        "recent-form-backed",
        "recent-form-backed for High + 8 logs",
    )

    # 10 logs still counts as recent-form-backed
    assert_eq(
        infer_context_tag({
            "confidence": "High",
            "riskFlags": [],
            "recent10": list(range(10)),
        }),
        "recent-form-backed",
        "recent-form-backed for High + 10 logs",
    )

    # sample-watch: any confidence, 5-7 logs
    for n_logs in (5, 6, 7):
        assert_eq(
            infer_context_tag({
                "confidence": "High",
                "riskFlags": [],
                "recent10": list(range(n_logs)),
            }),
            "sample-watch",
            f"sample-watch for High + {n_logs} logs",
        )
    assert_eq(
        infer_context_tag({
            "confidence": "Low",
            "riskFlags": [],
            "recent10": list(range(6)),
        }),
        "sample-watch",
        "sample-watch for Low + 6 logs",
    )

    # clean intentionally narrows to Medium + 8+
    # (we treat High + 8+ as recent-form-backed, a stronger label)
    # — verify Medium + 8 still resolves correctly
    # The current implementation prefers recent-form-backed over clean when
    # confidence==High, so Medium is the explicit "clean" path.
    # NOTE: the current implementation returns "recent-form-backed" only
    # when confidence==High. Verify Medium yields None or clean.
    medium_tag = infer_context_tag({
        "confidence": "Medium",
        "riskFlags": [],
        "recent10": list(range(8)),
    })
    # Spec: Medium + 8 logs → "clean" is desired but the current code
    # checks recent-form-backed first (only matches High), so Medium falls
    # through to the clean check. Confirm.
    assert_eq(medium_tag, "clean", "clean for Medium + 8 logs")

    # None for insufficient_data
    assert_eq(
        infer_context_tag({
            "confidence": "insufficient_data",
            "riskFlags": [],
            "recent10": [],
        }),
        None,
        "no tag for insufficient_data",
    )

    # None for no_play
    assert_eq(
        infer_context_tag({
            "confidence": "no_play",
            "riskFlags": [],
            "recent10": list(range(10)),
        }),
        None,
        "no tag for no_play",
    )

    # None for unknown / missing confidence
    assert_eq(
        infer_context_tag({
            "confidence": None,
            "riskFlags": [],
            "recent10": list(range(10)),
        }),
        None,
        "no tag for unknown confidence",
    )

    print("\n─── attach_context_tag — mutates dict in place ───")
    lean = {
        "confidence": "High",
        "riskFlags": [],
        "recent10": list(range(10)),
    }
    attach_context_tag(lean)
    assert_eq(lean.get("contextTag"), "recent-form-backed", "attaches tag")

    lean_none = {
        "confidence": "insufficient_data",
        "riskFlags": [],
        "recent10": [],
    }
    attach_context_tag(lean_none)
    assert_eq(
        "contextTag" in lean_none,
        False,
        "does NOT set contextTag when inference returns None",
    )

    print("\n─── apply_to_leans — pipeline integration ───")
    leans = [
        {
            "confidence": "High",
            "edgePct": 12.5,
            "recent10": list(range(10)),
            "riskFlags": [],
            "lean": "Over",
        },
        {
            "confidence": "High",
            "edgePct": 30.0,  # triggers R5 (>= 25)
            "recent10": list(range(10)),
            "riskFlags": [],
            "lean": "Over",
        },
        {
            "confidence": "Medium",
            "edgePct": 4.0,
            "recent10": [1, 2, 3, 4, 5, 6],  # 6 logs → sample-watch
            "riskFlags": [],
            "lean": "Under",
        },
    ]
    new_leans, summary = apply_to_leans(leans)

    assert_eq(
        new_leans[0].get("contextTag"),
        "recent-form-backed",
        "lean 0 — High + 10 logs + clean → recent-form-backed",
    )
    assert_eq(
        new_leans[1].get("contextTag"),
        "model-anomaly",
        "lean 1 — R5 trips → model-anomaly",
    )
    assert_eq(
        new_leans[2].get("contextTag"),
        "sample-watch",
        "lean 2 — Medium + 6 logs → sample-watch",
    )
    assert_eq(summary["adjusted"], 1, "summary counts only guardrail moves")

    print(f"\n{GREEN}✓ all context_tag assertions passed{RESET}\n")


if __name__ == "__main__":
    main()
