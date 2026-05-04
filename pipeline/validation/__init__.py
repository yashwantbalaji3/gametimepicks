"""
Append-only validation logger.

For every model lean the pipeline produces, write one JSON line to
pipeline/validation/leans_log.jsonl. This file is never edited or rewritten;
each line is a self-contained snapshot of a lean at the moment of generation.

Phase 7B-1: schema and writer only. Settlement / actual results come later
when gameId wiring is complete.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

log = logging.getLogger("gtp.validation")

THIS_DIR = Path(__file__).resolve().parent
DEFAULT_LOG_PATH = THIS_DIR / "leans_log.jsonl"


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
@dataclass
class LeanLogEntry:
    """One row of the append-only validation log.

    Generation-time fields are populated when the lean is created.
    Settlement-time fields are placeholders set to None until settle_results
    fills them in (Phase 7C+).
    """
    # Generation time
    leanId: str
    generatedAt: str
    date: str                          # YYYY-MM-DD slate date
    gameId: str | None
    playerId: int | None
    playerName: str
    team: str
    opponent: str
    market: str                        # PTS / REB / AST / etc.
    line: float
    oddsOver: int | None
    oddsUnder: int | None
    bookmaker: str | None
    oddsSource: str
    statsSource: str
    modelProjection: float
    modelProbability: float
    impliedProbability: float | None
    edgePct: float | None
    confidence: str                    # High / Medium / Low / NoPlay
    sourceReliabilityScore: float
    newsSignalIds: list[str] = field(default_factory=list)
    riskFlags: list[str] = field(default_factory=list)

    # Settlement time (populated by settle_results.py later)
    closingLine: float | None = None
    closingOddsOver: int | None = None
    closingOddsUnder: int | None = None
    actualResult: float | None = None
    outcome: str | None = None         # won / lost / push / pending
    projectionError: float | None = None
    settledAt: str | None = None


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------
def append_entries(
    entries: Iterable[LeanLogEntry],
    path: Path | None = None,
) -> int:
    """Append each entry as a JSON line to the log file. Returns count written.

    The log file is created if it doesn't exist. Existing lines are never
    touched. If a write fails, we log a warning but don't raise — validation
    logging is informational, not load-bearing.
    """
    p = path or DEFAULT_LOG_PATH
    p.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    try:
        with p.open("a", encoding="utf-8") as fh:
            for entry in entries:
                line = json.dumps(asdict(entry), ensure_ascii=False)
                fh.write(line + "\n")
                written += 1
        log.info(f"validation log: appended {written} entries to {p.name}")
    except OSError as e:
        log.warning(f"validation log write failed: {e}")
    return written


def now_utc_iso() -> str:
    """Helper for setting `generatedAt`."""
    return datetime.now(timezone.utc).isoformat()
