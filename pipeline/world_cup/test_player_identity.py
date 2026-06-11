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
