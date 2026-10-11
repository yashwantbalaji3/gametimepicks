"""Re-verify every committed RECONSTRUCTED optimizer receipt by replay — the python half of decision B'.

The quality job (app/src/lib/ask/parlay-window-evidence.mjs) checks that a reconstruction is bound to the exact
committed snapshot by sha256 and is on the explicit allowlist. It cannot replay the optimizer. This does: for each
receipt under data/internal/parlays/optimizer-reconstruction/receipts/, it re-hashes the snapshot, the boards and
the stored as-of policy inputs, replays pipeline.snapshot_optimizer on those inputs, and requires the replay to
reproduce the committed snapshot and its recorded classification. Then it proves that tampered receipts fail.

Run: python -m pipeline.optimizer_reconstruction_test
"""
from __future__ import annotations

import copy
import json
import re
import unittest

from pipeline import optimizer_reconstruction as rec

RECEIPTS = sorted((rec.REPO / rec.RECEIPTS_DIR).glob("*.json"))
JS_JUDGE = rec.REPO / "app" / "src" / "lib" / "ask" / "parlay-window-evidence.mjs"


def _load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def _js_allowlist() -> dict[str, str]:
    src = JS_JUDGE.read_text(encoding="utf-8")
    block = re.search(r"RECONSTRUCTED_RECEIPT_ALLOWLIST\s*=\s*Object\.freeze\(\{(.*?)\}\)", src, re.S)
    assert block, "the JS allowlist was not found"
    return dict(re.findall(r'"(\d{4}-\d{2}-\d{2})":\s*"([0-9a-f]{64})"', block.group(1)))


class CommittedReconstructionsHold(unittest.TestCase):
    def test_receipts_exist_and_match_the_js_allowlist_exactly(self):
        self.assertGreater(len(RECEIPTS), 0, "no reconstruction receipts found — this test would pass vacuously")
        on_disk = {p.stem: _load(p)["snapshot"]["sha256"] for p in RECEIPTS}
        self.assertEqual(on_disk, _js_allowlist(), "the receipts and the guard's allowlist must name the same dates and snapshot hashes")

    def test_every_receipt_reproduces_by_replay(self):
        for p in RECEIPTS:
            with self.subTest(date=p.stem):
                r = _load(p)
                self.assertEqual(r["date"], p.stem)
                self.assertEqual(rec.verify_receipt(r), [])
                self.assertTrue(r["reproduction"]["reproduced"])
                self.assertIn(r["classification"]["outcome"], ("NO_ELIGIBLE_SLIPS", "NO_QUALIFYING_GAMES"))
                for s in r["classification"]["publicSections"].values():
                    self.assertIn(s["emptyReason"], ("no_leg_pool", "structurally_infeasible", "insufficient_eligible_legs"))


class TamperedReceiptsFail(unittest.TestCase):
    """Each mutation must make verify_receipt report a problem."""

    MUTATIONS = {
        "claims to be genuine": lambda r: r.update(genuineProducerReceipt=True),
        "kind is PRODUCER": lambda r: r.update(receiptKind="PRODUCER"),
        "snapshot hash mismatch": lambda r: r["snapshot"].update(sha256="0" * 64),
        "snapshot of another date": lambda r: r["snapshot"].update(path="app/public/data/parlays/optimizer/2026-10-07.json"),
        "board hash mismatch": lambda r: r["inputs"]["boards"]["mlb"].update(sha256="1" * 64),
        "policy hash mismatch": lambda r: r["inputs"]["selectionPolicy"].update(sha256="2" * 64),
        "reliability copy missing": lambda r: r["inputs"]["marketReliability"].update(storedCopy="data/internal/nope.json"),
        "backdated to look contemporaneous": lambda r: r.update(reconstructedAt=r["snapshot"]["generatedAt"]),
        "original generatedAt rewritten": lambda r: r["snapshot"].update(generatedAt="2026-10-10T00:00:00+00:00"),
        "reproduction overstated": lambda r: r["reproduction"].update(bucketsEqual=False),
        "reason changed": lambda r: r["classification"]["publicSections"]["low"].update(emptyReason="structurally_infeasible"),
        "count changed": lambda r: r["classification"]["legPool"].update(totalLegs=99),
        "outcome changed": lambda r: r["classification"].update(outcome="NO_QUALIFYING_GAMES"),
    }

    def test_each_tamper_is_detected(self):
        base = _load(next(p for p in RECEIPTS if p.stem == "2026-10-10"))
        for name, mutate in self.MUTATIONS.items():
            with self.subTest(mutation=name):
                r = copy.deepcopy(base)
                mutate(r)
                self.assertNotEqual(rec.verify_receipt(r), [], f"{name}: tampered receipt passed verification")


if __name__ == "__main__":
    unittest.main()
