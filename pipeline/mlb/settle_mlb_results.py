"""MLB results settlement — grade published leans against final box scores.

Free MLB Stats API only. No paid Odds API. No fabrication.

Inputs:
  - app/public/data/mlb/boards/<date>.json — the published lean snapshot

Outputs (internal — `pipeline/validation/`):
  - mlb_settled_leans.jsonl              one row per graded lean, append/update
                                          by lean id so reruns stay idempotent
  - mlb_comparison_report_<date>.json    summary + per-game/market/confidence
                                          buckets + top hits/biggest misses

Markets graded (all four the board publishes):
  - pitcher_strikeouts    → stats.pitching.strikeOuts
  - batter_hits           → stats.batting.hits
  - batter_total_bases    → stats.batting.totalBases
  - batter_hits_runs_rbis → stats.batting.(hits + runs + rbi)

Grade rule (standard):
  - Over wins  if actual > line
  - Under wins if actual < line
  - Push       if actual == line

Excluded from the decisive denominator:
  - confidence == insufficient_data
  - projection / line / lean missing
  - actual stat unavailable (player didn't appear, pitcher didn't start, etc.)
  - lean in {"Pass", "No Play"}

Pending games (state != Final per MLB-StatsAPI schedule abstract state)
are left ungraded.
"""
from __future__ import annotations

import argparse
import json
from pipeline.mlb.settlement_lineage import assert_settlement_lineage, derive_event_id
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .. import config as C

API_BASE = "https://statsapi.mlb.com/api/v1"
USER_AGENT = "gametimepicks/0.4 (educational analytics)"

SETTLED_LEANS_PATH = (
    C.ROOT_DIR / "pipeline" / "validation" / "mlb_settled_leans.jsonl"
)


class MlbSettleError(Exception):
    """Raised on terminal MLB Stats API failure (HTTP + retries)."""


# ---------------------------------------------------------------------------
# HTTP helpers (urllib + retries; same pattern as mlb_stats.py)
# ---------------------------------------------------------------------------
def _http_get(path: str, timeout: int = 30, retries: int = 3) -> dict:
    import socket

    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == retries - 1:
                raise MlbSettleError(f"HTTP {e.code} for {path}")
            last_err = e
        except (urllib.error.URLError, TimeoutError, socket.timeout) as e:
            last_err = e
        time.sleep(1.0 * (attempt + 1))
    raise MlbSettleError(f"network error for {path}: {last_err}")


# ---------------------------------------------------------------------------
# Schedule finality
# ---------------------------------------------------------------------------
def final_game_pks_for_date(date_iso: str) -> set[int]:
    """Return the set of gamePks whose abstract state is 'Final' on `date_iso`."""
    payload = _http_get(
        f"/schedule?sportId=1&date={date_iso}&hydrate=team,linescore"
    )
    out: set[int] = set()
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            if (g.get("status") or {}).get("abstractGameState") == "Final":
                gpk = g.get("gamePk")
                if isinstance(gpk, int):
                    out.add(gpk)
    return out


def schedule_game_status_map(date_iso: str) -> dict[int, dict]:
    """Return {gamePk -> {abstractState, detailedState, awayAbbr, homeAbbr, gameDate}}."""
    payload = _http_get(
        f"/schedule?sportId=1&date={date_iso}&hydrate=team,linescore"
    )
    out: dict[int, dict] = {}
    for d in payload.get("dates", []):
        for g in d.get("games", []):
            gpk = g.get("gamePk")
            if not isinstance(gpk, int):
                continue
            status = g.get("status", {}) or {}
            away = (g["teams"]["away"]["team"] or {})
            home = (g["teams"]["home"]["team"] or {})
            out[gpk] = {
                "abstractState": status.get("abstractGameState"),
                "detailedState": status.get("detailedState"),
                "awayAbbr": away.get("abbreviation"),
                "homeAbbr": home.get("abbreviation"),
                "gameDate": g.get("gameDate"),
            }
    return out


# ---------------------------------------------------------------------------
# Boxscore fetch + per-player stat extraction
# ---------------------------------------------------------------------------
def fetch_boxscore(gamepk: int) -> dict:
    return _http_get(f"/game/{gamepk}/boxscore")


