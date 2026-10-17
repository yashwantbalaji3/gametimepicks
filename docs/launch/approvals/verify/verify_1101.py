#!/usr/bin/env python3
"""Post-merge verification for #1101 (nightly-settle historical stamp guard). Read-only; independent of the guard.

Usage (repo root, after `git fetch origin`):
    python3 -I docs/launch/approvals/verify/verify_1101.py <merge-sha> [--runs]

For every "auto: nightly settle" commit on origin/main after <merge-sha>:
  * FAIL if any MODIFIED past-dated (path date < the commit's ET date) JSON/JSONL file differs from its parent
    only in stamp keys (gradedAt, generatedAt, settledAt, checkedAt, builtAt, lastRunAt, updatedAt) with both
    sides non-empty strings — that is exactly the restamp the guard must stop;
  * reports past-dated files that DID change (real corrections — they must publish) and ADDED dated files
    (yesterday's new settlement — must publish);
  * reports whether the next "auto: forecast ledger" commit or run exists.
Then compares gradedAt values of 3 historical model-rows dates between <merge-sha>^ and origin/main: any
change must be accompanied by a non-stamp change in the same row (otherwise FAIL).
--runs greps the latest nightly-settle run logs for the guard's "restored N" line.
"""
import json, re, subprocess, sys, datetime
from zoneinfo import ZoneInfo

STAMP = {"gradedAt", "generatedAt", "settledAt", "checkedAt", "builtAt", "lastRunAt", "updatedAt"}
DATE = re.compile(r"(?:^|[/_-])(\d{4}-\d{2}-\d{2})(?=[./_-])")

def git(*a):
    r = subprocess.run(["git", *a], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

def load(t, f):
    return [json.loads(l) for l in t.split("\n") if l.strip()] if f.endswith(".jsonl") else json.loads(t)

def only_restamped(a, b):
    """True if a and b differ, and differ only in stamp keys holding non-empty strings on both sides."""
    diff = [False]
    def walk(x, y):
        if isinstance(x, dict) and isinstance(y, dict):
            if set(x) != set(y):
                return False
            for k in x:
                if k in STAMP and x[k] != y[k]:
                    if not (isinstance(x[k], str) and x[k] and isinstance(y[k], str) and y[k]):
                        return False
                    diff[0] = True
                elif k not in STAMP and not walk(x[k], y[k]):
                    return False
            return True
        if isinstance(x, list) and isinstance(y, list):
            return len(x) == len(y) and all(walk(p, q) for p, q in zip(x, y))
        return x == y and type(x) == type(y)
    return walk(a, b) and diff[0]

def main():
    merge = sys.argv[1]
    fails = 0
    log = [l.split("\t", 2) for l in (git("log", "origin/main", "--first-parent", "--reverse", "--format=%H\t%cI\t%s", f"{merge}..origin/main") or "").strip().split("\n") if l]
    settles = [(s, a) for s, a, m in log if m.startswith("auto: nightly settle")]
    ledgers = [(s, a) for s, a, m in log if m.startswith("auto: forecast ledger")]
    for sha, at in settles:
        today = datetime.datetime.fromisoformat(at).astimezone(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
        restamped, changed, added = [], [], []
        for line in (git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--name-status", sha) or "").strip().split("\n"):
            if not line:
                continue
            st, f = line.split("\t", 1)
            m = DATE.findall(f)
            if not m or m[-1] >= today or not re.search(r"\.jsonl?$", f):
                continue
            if st == "A":
                added.append(f)
                continue
            if st != "M":
                continue
            try:
                a, b = load(git("show", f"{sha}^:{f}"), f), load(git("show", f"{sha}:{f}"), f)
            except Exception:
                continue
            (restamped if only_restamped(a, b) else changed).append(f)
        if restamped:
            fails += 1
        print(f"{'FAIL' if restamped else 'OK  '} settle {sha[:10]} {at} today={today}: stamp-only past-dated {len(restamped)}"
              f" | real past-dated changes {len(changed)} | added dated {len(added)}")
        for f in restamped[:5]:
            print(f"      restamped: {f}")
        for f in changed[:5]:
            print(f"      changed (must publish): {f}")
    print(f"forecast-ledger commits since merge: {len(ledgers)}")
    base = f"{merge}^"
    dates = sorted({m for f in (git("ls-tree", "--name-only", base, "app/public/data/mlb/results/model-rows/") or "").split() for m in DATE.findall(f)})[-40:-37]
    for d in dates:
        p = f"app/public/data/mlb/results/model-rows/{d}.json"
        a, b = git("show", f"{base}:{p}"), git("show", f"origin/main:{p}")
        if a is None or b is None:
            continue
        same = a == b
        if not same and only_restamped(json.loads(a), json.loads(b)):
            fails += 1
            print(f"FAIL historical {p}: restamped since the merge")
        else:
            print(f"OK   historical {p}: {'byte-identical' if same else 'changed with content (a correction)'}")
    if "--runs" in sys.argv:
        for r in (subprocess.run(["gh", "run", "list", "--workflow", "nightly-settle.yml", "-L", "4", "--json", "databaseId", "--jq", ".[].databaseId"],
                                 capture_output=True, text=True).stdout.split()):
            lines = [l for l in subprocess.run(["gh", "run", "view", r, "--log"], capture_output=True, text=True).stdout.split("\n") if "historical-stamp-guard" in l]
            print(f"run {r}: {lines[-1].split('Z ', 1)[-1][:180] if lines else 'no guard line (pre-merge run)'}")
    print(f"\n{fails} failure(s)")
    sys.exit(1 if fails else 0)

main()
