#!/usr/bin/env python3
"""Read-only analysis of bot commits on origin/main vs the Vercel Ignored Build Step.
Uses only git log / git diff / git show against the repo's object store."""
import json, re, subprocess, sys, datetime as dt
from collections import defaultdict

REPO = "/Users/yashwantbalaji/Downloads/gametimepicks"
OUT = sys.argv[1]
NOW = dt.datetime.now(dt.timezone.utc)

BUILD_INPUTS = [
    ':(top)app/', ':(top)data/research-projection/', ':(top)data/compare-projection/',
    ':(top)data/lab-projection/', ':(top)data/ask-projection/',
    ':(top)data/internal/mlb/model-learning/calibrator-manifest.json',
    ':(top)data/internal/nfl/forecast-receipts/', ':(top)data/internal/mlb/prediction-snapshots/',
    ':(top)data/internal/forecast-ledger/', ':(top,exclude)app/public/data/ops/',
]
STAMP_RE = re.compile(r'^(generatedAt|updatedAt|checkedAt|capturedAt|lastRunAt|builtAt|fetchedAt|observedAt|asOf|refreshedAt|priceAgeDays|ageHours|ageMinutes|etTime|runAt|now)$')

PATTERNS = [  # (regex on subject, workflow, lane)
    (r'^auto-refresh: .*\(zero Odds API credits\)', 'auto-refresh', 'zero-credit'),
    (r'^auto-refresh: .*\(props-only\)', 'auto-refresh', 'props-only'),
    (r'^auto-refresh: .*\(projections\)', 'auto-refresh', 'projections'),
    (r'^auto: cron-slot coverage', 'cron-watchdog', 'coverage'),
    (r'^auto: daily products', 'daily-products', 'products'),
    (r'^auto: Phase 10 daily refresh', 'daily-refresh', 'refresh'),
    (r'^auto: epl matchweek refresh', 'epl-matchweek', 'matchweek'),
    (r'^auto: epl settle', 'epl-settle', 'settle'),
    (r'^auto: mlb daily production slate', 'mlb-daily-production', 'slate'),
    (r'^auto: mlb lineup refresh', 'mlb-lineup-refresh', 'lineup'),
    (r'^auto: mlb pregame archive metadata', 'mlb-pregame-capture', 'archive'),
    (r'^auto: morning projections', 'morning-projections', 'projections'),
    (r'^auto: nba pre-tip forecast window', 'nba-forecast-window', 'forecast'),
    (r'^auto: NBA OddsAPI market probe', 'nba-market-probe', 'probe'),
    (r'^auto: nba results capture', 'nba-results-refresh', 'results'),
    (r'^auto: nfl depth-chart snapshots', 'nfl-depth-charts', 'depth'),
    (r'^auto: nfl event window', 'nfl-event-window', 'window'),
    (r'^auto: nfl settlement receipts', 'nfl-event-window', 'settlement'),
    (r'^auto: nfl live props \(free\)', 'nfl-live-props-free', 'live-free'),
    (r'^auto: nfl live props', 'nfl-live-props', 'live'),
    (r'^auto: nfl odds capture', 'nfl-odds-capture', 'odds'),
    (r'^auto: P300 player props forward shadow', 'nfl-props-forward-shadow', 'shadow'),
    (r'^auto: nfl sim v2 shadow receipts', 'nfl-sim-v2-shadow', 'shadow'),
    (r'^auto: nflverse weekly capture', 'nflverse-weekly', 'nflverse'),
    (r'^auto: nightly settle', 'nightly-settle', 'settle'),
    (r'^auto: forecast ledger', 'nightly-settle', 'forecast-ledger'),
    (r'^auto: odds canary', 'odds-canary', 'canary'),
    (r'^auto: freeze daily top boards', 'results-top-boards', 'freeze'),
    (r'^auto: soccer Dixon-Coles', 'soccer-dc-shadow', 'shadow'),
    (r'^auto: soccer league forecasts', 'soccer-leagues', 'forecasts'),
    (r'^auto: schedule capture', 'sport-schedules', 'schedule'),
    (r'^auto: epl results capture', 'sport-schedules', 'epl-results'),
    (r'^auto: nfl results capture', 'sport-schedules', 'nfl-results'),
    (r'^auto: nba roster capture', 'sport-schedules', 'nba-rosters'),
    (r'^auto: injuries facts capture', 'sport-schedules', 'injuries'),
    (r'^auto: nba experimental forecasts v0\.1', 'sport-schedules', 'nba-exp-v0.1'),
    (r'^auto: nba experimental forecasts', 'sport-schedules', 'nba-exp-v0'),
    (r'^auto: ufc results capture', 'sport-schedules', 'ufc-results'),
    (r'^auto: ufc fight-week refresh', 'ufc-fight-week', 'fight-week'),
    (r'^auto: refresh UFC fighter stats', 'ufc-fighter-stats-refresh', 'stats'),
    (r'^auto: refresh UFC odds', 'ufc-odds-refresh', 'odds'),
    (r'^auto: UFC post-card grading', 'ufc-post-card', 'grading'),
    (r'^auto: UFC pre-card refresh', 'ufc-pre-card', 'refresh'),
    (r'^auto: refresh UFC results', 'ufc-results-refresh', 'results'),
    (r'^auto: pregame weather capture', 'weather-capture', 'weather'),
    (r'^Merge pull request ', 'human (PR merge)', 'merge'),
]

