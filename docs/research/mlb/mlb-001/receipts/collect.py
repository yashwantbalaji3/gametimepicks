import json, subprocess, os, pickle, collections
REPO='/Users/yashwantbalaji/Downloads/gametimepicks/.claude/worktrees/gametimepicks-core-intelligence-ebaedd'
OUT=os.path.dirname(os.path.abspath(__file__))
def git(*a): return subprocess.run(['git',*a],cwd=REPO,capture_output=True).stdout
rows=[json.loads(l) for l in open(f'{REPO}/app/public/data/mlb/results/game-predictions-graded.jsonl') if l.strip()]
dates=sorted(set(r['date'] for r in rows))
# full-game index by artifactHash (all revisions + working copy)
fg={}  # hash -> (game, artifact meta, rev)
fgrevs=collections.Counter()
for d in dates:
    rel=f'app/public/data/mlb/full-game-simulations/{d}.json'
    shas=git('log','--all','--format=%H','--',rel).decode().split()
    texts=[(s,git('show',f'{s}:{rel}')) for s in shas]
    p=f'{REPO}/{rel}'
    if os.path.exists(p): texts.append(('wc',open(p,'rb').read()))
    for s,t in texts:
        try: a=json.loads(t)
        except Exception: continue
        fgrevs[d]+=1
        meta={k:v for k,v in a.items() if k!='games'}
        for g in a.get('games',[]):
            h=g.get('artifactHash')
            if h and h not in fg: fg[h]=(g,meta,s[:12])
# prediction revision -> per game hash
predcache={}
def predrev(src,d):
    if src in predcache: return predcache[src]
    kind,rest=src.split(':',1)
    a=None
    if kind=='git':
        t=git('show',f'{rest}:app/public/data/mlb/predictions/{d}.json')
        try: a=json.loads(t)
        except Exception: a=None
    elif kind=='snapshot':
        p=f'{REPO}/data/internal/mlb/prediction-snapshots/{rest}'
        if os.path.exists(p): a=json.load(open(p))
    elif kind=='dated-file':
        a=json.load(open(f'{REPO}/app/public/data/mlb/predictions/{d}.json'))
    m={p['gamePk']:p for p in a['predictions']} if a else None
    predcache[src]=m; return m
games={}
miss=collections.Counter()
for r in rows:
    gp=r['gamePk']
    if gp not in games: games[gp]={'date':r['date'],'actual':r['actual'],'src':r['forecastSource'],'gen':r['forecastGeneratedAt'],'fp':r['firstPitchUtc'],'matchup':r['matchup'],'rows':{}}
    games[gp]['rows'][r['market']]=r
for gp,G in games.items():
    m=predrev(G['src'],G['date'])
    if not m or gp not in m: miss['nopred']+=1; continue
    p=m[gp]; G['pred']=p
    h=p.get('artifactHash')
    if h in fg: G['fg'],G['fgmeta'],G['fgrev']=fg[h]
    else: miss['nofg']+=1
print('games',len(games),'miss',miss,'fg hashes',len(fg))
pickle.dump(games,open(f'{OUT}/games.pkl','wb'))
