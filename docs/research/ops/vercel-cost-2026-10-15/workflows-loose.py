#!/usr/bin/env python3
"""Second pass over rows.json: EXTENDED stamp heuristic (looser upper bound) and the internal-admin counterfactual.
Read-only: git diff / git show only."""
import json, re, subprocess, sys
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor

REPO = "/Users/yashwantbalaji/Downloads/gametimepicks"
OUT = sys.argv[1]
BUILD_INPUTS = [
    ':(top)app/', ':(top)data/research-projection/', ':(top)data/compare-projection/',
    ':(top)data/lab-projection/', ':(top)data/ask-projection/',
    ':(top)data/internal/mlb/model-learning/calibrator-manifest.json',
    ':(top)data/internal/nfl/forecast-receipts/', ':(top)data/internal/mlb/prediction-snapshots/',
    ':(top)data/internal/forecast-ledger/', ':(top,exclude)app/public/data/ops/',
]
# Looser than the task's list: any key ending in At/_at/Stamp/AsOf, run clocks, ages, countdowns.
EXT_KEY = re.compile(r'^(.*At|.*_at|.*Stamp|.*stamp|.*AsOf|asOf|now|etTime|runAt|fitThrough|hoursAway|minutesAway|hoursToStart|minutesToStart|age(Hours|Minutes|Days|Seconds)|priceAgeDays)$')
ISO = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?')
# Internal-only admin artifacts: read by /ops, /launch (pruned internal routes) and lib/launch/*, not by a public route.
# admin/model-health.json is EXCLUDED from this set: lib/top-reads.ts and lib/command-center/model-status.ts read it.
SNAP = re.compile(r"(snapshot-[0-9]+[.]json|/capture-[^/]+[.]json)$")
ADMIN_INTERNAL = re.compile(r'^app/public/data/admin/(?!model-health\.json$)')

def git(*a, check=False):
    r = subprocess.run(['git', '-C', REPO, *a], capture_output=True, text=True)
    return r.stdout

def norm(o):
    if isinstance(o, dict):
        return {k: norm(v) for k, v in o.items() if not EXT_KEY.match(k)}
    if isinstance(o, list):
        return [norm(v) for v in o]
    if isinstance(o, str):
        return ISO.sub('<TS>', o)
    return o

def canon(t):
    try:
        return json.dumps(norm(json.loads(t)), sort_keys=True, separators=(',', ':'))
    except Exception:
        try:
            return json.dumps([norm(json.loads(l)) for l in t.splitlines() if l.strip()], sort_keys=True, separators=(',', ':'))
        except Exception:
            return None

def judge(sha):
    rows = []
    for line in git('diff', '--no-renames', '--name-status', f'{sha}^1', sha, '--', *BUILD_INPUTS).splitlines():
        st, p = line.split('\t', 1)
        rows.append((st[0], p))
    nonadmin = [r for r in rows if not ADMIN_INTERNAL.match(r[1]) and not (r[0]=='A' and SNAP.search(r[1]))]
    first_real = 'skip'
    for st, p in []:
        if st != 'M' or not p.endswith('.json'):
            first_real = p; break
        a, b = git('show', f'{sha}^1:{p}'), git('show', f'{sha}:{p}')
        ca, cb = canon(a), canon(b)
        if ca is None or cb is None or ca != cb:
            first_real = p; break
    # Combined: stamp-only (extended) after also ignoring internal-admin files.
    first_real_na = None
    for st, p in nonadmin:
        if st != 'M' or not (p.endswith('.json') or p.endswith('.jsonl')):
            first_real_na = p; break
        a, b = git('show', f'{sha}^1:{p}'), git('show', f'{sha}:{p}')
        ca, cb = canon(a), canon(b)
        if ca is None or cb is None or ca != cb:
            first_real_na = p; break
    return sha, dict(loose_stamp_only=first_real_na is None, loose_first_real=first_real_na, loose_jsonl_aware=True)

d = json.load(open(f'{OUT}/rows.json'))
todo = [c['sha'] for c in d['commits'] if c['build_triggering'] and not c['workflow'].startswith('human') and c['within7d']]
res = {}
with ProcessPoolExecutor(max_workers=8, mp_context=mp.get_context('fork')) as ex:
    for i, (sha, r) in enumerate(ex.map(judge, todo)):
        res[sha] = r
        if i % 100 == 0: print('ext', i, '/', len(todo), flush=True)
for c in d['commits']:
    if c['sha'] in res:
        c.update(res[c['sha']])
json.dump(d, open(f'{OUT}/rows.json', 'w'), indent=1)
print('done', len(res))
