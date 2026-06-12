import unittest
from pipeline.world_cup.player_identity import match_player, norm_join

SQUAD = [{"id": 1, "name": "Son Heung-Min", "photo": "x", "position": "Attacker"},
         {"id": 2, "name": "Raúl Jiménez", "photo": "y", "position": "Attacker"},
         {"id": 3, "name": "César Huerta", "photo": "z", "position": "Midfielder"}]


class TestPlayerIdentity(unittest.TestCase):
    def test_korean_name_order(self):
        m = match_player("Heung-Min Son", SQUAD)
        self.assertEqual(m["id"], 1); self.assertEqual(m["matchConfidence"], "high")

    def test_accents_exact(self):
        m = match_player("Raul Jimenez", SQUAD)
        self.assertEqual(m["id"], 2); self.assertEqual(m["matchConfidence"], "exact")

    def test_full_name_subset(self):
        m = match_player("Cesar Saul Huerta Valera", SQUAD)
        self.assertEqual(m["id"], 3)

    def test_unmatched(self):
        self.assertIsNone(match_player("Totally Unknown", SQUAD))

    def test_norm_join(self):
        self.assertEqual(norm_join("Raúl Jiménez"), "rauljimenez")


class TestSurnameInitialUpgrade(unittest.TestCase):
    """June-12 fix: unique surname + first initial is high-precision (API-Football
    abbreviates first names, e.g. 'M. Almirón') → medium confidence; an ambiguous
    surname stays low so the caller drops it rather than guessing."""

    def test_unique_surname_first_initial_is_medium(self):
        from pipeline.world_cup.player_identity import match_player
        squad = [{"id": 1, "name": "M. Almirón"}, {"id": 2, "name": "J. Enciso"}]
        m = match_player("Miguel Almiron", squad)
        self.assertIsNotNone(m)
        self.assertEqual(m["id"], 1)
        self.assertEqual(m["matchConfidence"], "medium")

    def test_ambiguous_surname_stays_low(self):
        from pipeline.world_cup.player_identity import match_player
        squad = [{"id": 1, "name": "J. Gonzalez"}, {"id": 2, "name": "J. Gonzalez Jr"}]
        # Two squad members share the bare surname token only when last tokens equal —
        # craft a true ambiguity: same surname, same initial.
        squad = [{"id": 1, "name": "Jose Martinez"}, {"id": 2, "name": "Juan Martinez"}]
        m = match_player("J. Martinez", squad)
        self.assertTrue(m is None or m["matchConfidence"] == "low")
