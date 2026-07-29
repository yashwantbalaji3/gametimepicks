"""Settlement lineage enforcement for MLB — the Python side of the contract.

SPRINT 045. Sprint 044 proved three historical event-identity collisions corrupted 49 settled legs:
all three were doubleheaders where the late game's ``gamePk`` survived a last-write-wins join, so game
1's predictions were graded against game 2's box score. Because both halves share rosters, those legs
graded to Win/Loss instead of erroring — plausible, not missing, which is why nobody investigated.

Sprint 044 also built a validator for exactly that shape. It was a *test*, not enforcement: it could
prove a defect was catchable, and it sat in `app/src/lib/identity/settlement-lineage.ts` where the
Python settlement pipeline could never call it. This module closes that gap.

WHY A SECOND IMPLEMENTATION RATHER THAN A SHARED ONE
Settlement is Python; the surfaces are TypeScript. Bridging them at runtime would mean a subprocess
call inside the ledger write path — more failure modes than the check removes. So the contract is
mirrored here, and `settlement_lineage_test.py` asserts the two implementations agree on shared
fixtures, including the real 2026-07-22 collision. Two independent derivations that agree is stronger
evidence than one shared implementation nobody re-checks — the same argument that made the Sprint 043
historical audit credible.

Scope: pure functions over already-built rows. No I/O, no network.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime


class SettlementLineageError(RuntimeError):
    """Raised when settled rows would be written without a reconstructable lineage."""


# Mirrors OFFICIAL_SETTLEMENT_SOURCES in app/src/lib/identity/settlement-lineage.ts.
# An ALLOWLIST, not a denylist: a source nobody thought to forbid is exactly the one that ends up
# settling a leg from a search-result snippet.
OFFICIAL_SETTLEMENT_SOURCES = (
    "mlb-statsapi-boxscore",
    "mlb-statsapi-linescore",
    "nba-stats-boxscore",
    "api-football-fixtures",
    "espn-official-scores",
    "operator-official-input",
)

REQUIRED_FIELDS = ("id", "eventId", "marketKey", "outcome", "settlementSource", "settledAt")


def _slug(value: str) -> str:
    """Mirror of the TS `slug` helper. Must stay byte-compatible — the agreement test proves it."""
    norm = unicodedata.normalize("NFKD", value)
    norm = "".join(c for c in norm if not unicodedata.combining(c))
    norm = norm.lower()
    norm = re.sub(r"[^a-z0-9]+", "-", norm)
    return norm.strip("-")


def derive_event_id(
    *,
    sport: str,
    league: str | None,
    participant_names: list[str],
    scheduled_start: str | None,
) -> str:
    """Mirror of `deriveEventId` in app/src/lib/identity/event-identity.ts.

    Includes the start time to the MINUTE, which is what separates the two halves of a doubleheader.
    Date alone is what failed in Sprint 041. Participants are sorted so argument order cannot change
    the id — two adapters describing the same event must agree or the whole point is lost.
    """
    parts = sorted(_slug(n) for n in participant_names)
    if scheduled_start:
        when = re.sub(r":\d{2}(\.\d+)?Z?$", "", scheduled_start)
        when = when.replace(":", "").replace("-", "").replace("T", "t")
    else:
        when = "unscheduled"
    sport_slug = _slug(sport)
    league_slug = _slug(league) if league else None
    segments = [sport_slug, league_slug] if league_slug and league_slug != sport_slug else [sport_slug]
    return ":".join([*segments, "-v-".join(parts), when])


def _parse(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def validate_settlement_lineage(rows: list[dict]) -> list[str]:
    """Return every lineage violation in a batch of settled rows. Empty means writable.

    Violations are returned rather than raised so a settlement run reports all of them at once —
    reporting one problem per run turns a single audit into six.
    """
    violations: list[str] = []

    # 1 — every link present. Rows failing this are excluded from the relational checks below rather
    #     than crashing them, so one malformed row cannot mask the rest.
    malformed: set[int] = set()
    for i, r in enumerate(rows):
        missing = [f for f in REQUIRED_FIELDS if not r.get(f)]
        if missing:
            malformed.add(i)
            violations.append(
                f"MISSING_LINEAGE: settled row {r.get('id') or '(no id)'} is missing "
                f"{', '.join(missing)} — the result cannot be reconstructed"
            )
    well_formed = [r for i, r in enumerate(rows) if i not in malformed]

    # 2 — one settled row per prediction.
    counts: dict[str, int] = {}
    for r in well_formed:
        counts[r["id"]] = counts.get(r["id"], 0) + 1
    for pid, n in sorted(counts.items()):
        if n > 1:
            violations.append(
                f"DUPLICATE_PREDICTION: prediction {pid} was settled {n} times — one of them is "
                f"graded against the wrong event or double-counted"
            )

    # 3 — THE 49-BAD-LEGS CHECK. A provider event id and a canonical event must be one-to-one, in
    #     BOTH directions. One provider id across two events means some rows are graded against the
    #     wrong game; one event across two provider ids means the join is ambiguous.
    by_provider: dict[str, set[str]] = {}
    by_event: dict[str, set[str]] = {}
    for r in well_formed:
        alias = r.get("providerEventId") or r.get("gameId")
        if not alias:
            continue
        by_provider.setdefault(alias, set()).add(r["eventId"])
        by_event.setdefault(r["eventId"], set()).add(alias)
    for alias, events in sorted(by_provider.items()):
        if len(events) > 1:
            violations.append(
                f"DUPLICATE_MAPPING: provider id {alias[:16]} was settled against {len(events)} "
                f"different events ({', '.join(sorted(events))}) — at least one set of results is "
                f"graded against the wrong event"
            )
    for event, aliases in sorted(by_event.items()):
        if len(aliases) > 1:
            violations.append(
                f"AMBIGUOUS_IDENTITY: event {event} was settled from {len(aliases)} different "
                f"provider ids ({', '.join(sorted(a[:16] for a in aliases))})"
            )

    # 4 — a canonical event must resolve to exactly one gamePk. This is the collision expressed in the
    #     settlement's own terms, and it is what would have caught 2026-07-22 at write time.
    pks_by_event: dict[str, set] = {}
    for r in well_formed:
        if r.get("gamePk") is not None:
            pks_by_event.setdefault(r["eventId"], set()).add(r["gamePk"])
    for event, pks in sorted(pks_by_event.items()):
        if len(pks) > 1:
            violations.append(
                f"WRONG_EVENT_MAPPING: event {event} was graded against {len(pks)} gamePks "
                f"({', '.join(str(p) for p in sorted(pks, key=str))})"
            )

    # 4b — the INVERSE, and the one that actually fires on the real 2026-07-22 board: two distinct
    #      canonical events graded against the SAME gamePk. The eventIds correctly differ there
    #      (derivation separates the halves by start time), so checks 3 and 4 pass — but both halves
    #      still carried gamePk 823519, which is precisely how game 1's legs were graded against game
    #      2's box score. Found by running this gate against the real board rather than a fixture.
    events_by_pk: dict = {}
    for r in well_formed:
        if r.get("gamePk") is not None:
            events_by_pk.setdefault(r["gamePk"], set()).add(r["eventId"])
    for pk, events in sorted(events_by_pk.items(), key=lambda kv: str(kv[0])):
        if len(events) > 1:
            violations.append(
                f"WRONG_EVENT_MAPPING: gamePk {pk} is claimed by {len(events)} distinct events "
                f"({', '.join(sorted(events))}) — one event's predictions would be graded against "
                f"the other's box score"
            )

    # 5 — timing and source.
    for r in well_formed:
        settled_at = _parse(r.get("settledAt"))
        if settled_at is None:
            violations.append(
                f"IMPOSSIBLE_RELATIONSHIP: settled row {r['id']} has an unparseable settledAt "
                f"{r.get('settledAt')!r}"
            )
        else:
            start = _parse(r.get("eventStartTime"))
            if start is not None and settled_at < start:
                violations.append(
                    f"IMPOSSIBLE_RELATIONSHIP: settled row {r['id']} was settled at "
                    f"{r['settledAt']}, BEFORE its event started at {r['eventStartTime']} — "
                    f"the outcome did not exist yet"
                )
        if r.get("settlementSource") not in OFFICIAL_SETTLEMENT_SOURCES:
            violations.append(
                f"UNTRUSTED_SOURCE: settled row {r['id']} cites source "
                f"{r.get('settlementSource')!r}, which is not an official settlement source"
            )

    return violations


def assert_settlement_lineage(rows: list[dict], *, date: str) -> None:
    """Refuse to write settled rows whose lineage is broken.

    Raises rather than warning. The whole reason the 49 corrupted legs persisted is that nothing
    downstream treated a suspicious result as a failure — a warning here would be read exactly as
    every other warning in this pipeline's history was.
    """
    violations = validate_settlement_lineage(rows)
    if not violations:
        return
    detail = "\n".join(f"  {v}" for v in violations)
    raise SettlementLineageError(
        f"Settlement {date} failed lineage validation — refusing to write {len(rows)} row(s):\n"
        f"{detail}\n\n"
        f"  Every settled result must trace prediction -> event -> market -> official source.\n"
        f"  See pipeline/mlb/settlement_lineage.py and app/src/lib/identity/settlement-lineage.ts."
    )
