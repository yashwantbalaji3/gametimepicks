"""NBA board row schema — the ISO tip-off instant and per-row research eligibility.

PREREQUISITE ZERO for gate G3 (docs/NBA_RESEARCH_ADAPTER_READINESS.md §3.1).

The provider already RECEIVES the tip-off instant. `espn_provider.fetch_schedule` reads
``ev["date"]`` (an ISO 8601 UTC instant) and reduces it to ``"8:30 PM ET"`` through
``_format_tipoff_et``. A display string is not an instant: ``capturedAt < eventStart`` cannot be
evaluated against it, which is why all 54 historical boards report zero research-eligible rows. The
fix is to carry the instant through to the artifact ALONGSIDE the display string, so eligibility is
computable per row from the first new artifact onward.

FORWARD-ONLY, PERMANENTLY. The historical boards stay ineligible. Backfilling a tip-off instant onto
a board whose capture time we never recorded would manufacture the exact evidence the gate exists to
demand — a row that "proves" it was captured pregame because someone later decided it must have been.
``assert_no_historical_backfill`` is the mechanical statement of that rule.

Pure: no clock, no network, no I/O. Callers pass the capture instant in.
"""
from __future__ import annotations

from datetime import datetime


# The first slate date whose board rows may carry `tipoffIso`. Rows for any earlier date were
# generated before the instant was persisted; a `tipoffIso` on one of them can only have been
# back-written, which is leakage. Guarded by `assert_no_historical_backfill`.
TIPOFF_SCHEMA_EPOCH = "2026-07-30"

# Emitted on every row so a consumer can tell a row built by this schema from a legacy row that
# merely happens to lack a tip-off instant.
BOARD_ROW_SCHEMA_VERSION = "nba-board-row-2"

# How an empty slate is explained. `dataMode` already distinguishes the two upstream states; this
# names them in the artifact so a reader does not have to know that vocabulary to tell an off-day
# from a broken provider.
EMPTY_SLATE_OFF_SEASON = "OFF_SEASON_OR_OFF_DAY"
EMPTY_SLATE_PROVIDER_FAILURE = "PROVIDER_FAILURE"
EMPTY_SLATE_NOT_EMPTY = "NOT_EMPTY"


def _instant(value: str | None) -> datetime | None:
    """Parse an ISO 8601 instant. Anything without a date+time component is not an instant."""
    if not value or not isinstance(value, str):
        return None
    if "T" not in value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_proven_instant(value: str | None) -> bool:
    """True only for a parseable ISO datetime. Mirrors `isProvenInstant` in identity-contract.ts."""
    return _instant(value) is not None


def research_eligible(captured_at: str | None, tipoff_iso: str | None) -> bool:
    """Was this row observed strictly before the game started?

    FAIL-CLOSED. A missing or unparseable timestamp on either side returns False — the same rule
    `isLeakageSafe` applies in app/src/lib/identity/sport-adapter.ts. "Probably pregame" is how UFC
    accumulated features that include the outcome they predict.
    """
    captured = _instant(captured_at)
    tipoff = _instant(tipoff_iso)
    if captured is None or tipoff is None:
        return False
    if captured.tzinfo is None or tipoff.tzinfo is None:
        return False
    return captured < tipoff


def serialize_game_row(game, date: str, captured_at: str | None) -> dict:
    """Build one NBA board game row.

    `game` is a `pipeline.providers.base.Game`. `tipoff` keeps the display string every existing
    consumer reads; `tipoffIso` is the new instant, null when the provider did not supply one —
    never a reconstruction from the display string, which has no date and no zone offset.
    """
    tipoff_iso = getattr(game, "tipoff_iso", None)
    if not is_proven_instant(tipoff_iso):
        tipoff_iso = None
    return {
        "gameId": game.game_id,
        "date": date,
        "tipoff": game.tipoff_et or "TBD",
        "tipoffIso": tipoff_iso,
        "capturedAt": captured_at,
        "researchEligible": research_eligible(captured_at, tipoff_iso),
        "schemaVersion": BOARD_ROW_SCHEMA_VERSION,
        "homeTeamAbbr": game.home_team_abbr,
        "homeTeamFull": game.home_team_full,
        "awayTeamAbbr": game.away_team_abbr,
        "awayTeamFull": game.away_team_full,
        "status": game.status,
    }


def validate_new_board_row(row: dict) -> list[str]:
    """Structural violations for a row produced by this schema. Empty means writable.

    Checks the invariants a consumer would otherwise have to assume: eligibility is DERIVED from the
    two timestamps rather than asserted, and a row cannot claim eligibility without both of them.
    """
    violations: list[str] = []
    gid = row.get("gameId") or "(no gameId)"

    if "tipoffIso" not in row:
        violations.append(f"MISSING_TIPOFF_FIELD: row {gid} has no tipoffIso key")
    if "researchEligible" not in row:
        violations.append(f"MISSING_ELIGIBILITY_FIELD: row {gid} has no researchEligible key")
    if violations:
        return violations

    tipoff_iso = row.get("tipoffIso")
    if tipoff_iso is not None and not is_proven_instant(tipoff_iso):
        violations.append(
            f"UNPARSEABLE_TIPOFF: row {gid} carries tipoffIso {tipoff_iso!r}, which is not an instant"
        )
    if not row.get("tipoff"):
        violations.append(f"MISSING_DISPLAY_TIPOFF: row {gid} lost its display tip-off string")

    declared = row.get("researchEligible")
    derived = research_eligible(row.get("capturedAt"), tipoff_iso)
    if declared is not derived:
        violations.append(
            f"ELIGIBILITY_NOT_DERIVED: row {gid} declares researchEligible={declared!r} but "
            f"capturedAt={row.get('capturedAt')!r} vs tipoffIso={tipoff_iso!r} derives {derived!r}"
        )
    return violations


def assert_no_historical_backfill(date: str, rows: list[dict]) -> None:
    """Refuse to write a tip-off instant onto a board that predates the schema.

    Raises. The 54 boards generated 2026-05-04 -> 06-13 have no recorded capture instant, so a
    `tipoffIso` appearing on one of them cannot have been observed — it can only have been derived
    from knowledge the pipeline did not have at capture time. G3 says "never retrofit"; this is that
    sentence in code.
    """
    if date >= TIPOFF_SCHEMA_EPOCH:
        return
    offenders = [r.get("gameId") or "(no gameId)" for r in rows if r.get("tipoffIso")]
    if offenders:
        raise ValueError(
            f"NBA board {date} predates the tip-off schema epoch {TIPOFF_SCHEMA_EPOCH} but "
            f"{len(offenders)} row(s) carry tipoffIso ({', '.join(offenders[:5])}). Backfilling a "
            f"tip-off instant onto a historical board fabricates leakage-safety evidence — those "
            f"boards are permanently research-ineligible. See docs/NBA_RESEARCH_ADAPTER_READINESS.md G3."
        )


def classify_empty_slate(*, game_count: int, schedule_available: bool) -> str:
    """Name why a slate is empty, so an off-day and a dead provider are not the same artifact.

    The daily cron keeps emitting boards through the off-season. Silencing them entirely would hide
    provider failures, and leaving them unlabelled makes a stats.nba.com timeout look like a night
    with no games. `schedule_available` is the board's own `scheduleAvailable` — True only when at
    least two providers independently agreed the slate was empty.
    """
    if game_count > 0:
        return EMPTY_SLATE_NOT_EMPTY
    return EMPTY_SLATE_OFF_SEASON if schedule_available else EMPTY_SLATE_PROVIDER_FAILURE
