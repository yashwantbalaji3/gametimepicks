"""Independent check of the NFL receipts replay (no code shared with the JS gate).

  python3 -I docs/research/ops/nfl-receipts-stamp-gate-2026-10-16/independent_check.py <repo> <replay-N.json> [heartbeatHours|off]

Re-walks origin/main's first-parent history itself, keeps its own chained "virtual committed" state, parses the
ignore step's build-input lists itself, and diffs JSON leaf-by-leaf itself. For every commit the JS replay marked
SUPPRESS it asserts that every changed build input is a MODIFIED interval-calibration.json or
reconciliation/index.json whose differing leaves are ALL in the allowlist below, and that the oldest committed
stamp is within the heartbeat. It also derives its own verdict for every commit and reports disagreements.
"""
import json, re, subprocess, sys
from datetime import datetime

repo, replay_path = sys.argv[1], sys.argv[2]
hb = float("inf") if (len(sys.argv) > 3 and sys.argv[3] == "off") else float(sys.argv[3] if len(sys.argv) > 3 else 6)
CAL = "app/public/data/nfl/interval-calibration.json"
IDX = "app/public/data/nfl/reconciliation/index.json"
ALLOW = {CAL: [("generatedAt",), ("ledgerGeneratedAt",)], IDX: [("generatedAt",), ("weeks", "*", "generatedAt")]}

def git(*a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True).stdout

def show(rev, p):
    r = subprocess.run(["git", "-C", repo, "show", f"{rev}:{p}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

sh = open(f"{repo}/app/scripts/vercel-ignore-build.sh").read()
inc = re.findall(r"':\(top\)([^']+)'", re.search(r"\nBUILD_INPUTS=\((.*?)\n\)", sh, re.S).group(1))
exc = re.findall(r"'([^']+)'", re.search(r"NON_BUILD_INPUTS=\((.*?)\)", sh, re.S).group(1))
under = lambda f, p: f.startswith(p) if p.endswith("/") else f == p
def build_input(f):
    return any(under(f, p) for p in inc) and not any(under(f, p) for p in exc)

def leaves(a, b, path=()):
    """Every path at which a and b differ (a missing key on one side is a difference at that key)."""
    if type(a) != type(b) or not isinstance(a, (dict, list)):
        return [] if a == b else [path]
    out = []
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(path + (k,))
            else:
                out += leaves(a[k], b[k], path + (k,))
    else:
        if len(a) != len(b):
            return [path]
        for i, (x, y) in enumerate(zip(a, b)):
            out += leaves(x, y, path + (i,))
    return out

def allowed(f, p):
    for pat in ALLOW.get(f, []):
        if len(pat) == len(p) and all(q == "*" and isinstance(s, int) or q == s for q, s in zip(pat, p)):
            return True
    return False

ts = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
rows = {r["sha"]: r for r in json.load(open(replay_path))}
log = [l.split("\t") for l in git("log", "origin/main", "--first-parent", "--reverse", "--since=2026-10-09T00:00:00Z", "--format=%H\t%cI\t%s").strip().split("\n")]
virtual, report = {}, {"checked": 0, "suppressedByJs": 0, "suppressedConfirmedStampOnly": 0, "substantiveSuppressed": 0, "disagreements": [], "suppressed": []}
for sha, at, subj in log:
    ns = [l.split("\t") for l in git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--name-status", sha).strip().split("\n") if l]
    if not subj.startswith("auto: nfl settlement receipts"):
        for _, p in ns: virtual.pop(p, None)
        continue
    report["checked"] += 1
    js = rows[sha[:10]]
    problems, diffs, stamps = [], {}, []
    for st, p in ns:
        if not build_input(p):
            continue
        if p not in ALLOW:
            problems.append(f"{p}: build input outside the allowlist"); continue
        if st != "M":
            problems.append(f"{p}: status {st}"); continue
        before = virtual.get(p) or show(f"{sha}^", p)
        try:
            a, b = json.loads(before), json.loads(show(sha, p))
        except Exception as e:
            problems.append(f"{p}: unreadable {e}"); continue
        d = leaves(a, b)
        bad = [x for x in d if not allowed(p, x)]
        diffs[p] = {"changedLeaves": [".".join(map(str, x)) for x in d], "substantive": [".".join(map(str, x)) for x in bad]}
        if bad:
            problems.append(f"{p}: substantive change at {bad[:3]}")
        if isinstance(a.get("generatedAt"), str):
            stamps.append(ts(a["generatedAt"]))
        else:
            problems.append(f"{p}: committed stamp unreadable")
    if not problems and stamps and (ts(at) - min(stamps)) / 3600 > hb:
        problems.append("heartbeat")
    if not diffs and not problems:
        problems.append("nothing gated")
    py_verdict = "PUBLISH" if problems else "SUPPRESS"
    if py_verdict != js["verdict"]:
        report["disagreements"].append({"sha": sha[:10], "js": js["verdict"], "py": py_verdict, "py_reasons": problems[:3], "js_reasons": js["reasons"][:3]})
    if js["verdict"] == "SUPPRESS":
        report["suppressedByJs"] += 1
        substantive = [x for x in problems if x != "heartbeat"]
        if substantive:
            report["substantiveSuppressed"] += 1
        else:
            report["suppressedConfirmedStampOnly"] += 1
        report["suppressed"].append({"sha": sha[:10], "at": at, "files": diffs, "problems": problems})
        for p in js["restored"]:
            virtual[p] = virtual.get(p) or show(f"{sha}^", p)
    else:
        for _, p in ns: virtual.pop(p, None)

print(json.dumps({k: v for k, v in report.items() if k != "suppressed"}, indent=1))
json.dump(report, open(replay_path.replace("replay-", "independent-check-"), "w"), indent=1)
sys.exit(1 if report["substantiveSuppressed"] or report["disagreements"] else 0)
