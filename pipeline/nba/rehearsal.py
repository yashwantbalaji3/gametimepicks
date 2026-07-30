"""NBA preseason dress rehearsal — one command, one go/no-go artifact.

Procedure and interpretation: docs/NBA_PRESEASON_DRESS_REHEARSAL.md.

    python -m pipeline.nba.rehearsal --date 2026-10-14

READ-ONLY. This runs no ingest and writes no artifact unless `--out` is given. It reads what the
capture step produced and reports, stage by stage, whether the adapter did what gates G2/G3/G4 ask
of it — on a real slate, which is the only place those gates can be graded.

WHY A STAGED VERDICT RATHER THAN A PASS/FAIL
"The rehearsal worked" is the claim that would be least useful to check later. Each stage names one
requirement and reports its own evidence, so a NO_GO says which requirement failed and on how many
rows. A stage that cannot run reports UNAVAILABLE and the verdict is NO_GO — fail closed, because a
check that did not run is not a check that passed.

The identity stage delegates to the canonical TypeScript implementation rather than re-deriving team
resolution in Python. One identity implementation per sport; a Python copy of the 30-tricode contract
would be a second one, and the two would drift.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from pipeline.nba import settle_results as nba_settle
from pipeline.nba.board_schema import research_eligible, validate_new_board_row

ROOT = Path(__file__).resolve().parents[2]

PASS = "PASS"
FAIL = "FAIL"
UNAVAILABLE = "UNAVAILABLE"
INFORMATIONAL = "INFORMATIONAL"

# Stages whose PASS is required for a GO. `movement` is excluded on purpose: a preseason slate may
# legitimately have one capture per event, and the correct response is to make no movement claim —
# not to fail the rehearsal.
REQUIRED_STAGES = ("schedule", "tipoff", "eligibility", "identity", "devig", "settlement", "population")

IDENTITY_CHECK_COMMAND = (
    "npx", "tsx", "--test", "src/lib/nba/historical-boards-scale.test.mjs",
)


def _stage(name: str, status: str, detail: str, **evidence) -> dict:
    return {"stage": name, "status": status, "detail": detail, "evidence": evidence}


def _read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# De-vig — the first-class transformation for NBA game markets
# ---------------------------------------------------------------------------
def implied_probability(american: float | int | None) -> float | None:
    """American odds -> raw implied probability. None for a missing price; 0 is not a price."""
    if american is None or isinstance(american, bool):
        return None
    try:
        odds = float(american)
    except (TypeError, ValueError):
        return None
    if odds == 0:
        return None
    return 100.0 / (odds + 100.0) if odds > 0 else (-odds) / (-odds + 100.0)


def devig_two_way(
    american_a: float | int | None, american_b: float | int | None
) -> tuple[float, float] | None:
    """Remove the vig from a two-sided market by proportional normalization.

    Returns None when either side is missing. A one-sided market has no vig to remove — the overround
    is only measurable across both sides, and normalizing one price against itself would return 1.0
    and look like certainty.
    """
    a = implied_probability(american_a)
    b = implied_probability(american_b)
    if a is None or b is None:
        return None
    total = a + b
    if total <= 0:
        return None
    return (a / total, b / total)


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------
def _stage_schedule(board: dict | None, date: str) -> tuple[dict, list[dict]]:
    if board is None:
        return _stage("schedule", FAIL, f"no board artifact for {date}"), []
    rows = board.get("games") or []
    if not rows:
        return (
            _stage(
                "schedule",
                FAIL,
                f"board for {date} carries no games (emptySlateClassification "
                f"{board.get('emptySlateClassification')!r})",
                emptySlateClassification=board.get("emptySlateClassification"),
                dataMode=board.get("dataMode"),
            ),
            [],
        )
    return _stage("schedule", PASS, f"{len(rows)} game(s) captured", games=len(rows)), rows


def _stage_tipoff(rows: list[dict]) -> dict:
    missing = [r.get("gameId") for r in rows if not r.get("tipoffIso")]
    if missing:
        return _stage(
            "tipoff",
            FAIL,
            f"{len(missing)} of {len(rows)} game(s) carry no ISO tip-off instant — leakage safety "
            f"is unprovable for them",
            missingGameIds=missing[:10],
        )
    return _stage("tipoff", PASS, f"all {len(rows)} game(s) carry an ISO tip-off instant")


def _stage_eligibility(rows: list[dict]) -> dict:
    violations: list[str] = []
    for row in rows:
        violations.extend(validate_new_board_row(row))
    eligible = [r for r in rows if research_eligible(r.get("capturedAt"), r.get("tipoffIso"))]
    if violations:
        return _stage(
            "eligibility",
            FAIL,
            f"{len(violations)} row-schema violation(s) — eligibility is not derivable from the row",
            violations=violations[:10],
        )
    if not eligible:
        return _stage(
            "eligibility",
            FAIL,
            f"0 of {len(rows)} rows were captured before tip-off — the capture ran too late",
            eligible=0,
            total=len(rows),
        )
    return _stage(
        "eligibility",
        PASS,
        f"{len(eligible)} of {len(rows)} rows captured strictly before tip-off",
        eligible=len(eligible),
        total=len(rows),
    )


def _stage_identity(runner) -> dict:
    """Delegate to the canonical TypeScript identity check.

    UNAVAILABLE rather than skipped when the toolchain is absent: a check that did not run is not a
    check that passed, and the verdict treats it as blocking.
    """
    try:
        ok, output = runner(IDENTITY_CHECK_COMMAND)
    except Exception as e:  # toolchain missing, sandbox, etc.
        return _stage("identity", UNAVAILABLE, f"identity check could not run: {e}")
    if not ok:
        return _stage(
            "identity",
            FAIL,
            "the canonical identity check refused — some row resolves to zero or several games",
            output=output[-2000:],
        )
    return _stage("identity", PASS, "every schedule row resolves injectively or refuses explicitly")


def _stage_devig(markets: dict | None, date: str) -> dict:
    if markets is None:
        return _stage("devig", FAIL, f"no game-markets artifact for {date}")
    games = markets.get("games") or {}
    if not games:
        return _stage("devig", FAIL, f"game-markets artifact for {date} carries no games")

    devigged = 0
    unpriced: list[str] = []
    for gid, g in games.items():
        ml = g.get("moneyline") or {}
        if devig_two_way(ml.get("home"), ml.get("away")) is None:
            unpriced.append(gid)
        else:
            devigged += 1
    if devigged == 0:
        return _stage(
            "devig",
            FAIL,
            f"no two-sided moneyline in {len(games)} game(s) — nothing to de-vig",
            unpriced=unpriced[:10],
        )
    return _stage(
        "devig",
        PASS,
        f"{devigged} of {len(games)} game(s) de-vig to a two-sided probability pair",
        devigged=devigged,
        unpriced=unpriced[:10],
    )


def _stage_movement(captures: list[dict]) -> dict:
    """Movement is only real when several captures of the same event exist.

    INFORMATIONAL, never required. One capture is a legitimate preseason outcome; the correct
    response is to make no movement claim, which is what this stage records.
    """
    per_event: dict[str, int] = {}
    for capture in captures:
        for gid in (capture.get("games") or {}):
            per_event[gid] = per_event.get(gid, 0) + 1
    multi = {gid: n for gid, n in per_event.items() if n > 1}
    if not multi:
        return _stage(
            "movement",
            INFORMATIONAL,
            f"{len(captures)} capture(s); no event has more than one — movement must not be claimed",
            eventsWithMultipleCaptures=0,
        )
    return _stage(
        "movement",
        INFORMATIONAL,
        f"{len(multi)} event(s) have multiple captures — movement is describable for those only",
        eventsWithMultipleCaptures=len(multi),
    )


def _stage_settlement(settled_rows: list[dict], date: str) -> dict:
    if not settled_rows:
        return _stage("settlement", FAIL, f"no settled rows for {date}")
    report = nba_settle.dry_run_lineage(settled_rows, date=date)
    if not report["wouldWrite"]:
        return _stage(
            "settlement",
            FAIL,
            f"the lineage gate refuses {report['gradedRows']} graded row(s)",
            violations=report["violations"][:10],
            gradedRows=report["gradedRows"],
        )
    return _stage(
        "settlement",
        PASS,
        f"{report['gradedRows']} graded row(s) trace prediction -> event -> market -> official source",
        gradedRows=report["gradedRows"],
        settledRows=report["settledRows"],
    )


def _stage_population(rows: list[dict], markets: dict | None) -> dict:
    """Reconcile the two populations. A gap in either direction is a defect, not a rounding error."""
    scheduled = {str(r.get("gameId")) for r in rows if r.get("gameId")}
    priced = {str(k) for k in ((markets or {}).get("games") or {})}
    missing_markets = sorted(scheduled - priced)
    orphan_markets = sorted(priced - scheduled)
    if missing_markets or orphan_markets:
        return _stage(
            "population",
            FAIL,
            f"{len(missing_markets)} scheduled game(s) have no market and "
            f"{len(orphan_markets)} market(s) match no scheduled game",
            missingMarkets=missing_markets[:10],
            orphanMarkets=orphan_markets[:10],
        )
    return _stage(
        "population",
        PASS,
        f"{len(scheduled)} scheduled game(s) reconcile one-to-one with the market artifact",
        games=len(scheduled),
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def _default_identity_runner(command: tuple[str, ...]) -> tuple[bool, str]:
    proc = subprocess.run(
        list(command), cwd=ROOT / "app", capture_output=True, text=True, timeout=600
    )
    return proc.returncode == 0, (proc.stdout or "") + (proc.stderr or "")


def run_rehearsal(
    date: str,
    *,
    root: Path | None = None,
    identity_runner=_default_identity_runner,
) -> dict:
    """Run every stage for `date` and return the go/no-go artifact. Reads only."""
    base = root or ROOT
    board = _read_json(base / "app" / "public" / "data" / "boards" / f"{date}.json")
    markets = _read_json(base / "app" / "public" / "data" / "nba" / "game-markets" / f"{date}.json")

    settled_path = base / "pipeline" / "validation" / "settled_leans.jsonl"
    settled_rows: list[dict] = []
    if settled_path.exists():
        for line in settled_path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("date") == date:
                settled_rows.append(row)

    schedule_stage, rows = _stage_schedule(board, date)
    stages = [
        schedule_stage,
        _stage_tipoff(rows),
        _stage_eligibility(rows),
        _stage_identity(identity_runner),
        _stage_devig(markets, date),
        _stage_movement([markets] if markets else []),
        _stage_settlement(settled_rows, date),
        _stage_population(rows, markets),
    ]

    by_name = {s["stage"]: s for s in stages}
    blocking = [
        name for name in REQUIRED_STAGES if by_name.get(name, {}).get("status") != PASS
    ]
    return {
        "date": date,
        "verdict": "GO" if not blocking else "NO_GO",
        "blockingStages": blocking,
        "stages": stages,
        "note": (
            "A GO verdict is evidence for gates G2/G3/G4, not a promotion. NBA moves to "
            "MARKET_INTELLIGENCE only with founder sign-off recorded in the promoting sprint's "
            "program ledger. See docs/MULTISPORT_PROMOTION_GATES.md."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="NBA preseason dress rehearsal (read-only).")
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--out", default=None, help="write the go/no-go artifact to this path")
    parser.add_argument(
        "--skip-identity",
        action="store_true",
        help="skip the TypeScript identity check; the stage reports UNAVAILABLE and the verdict is NO_GO",
    )
    args = parser.parse_args(argv)

    runner = (
        (lambda _cmd: (_ for _ in ()).throw(RuntimeError("skipped by --skip-identity")))
        if args.skip_identity
        else _default_identity_runner
    )
    report = run_rehearsal(args.date, identity_runner=runner)

    for stage in report["stages"]:
        print(f"[{stage['status']:<13}] {stage['stage']:<11} {stage['detail']}")
    print(f"\nverdict: {report['verdict']}")
    if report["blockingStages"]:
        print(f"blocking: {', '.join(report['blockingStages'])}")

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n")
        print(f"wrote {out}")
    return 0 if report["verdict"] == "GO" else 1


if __name__ == "__main__":
    raise SystemExit(main())
