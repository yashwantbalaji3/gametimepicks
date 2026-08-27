"""MLB main-board pipeline.

Orchestrates: schedule (free) → odds (paid, capped) → projections (free).
Writes:
  app/public/data/mlb/schedule/<date>.json
  app/public/data/mlb/boards/<date>.json
  app/public/data/mlb/power/<date>.json   (pending shell; populated by
                                            generate_mlb_power if desired)

Usage:
    python3 -m pipeline.mlb.generate_mlb_board --date 2026-05-16
    python3 -m pipeline.mlb.generate_mlb_board --date 2026-05-16 --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .. import config as C
from . import mlb_odds, mlb_stats, mlb_model
from .settlement_lineage import derive_event_id

# Bumped when the shape of a lean row's provenance block changes. The research-lineage exporter reads
# this to tell a natively-stamped row from one it had to reconstruct.
BOARD_ROW_SCHEMA_VERSION = "mlb-board-row-1"

SEASON = 2026
DEFAULT_DATE = "2026-05-16"

PITCHER_MARKETS = ("pitcher_strikeouts",)
BATTER_MARKETS = (
    "batter_hits",
    "batter_total_bases",
    "batter_hits_runs_rbis",
)


def _out_dir(kind: str) -> Path:
    p = C.APP_PUBLIC_DATA / "mlb" / kind
    p.mkdir(parents=True, exist_ok=True)
    return p


def _team_lookup_from_schedule(games: list[dict]) -> dict[str, list[dict]]:
    """Index team-name → LIST of that team's games on the date.

    The Odds API uses full team names ("Toronto Blue Jays"); MLB-StatsAPI
    uses both names and abbreviations. We build a name-keyed lookup so we
    can attach team context onto each prop row.

    SPRINT 041 — this returned dict[str, dict] and assigned `lookup[name] = ctx`,
    which silently assumed **a team plays at most one game per date**. That is false
    for doubleheaders: the second game overwrote the first, so every prop row for
    that team inherited ONE gamePk.

    Measured on 2026-07-28 (CLE @ CIN twice): both provider events mapped to gamePk
    824489, leaving gamePk 824490 simulated but orphaned, and the early game's markets
    joined to the late game's simulation.

    The value is now a LIST, and `_resolve_team_ctx` picks the game whose start time is
    nearest the prop's own commenceTime. Single-game teams behave exactly as before.
    """
    lookup: dict[str, list[dict]] = {}
    for g in games:
        home = {
            "name": g.get("homeTeamName"),
            "abbr": g.get("homeTeamAbbr"),
            "id": g.get("homeTeamId"),
            "homeOrAway": "Home",
            "opponentAbbr": g.get("awayTeamAbbr"),
            "opponentName": g.get("awayTeamName"),
            "gamePk": g.get("gamePk"),
            "gameDate": g.get("gameDate"),
            "venue": g.get("venue"),
        }
        away = {
            "name": g.get("awayTeamName"),
            "abbr": g.get("awayTeamAbbr"),
            "id": g.get("awayTeamId"),
            "homeOrAway": "Away",
            "opponentAbbr": g.get("homeTeamAbbr"),
            "opponentName": g.get("homeTeamName"),
            "gamePk": g.get("gamePk"),
            "gameDate": g.get("gameDate"),
            "venue": g.get("venue"),
        }
        if home["name"]:
            lookup.setdefault(home["name"], []).append(home)
        if away["name"]:
            lookup.setdefault(away["name"], []).append(away)
    return lookup


def _parse_iso(value: str | None) -> float | None:
    """Epoch seconds for an ISO timestamp, or None. Never raises on bad input."""
    if not value or not isinstance(value, str):
        return None
    try:
        from datetime import datetime

        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _captured_before_start(captured_at: str | None, scheduled_start: str | None) -> bool:
    """True only when the capture provably precedes first pitch.

    Fails closed: a missing or unparseable timestamp on either side is NOT eligible, and equality is
    not pregame. Research eligibility is a claim about when we looked, so it can only ever be granted
    by two real instants — never inferred, and never repaired after the fact from the outcome.
    """
    a = _parse_iso(captured_at)
    b = _parse_iso(scheduled_start)
    if a is None or b is None:
        return False
    return a < b


def _has_started(scheduled_start: str | None, *, at: str) -> bool:
    """True when `scheduled_start` is at or before the reference instant `at`.

    Fails CLOSED in the direction that matters: an unparseable or missing start time is treated as
    STARTED, so an event we cannot time-check never enters a pre-event artifact. Equality counts as
    started — first pitch is not pregame.

    `at` is the generation instant, not "now at the moment this line runs". A single reference
    instant per run is what makes the refusal auditable after the fact: every published row's
    commenceTime is strictly after the board's own generatedAt, and that is checkable from the
    committed bytes alone.
    """
    a = _parse_iso(scheduled_start)
    b = _parse_iso(at)
    if a is None or b is None:
        return True
    return a <= b


def partition_events_by_start(events: list[dict], *, at: str) -> tuple[list[dict], list[dict]]:
    """Split provider events into (pregame, started) against the generation instant.

    THIS IS THE PRE-EVENT BOUNDARY. Before 2026-08-27 the generator had none: `_captured_before_start`
    existed but only decorated each row with a `researchEligible` flag, so a run that started after
    first pitch still emitted ordinary-looking leans for a game already in progress and still PAID for
    its odds. The Aug-27 recovery is what surfaced it — the daily chain never fired, and by the time
    it could be re-run one of the seven games was in the second inning.

    Refusing here rather than at the row layer also means we never buy a market we are forbidden to
    publish: the started events are dropped before the cost estimate.
    """
    pregame: list[dict] = []
    started: list[dict] = []
    for e in events:
        (started if _has_started(e.get("commence_time"), at=at) else pregame).append(e)
    return pregame, started


def _started_receipt(events: list[dict], *, at: str) -> list[dict]:
    """A typed, committed record of every event refused for having already started."""
    return [
        {
            "providerEventId": str(e.get("id")) if e.get("id") is not None else None,
            "awayTeam": e.get("away_team"),
            "homeTeam": e.get("home_team"),
            "commenceTime": e.get("commence_time"),
            "state": "MISSED_COVERAGE",
            "reason": "MISSING_PRE_EVENT_ARTIFACT",
            "detail": (
                "Scheduled start is at or before this run's generatedAt, so no pre-event forecast "
                "can honestly be produced for it. It stays in the coverage denominator."
            ),
            "generatedAt": at,
        }
        for e in events
    ]


def _club_identity(ctxs: list[dict]) -> tuple[int | str, str | None] | None:
    """The club a team's schedule entries describe, as `(team_id, abbr)`, or None if unidentifiable.

    `_team_lookup_from_schedule` returns a LIST per team so a doubleheader keeps a distinct gamePk
    per game (b8c68dee). Roster lookup is per CLUB, not per game — every entry for a team names the
    same club — so it needs exactly one entry, and the first that carries an id is enough.

    This is a function rather than two lines inside the roster loop because it was two lines inside
    the roster loop that broke: when the lookup started returning lists, the loop kept calling
    `.get()` on the value and every board raised AttributeError. Board generation printed a success
    line anyway, so 2026-07-29 and 2026-07-30 silently produced no board at all and settlement had
    nothing to grade. Inline logic could not be tested; this can.
    """
    for ctx in ctxs or []:
        team_id = ctx.get("id")
        if team_id:
            return team_id, ctx.get("abbr")
    return None


def _resolve_team_ctx(
    team_ctx: dict[str, list[dict]], team_name: str | None, commence_time: str | None
) -> dict:
    """Pick the ONE scheduled game a market row belongs to.

    With a single game the answer is unambiguous and this behaves exactly as the old
    last-write-wins lookup did. With a doubleheader it picks the game whose scheduled
    start is nearest the market's own commenceTime.

    Nearest-start rather than exact-match on purpose: the two sources disagree by up to
    a minute in practice (2026-07-28 first pitch was 17:40:00Z on StatsAPI and 17:41:00Z
    from the provider), so an equality join would have failed on exactly the game it
    most needed to resolve.
    """
    candidates = team_ctx.get(team_name or "") or []
    if not candidates:
        return {}
    if len(candidates) == 1:
        return candidates[0]

    target = _parse_iso(commence_time)
    if target is None:
        # No time to disambiguate with. Return the earliest game rather than an arbitrary
        # one, so the choice is at least deterministic across runs.
        return min(candidates, key=lambda c: _parse_iso(c.get("gameDate")) or float("inf"))

    def distance(c: dict) -> float:
        t = _parse_iso(c.get("gameDate"))
        return abs(t - target) if t is not None else float("inf")

    return min(candidates, key=distance)


# ── SPRINT 043 · PUBLICATION SAFETY GATE ────────────────────────────────────────────────────────


class IdentityGateError(RuntimeError):
    """Raised when a board would publish a corrupted event-identity mapping."""


def validate_board_identity(leans: list[dict]) -> list[str]:
    """Return every identity violation in a board's leans. Empty list means publishable.

    SPRINT 043. Sprint 041 fixed the doubleheader resolver, but nothing stopped a corrupted
    mapping from being WRITTEN — the July 28 defect reached two user-facing surfaces before a
    cross-surface test noticed. This gate runs at the point of generation, which is the only
    place the problem is cheap to catch.

    The invariant is injectivity: a provider event id and a StatsAPI gamePk are one-to-one.
    A gamePk claimed by two gameIds means one game's markets are attached to another game's
    model output. A gameId claiming two gamePks means the reverse.

    Violations are returned rather than raised so the caller can report all of them at once.
    """
    by_pk: dict[object, set[str]] = {}
    by_gid: dict[str, set[object]] = {}
    for lean in leans:
        gid, pk = lean.get("gameId"), lean.get("gamePk")
        if not gid or pk is None:
            continue
        by_pk.setdefault(pk, set()).add(gid)
        by_gid.setdefault(gid, set()).add(pk)

    violations: list[str] = []
    for pk, gids in sorted(by_pk.items(), key=lambda kv: str(kv[0])):
        if len(gids) > 1:
            violations.append(
                f"PROVIDER_ID_COLLISION: gamePk {pk} is claimed by {len(gids)} provider events "
                f"({', '.join(sorted(g[:16] for g in gids))}) — one game's markets would be joined "
                f"to another game's model output"
            )
    for gid, pks in sorted(by_gid.items()):
        if len(pks) > 1:
            violations.append(
                f"AMBIGUOUS_EVENT: provider event {gid[:16]} resolves to {len(pks)} gamePks "
                f"({', '.join(str(p) for p in sorted(pks, key=str))})"
            )
    return violations


def assert_board_publishable(leans: list[dict], *, date: str) -> None:
    """Refuse to publish a board whose event identities are corrupted.

    Raises rather than warning. A warning here would have been ignored on 2026-07-28 exactly as
    every other silent degradation in this pipeline's history was.
    """
    violations = validate_board_identity(leans)
    if not violations:
        return
    detail = "\n".join(f"  {v}" for v in violations)
    raise IdentityGateError(
        f"Board {date} failed event-identity validation — refusing to publish:\n{detail}\n\n"
        f"  A provider identifier is an alias, not an identity. See _resolve_team_ctx in this file "
        f"and app/src/lib/identity/event-identity.ts."
    )


def _build_lean(
    row: dict,
    team_ctx: dict[str, list[dict]],
    projection: dict,
    is_pitcher: bool,
    *,
    player_id: int | None = None,
    player_team_abbr: str | None = None,
    player_team_name: str | None = None,
) -> dict:
    """Combine an odds row + a projection result into the final lean record."""
    grade = mlb_model.grade(
        projection.get("projection"),
        row["line"],
        projection.get("sigma", 0.0),
        row["impliedOver"],
        row["impliedUnder"],
        samples=int(projection.get("samples", 0) or 0),
    )
    # Match player → team via "any of player_name in roster" is overkill for
    # MVP. We approximate using the home/away teams on the event: the player
    # will appear in one of them. The Odds API does not tag this, so we mark
    # the team field as "unknown" when we can't resolve it. UI will show the
    # matchup string regardless.
    # SPRINT 041: resolve by (team, nearest start time) so a doubleheader keeps Game 1
    # and Game 2 separate. Single-game teams are unaffected.
    commence = row.get("commenceTime")
    home_ctx = _resolve_team_ctx(team_ctx, row.get("homeTeam"), commence)
    away_ctx = _resolve_team_ctx(team_ctx, row.get("awayTeam"), commence)
    market_key = row["marketKey"]

    # Build both the legacy `reason` paragraph (kept for back-compat with any
    # downstream consumer) and a structured `reasonBullets` array the UI
    # uses to render NBA-style bullet points.
    reason_bits: list[str] = []
    reason_bullets: list[dict] = []
    if projection.get("insufficient"):
        reason_bits.append("sample too small to project")
        reason_bullets.append(
            {
                "label": "Sample",
                "text": f"too small to project ({projection.get('samples', 0)} games of log data)",
                "tone": "mute",
            }
        )
    else:
        if is_pitcher:
            reason_bits.append(
                f"last 3 {projection['last3Mean']:.1f} K · season {projection['seasonMean']:.1f} K · {projection['samples']} starts"
            )
            reason_bullets.extend(
                [
                    {
                        "label": "Recent form",
                        "text": f"Last 3 starts averaging {projection['last3Mean']:.1f} strikeouts",
                        "tone": "default",
                    },
                    {
                        "label": "Season",
                        "text": f"Season average {projection['seasonMean']:.1f} K across {projection['samples']} starts",
                        "tone": "default",
                    },
                ]
            )
        else:
            reason_bits.append(
                f"last 10 {projection['last10Mean']:.2f} · season {projection['seasonMean']:.2f} · {projection['samples']} games"
            )
            reason_bullets.extend(
                [
                    {
                        "label": "Recent form",
                        "text": f"Last 10 games averaging {projection['last10Mean']:.2f}",
                        "tone": "default",
                    },
                    {
                        "label": "Season",
                        "text": f"Season average {projection['seasonMean']:.2f} across {projection['samples']} games",
                        "tone": "default",
                    },
                ]
            )
    if grade.get("riskFlags") and "r5_model_anomaly" in grade["riskFlags"]:
        reason_bits.append("flagged: edge above R5 anomaly threshold")
        reason_bullets.append(
            {
                "label": "Calibration watch",
                "text": "Edge above R5 anomaly threshold — capped to Low confidence",
                "tone": "warn",
            }
        )

    # Derive the opponent abbr for the player so the UI can render
    # "PLAYER · TEAM vs OPP" without re-cross-referencing the schedule.
    opponent_abbr: str | None = None
    if player_team_abbr:
        if home_ctx.get("abbr") == player_team_abbr:
            opponent_abbr = away_ctx.get("abbr")
        elif away_ctx.get("abbr") == player_team_abbr:
            opponent_abbr = home_ctx.get("abbr")

    return {
        # Include the line in the id — sportsbooks sometimes post two
        # offerings for the same (player, market) at different lines
        # (e.g. Over 4.5 K + Over 5.5 K). Without the line the id
        # collides and React surfaces a duplicate-key warning.
        "id": f"{row['gameId']}-{row['playerName'].replace(' ', '_')}-{market_key}-{row['line']}",
        "sport": "MLB",
        "date": row["commenceTime"][:10],
        "gameId": row["gameId"],
        "gamePk": (home_ctx.get("gamePk") or away_ctx.get("gamePk")),
        "commenceTime": row["commenceTime"],
        # ── native provenance ──────────────────────────────────────────────────────────────────
        # Stamped at generation time so the row carries its own history instead of having one
        # reconstructed for it later. capturedAt comes from the odds call that produced this row;
        # scheduledStart is the event's start, not the slate date; eventId uses the same derivation
        # as settlement, so a board row and the result that grades it agree on which event they mean.
        # researchEligible is DERIVED here rather than asserted — it is exactly `captured before start`,
        # and it is false when either timestamp is missing rather than optimistically true.
        "eventId": derive_event_id(
            sport="mlb",
            league="mlb",
            participant_names=[row.get("awayTeam") or "", row.get("homeTeam") or ""],
            scheduled_start=row["commenceTime"],
        ),
        "scheduledStart": row["commenceTime"],
        "capturedAt": row.get("capturedAt"),
        "providerRefs": {"oddsApiEventId": row.get("providerEventId"), "bookmaker": row.get("bookmaker")},
        "researchEligible": _captured_before_start(row.get("capturedAt"), row["commenceTime"]),
        "rowSchemaVersion": BOARD_ROW_SCHEMA_VERSION,
        "homeTeamAbbr": home_ctx.get("abbr"),
        "homeTeamName": row.get("homeTeam"),
        "awayTeamAbbr": away_ctx.get("abbr"),
        "awayTeamName": row.get("awayTeam"),
        "venue": home_ctx.get("venue"),
        "playerId": player_id,
        "playerName": row["playerName"],
        "playerTeamAbbr": player_team_abbr,
        "playerTeamName": player_team_name,
        "opponentAbbr": opponent_abbr,
        "playerRole": "pitcher" if is_pitcher else "batter",
        "marketKey": market_key,
        "marketLabel": _market_label(market_key),
        "line": row["line"],
        "oddsOver": row["oddsOver"],
        "oddsUnder": row["oddsUnder"],
        "impliedOver": round(row["impliedOver"], 4),
        "impliedUnder": round(row["impliedUnder"], 4),
        "bookmaker": row["bookmaker"],
        "projection": projection.get("projection"),
        "sigma": projection.get("sigma") or None,
        "samples": projection.get("samples", 0),
        "recentSeries": projection.get("recentSeries", []),
        "recentGames": projection.get("recentGames", []),
        "lean": grade["lean"],
        "confidence": grade["confidence"],
        "modelProbOver": grade["modelProbOver"],
        "modelProbUnder": grade["modelProbUnder"],
        "edgePct": grade["edgePct"],
        "edgePctOver": grade["edgePctOver"],
        "edgePctUnder": grade["edgePctUnder"],
        "riskFlags": grade["riskFlags"],
        "contextTag": grade.get("contextTag"),
        "reason": " · ".join(reason_bits),
        "reasonBullets": reason_bullets,
    }


def _market_label(key: str) -> str:
    return {
        "pitcher_strikeouts": "Strikeouts",
        "batter_hits": "Hits",
        "batter_total_bases": "Total Bases",
        "batter_hits_runs_rbis": "Hits + Runs + RBIs",
    }.get(key, key)


def run(
    date: str,
    *,
    dry_run: bool = False,
    markets: list[str] | None = None,
    regions: list[str] | None = None,
    bookmakers: list[str] | None = None,
    min_credits_remaining: int = 2000,
    max_credits_per_run: int = 75,
    allow_below_floor: bool = False,
    only_events: list[str] | None = None,
    rows_out: str | None = None,
) -> dict:
    """Run the full pipeline. Returns a summary dict.

    `only_events` narrows which provider events are processed (scope only — see §4.1 note at the
    filter). `rows_out` diverts the generated rows to a standalone artifact and SUPPRESSES the
    board write entirely, so an event-scoped run structurally cannot overwrite a frozen base
    board — the append-only patch writer, not this generator, decides what becomes public.
    """
    markets = markets or mlb_odds.DEFAULT_MARKETS
    regions = regions or mlb_odds.DEFAULT_REGIONS
    bookmakers = bookmakers or mlb_odds.DEFAULT_BOOKMAKERS

    summary: dict = {
        "date": date,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dryRun": dry_run,
        "markets": markets,
        "regions": regions,
        "bookmakers": bookmakers,
        "creditsBefore": None,
        "creditsAfter": None,
        "creditsSpent": 0,
        "eventsScheduled": 0,
        "eventsWithOdds": 0,
        "eventsPregame": 0,
        "eventsStartedBeforeGeneration": 0,
        "startedBeforeGeneration": [],
        "propRowsFetched": 0,
        "leansEmitted": 0,
        "insufficientCount": 0,
        "warnings": [],
    }

    # ------------------------------------------------------------------
    # 1) Schedule (FREE)
    # ------------------------------------------------------------------
    raw_games = mlb_stats.fetch_schedule(date)
    games = mlb_stats.normalize_schedule_games(date, raw_games)
    summary["eventsScheduled"] = len(games)

    schedule_payload = {
        "sport": "MLB",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "source": "mlb-statsapi.fetch_schedule",
        "games": games,
    }
    schedule_path = _out_dir("schedule") / f"{date}.json"
    schedule_path.write_text(json.dumps(schedule_payload, indent=2))
    print(f"[schedule] wrote {schedule_path.relative_to(C.ROOT_DIR)} — {len(games)} games")

    team_ctx = _team_lookup_from_schedule(games)

    # ------------------------------------------------------------------
    # 2) Odds events (FREE) + cost gate
    # ------------------------------------------------------------------
    if not C.ODDS_API_KEY:
        summary["warnings"].append("ODDS_API_KEY not configured — props pending state")
        _write_pending_board(date, games, summary, reason="odds_not_configured")
        return summary

    events, headers = mlb_odds.list_events_for_date(date)
    summary["creditsBefore"] = headers.get("x-requests-remaining")

    # ── EVENT SCOPING (Program 117-122 §4.1) ──────────────────────────────────────────────────
    # Scope changes INCLUSION ONLY. The narrowed list flows through the identical cost estimate,
    # credit guards, fetch loop, stamping and row generation below, so a scoped run and the full
    # run produce the same official rows for the same event — equivalence by construction rather
    # than by a parallel code path. Refuses unknown ids rather than silently generating nothing.
    if only_events:
        wanted = {str(x) for x in only_events}
        by_id = {str(e.get("id")): e for e in events}
        selected = [e for e in events if str(e.get("id")) in wanted]
        unknown = wanted - set(by_id)
        if unknown:
            raise ValueError(
                f"event scope refers to unknown provider event id(s): {sorted(unknown)}. "
                f"Refusing rather than generating a partial board silently."
            )
        summary["eventScope"] = sorted(wanted)
        summary["eventScopeMatched"] = len(selected)
        print(f"[odds] EVENT-SCOPED run — {len(selected)}/{len(events)} event(s): {sorted(wanted)}")
        events = selected

    # ── PRE-EVENT BOUNDARY ────────────────────────────────────────────────────────────────────
    # Applied BEFORE the cost estimate and the paid fetch: an event whose first pitch has passed is
    # neither publishable nor worth buying. The refused set is carried in the summary and stamped
    # into the board so the day's denominator stays whole — a game we could not cover honestly is
    # visible as MISSED_COVERAGE, never silently absent.
    events, started_events = partition_events_by_start(events, at=summary["generatedAt"])
    summary["eventsPregame"] = len(events)
    summary["eventsStartedBeforeGeneration"] = len(started_events)
    summary["startedBeforeGeneration"] = _started_receipt(started_events, at=summary["generatedAt"])
    if started_events:
        for row in summary["startedBeforeGeneration"]:
            print(
                f"[pre-event] REFUSED {row['awayTeam']} @ {row['homeTeam']} — "
                f"start {row['commenceTime']} <= generatedAt {summary['generatedAt']} · MISSED_COVERAGE"
            )
        summary["warnings"].append(
            f"{len(started_events)} event(s) had already started at generation time and were refused "
            f"(MISSED_COVERAGE); they remain in the scheduled denominator."
        )
    # Plan detection (suffix only — never log the key). total quota = used + remaining; a ~500 total is
    # the FREE tier, a 20K total is paid. Paid pipeline runs fail closed on the free key unless overridden.
    key = C.ODDS_API_KEY or ""
    summary["keySuffix"] = key[-4:] if key else None
    try:
        used = int(headers.get("x-requests-used") or 0)
        rem0 = int(summary["creditsBefore"]) if summary["creditsBefore"] else 0
        total_quota = used + rem0
    except (TypeError, ValueError):
        total_quota = 0
    is_free_plan = 0 < total_quota <= 600
    summary["plan"] = "free" if is_free_plan else ("paid" if total_quota > 600 else "unknown")
    summary["allowBelowFloor"] = allow_below_floor
    print(f"[odds] key ****{summary['keySuffix']} · plan={summary['plan']} · remaining={summary['creditsBefore']} · floor={min_credits_remaining} · events={len(events)}")
    if is_free_plan and not allow_below_floor:
        summary["warnings"].append(
            f"FREE-tier key (****{summary['keySuffix']}, total quota {total_quota}) — paid MLB odds fetch blocked. "
            f"Set the paid ODDS_API_KEY (or ODDS_API_ALLOW_BELOW_FLOOR=true to override)."
        )
        _write_pending_board(date, games, summary, reason="free_key_blocked")
        return summary

    if not events:
        if started_events:
            # Every event on the slate had already begun. That is an honest coverage gap, not
            # "the provider had nothing" — collapsing the two would let a missed morning read as
            # a quiet no-market day.
            summary["warnings"].append(
                "every MLB event for the date had already started at generation time — "
                "no pre-event board can be produced"
            )
            _write_pending_board(date, games, summary, reason="all_events_started")
            return summary
        summary["warnings"].append("Odds API returned 0 MLB events for date")
        _write_pending_board(date, games, summary, reason="no_events")
        return summary

    # Cache-adjusted cost: per-event /odds calls hit the local disk cache
    # within the TTL window and cost 0. Estimating against the worst case
    # only would block legitimate cache-warm reruns (e.g. attaching a new
    # field after the original paid fetch). Count only events whose cache
    # is cold.
    cold_event_count = sum(
        1
        for ev in events
        if not mlb_odds.is_event_cached(ev.get("id"), list(markets), list(regions))
    )
    estimated_cost = cold_event_count * len(markets) * len(regions)
    worst_case_cost = len(events) * len(markets) * len(regions)
    summary["estimatedCost"] = estimated_cost
    summary["worstCaseCost"] = worst_case_cost
    summary["coldEventCount"] = cold_event_count
    summary["cachedEventCount"] = len(events) - cold_event_count
    try:
        rem = int(summary["creditsBefore"]) if summary["creditsBefore"] else 0
    except (TypeError, ValueError):
        rem = 0
    after = rem - estimated_cost

    print(
        f"[odds] cold events: {cold_event_count}/{len(events)} · "
        f"estimated cost: {estimated_cost} credits · "
        f"worst-case: {worst_case_cost} · projected after: {after}"
    )
    if worst_case_cost > max_credits_per_run:
        summary["warnings"].append(
            f"worst-case cost {worst_case_cost} > cap {max_credits_per_run}; skipping paid fetch"
        )
        _write_pending_board(date, games, summary, reason="cost_cap")
        return summary
    if after < min_credits_remaining and not allow_below_floor:
        summary["warnings"].append(
            f"projected remaining {after} < floor {min_credits_remaining}; skipping paid fetch "
            f"(set ODDS_API_ALLOW_BELOW_FLOOR=true or raise the paid quota to override)"
        )
        _write_pending_board(date, games, summary, reason="floor_guard")
        return summary

    if dry_run:
        print("[odds] DRY RUN — skipping paid /odds calls")
        _write_pending_board(date, games, summary, reason="dry_run")
        return summary

    # ------------------------------------------------------------------
    # 3) Odds fetch (PAID) per event
    # ------------------------------------------------------------------
    all_rows: list[dict] = []
    for i, e in enumerate(events, 1):
        eid = e.get("id")
        try:
            payload, hdrs = mlb_odds.fetch_event_odds(eid, list(markets), list(regions), list(bookmakers))
            summary["creditsAfter"] = hdrs.get("x-requests-remaining")
            last_cost = hdrs.get("x-requests-last")
            try:
                if last_cost is not None:
                    summary["creditsSpent"] += int(last_cost)
            except (TypeError, ValueError):
                pass
            rows = mlb_odds.parse_event_odds(payload, list(bookmakers))
            # Stamp the capture instant on the rows THIS call produced, at the moment it returned.
            # capturedAt is the one provenance field that cannot be recovered afterwards: once the
            # board is on disk there is no record of when its prices were read, and the file-level
            # generatedAt describes the whole run, not this event. Substituting it is precisely the
            # backfill the research-lineage contract refuses, which is why every historical row is
            # LEGACY_UNSTAMPED. Stamped here, `capturedAt < commenceTime` is a fact about the row.
            #
            # PROVENANCE FIX (2026-08-03): this ran for cache hits too, so a 0-credit regeneration
            # re-stamped rows observed up to the cache TTL earlier as if read just now. Observed
            # live: the 12:03 ET rebuild spent 0 credits yet moved capturedAt on all 211 rows from
            # 04:34Z to 16:03Z. `x-gtp-observed-at` carries the real observation instant on a cache
            # hit; only a genuine network read may claim `now`.
            captured_at = hdrs.get("x-gtp-observed-at") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            for r in rows:
                r["capturedAt"] = captured_at
                r["providerEventId"] = eid
            all_rows.extend(rows)
            if rows:
                summary["eventsWithOdds"] += 1
            print(
                f"[odds {i:02d}/{len(events)}] {e.get('away_team')} @ {e.get('home_team')} "
                f"— {len(rows)} rows · last_cost={last_cost} · rem={summary['creditsAfter']}"
            )
        except mlb_odds.MlbOddsError as err:
            summary["warnings"].append(f"event {eid}: {err}")
            print(f"[odds {i:02d}/{len(events)}] FAILED: {err}")
        time.sleep(0.15)

    summary["propRowsFetched"] = len(all_rows)

    # ------------------------------------------------------------------
    # 4) Game logs (FREE) — only for players who appear in prop rows
    # ------------------------------------------------------------------
    pitcher_id_by_name: dict[str, int] = {}
    # Per-player team attribution: which team a player suits up for today.
    # The Odds API never tags this; we resolve from probable-pitcher data
    # (definitive) and team rosters (best-effort for batters).
    player_team_by_name: dict[str, tuple[str | None, str | None]] = {}
    for g in games:
        if g.get("awayProbablePitcherName") and g.get("awayProbablePitcherId"):
            pitcher_id_by_name[g["awayProbablePitcherName"]] = g["awayProbablePitcherId"]
            player_team_by_name[g["awayProbablePitcherName"]] = (g.get("awayTeamAbbr"), g.get("awayTeamName"))
        if g.get("homeProbablePitcherName") and g.get("homeProbablePitcherId"):
            pitcher_id_by_name[g["homeProbablePitcherName"]] = g["homeProbablePitcherId"]
            player_team_by_name[g["homeProbablePitcherName"]] = (g.get("homeTeamAbbr"), g.get("homeTeamName"))

    # Batter IDs: resolve from rosters of teams playing today
    # (Odds API only gives us player names; MLB API gives us names + ids per roster).
    print(f"[stats] fetching rosters for {len(team_ctx)} teams")
    batter_id_by_name: dict[str, int] = {}
    for team_name, ctxs in team_ctx.items():
        club = _club_identity(ctxs)
        if club is None:
            continue
        team_id, team_abbr = club
        try:
            roster = mlb_stats.fetch_team_roster(int(team_id))
        except mlb_stats.MlbStatsError as err:
            summary["warnings"].append(f"roster fetch failed for {team_name}: {err}")
            continue
        for entry in roster:
            person = entry.get("person", {}) or {}
            pos = (entry.get("position", {}) or {}).get("type") or ""
            full = person.get("fullName")
            if not full:
                continue
            if pos == "Pitcher":
                # still index in case pitcher is referenced in batter logs (rare)
                pitcher_id_by_name.setdefault(full, person.get("id"))
            else:
                batter_id_by_name[full] = person.get("id")
            # Record team attribution — first roster wins (players occasionally
            # appear on multiple rosters around trade deadlines; we accept the
            # first hit rather than guess. Probable-pitcher hits above are
            # definitive and overwrite roster fallback below.)
            player_team_by_name.setdefault(full, (team_abbr, team_name))
        time.sleep(0.05)

    pitcher_names_in_props = {r["playerName"] for r in all_rows if r["marketKey"] in PITCHER_MARKETS}
    batter_names_in_props = {r["playerName"] for r in all_rows if r["marketKey"] in BATTER_MARKETS}

    pitcher_ids_to_fetch = {pitcher_id_by_name[n] for n in pitcher_names_in_props if n in pitcher_id_by_name}
    batter_ids_to_fetch = {batter_id_by_name[n] for n in batter_names_in_props if n in batter_id_by_name}
    print(
        f"[stats] pitchers in props: {len(pitcher_names_in_props)} resolved → {len(pitcher_ids_to_fetch)}"
    )
    print(
        f"[stats] batters in props: {len(batter_names_in_props)} resolved → {len(batter_ids_to_fetch)}"
    )

    pitcher_logs = mlb_stats.fetch_player_game_logs_bulk(pitcher_ids_to_fetch, SEASON, "pitching")
    batter_logs = mlb_stats.fetch_player_game_logs_bulk(batter_ids_to_fetch, SEASON, "hitting")

    # ------------------------------------------------------------------
    # 5) Project + grade
    # ------------------------------------------------------------------
    leans: list[dict] = []
    for row in all_rows:
        market = row["marketKey"]
        if market in PITCHER_MARKETS:
            pid = pitcher_id_by_name.get(row["playerName"])
            logs = pitcher_logs.get(pid, []) if pid else []
            proj = mlb_model.project_pitcher_strikeouts(logs)
            is_pitcher = True
        elif market in BATTER_MARKETS:
            pid = batter_id_by_name.get(row["playerName"])
            logs = batter_logs.get(pid, []) if pid else []
            proj = mlb_model.project_batter_market(logs, market)
            is_pitcher = False
        else:
            continue
        team_abbr, team_name = player_team_by_name.get(row["playerName"], (None, None))
        lean = _build_lean(
            row,
            team_ctx,
            proj,
            is_pitcher,
            player_id=pid,
            player_team_abbr=team_abbr,
            player_team_name=team_name,
        )
        leans.append(lean)
        if proj.get("insufficient"):
            summary["insufficientCount"] += 1

    # BELT TO THE EVENT-LEVEL BRACES. The event filter above is the primary boundary; this second
    # pass catches a row whose commenceTime disagrees with its parent event's (a provider
    # reschedule mid-run, or a cached payload older than the schedule). A published row must
    # satisfy `commenceTime > generatedAt` on its own bytes, with no appeal to the event list.
    kept: list[dict] = []
    late_dropped = 0
    for l in leans:
        if _has_started(l.get("commenceTime"), at=summary["generatedAt"]):
            late_dropped += 1
            continue
        kept.append(l)
    if late_dropped:
        summary["warnings"].append(
            f"{late_dropped} generated row(s) failed the row-level pre-event check and were dropped"
        )
        print(f"[pre-event] dropped {late_dropped} row(s) at the row-level check")
    leans = kept
    summary["leansEmitted"] = len(leans)

    # ------------------------------------------------------------------
    # 6) Aggregate counts and write board
    # ------------------------------------------------------------------
    board_payload = {
        "sport": "MLB",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "generatedFor": date,
        "isDemo": False,
        "scheduleAvailable": bool(games),
        "propsAvailable": bool(all_rows),
        "scheduleSource": "mlb-statsapi",
        "oddsSource": "the_odds_api",
        "dataSources": ["mlb-statsapi", "the_odds_api"],
        "games": [
            {**g, "startedBeforeGeneration": _has_started(g.get("gameDate"), at=summary["generatedAt"])}
            for g in games
        ],
        "leans": leans,
        "coverage": build_coverage(games, summary, leans=leans),
        "summary": {
            "scheduledGames": len(games),
            "eventsWithOdds": summary["eventsWithOdds"],
            "leans": len(leans),
            "highConfidence": sum(1 for l in leans if l["confidence"] == "High"),
            "mediumConfidence": sum(1 for l in leans if l["confidence"] == "Medium"),
            "lowConfidence": sum(1 for l in leans if l["confidence"] == "Low"),
            "insufficientData": summary["insufficientCount"],
            "anomalies": sum(
                1 for l in leans if "r5_model_anomaly" in (l.get("riskFlags") or [])
            ),
            "byMarket": _by_market_counts(leans),
        },
        "credits": {
            "before": summary["creditsBefore"],
            "after": summary["creditsAfter"],
            "spent": summary["creditsSpent"],
            "estimated": summary.get("estimatedCost"),
        },
    }

    # SPRINT 043: the gate runs BEFORE the write. A corrupted identity mapping must never reach disk.
    assert_board_publishable(leans, date=date)

    if rows_out:
        # Scoped/rows-only mode: emit the rows as a standalone artifact and DO NOT touch the
        # board. The base board is frozen after cutover; only the append-only patch writer may
        # add coverage, and it validates these rows before anything becomes public.
        rows_path = Path(rows_out)
        rows_path.parent.mkdir(parents=True, exist_ok=True)
        rows_path.write_text(json.dumps({
            "kind": "mlb-event-scoped-rows",
            "date": date,
            "generatedAt": board_payload.get("generatedAt"),
            "eventScope": summary.get("eventScope"),
            "rows": leans,
            "summary": {k: summary.get(k) for k in ("creditsBefore", "creditsAfter", "creditsSpent", "estimatedCost", "eventScopeMatched")},
        }, indent=2))
        print(f"[board] EVENT-SCOPED: wrote {len(leans)} row(s) to {rows_path} — board NOT written (base stays frozen)")
        summary["rowsOut"] = str(rows_path)
        return summary

    board_path = _out_dir("boards") / f"{date}.json"
    board_path.write_text(json.dumps(board_payload, indent=2))
    print(f"[board] wrote {board_path.relative_to(C.ROOT_DIR)} — {len(leans)} leans")

    # ------------------------------------------------------------------
    # 7) Power Board shell (pending) — populated separately
    # ------------------------------------------------------------------
    power_payload = {
        "sport": "MLB",
        "scope": "home_runs",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "state": "pending",
        "reason": "HR Power Board uses a separate variance profile and dedicated data inputs that aren't wired yet. Schedule below shows the slate the Power Board will analyze once those inputs are live.",
        "inputsPlanned": [
            "season slugging + hard-hit + barrel rate (Baseball Savant)",
            "pitcher HR-allowed rate + handedness splits",
            "park factor + weather",
            "lineup position",
        ],
        "games": games,
    }
    power_path = _out_dir("power") / f"{date}.json"
    power_path.write_text(json.dumps(power_payload, indent=2))
    print(f"[power] wrote pending shell {power_path.relative_to(C.ROOT_DIR)}")

    return summary


def build_coverage(games: list[dict], summary: dict, *, leans: list[dict] | None = None) -> dict:
    """The day's coverage denominator, reconciled from the schedule down.

    `scheduled` is the official game count and is the ONLY number that may anchor a coverage claim.
    Everything else is a partition of it, so `covered + startedBeforeGeneration + uncovered` is an
    identity the guards can assert on the committed bytes rather than a narrative in a summary line.
    """
    at = summary["generatedAt"]
    started_games = [g for g in games if _has_started(g.get("gameDate"), at=at)]
    covered_keys = set()
    for l in leans or []:
        key = l.get("providerEventId") or (l.get("awayTeam"), l.get("homeTeam"))
        if key:
            covered_keys.add(key if isinstance(key, str) else str(key))
    return {
        "generatedAt": at,
        "scheduled": len(games),
        "pregameAtGeneration": len(games) - len(started_games),
        "startedBeforeGeneration": summary.get("startedBeforeGeneration") or [],
        "startedGameCount": len(started_games),
        "eventsPricedPregame": summary.get("eventsWithOdds", 0),
        "coveredEventCount": len(covered_keys),
        "note": (
            "Games that had already started when this board was generated carry no pre-event "
            "forecast by design. They stay counted here so the day is never reported as fully "
            "covered when it was not."
        ),
    }


def _by_market_counts(leans: list[dict]) -> dict:
    out: dict = {}
    for l in leans:
        m = l["marketKey"]
        if m not in out:
            out[m] = {"total": 0, "high": 0, "medium": 0, "low": 0, "insufficient": 0}
        out[m]["total"] += 1
        if l["confidence"] == "High":
            out[m]["high"] += 1
        elif l["confidence"] == "Medium":
            out[m]["medium"] += 1
        elif l["confidence"] == "Low":
            out[m]["low"] += 1
        elif l["confidence"] == "insufficient_data":
            out[m]["insufficient"] += 1
    return out


def _write_pending_board(date: str, games: list[dict], summary: dict, *, reason: str) -> None:
    """Write a schedule-only board when props can't be fetched."""
    board_payload = {
        "sport": "MLB",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "generatedFor": date,
        "isDemo": False,
        "scheduleAvailable": bool(games),
        "propsAvailable": False,
        "scheduleSource": "mlb-statsapi",
        "oddsSource": None,
        "dataSources": ["mlb-statsapi"],
        "pendingReason": reason,
        "games": [
            {**g, "startedBeforeGeneration": _has_started(g.get("gameDate"), at=summary["generatedAt"])}
            for g in games
        ],
        "leans": [],
        "coverage": build_coverage(games, summary, leans=[]),
        "summary": {
            "scheduledGames": len(games),
            "eventsWithOdds": 0,
            "leans": 0,
            "highConfidence": 0,
            "mediumConfidence": 0,
            "lowConfidence": 0,
            "insufficientData": 0,
            "anomalies": 0,
            "byMarket": {},
        },
        "credits": {
            "before": summary["creditsBefore"],
            "after": summary["creditsAfter"],
            "spent": 0,
            "estimated": summary.get("estimatedCost"),
        },
    }
    board_path = _out_dir("boards") / f"{date}.json"
    board_path.write_text(json.dumps(board_payload, indent=2))
    print(f"[board] wrote pending board {board_path.relative_to(C.ROOT_DIR)} — reason={reason}")

    # Always write the pending Power Board shell too
    power_payload = {
        "sport": "MLB",
        "scope": "home_runs",
        "date": date,
        "generatedAt": summary["generatedAt"],
        "state": "pending",
        "reason": "Power Board data inputs aren't wired yet. The schedule below is what the Power Board will analyze when they're live.",
        "inputsPlanned": [
            "season slugging + hard-hit + barrel rate (Baseball Savant)",
            "pitcher HR-allowed rate + handedness splits",
            "park factor + weather",
            "lineup position",
        ],
        "games": games,
    }
    power_path = _out_dir("power") / f"{date}.json"
    power_path.write_text(json.dumps(power_payload, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the MLB MVP board for a date.")
    parser.add_argument("--date", default=DEFAULT_DATE, help="YYYY-MM-DD (ET)")
    parser.add_argument("--dry-run", action="store_true", help="Skip paid /odds calls")
    parser.add_argument(
        "--event",
        action="append",
        default=None,
        help="Provider event id to scope this run to (repeatable). Scope changes INCLUSION ONLY — "
        "the same generator logic runs on a narrower event list. Unknown ids are refused.",
    )
    parser.add_argument(
        "--rows-out",
        default=None,
        help="Write generated rows to this path INSTEAD of the board. Required companion to "
        "--event in production: a scoped run must never overwrite a frozen base board.",
    )
    parser.add_argument(
        "--markets",
        default=None,
        help="Comma-separated market keys. Defaults to all 4 MVP markets.",
    )
    parser.add_argument(
        "--min-credits-remaining",
        type=int,
        # Default 2000 — a conservative floor for the paid 20K plan. The free key is refused earlier by
        # the plan-aware check regardless of this floor, so 2000 never over-blocks a free-key run.
        default=int(os.environ.get("ODDS_API_MIN_CREDITS_REMAINING", "2000")),
        help="Refuse to run if projected remaining < this (env: ODDS_API_MIN_CREDITS_REMAINING, default 2000 for the paid plan)",
    )
    parser.add_argument(
        "--allow-below-floor",
        action="store_true",
        default=os.environ.get("ODDS_API_ALLOW_BELOW_FLOOR", "").lower() in ("1", "true", "yes"),
        help="Explicitly allow a paid fetch even below the floor / on the free key (env: ODDS_API_ALLOW_BELOW_FLOOR)",
    )
    parser.add_argument(
        "--max-credits-per-run",
        type=int,
        default=75,
        help="Refuse to run if estimated cost exceeds this",
    )
    args = parser.parse_args(argv)

    markets = None
    if args.markets:
        markets = [m.strip() for m in args.markets.split(",") if m.strip()]

    # A scoped run may not write the board — that is what keeps a frozen base safe from an
    # event-level top-up. Refuse the combination rather than discovering it after the write.
    if args.event and not args.rows_out:
        print("[board] REFUSED: --event requires --rows-out (a scoped run must never overwrite the board)", file=sys.stderr)
        return 2

    summary = run(
        args.date,
        dry_run=args.dry_run,
        markets=markets,
        min_credits_remaining=args.min_credits_remaining,
        max_credits_per_run=args.max_credits_per_run,
        allow_below_floor=args.allow_below_floor,
        only_events=args.event,
        rows_out=args.rows_out,
    )
    print("\n=== summary ===")
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
