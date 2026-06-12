import unittest

from pipeline.daily.settle_suggested_cards import card_result


class TestCardResult(unittest.TestCase):
    """Standard parlay grading: loss beats everything, pending blocks settlement,
    pushes drop out, all-push is a push."""

    def test_any_loss_loses(self):
        self.assertEqual(card_result(["win", "loss"]), "lost")
        self.assertEqual(card_result(["loss", "pending"]), "lost")  # a loss settles even with a pending leg
        self.assertEqual(card_result(["push", "loss"]), "lost")

    def test_pending_blocks_settlement(self):
        self.assertEqual(card_result(["win", "pending"]), "pending")
        self.assertEqual(card_result(["pending"]), "pending")
        self.assertEqual(card_result(["win", ""]), "pending")  # unmatched leg = unsettled, never guessed

    def test_all_wins_won(self):
        self.assertEqual(card_result(["win"]), "won")
        self.assertEqual(card_result(["win", "win"]), "won")

    def test_push_drops_out(self):
        self.assertEqual(card_result(["win", "push"]), "won")
        self.assertEqual(card_result(["push", "push"]), "push")


if __name__ == "__main__":
    unittest.main()
