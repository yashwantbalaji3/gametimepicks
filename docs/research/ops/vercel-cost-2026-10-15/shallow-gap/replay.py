# Replay main's real push sequence (14 days) through the ignore step under depth-10 shallow clones.
# Model: each push tip = one deployment attempt; BASE = tip of the last *built* attempt (ignored deployments
# are canceled, so VERCEL_GIT_PREVIOUS_SHA does not advance). BASE is "in clone" iff its BFS distance from
# HEAD over parent edges is < DEPTH (git clone --depth=N keeps N levels). Builds are assumed to succeed.
import subprocess, sys
R='/Users/yashwantbalaji/Downloads/gametimepicks'; DEPTH=int(sys.argv[2]) if len(sys.argv)>2 else 10
pushes=[l.rstrip('\n').split('\t') for l in open(sys.argv[1])]
pushes=sorted(pushes)  # chronological
g=lambda *a: subprocess.run(['git','-C',R,*a],capture_output=True,text=True)
par={}
for l in g('log','--all','--format=%H %P','--since=2026-09-25').stdout.splitlines():
    h,*p=l.split(); par[h]=p
def dist(head,base,lim):
    seen={head:0}; q=[head]
    for x in q:
        d=seen[x]
        if x==base: return d
        if d+1>=lim+1: continue
        for p in par.get(x,[]):
            if p not in seen: seen[p]=d+1; q.append(p)
    return None
INPUTS=[':(top)app/',':(top)data/research-projection/',':(top)data/compare-projection/',':(top)data/lab-projection/',
 ':(top)data/ask-projection/',':(top)data/internal/mlb/model-learning/calibrator-manifest.json',':(top)data/internal/nfl/forecast-receipts/',
 ':(top)data/internal/mlb/prediction-snapshots/',':(top)data/internal/forecast-ledger/',':(top,exclude)app/public/data/ops/']
GLOBS=[':(top,exclude,glob)app/**/*.test.mjs',':(top,exclude,glob)app/e2e/**',':(top,exclude,glob)app/scripts/ci/**']
cache={}
def changed(b,h,pol):
    k=(b,h,pol)
    if k not in cache:
        spec=INPUTS+(GLOBS if pol=='1091' else [])
        cache[k]=g('diff','--quiet',b,h,'--',*spec).returncode!=0
    return cache[k]
for pol in ('pre1091','1091'):
    for mode in ('fallback','deepen'):
        base=None; n=built=ign=fb=fbw=0; gaps=[]
        for t,before,after,actor,ev in pushes:
            if after not in par: continue
            n+=1
            if base is None: base=after; built+=1; continue
            d=dist(after,base,DEPTH) if mode=='fallback' else 0
            if mode=='fallback' and d is None:
                fb+=1; built+=1
                if not changed(base,after,pol): fbw+=1
                base=after; continue
            if changed(base,after,pol): built+=1; base=after
            else: ign+=1
        print(f"{pol:8} {mode:8} attempts={n} built={built} ignored={ign} fallback-builds={fb} of-which-ignorable={fbw}")
