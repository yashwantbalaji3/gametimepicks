"""MLB-001 audit, step 3: classify disagreements between the committed grader's forecast identity
(game-projected-scores-graded.jsonl forecastGeneratedAt/forecastSource) and this audit's last-pregame-commit rule.
Run after audit.py:  python3 -I crosscheck.py   -> out/crosscheck.json
"""
import json, os, collections
from datetime import datetime
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out")
ts = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
S = json.load(open(os.path.join(OUT, "scores.json"))); G = json.load(open(os.path.join(OUT, "games.json")))
byk = {(r["gamePk"], r["date"]): r for r in G["records"]}
cls = collections.Counter(); examples = collections.defaultdict(list)
for m in S["crossCheckMismatchRows"]:
    r = byk[(m["gamePk"], m["date"])]; fp = ts(r["firstPitch"]); gt = ts(m["graderForecastGeneratedAt"])
    match = [x for x in r["history"] if x["fileGeneratedAt"] and abs(ts(x["fileGeneratedAt"]) - gt) < 1]
    if match:
        x = match[0]
        k = ("grader_rev_in_history", "committed_after_pitch" if ts(x["commitIso"]) > fp else "committed_pre_pitch",
             "same_bytes_as_lastPregame" if x["artifactHash"] == r["lcp"]["artifactHash"] else "different_bytes")
    else:
        k = ("grader_time_not_a_sim_file_revision", "grader_after_pitch" if gt > fp else "grader_pre_pitch",
             "medians_match" if m["graderScore"]["away"] == m["lcpMedians"][0] and m["graderScore"]["home"] == m["lcpMedians"][1] else "medians_differ")
    cls[k] += 1
    if len(examples[k]) < 10:
        examples[k].append({**m, "firstPitch": r["firstPitch"]})
json.dump({"classes": {" | ".join(k): v for k, v in cls.items()}, "examples": {" | ".join(k): v for k, v in examples.items()}},
          open(os.path.join(OUT, "crosscheck.json"), "w"), indent=1)
print(json.dumps({" | ".join(k): v for k, v in cls.items()}, indent=1))
