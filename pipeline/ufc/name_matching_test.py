"""Deterministic name-matching tests (conservative, unique-only)."""
from __future__ import annotations

import unittest
from pipeline.ufc.name_matching import normalize, match_key, build_index, resolve

DB = ["Steve Garcia", "Diego Lopes", "Jon Jones", "Jared Jones", "Sean O'Malley", "José Aldo"]
IDX = build_index(DB)


class NameMatchingTests(unittest.TestCase):
    def test_suffix_unique_resolves(self):
        it, mt = resolve("Steve Garcia Jr.", IDX)
        self.assertEqual(it, "Steve Garcia"); self.assertEqual(mt, "suffix_stripped")

    def test_exact_wins(self):
        it, mt = resolve("Diego Lopes", IDX)
        self.assertEqual(it, "Diego Lopes"); self.assertEqual(mt, "exact")

    def test_jon_jones_not_jared_jones(self):
        # both share surname but different first names → exact only; no cross-map
        it, mt = resolve("Jon Jones", IDX)
        self.assertEqual(it, "Jon Jones")
        it2, mt2 = resolve("Jonathan Jones", IDX)  # not present, must not map to either
        self.assertIsNone(it2); self.assertIn(mt2, ("unmatched", "ambiguous"))

    def test_ambiguous_suffix_blocks(self):
        idx = build_index(["Alex Pereira", "Alex Pereira Jr."])  # both reduce to same key
        it, mt = resolve("Alex Pereira III", idx)
        self.assertIsNone(it); self.assertEqual(mt, "ambiguous")

    def test_apostrophe_and_accent_normalize(self):
        it, _ = resolve("Sean OMalley", IDX)
        self.assertEqual(it, "Sean O'Malley")
        it2, _ = resolve("Jose Aldo", IDX)
        self.assertEqual(it2, "José Aldo")

    def test_unmatched(self):
        it, mt = resolve("Nonexistent Fighter", IDX)
        self.assertIsNone(it); self.assertEqual(mt, "unmatched")


if __name__ == "__main__":
    unittest.main()
