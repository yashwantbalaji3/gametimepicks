"""
PR 8 — props-only mode plumbing tests.

Verifies CLI flag wiring + module-level global existence. The full
integration (paid run → props commit → enrichment) is tested by the
post-merge paid refresh workflow itself.
"""
from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class PropsOnlyFlagTests(unittest.TestCase):
    def test_argparse_accepts_props_only(self) -> None:
        """`generate_daily_board --help` mentions --props-only."""
        result = subprocess.run(
            [sys.executable, "-m", "pipeline.generate_daily_board", "--help"],
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
        )
        self.assertEqual(result.returncode, 0, msg=f"--help failed: {result.stderr}")
        self.assertIn("--props-only", result.stdout)

    def test_module_global_exists_and_is_bool(self) -> None:
        """_PROPS_ONLY_MODE exists at module scope and is a bool."""
        from pipeline import generate_daily_board  # type: ignore
        self.assertTrue(hasattr(generate_daily_board, "_PROPS_ONLY_MODE"))
        self.assertIsInstance(generate_daily_board._PROPS_ONLY_MODE, bool)


if __name__ == "__main__":
    unittest.main()
