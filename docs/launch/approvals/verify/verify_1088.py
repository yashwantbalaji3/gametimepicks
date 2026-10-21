#!/usr/bin/env python3
"""Post-merge verification for #1088 (MLB stamp-only gate). Read-only; independent of the gate's code.

Usage (repo root, after `git fetch origin`):
    python3 -I docs/launch/approvals/verify/verify_1088.py <merge-sha> [--runs]

For every first-parent MLB workflow commit on origin/main after <merge-sha>:
  * "run records only" (SUPPRESSED) commits must contain NO gated slate file and NO Vercel build input
    other than the run records the PR made non-inputs (ops/, admin/status.json);
  * PUBLISHED commits must carry a gated change that is more than the 3 allowlisted stamps, a new gated
    file, or a heartbeat (the newest committed gated stamp in the parent is older than 6 h);
  * the Vercel commit status of each commit is reported (published → expect a completed build; suppressed →
    expect no build, i.e. canceled by the Ignored Build Step or no status).
--runs also greps each workflow run's log for the gate's JSON verdict line.
Exit 1 if any check fails.
"""
import json, re, subprocess, sys, datetime

GATED = [
    (r"^app/public/data/mlb/full-game-simulations/\d{4}-\d{2}-\d{2}\.json$", ["generatedAt"]),
    (r"^app/public/data/mlb/predictions/\d{4}-\d{2}-\d{2}\.json$", ["generatedAt"]),
    (r"^app/public/data/mlb/game-simulations/\d{4}-\d{2}-\d{2}\.json$", ["generatedAt", "games.*.freshness.generatedAt"]),
    (r"^app/public/data/mlb/homer-nukes/\d{4}-\d{2}-\d{2}\.json$", ["generatedAt"]),
    (r"^app/public/data/parlays/tier-grid/mlb-(\d{4}-\d{2}-\d{2}|latest)\.json$", ["generatedAt", "evidence.priceAgeDays"]),
    (r"^app/public/data/mlb/schedule/\d{4}-\d{2}-\d{2}\.json$", ["generatedAt"]),
    (r"^data/internal/mlb/prediction-snapshots/\d{4}-\d{2}-\d{2}/snapshot-\d{12}\.json$", ["generatedAt"]),
]
RUN_RECORDS = (r"^app/public/data/ops/", r"^app/public/data/admin/status\.json$", r"^data/")

def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True).stdout

def rule(p):
    return next((s for pat, s in GATED if re.match(pat, p)), None)

def strip(o, path):
    k, *rest = path.split(".")
    if k == "*":
        for x in o if isinstance(o, list) else []:
            strip(x, ".".join(rest))
    elif isinstance(o, dict) and k in o:
        if rest:
            strip(o[k], ".".join(rest))
        else:
            del o[k]

def norm(txt, stamps):
    o = json.loads(txt)
    for s in stamps:
        strip(o, s)
    return json.dumps(o, sort_keys=True)

def ts(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))

def vercel(sha):
    out = subprocess.run(["gh", "api", f"repos/yashwantbalaji3/gametimepicks/commits/{sha}/statuses",
                          "--jq", '[.[]|select(.context=="Vercel")]|sort_by(.created_at)|.[-1].description // "no Vercel status"'],
                         capture_output=True, text=True).stdout.strip()
    return out or "no Vercel status"

def main():
    merge = sys.argv[1]
    log = git("log", "origin/main", "--first-parent", "--reverse", "--format=%H\t%cI\t%s", f"{merge}..origin/main").strip().split("\n")
    fails = 0
    for line in filter(None, log):
        sha, at, subj = line.split("\t", 2)
        if not re.search(r"auto: mlb (lineup refresh|daily production)", subj):
            continue
        files = [l.split("\t") for l in git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--name-status", sha).strip().split("\n") if l]
        suppressed = "run records only" in subj
        gated = [(st, p) for st, p in files if rule(p)]
        verdict, why = "OK", ""
        if suppressed:
            stray = [p for _, p in files if not any(re.match(r, p) for r in RUN_RECORDS)]
            if gated or stray:
                verdict, why = "FAIL", f"suppressed commit carries gated/build files: {[p for _, p in gated] + stray}"
        else:
            reasons = []
            for st, p in gated:
                if st == "A" and "/prediction-snapshots/" in p:
                    # a new snapshot is content only if it differs from the newest snapshot already committed
                    d = p.rsplit("/", 1)[0]
                    prior = sorted(n for n in (git("ls-tree", "--name-only", f"{sha}^", d + "/") or "").split() if re.search(r"snapshot-\d{12}\.json$", n))
                    if prior and norm(git("show", f"{sha}^:{prior[-1]}"), rule(p)) == norm(git("show", f"{sha}:{p}"), rule(p)):
                        continue
                    reasons.append(f"new snapshot {p}")
                    continue
                if st != "M":
                    reasons.append(f"{st} {p}")
                    continue
                if norm(git("show", f"{sha}^:{p}"), rule(p)) != norm(git("show", f"{sha}:{p}"), rule(p)):
                    reasons.append(f"content {p}")
            if not reasons and gated:
                stamps = []
                for _, p in gated:
                    try:
                        stamps.append(ts(json.loads(git("show", f"{sha}^:{p}"))["generatedAt"]))
                    except Exception:
                        pass
                age = (ts(at) - max(stamps)).total_seconds() / 3600 if stamps else None
                if age is not None and age >= 6:
                    reasons.append(f"heartbeat ({age:.1f} h)")
            if gated and not reasons:
                verdict, why = "FAIL", "published commit is stamp-only and inside the heartbeat (the gate should have suppressed it)"
            else:
                why = "; ".join(reasons[:3]) or "no gated file (other inputs only)"
        if verdict == "FAIL":
            fails += 1
        print(f"{verdict:4} {at[:16]} {sha[:10]} {'SUPPRESSED' if suppressed else 'PUBLISHED '} vercel={vercel(sha)[:40]!r} {why[:140]}")
    if "--runs" in sys.argv:
        runs = subprocess.run(["gh", "run", "list", "--workflow", "mlb-lineup-refresh.yml", "-L", "6", "--json", "databaseId", "--jq", ".[].databaseId"],
                              capture_output=True, text=True).stdout.split()
        runs += subprocess.run(["gh", "run", "list", "--workflow", "mlb-daily-production.yml", "-L", "4", "--json", "databaseId", "--jq", ".[].databaseId"],
                               capture_output=True, text=True).stdout.split()
        for r in runs:
            v = [l for l in subprocess.run(["gh", "run", "view", r, "--log"], capture_output=True, text=True).stdout.split("\n") if '"verdict"' in l]
            print(f"run {r}: {v[0].split('Z ', 1)[-1][:160] if v else 'no gate verdict line (pre-merge run or no commit step)'}")
    print(f"\n{fails} failure(s)")
    sys.exit(1 if fails else 0)

main()
