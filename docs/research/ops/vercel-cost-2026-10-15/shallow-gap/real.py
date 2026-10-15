# Real outcomes (GitHub "Vercel" statuses, 14 days to 10-15 04:54Z): BASE for an attempt = the newest commit whose
# deployment COMPLETED (final_class BUILT) before the attempt's first status — what VERCEL_GIT_PREVIOUS_SHA holds.
import json, subprocess, collections, sys
sys.path.insert(0, sys.argv[2]); R='/Users/yashwantbalaji/Downloads/gametimepicks'
rows=json.load(open(sys.argv[1]))['rows']
print(collections.Counter(r['final_class'] for r in rows))
g=lambda *a: subprocess.run(['git','-C',R,*a],capture_output=True,text=True).stdout
par={}
for l in g('log','--all','--format=%H %P','--since=2026-09-20').splitlines(): h,*p=l.split(); par[h]=p
sup={r['sha'] for r in json.load(open(sys.argv[3])) if r.get('oldBuild') and not r.get('newBuild')}
INPUTS=[':(top)app/',':(top)data/research-projection/',':(top)data/compare-projection/',':(top)data/lab-projection/',':(top)data/ask-projection/',':(top)data/internal/mlb/model-learning/calibrator-manifest.json',':(top)data/internal/nfl/forecast-receipts/',':(top)data/internal/mlb/prediction-snapshots/',':(top)data/internal/forecast-ledger/',':(top,exclude)app/public/data/ops/']
GL=[':(top,exclude,glob)app/**/*.test.mjs',':(top,exclude,glob)app/e2e/**',':(top,exclude,glob)app/scripts/ci/**']
tc={}
def touches(c,gl):
    k=(c,gl)
    if k not in tc:
        p=par.get(c,[]); tc[k]=True if not p else subprocess.run(['git','-C',R,'diff','--quiet',p[0],c,'--',*INPUTS,*(GL if gl else [])]).returncode!=0
    return tc[k]
def dist(head,base,D=10):
    seen={head:0}; q=[head]
    for x in q:
        if x==base: return seen[x]
        if seen[x]>=D-1: continue
        for p in par.get(x,[]):
            if p not in seen: seen[p]=seen[x]+1; q.append(p)
    return None
att=sorted((r for r in rows if r['final_class'] not in (None,'NONE','BLOCKED','NO_STATUS','PENDING') and r['first_status'] and r['sha'] in par), key=lambda r:r['first_status'])
built=sorted((r for r in att if r['final_class']=='BUILT'), key=lambda r:r['last_status'])
n=gap=0; res=collections.Counter(); ex=[]
for r in att:
    prev=[b for b in built if b['last_status']<r['first_status']]
    if not prev: continue
    base=prev[-1]['sha']; n+=1
    if dist(r['sha'],base) is not None: continue
    gap+=1; cs=g('rev-list',f"{base}..{r['sha']}").split()
    for pol,gl,s1088 in (('pre1091',False,False),('1091',True,False),('1091+1088',True,True)):
        need=any(touches(c,gl) and not (s1088 and c[:10] in sup) for c in cs)
        res[(pol,need)]+=1
    ex.append((r['first_status'][:16], r['final_class'], len(cs)))
print(f"attempts with a known BASE: {n}; BASE outside depth-10 clone: {gap} ({100*gap/max(n,1):.1f}%)")
for pol in ('pre1091','1091','1091+1088'): print(f"  {pol:10} of those, ignorable (pure waste): {res[(pol,False)]}  genuinely needed a build: {res[(pol,True)]}")
print("classes of gap attempts:", collections.Counter(c for _,c,_ in ex), "commits-behind median:", sorted(k for *_,k in ex)[len(ex)//2] if ex else None)