def _find_player_in_box(
    box: dict, player_id: int | None, player_name: str
) -> tuple[dict | None, str | None]:
    """Return (player_record, match_method) where method ∈ {'id','name',None}."""
    pid_key = f"ID{player_id}" if player_id else None
    for side in ("away", "home"):
        team = box.get("teams", {}).get(side, {}) or {}
        players = team.get("players", {}) or {}
        if pid_key and pid_key in players:
            return players[pid_key], "id"
    if player_name:
        for side in ("away", "home"):
            team = box.get("teams", {}).get(side, {}) or {}
            players = team.get("players", {}) or {}
            for rec in players.values():
                if (rec.get("person", {}).get("fullName") or "").strip() == player_name.strip():
                    return rec, "name"
    return None, None


def _stat_for_market(rec: dict, market: str) -> int | None:
    """Return the integer actual stat for the given market. None if unavailable."""
    stats = rec.get("stats", {}) or {}
    if market == "pitcher_strikeouts":
        p = stats.get("pitching") or {}
        if not p or not (rec.get("position", {}).get("type") == "Pitcher" or p.get("inningsPitched")):
            return None
        v = p.get("strikeOuts")
        return int(v) if isinstance(v, (int, str)) and str(v).strip() not in ("", "-") else None
    if market == "batter_hits":
        b = stats.get("batting") or {}
        ab = b.get("atBats")
        # A batter who didn't appear has empty batting dict OR atBats unset/0
        # with no plate appearances. Use atBats as the existence test —
        # plateAppearances also works.
        pa = b.get("plateAppearances")
        if not b or ((ab is None or int(ab) == 0) and (pa is None or int(pa) == 0)):
            return None
        v = b.get("hits")
        return int(v) if isinstance(v, (int, str)) and str(v).strip() not in ("", "-") else None
    if market == "batter_total_bases":
        b = stats.get("batting") or {}
        ab = b.get("atBats")
        pa = b.get("plateAppearances")
        if not b or ((ab is None or int(ab) == 0) and (pa is None or int(pa) == 0)):
            return None
        # MLB Stats API exposes totalBases directly. Belt-and-suspenders:
        # also compute from raw H/2B/3B/HR if missing.
        v = b.get("totalBases")
        if isinstance(v, (int, str)) and str(v).strip() not in ("", "-"):
            return int(v)
        h = b.get("hits")
        d = b.get("doubles")
        t = b.get("triples")
        hr = b.get("homeRuns")
        if all(isinstance(x, int) for x in (h, d, t, hr)):
            singles = h - d - t - hr
            return singles + 2 * d + 3 * t + 4 * hr
        return None
    if market == "batter_hits_runs_rbis":
        # PR `fix/public-risk-pending-audit` (2026-05-29) — the
        # H+R+RBI prop sums three independent batting stats from a
        # single box-score row. The MLB Stats API exposes each one
        # directly under `stats.batting`:
        #
        #   hits   ← b["hits"]
        #   runs   ← b["runs"]
        #   rbi    ← b["rbi"]
        #
        # We require the batter to have actually appeared (atBats or
        # plateAppearances > 0) so a benched player doesn't get
        # graded as 0-0-0 = 0. Returns None for an absent batter so
        # the grader treats the leg as "stats_unavailable" honestly.
        b = stats.get("batting") or {}
        ab = b.get("atBats")
        pa = b.get("plateAppearances")
        if not b or ((ab is None or int(ab) == 0) and (pa is None or int(pa) == 0)):
            return None
        h = b.get("hits")
        r = b.get("runs")
        rbi = b.get("rbi")
        if all(isinstance(x, (int, str)) and str(x).strip() not in ("", "-") for x in (h, r, rbi)):
            return int(h) + int(r) + int(rbi)
        return None
    return None


# ---------------------------------------------------------------------------
# Grade rule
# ---------------------------------------------------------------------------
def _grade(side: str, line: float, actual: float) -> str:
    if actual > line:
        return "Win" if side == "Over" else "Loss"
    if actual < line:
        return "Win" if side == "Under" else "Loss"
    return "Push"