def git(*args, check=True):
    r = subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {args}: {r.stderr}")
    return r.stdout

def attribute(subj, author):
    for rx, wf, lane in PATTERNS:
        if re.search(rx, subj):
            return wf, lane
    if subj.startswith('auto') or 'bot' in author:
        return 'bot (unattributed)', 'other'
    return 'human (direct)', 'direct'

def name_status(a, b, specs=None):
    out = git('diff', '--no-renames', '--name-status', a, b, *(['--'] + specs if specs else []))
    rows = []
    for line in out.splitlines():
        if not line.strip():
            continue
        st, path = line.split('\t', 1)
        rows.append((st[0], path))
    return rows

def strip(o):
    if isinstance(o, dict):
        return {k: strip(v) for k, v in o.items() if not STAMP_RE.match(k)}
    if isinstance(o, list):
        return [strip(v) for v in o]
    return o

def canon(text):
    try:
        return json.dumps(strip(json.loads(text)), sort_keys=True, separators=(',', ':'))
    except Exception:
        return None

def stamp_only(sha, files):
    """files: [(status, path)] of build-input changes. Returns (is_stamp_only, real_files)."""
    real = []
    for st, p in files:
        if st != 'M' or not p.endswith('.json'):
            real.append(p); continue
        d = git('diff', '-U0', f'{sha}^1', sha, '--', p, check=False)
        ch = [l for l in d.splitlines() if (l.startswith('+') or l.startswith('-')) and not l.startswith('+++') and not l.startswith('---')]
        if ch and all(len(l) < 400 and re.match(r'^[+-]\s*"([A-Za-z]+)"\s*:', l) for l in ch):
            keys = {re.match(r'^[+-]\s*"([A-Za-z]+)"\s*:', l).group(1) for l in ch}
            if all(STAMP_RE.match(k) for k in keys):
                continue  # every changed line is a stamp-key line (pretty-printed JSON)
            if not all(STAMP_RE.match(k) for k in keys) and all(not l.rstrip().endswith(('{','[')) for l in ch):
                real.append(p); continue  # a scalar non-stamp key changed: real
        a = git('show', f'{sha}^1:{p}', check=False)
        b = git('show', f'{sha}:{p}', check=False)
        ca, cb = canon(a), canon(b)
        if ca is None or cb is None or ca != cb:
            real.append(p)
    return (len(real) == 0), real

# ---------- commits ----------
log = git('log', '--first-parent', 'origin/main', '--since=14 days ago', '--format=%H%x09%cI%x09%an%x09%s')
commits = []
for line in log.splitlines():
    sha, ts, author, subj = line.split('\t', 3)
    wf, lane = attribute(subj, author)
    t = dt.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    allf = name_status(f'{sha}^1', sha)
    bif = name_status(f'{sha}^1', sha, BUILD_INPUTS)
    row = dict(sha=sha, ts=ts, author=author, subject=subj, workflow=wf, lane=lane,
               files_changed=len(allf), build_input_files=len(bif), build_triggering=len(bif) > 0,
               build_input_paths=[p for _, p in bif][:400])
    within7 = (NOW - t).total_seconds() <= 7 * 86400
    row['within7d'] = within7
    if within7 and len(bif) > 0 and not wf.startswith('human'):
        row['_bif'] = bif
    commits.append(row)
    if len(commits) % 200 == 0: print('A', len(commits), flush=True)
print('phase A done', len(commits), flush=True)

from concurrent.futures import ProcessPoolExecutor
def _job(args):
    sha, bif = args
    return sha, stamp_only(sha, bif)
todo = [(c['sha'], c['_bif']) for c in commits if '_bif' in c]
print('stamp candidates', len(todo), 'files', sum(len(b) for _, b in todo), flush=True)
res = {}
import multiprocessing as mp
with ProcessPoolExecutor(max_workers=8, mp_context=mp.get_context('fork')) as ex:
    for i, (sha, (so, real)) in enumerate(ex.map(_job, todo)):
        res[sha] = (so, real)
        if i % 25 == 0: print('stamp', i, flush=True)
for c in commits:
    b = c.pop('_bif', None)
    if b is not None:
        so, real = res[c['sha']]
        c['stamp_only_heuristic'] = so
        c['real_change_files'] = real[:100]

print('phase B done', flush=True)
# ---------- pushes (GitHub activity API dump) ----------
pushes = []
sha2row = {c['sha']: c for c in commits}
cut14 = NOW - dt.timedelta(days=14)
for line in open(f'{OUT}/pushes.tsv'):
    ts, before, after, actor, _ = line.rstrip('\n').split('\t')
    t = dt.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    if t < cut14:
        continue
    head = sha2row.get(after)
    try:
        bif = name_status(before, after, BUILD_INPUTS)
        n = len(git('rev-list', '--first-parent', f'{before}..{after}').split())
    except RuntimeError:
        bif, n = None, None
    pushes.append(dict(ts=ts, before=before, after=after, actor=actor,
                       head_workflow=head['workflow'] if head else 'unknown(not first-parent in window)',
                       head_subject=head['subject'] if head else None, commits=n,
                       build_triggering=(None if bif is None else len(bif) > 0)))

json.dump(dict(generated=NOW.isoformat(), window_days=14, commits=commits, pushes=pushes),
          open(f'{OUT}/rows.json', 'w'), indent=1)
print(len(commits), 'commits;', len(pushes), 'pushes')
