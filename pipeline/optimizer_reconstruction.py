"""RECONSTRUCTED optimizer receipts for the pre-receipt period — built by replay, never passed off as genuine.

The optimizer snapshots for 2026-10-08, 2026-10-09 and 2026-10-10 were written before the producer recorded
a `generationReceipt`, so the Ask guard cannot verify their emptiness from the snapshot alone. Under the founder's
decision (B'), this module reconstructs evidence for them WITHOUT touching the snapshots:

  * the committed snapshot stays byte-identical; it is identified by path, git commit and sha256;
  * the as-of inputs are reconstructed from git (the board as committed with the snapshot, and the selection
    policy + market reliability as they stood in the snapshot commit's parent — the files the run read), each
    with path, git commit and sha256; the two policy files are stored verbatim beside the receipt so the
    replay can be re-run without git history;
  * the optimizer is replayed on exactly those inputs, and the receipt records whether the replay reproduces
    the committed snapshot (public risk sections, leg pool, internal buckets, totalSlips);
  * the receipt carries the replay's classification (outcome + per-section empty reason), its ACTUAL creation
    time, `receiptKind: "RECONSTRUCTED"` and `genuineProducerReceipt: false`. It is not, and must never be
    read as, proof that the producer emitted it on that date.

A replay that does not reproduce is still written, with `reproduction.reproduced: false`, so the failure is on
record; the CLI exits non-zero and the Ask guard rejects it.

CLI (repo root, needs git history):
    python -m pipeline.optimizer_reconstruction --date 2026-10-08 --snapshot-commit ec54dd8b4f

`verify_receipt` re-runs the replay from the stored inputs (no git needed); the CI test
pipeline/optimizer_reconstruction_test.py calls it for every committed reconstruction.
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from . import parlay_optimizer as po
from . import snapshot_optimizer as so

REPO = Path(__file__).resolve().parents[1]
RECON_DIR = Path("data") / "internal" / "parlays" / "optimizer-reconstruction"
RECEIPTS_DIR = RECON_DIR / "receipts"
INPUTS_DIR = RECON_DIR / "inputs"

POLICY_PATH = "app/public/data/learning/selection-policy-latest.json"
RELIABILITY_PATH = "app/public/data/audit/market-reliability.json"
SNAPSHOT_PATH = "app/public/data/parlays/optimizer/{date}.json"
BOARD_PATHS = {"mlb": "app/public/data/mlb/boards/{date}.json", "nba": "app/public/data/boards/{date}.json"}

NOTICE = (
    "RECONSTRUCTED after the fact by replaying pipeline.snapshot_optimizer on its as-of inputs. "
    "NOT emitted by the producer on {date}, and not proof of what the producer recorded at the time. "
    "The committed snapshot is unchanged and bound here by sha256."
)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(rel: str | Path) -> str | None:
    p = REPO / rel
    return sha256_bytes(p.read_bytes()) if p.exists() else None


def _git_show(commit: str, rel: str) -> bytes:
    return subprocess.run(["git", "-C", str(REPO), "show", f"{commit}:{rel}"], check=True, capture_output=True).stdout


def _git_rev(ref: str) -> str:
    return subprocess.run(["git", "-C", str(REPO), "rev-parse", ref], check=True, capture_output=True, text=True).stdout.strip()


@contextlib.contextmanager
def as_of_inputs(policy: Path, reliability: Path) -> Iterator[None]:
    """Point the optimizer's two file inputs at the as-of copies for the duration of a replay, then restore.
    Changes nothing about how the optimizer selects — only which file it reads."""
    saved = (po._LEARNING_POLICY_PATH, po._RELIABILITY_PATH, po._reliability_cache,
             po._active_selection_policy, po._active_selection_policy_meta)
    po._LEARNING_POLICY_PATH, po._RELIABILITY_PATH, po._reliability_cache = Path(policy), Path(reliability), None
    try:
        yield
    finally:
        (po._LEARNING_POLICY_PATH, po._RELIABILITY_PATH, po._reliability_cache,
         po._active_selection_policy, po._active_selection_policy_meta) = saved


def replay(date: str, policy: Path, reliability: Path) -> dict[str, Any]:
    cwd = os.getcwd()
    os.chdir(REPO)  # the lean loaders read repo-relative paths
    try:
        with as_of_inputs(policy, reliability):
            return so.build_optimizer_snapshot(date)
    finally:
        os.chdir(cwd)


def compare(original: dict[str, Any], replayed: dict[str, Any]) -> dict[str, bool]:
    r = {
        "publicRiskSectionsEqual": original.get("publicRiskSections") == replayed.get("publicRiskSections"),
        "legPoolLegsEqual": (original.get("legPool") or {}).get("legs") == (replayed.get("legPool") or {}).get("legs"),
        "bucketsEqual": original.get("buckets") == replayed.get("buckets"),
        "totalSlipsEqual": original.get("totalSlips") == replayed.get("totalSlips"),
        "sourcePoolsEqual": original.get("sourcePools") == replayed.get("sourcePools"),
    }
    r["reproduced"] = all(r.values())
    return r


def classification_of(replayed: dict[str, Any]) -> dict[str, Any]:
    """The replay's own classification, stripped of the replay's run identity (its generatedAt / kind)."""
    g = copy.deepcopy(replayed["generationReceipt"])
    for k in ("generatedAt", "receiptKind", "producer", "status", "date"):
        g.pop(k, None)
    return g


def reconstruct(date: str, snapshot_commit: str, *, now: str | None = None) -> dict[str, Any]:
    snapshot_commit = _git_rev(snapshot_commit)
    inputs_commit = _git_rev(f"{snapshot_commit}^")
    snap_rel = SNAPSHOT_PATH.format(date=date)
    snap_bytes = (REPO / snap_rel).read_bytes()
    if _git_show(snapshot_commit, snap_rel) != snap_bytes:
        raise SystemExit(f"{snap_rel} on disk is not the snapshot committed in {snapshot_commit}")
    original = json.loads(snap_bytes)

    os.makedirs(REPO / INPUTS_DIR, exist_ok=True)
    stored: dict[str, Any] = {}
    for role, rel in (("selectionPolicy", POLICY_PATH), ("marketReliability", RELIABILITY_PATH)):
        blob = _git_show(inputs_commit, rel)
        if _git_show(snapshot_commit, rel) != blob:
            raise SystemExit(f"{rel} changed inside {snapshot_commit} — the run's as-of input is ambiguous")
        digest = sha256_bytes(blob)
        copy_rel = INPUTS_DIR / f"{Path(rel).stem}@{digest[:12]}.json"
        (REPO / copy_rel).write_bytes(blob)
        stored[role] = {"path": rel, "gitCommit": inputs_commit, "sha256": digest, "storedCopy": str(copy_rel)}

    boards: dict[str, Any] = {}
    for sport, tmpl in BOARD_PATHS.items():
        rel = tmpl.format(date=date)
        digest = sha256_file(rel)
        if digest is None:
            boards[sport] = {"path": rel, "present": False}
            continue
        if sha256_bytes(_git_show(snapshot_commit, rel)) != digest:
            raise SystemExit(f"{rel} on disk is not the board committed with the snapshot in {snapshot_commit}")
        boards[sport] = {"path": rel, "present": True, "gitCommit": snapshot_commit, "sha256": digest}

    replayed = replay(date, REPO / stored["selectionPolicy"]["storedCopy"], REPO / stored["marketReliability"]["storedCopy"])
    return {
        "receiptKind": "RECONSTRUCTED",
        "genuineProducerReceipt": False,
        "notice": NOTICE.format(date=date),
        "receiptVersion": so.RECEIPT_VERSION,
        "reconstructor": "pipeline.optimizer_reconstruction",
        "reconstructedAt": now or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "date": date,
        "snapshot": {"path": snap_rel, "gitCommit": snapshot_commit, "sha256": sha256_bytes(snap_bytes),
                     "generatedAt": original.get("generatedAt")},
        "inputs": {"boards": boards, **stored},
        "reproduction": compare(original, replayed),
        "classification": classification_of(replayed),
    }


def verify_receipt(receipt: dict[str, Any]) -> list[str]:
    """Re-check a committed reconstruction against the files on disk and a fresh replay. [] means it holds."""
    problems: list[str] = []
    date = receipt.get("date")
    if receipt.get("receiptKind") != "RECONSTRUCTED" or receipt.get("genuineProducerReceipt") is not False:
        problems.append("not marked RECONSTRUCTED / genuineProducerReceipt false")
    snap = receipt.get("snapshot") or {}
    if snap.get("path") != SNAPSHOT_PATH.format(date=date):
        problems.append(f"snapshot path {snap.get('path')} is not the snapshot for {date}")
    if sha256_file(snap.get("path", "")) != snap.get("sha256"):
        problems.append("committed snapshot sha256 differs from the receipt")
        return problems
    original = json.loads((REPO / snap["path"]).read_text(encoding="utf-8"))
    if original.get("generationReceipt"):
        problems.append("the snapshot carries a genuine receipt — a reconstruction is not allowed for it")
    if original.get("generatedAt") != snap.get("generatedAt"):
        problems.append("snapshot generatedAt differs from the receipt")
    if not (receipt.get("reconstructedAt") or "") > (original.get("generatedAt") or "~"):
        problems.append("reconstructedAt is not after the original run — a reconstruction cannot claim to be contemporaneous")
    ins = receipt.get("inputs") or {}
    for sport, b in (ins.get("boards") or {}).items():
        if b.get("present") and sha256_file(b.get("path", "")) != b.get("sha256"):
            problems.append(f"{sport} board sha256 differs from the receipt")
        if not b.get("present") and sha256_file(BOARD_PATHS[sport].format(date=date)) is not None:
            problems.append(f"{sport} board exists now but the receipt says it was absent")
    for role in ("selectionPolicy", "marketReliability"):
        r = ins.get(role) or {}
        if not r.get("storedCopy") or sha256_file(r["storedCopy"]) != r.get("sha256"):
            problems.append(f"{role} stored copy is missing or its sha256 differs from the receipt")
    if problems:
        return problems
    replayed = replay(date, REPO / ins["selectionPolicy"]["storedCopy"], REPO / ins["marketReliability"]["storedCopy"])
    rep = compare(original, replayed)
    if rep != receipt.get("reproduction"):
        problems.append(f"replay reproduction {rep} differs from the recorded {receipt.get('reproduction')}")
    if not rep["reproduced"]:
        problems.append("the replay does not reproduce the committed snapshot")
    fresh = classification_of(replayed)
    if fresh != receipt.get("classification"):
        problems.append("the replay's classification differs from the recorded one")
    return problems


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True)
    p.add_argument("--snapshot-commit", required=True, help="the commit that wrote the snapshot")
    args = p.parse_args(argv)
    receipt = reconstruct(args.date, args.snapshot_commit)
    os.makedirs(REPO / RECEIPTS_DIR, exist_ok=True)
    out = REPO / RECEIPTS_DIR / f"{args.date}.json"
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    rep = receipt["reproduction"]
    print(f"[reconstruction] {args.date} reproduced={rep['reproduced']} outcome={receipt['classification']['outcome']} → {out.relative_to(REPO)}")
    return 0 if rep["reproduced"] else 1


if __name__ == "__main__":
    sys.exit(main())
