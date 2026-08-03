"""Test-runner coverage manifest (Program 123-127 §4.3).

THE DEFECT THIS PREVENTS (found 2026-08-03)
`scripts/run_all_tests.sh` enumerated `pipeline.<name>_test` modules only. Every suite under
`pipeline/mlb/` — settlement grading, board identity, settlement lineage, model, export — existed
on disk and was **never executed by any runner or workflow**. That included the July-30
void-denominator regression, which had only ever run when a human invoked it by hand.

A test that never runs is documentation, not a guard. This module makes "exists" and "executes"
the same thing: every `*_test.py` discovered under pipeline/mlb/ must be invoked by the runner,
and the runner may not list a suite that does not exist.

Run: PYTHONPATH=. python3 -m pipeline.mlb.test_runner_coverage_test
"""
from __future__ import annotations

import pathlib
import re
import sys

MLB_DIR = pathlib.Path(__file__).resolve().parent
REPO = MLB_DIR.parent.parent
RUNNER = REPO / "scripts" / "run_all_tests.sh"

# This module is itself a suite; it is discovered like any other and must also be registered.
SELF = "test_runner_coverage_test"


def _discovered() -> set[str]:
    """Every MLB test module physically present."""
    return {p.stem for p in MLB_DIR.glob("*_test.py")}


def _registered(runner_text: str) -> set[str]:
    """Every MLB test module the runner actually invokes.

    The runner drives `pipeline.mlb.<name>` from a MLB_TESTS array; parse that array rather than
    grepping the whole file, so an unrelated mention in a comment cannot fake coverage.
    """
    m = re.search(r"MLB_TESTS=\(([^)]*)\)", runner_text, re.S)
    if not m:
        return set()
    return {tok.strip() for tok in m.group(1).split() if tok.strip() and not tok.strip().startswith("#")}


def test_runner_exists_and_declares_the_mlb_suite_list() -> None:
    assert RUNNER.exists(), f"the aggregate runner must exist at {RUNNER}"
    text = RUNNER.read_text()
    assert "MLB_TESTS=(" in text, "the runner must declare an explicit MLB_TESTS array"
    assert "pipeline.mlb." in text, "the runner must invoke pipeline.mlb modules"
    print("  \033[0;32m✓\033[0m the runner declares an explicit MLB suite list")


def test_every_discovered_mlb_suite_is_executed() -> None:
    text = RUNNER.read_text()
    discovered, registered = _discovered(), _registered(text)
    missing = sorted(discovered - registered)
    assert not missing, (
        "these MLB test modules exist on disk but are NOT executed by the runner — exactly the "
        f"silent gap that hid the settlement suites: {missing}"
    )
    print(f"  \033[0;32m✓\033[0m all {len(discovered)} discovered MLB suites are executed")


def test_runner_does_not_reference_a_missing_suite() -> None:
    text = RUNNER.read_text()
    ghosts = sorted(_registered(text) - _discovered())
    assert not ghosts, (
        f"the runner invokes suites that do not exist (renamed/removed without updating the "
        f"runner): {ghosts}"
    )
    print("  \033[0;32m✓\033[0m the runner references no missing suite")


def test_this_guard_is_itself_registered() -> None:
    assert SELF in _registered(RUNNER.read_text()), (
        "the coverage guard must itself be run by the runner, or it can never fail in CI"
    )
    print("  \033[0;32m✓\033[0m the coverage guard is itself executed")


def test_MUTATION_dropping_a_suite_is_detected() -> None:
    """Prove the guard actually fires — and that the mutation truly changed the input."""
    text = RUNNER.read_text()
    victim = "settle_mlb_results_test"
    assert victim in _registered(text), "precondition: the victim suite is registered"

    mutated = re.sub(r"(MLB_TESTS=\([^)]*?)\n\s*" + victim, r"\1", text, count=1, flags=re.S)
    assert _registered(mutated) != _registered(text), "the mutation must actually change registration"
    assert victim not in _registered(mutated), "the mutation must remove the victim"

    missing = sorted(_discovered() - _registered(mutated))
    assert victim in missing, "the guard must detect the dropped suite"
    print("  \033[0;32m✓\033[0m MUTATION: removing a suite from the runner is detected")


def test_MUTATION_an_unregistered_new_suite_is_detected() -> None:
    """A newly added test file that nobody wired must fail the guard."""
    registered = _registered(RUNNER.read_text())
    pretend_discovered = _discovered() | {"brand_new_unwired_test"}
    missing = sorted(pretend_discovered - registered)
    assert "brand_new_unwired_test" in missing, (
        "an unregistered new suite must be reported as unexecuted"
    )
    print("  \033[0;32m✓\033[0m MUTATION: an unregistered new suite is detected")


def main() -> int:
    print("\n=== pipeline.mlb test-runner coverage manifest ===")
    test_runner_exists_and_declares_the_mlb_suite_list()
    test_every_discovered_mlb_suite_is_executed()
    test_runner_does_not_reference_a_missing_suite()
    test_this_guard_is_itself_registered()
    test_MUTATION_dropping_a_suite_is_detected()
    test_MUTATION_an_unregistered_new_suite_is_detected()
    print("\n\033[0;32m✓ every MLB suite that exists is a suite that runs\033[0m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