def aggregate_outcomes(settled_rows: list[dict]) -> dict:
    """Outcome accounting with the DECISIVE denominator (Program 092-095 §6.3).

    Decisive = Win + Loss only. Push, Void, and any other non-decisive outcome are counted
    explicitly and NEVER enter the hit-rate denominator. 2026-07-30 is the canonical example:
    162 W / 206 L / 17 Void → hit rate 162/368 = 44.02%, not 162/385 = 42.08%. Keeping
    `settled` and `decisive` as separate named fields makes conflating them a visible bug
    rather than a silent one.
    """
    wins = sum(1 for r in settled_rows if r["outcome"] == "Win")
    losses = sum(1 for r in settled_rows if r["outcome"] == "Loss")
    pushes = sum(1 for r in settled_rows if r["outcome"] == "Push")
    voids = len(settled_rows) - wins - losses - pushes
    decisive = wins + losses
    return {
        "settled": len(settled_rows),
        "wins": wins,
        "losses": losses,
        "pushes": pushes,
        "voids": voids,
        "decisive": decisive,
        "hitRate": (wins / decisive) if decisive > 0 else None,
    }


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
GRADABLE_MARKETS = {
    "pitcher_strikeouts",
    "batter_hits",
    "batter_total_bases",
    # PR `fix/public-risk-pending-audit` (2026-05-29) — the optimizer
    # has been generating H+R+RBI props for weeks; the grader was
    # silently dropping every settlement as "unsupported market",
    # which propagated as `result="unresolved"` on the leg and a
    # blanket `status="pending"` on every publicRiskSections slip
    # that contained one. The new `_stat_for_market` clause above
    # computes the actual H+R+RBI from the box score.
    "batter_hits_runs_rbis",
}


def _is_suspended(status: dict) -> bool:
    """True when a game is officially suspended/postponed (and not Final) — a
    rain/weather suspension or a postponement that the schedule has not closed out."""
    if status.get("abstractState") == "Final":
        return False
    ds = (status.get("detailedState") or "").lower()
    return "suspend" in ds or "postpon" in ds



def _lineage_fields(lean: dict) -> dict:
    """Canonical lineage for a settled row.

    SPRINT 045. `gameId` (the provider's event id) is an ALIAS, not identity — that inversion is what
    Sprint 041 got wrong and Sprint 044 measured the cost of. The canonical `eventId` includes the
    scheduled start to the minute, which is precisely what distinguishes the two halves of a
    doubleheader; `providerEventId` is retained alongside it so the join stays auditable.
    """
    names = [n for n in (lean.get("homeTeamName"), lean.get("awayTeamName")) if n]
    return {
        "eventId": derive_event_id(
            sport="mlb", league="MLB",
            participant_names=names,
            scheduled_start=lean.get("commenceTime"),
        ) if names else None,
        "providerEventId": lean.get("gameId"),
        "eventStartTime": lean.get("commenceTime"),
        "settlementSource": "mlb-statsapi-boxscore",
    }


