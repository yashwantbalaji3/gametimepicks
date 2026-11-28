"""MLB-001 audit, step 1: extract every committed revision of the MLB full-game simulation artifacts.

READ-ONLY against the repo: uses `git log` / `git cat-file` on origin/main only. Writes under ./out/.
Run:  python3 -I extract.py /Users/yashwantbalaji/Downloads/gametimepicks

For every game it records:
  * main      - the game record in the origin/main file (what the site reads today)
  * lcp       - the LAST revision committed to main's first-parent history at or before first pitch whose game
                record is a real simulation (status != unavailable). This is the "last committed pregame" record:
                GitHub evidence only, NOT Vercel served-revision evidence (see REPORT limitations).
  * history   - every distinct (artifactHash, status) the game carried, with commit time and file generatedAt.
"""
import json, os, subprocess, sys
from datetime import datetime, timezone

REPO = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
DIR = "app/public/data/mlb/full-game-simulations/"


def git(*args):
    return subprocess.run(["git", "-C", REPO, *args], check=True, capture_output=True).stdout


def ts(s):
    if s is None:
        return None
    s = s.replace("Z", "+00:00")
    return datetime.fromisoformat(s).astimezone(timezone.utc).timestamp()


main_sha = git("rev-parse", "origin/main").decode().strip()
log = git("log", "--first-parent", "-m", main_sha, "--format=C %H %cI", "--name-only", "--", DIR).decode()
revs = []  # (commit, commitIso, path)
cur = None
for line in log.splitlines():
    if line.startswith("C "):
        _, h, ci = line.split(" ")
        cur = (h, ci)
    elif line.strip().endswith(".json") and line.startswith(DIR):
        revs.append((cur[0], cur[1], line.strip()))
revs = list(dict.fromkeys(revs))  # -m can repeat a merge; dedupe

# batch-read blobs
proc = subprocess.Popen(["git", "-C", REPO, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)


def read_blob(spec):
    proc.stdin.write((spec + "\n").encode()); proc.stdin.flush()
    header = proc.stdout.readline().decode().split()
    if len(header) < 3 or header[1] == "missing":
        return None
    size = int(header[2]); data = proc.stdout.read(size); proc.stdout.read(1)
    return data


games = {}  # key (path, gamePk) -> info
parse_errors = []
for h, ci, path in revs:
    blob = read_blob(f"{h}:{path}")
    if blob is None:
        continue  # deleted in that commit
    try:
        doc = json.loads(blob)
    except Exception as e:
        parse_errors.append({"commit": h, "path": path, "error": str(e)[:200]})
        continue
    fgen = doc.get("generatedAt")
    for idx, g in enumerate(doc.get("games", [])):
        key = (path, g.get("gamePk"))
        info = games.setdefault(key, {"path": path, "gamePk": g.get("gamePk"), "firstPitch": g.get("firstPitch"), "revisions": []})
        info["revisions"].append({
            "commit": h, "commitIso": ci, "commitTs": ts(ci), "fileGeneratedAt": fgen,
            "status": g.get("status"), "artifactHash": g.get("artifactHash"), "game": g,
            "modelVersion": doc.get("modelVersion"), "indexInFile": idx,
            "frozenEntry": (doc.get("frozenPregame") or {}).get(str(g.get("gamePk"))),
        })
proc.stdin.close(); proc.wait()

# main versions
main_docs = {}
for name in git("ls-tree", "--name-only", main_sha, DIR).decode().split():
    main_docs[name] = json.loads(git("show", f"{main_sha}:{name}"))

records = []
for key, info in games.items():
    revisions = sorted(info["revisions"], key=lambda r: r["commitTs"])
    fp = ts(info["firstPitch"]) if info["firstPitch"] else None
    mdoc = main_docs.get(info["path"])
    mgame = None
    if mdoc:
        mgame = next((g for g in mdoc["games"] if g.get("gamePk") == info["gamePk"]), None)
    pre = [r for r in revisions if fp is not None and r["commitTs"] <= fp and r["status"] != "unavailable"
           and not (r["game"].get("completeness") or {}).get("startedBeforeGeneration")]
    lcp = pre[-1] if pre else None
    # distinct hash history
    hist = []
    for r in revisions:
        if not hist or hist[-1]["artifactHash"] != r["artifactHash"] or hist[-1]["status"] != r["status"]:
            hist.append({k: r[k] for k in ("commit", "commitIso", "fileGeneratedAt", "status", "artifactHash", "modelVersion")})
    # generated-before-pitch but first committed after pitch (would not count as pregame on GitHub evidence)
    late = [r for r in revisions if fp is not None and r["commitTs"] > fp and r["status"] != "unavailable"
            and r["fileGeneratedAt"] and ts(r["fileGeneratedAt"]) <= fp
            and (lcp is None or r["artifactHash"] != lcp["artifactHash"])]
    records.append({
        "path": info["path"], "date": os.path.basename(info["path"])[:-5], "gamePk": info["gamePk"],
        "firstPitch": info["firstPitch"], "nRevisions": len(revisions), "history": hist,
        "main": {"status": mgame.get("status") if mgame else None, "artifactHash": mgame.get("artifactHash") if mgame else None,
                  "frozenEntry": (mdoc.get("frozenPregame") or {}).get(str(info["gamePk"])) if mdoc else None,
                  "fileGeneratedAt": mdoc.get("generatedAt") if mdoc else None} if mdoc else None,
        "mainGame": mgame,
        "lcp": None if lcp is None else {k: lcp[k] for k in ("commit", "commitIso", "fileGeneratedAt", "status", "artifactHash", "modelVersion")},
        "lcpGame": lcp["game"] if lcp else None,
        "lateGeneratedPregame": [{k: r[k] for k in ("commit", "commitIso", "fileGeneratedAt", "artifactHash")} for r in late],
    })

records.sort(key=lambda r: (r["date"], str(r["gamePk"])))
with open(os.path.join(OUT, "games.json"), "w") as f:
    json.dump({"originMain": main_sha, "revisionsRead": len(revs), "parseErrors": parse_errors, "records": records}, f)
print(json.dumps({"originMain": main_sha, "commitFileRevisions": len(revs), "gameKeys": len(records),
                  "parseErrors": len(parse_errors)}))