def settle(date_iso: str, *, board_path: Path | None = None, void_suspended: bool = False) -> dict:
    """Run settlement for `date_iso`. Returns the comparison-report dict.

    `void_suspended` applies the suspended/rescheduled-game NO-ACTION rule: when an
    operator elects to close the date's slate, every leg tied to an officially
    suspended/postponed (non-Final) game settles as VOID (outcome "Postponed") for the
    ORIGINAL date — never a win/loss/pending. No fabricated stats; the resumed game can
    be regenerated/settled later as its own slate.
    """
    bpath = board_path or (
        C.APP_PUBLIC_DATA / "mlb" / "boards" / f"{date_iso}.json"
    )
    if not bpath.exists():
        raise MlbSettleError(f"board file not found: {bpath}")
    board = json.loads(bpath.read_text())
    leans = board.get("leans", []) or []
    print(f"[settle] board loaded — {len(leans)} leans")

    status_map = schedule_game_status_map(date_iso)
    final_pks = {pk for pk, s in status_map.items() if s["abstractState"] == "Final"}
    suspended_pks = {pk for pk, s in status_map.items() if _is_suspended(s)} if void_suspended else set()
    print(f"[settle] schedule audited — {len(final_pks)} final games"
          + (f", {len(suspended_pks)} suspended→no-action" if void_suspended else ""))

    # Fetch boxscores once per final game (idempotent + cache-friendly to caller)
    boxes: dict[int, dict] = {}
    for pk in sorted(final_pks):
        try:
            boxes[pk] = fetch_boxscore(pk)
            time.sleep(0.1)  # polite
        except MlbSettleError as e:
            print(f"[settle] WARN boxscore {pk} failed: {e}")

    settled_rows: list[dict] = []
    name_fallback_notes: list[str] = []
    actual_unavailable: list[str] = []

    for lean in leans:
        market = lean.get("marketKey")
        gpk = lean.get("gamePk")
        if market not in GRADABLE_MARKETS:
            continue
        if void_suspended and gpk in suspended_pks:
            # Suspended/rescheduled NO-ACTION rule: close the original-date paper slate.
            # The leg voids (refunded) — never graded from the eventual resumed-game stats.
            side = lean.get("lean")
            if side in (None, "Pass", "No Play"):
                continue
            settled_rows.append({
                **_lineage_fields(lean),
                "id": lean.get("id"), "date": date_iso, "gamePk": gpk,
                "gameId": lean.get("gameId"), "playerId": lean.get("playerId"),
                "playerName": lean.get("playerName"),
                "playerTeamAbbr": lean.get("playerTeamAbbr"),
                "opponentAbbr": lean.get("opponentAbbr"),
                "playerRole": lean.get("playerRole"),
                "marketKey": market, "marketLabel": lean.get("marketLabel"),
                "line": float(lean["line"]) if lean.get("line") is not None else None,
                "lean": side, "confidence": lean.get("confidence"),
                "projection": float(lean["projection"]) if lean.get("projection") is not None else None,
                "edgePct": lean.get("edgePct"),
                "modelProbOver": lean.get("modelProbOver"),
                "modelProbUnder": lean.get("modelProbUnder"),
                "actual": None, "outcome": "Void", "graded": True,
                "voidReason": "officially suspended/rescheduled — no action for the original slate",
                "settledAt": datetime.now(timezone.utc).isoformat(),
            })
            continue
        if gpk not in final_pks:
            # Game not Final — leave pending
            continue
        # Excluded from decisive
        line = lean.get("line")
        side = lean.get("lean")
        proj = lean.get("projection")
        conf = lean.get("confidence")
        if conf == "insufficient_data":
            continue
        if side in (None, "Pass", "No Play"):
            continue
        if line is None or proj is None:
            continue

        box = boxes.get(gpk)
        if box is None:
            # Final game but boxscore fetch failed — record as actual_unavailable
            actual_unavailable.append(
                f"{lean.get('playerName')} ({market}) — boxscore unavailable for gamePk {gpk}"
            )
            continue

        rec, method = _find_player_in_box(box, lean.get("playerId"), lean.get("playerName", ""))
        if rec is None:
            actual_unavailable.append(
                f"{lean.get('playerName')} ({market}) — not in boxscore for gamePk {gpk}"
            )
            continue
        if method == "name":
            name_fallback_notes.append(
                f"{lean.get('playerName')} (gamePk {gpk}) matched by name fallback"
            )

        actual = _stat_for_market(rec, market)
        if actual is None:
            # The player is IN the final box score but has no qualifying batting line.
            # 0-AB / no-PA RULE: a hitter prop VOIDS (DNP) when the batter recorded no
            # plate appearance — appeared only defensively / as a pinch runner, or has an
            # empty batting line. Never a win/loss. Pitcher props with no line stay
            # unresolved (a role/data issue, not a clean DNP).
            if market in ("batter_hits", "batter_total_bases", "batter_hits_runs_rbis"):
                bat = (rec.get("stats", {}) or {}).get("batting") or {}
                pa = bat.get("plateAppearances")
                ab = bat.get("atBats")
                no_pa = (pa is None or int(pa) == 0) and (ab is None or int(ab) == 0)
                if no_pa:
                    settled_rows.append({
                        **_lineage_fields(lean),
                        "id": lean.get("id"), "date": date_iso, "gamePk": gpk,
                        "gameId": lean.get("gameId"), "playerId": lean.get("playerId"),
                        "playerName": lean.get("playerName"),
                        "playerTeamAbbr": lean.get("playerTeamAbbr"),
                        "opponentAbbr": lean.get("opponentAbbr"),
                        "playerRole": lean.get("playerRole"),
                        "marketKey": market, "marketLabel": lean.get("marketLabel"),
                        "line": float(line), "lean": side, "confidence": conf,
                        "projection": float(proj) if proj is not None else None,
                        "edgePct": lean.get("edgePct"),
                        "modelProbOver": lean.get("modelProbOver"),
                        "modelProbUnder": lean.get("modelProbUnder"),
                        "actual": None, "outcome": "Void", "graded": True,
                        "voidReason": "no plate appearance (DNP / 0-AB)",
                        "matchMethod": method,
                        "settledAt": datetime.now(timezone.utc).isoformat(),
                    })
                    continue
            actual_unavailable.append(
                f"{lean.get('playerName')} ({market}) — actual stat unavailable (player didn't appear)"
            )
            continue

        outcome = _grade(side, float(line), float(actual))
        settled_rows.append(
            {
                **_lineage_fields(lean),
                "id": lean.get("id"),
                "date": date_iso,
                "gamePk": gpk,
                "gameId": lean.get("gameId"),
                "playerId": lean.get("playerId"),
                "playerName": lean.get("playerName"),
                "playerTeamAbbr": lean.get("playerTeamAbbr"),
                "opponentAbbr": lean.get("opponentAbbr"),
                "playerRole": lean.get("playerRole"),
                "marketKey": market,
                "marketLabel": lean.get("marketLabel"),
                "line": float(line),
                "lean": side,
                "confidence": conf,
                "projection": float(proj) if proj is not None else None,
                "edgePct": lean.get("edgePct"),
                "modelProbOver": lean.get("modelProbOver"),
                "modelProbUnder": lean.get("modelProbUnder"),
                "actual": float(actual),
                "outcome": outcome,
                "graded": True,
                "matchMethod": method,
                "settledAt": datetime.now(timezone.utc).isoformat(),
            }
        )

    # ---------- Aggregation ----------
    agg = aggregate_outcomes(settled_rows)
    wins, losses, pushes, voids = agg["wins"], agg["losses"], agg["pushes"], agg["voids"]
    decisive_n = agg["decisive"]
    hit_rate = agg["hitRate"]

    def _bucket(by_key):
        buckets: dict[str, dict] = {}
        for r in settled_rows:
            k = by_key(r)
            if k is None:
                continue
            b = buckets.setdefault(
                k,
                {"label": k, "total": 0, "wins": 0, "losses": 0, "pushes": 0, "voids": 0, "hitRate": None},
            )
            b["total"] += 1
            if r["outcome"] == "Win":
                b["wins"] += 1
            elif r["outcome"] == "Loss":
                b["losses"] += 1
            elif r["outcome"] == "Push":
                b["pushes"] += 1
            else:
                # Void / unavailable — never a push, never decisive.
                b["voids"] += 1
        for b in buckets.values():
            dec = b["wins"] + b["losses"]
            b["hitRate"] = (b["wins"] / dec) if dec > 0 else None
        return buckets

    by_market = _bucket(lambda r: r["marketKey"])
    by_confidence = _bucket(lambda r: r["confidence"])
    by_game = _bucket(lambda r: str(r["gamePk"]))

    # Augment per-game with friendly matchup + game date label
    for gpk_str, b in by_game.items():
        s = status_map.get(int(gpk_str))
        if s:
            b["matchup"] = f"{s['awayAbbr']} @ {s['homeAbbr']}"
            b["gameDate"] = s["gameDate"]

    # Top hits — biggest absolute-edge wins (clean = no R5 anomaly)
    def _row_with_anomaly_flag(r):
        # Find original lean to check riskFlags
        lean = next((l for l in leans if l.get("id") == r["id"]), None)
        anomaly = bool(lean and "r5_model_anomaly" in (lean.get("riskFlags") or []))
        return {**r, "isAnomaly": anomaly}

    settled_with_flag = [_row_with_anomaly_flag(r) for r in settled_rows]
    wins_rows = [r for r in settled_with_flag if r["outcome"] == "Win"]
    losses_rows = [r for r in settled_with_flag if r["outcome"] == "Loss"]

    top_hits = sorted(
        wins_rows,
        key=lambda r: abs(r.get("edgePct") or 0),
        reverse=True,
    )[:8]
    biggest_misses = sorted(
        losses_rows,
        key=lambda r: abs((r.get("projection") or 0) - r["actual"]),
        reverse=True,
    )[:8]

    pending_games = sorted(
        [
            {
                "gamePk": pk,
                "matchup": f"{s['awayAbbr']} @ {s['homeAbbr']}",
                "abstractState": s["abstractState"],
                "detailedState": s["detailedState"],
            }
            for pk, s in status_map.items()
            if s["abstractState"] != "Final"
        ],
        key=lambda x: x["gamePk"],
    )

    report = {
        "sport": "MLB",
        "date": date_iso,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scheduledGames": len(status_map),
        "finalGames": len(final_pks),
        "finalGamesSettled": len({r["gamePk"] for r in settled_rows}),
        "pendingGames": len(pending_games),
        "partial": len(pending_games) > 0,
        "settled": agg["settled"],
        "decisive": decisive_n,
        "wins": wins,
        "losses": losses,
        "pushes": pushes,
        "voids": voids,
        "hitRate": round(hit_rate, 4) if hit_rate is not None else None,
        "smallSample": decisive_n < 25,
        "byMarket": by_market,
        "byConfidence": by_confidence,
        "byGame": by_game,
        "topHits": top_hits,
        "biggestMisses": biggest_misses,
        "unavailableCount": len(actual_unavailable),
        "unavailable": actual_unavailable[:40],
        "pendingGameList": pending_games,
        "nameFallbackCount": len(name_fallback_notes),
        "nameFallbackNotes": name_fallback_notes[:40],
    }

    # ---------- Write internal outputs ----------
    SETTLED_LEANS_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Idempotent: read existing, replace rows with same id, write back.
    existing: dict[str, dict] = {}
    if SETTLED_LEANS_PATH.exists():
        for line_text in SETTLED_LEANS_PATH.read_text().splitlines():
            line_text = line_text.strip()
            if not line_text:
                continue
            try:
                obj = json.loads(line_text)
                if obj.get("id"):
                    existing[obj["id"]] = obj
            except Exception:
                continue
    for r in settled_rows:
        if r.get("id"):
            existing[r["id"]] = r
    # SPRINT 045: fail closed BEFORE the ledger write. Only the rows THIS run produced are gated —
    # historical rows predate the lineage fields and are preserved untouched, which is deliberate:
    # rewriting them would destroy the evidence that makes the Sprint 044 corruption provable.
    assert_settlement_lineage(settled_rows, date=date_iso)
    SETTLED_LEANS_PATH.write_text(
        "\n".join(json.dumps(v) for v in existing.values()) + ("\n" if existing else "")
    )

    report_path = (
        C.ROOT_DIR
        / "pipeline"
        / "validation"
        / f"mlb_comparison_report_{date_iso}.json"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2))

    print(
        f"[settle] settled={agg['settled']} decisive={decisive_n} wins={wins} losses={losses} "
        f"pushes={pushes} voids={voids} hit_rate={report['hitRate']} "
        f"pending_games={len(pending_games)} unavailable={len(actual_unavailable)}"
    )
    print(f"[settle] wrote {SETTLED_LEANS_PATH.relative_to(C.ROOT_DIR)} ({len(existing)} rows total)")
    print(f"[settle] wrote {report_path.relative_to(C.ROOT_DIR)}")

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Settle MLB props for a date.")
    parser.add_argument("--date", default="2026-05-16", help="YYYY-MM-DD")
    parser.add_argument(
        "--board",
        help="optional path override for the published board JSON",
    )
    parser.add_argument(
        "--void-suspended",
        action="store_true",
        help="apply the suspended/rescheduled NO-ACTION rule — void every leg tied to an "
        "officially suspended/postponed (non-Final) game for this date (closes the slate)",
    )
    args = parser.parse_args(argv)
    board_path = Path(args.board) if args.board else None
    settle(args.date, board_path=board_path, void_suspended=args.void_suspended)
    return 0


if __name__ == "__main__":
    sys.exit(main())
