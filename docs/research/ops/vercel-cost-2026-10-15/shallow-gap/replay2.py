# Per-commit model: a commit "touches inputs" if its own diff (vs first parent) hits a build input. With #1088,
# commits its replay marks oldBuild→newBuild=false stop touching inputs (their stamps are restored; only ops/
# run records commit). A push needs a build iff any commit in BASE..HEAD touches inputs. Window: #1088 replay span.
import subprocess, json, sys
R='/Users/yashwantbalaji/Downloads/gametimepicks'; DEPTH=10
g=lambda *a: subprocess.run(['git','-C',R,*a],capture_output=True,text=True).stdout
rp=json.load(open(sys.argv[2])); sup={r['sha'] for r in rp if r.get('oldBuild') and not r.get('newBuild')}
lo,hi=min(r['at'] for r in rp),max(r['at'] for r in rp)
pushes=sorted(l.rstrip('\n').split('\t') for l in open(sys.argv[1])); pushes=[p for p in pushes if lo<=p[0]<=hi]
par={}
for l in g('log','--all','--format=%H %P','--since=2026-09-25').splitlines(): h,*p=l.split(); par[h]=p
INPUTS=[':(top)app/',':(top)data/research-projection/',':(top)data/compare-projection/',':(top)data/lab-projection/',':(top)data/ask-projection/',':(top)data/internal/mlb/model-learning/calibrator-manifest.json',':(top)data/internal/nfl/forecast-receipts/',':(top)data/internal/mlb/prediction-snapshots/',':(top)data/internal/forecast-ledger/',':(top,exclude)app/public/data/ops/',':(top,exclude,glob)app/**/*.test.mjs',':(top,exclude,glob)app/e2e/**',':(top,exclude,glob)app/scripts/ci/**']
tc={}
def touches(c):
    if c not in tc:
        p=par.get(c,[])
        tc[c]= True if not p else subprocess.run(['git','-C',R,'diff','--quiet',p[0],c,'--',*INPUTS]).returncode!=0
    return tc[c]
def between(b,h): return g('rev-list',f'{b}..{h}').split()
def dist(head,base):
    seen={head:0}; q=[head]
    for x in q:
        if x==base: return seen[x]
        if seen[x]>=DEPTH-1: continue
        for p in par.get(x,[]):
            if p not in seen: seen[p]=seen[x]+1; q.append(p)
    return None
matched=sum(1 for c in par if c[:10] in sup)
print(f"window {lo}..{hi} pushes={len(pushes)} suppressed-by-1088={len(sup)} (found in git: {matched})")
for pol in ('1091','1091+1088'):
    for mode in ('fallback','gap-fetch'):
        base=None; built=ign=fb=fbw=fetches=0; streak=mx=0
        for t,before,after,actor,ev in pushes:
            if after not in par: continue
            if base is None: base=after; built+=1; continue
            need=any((touches(c) and not (pol=='1091+1088' and c[:10] in sup)) for c in between(base,after))
            inclone=dist(after,base) is not None
            if not inclone and mode=='fallback':
                fb+=1; built+=1; fbw+= (not need); base=after; streak=0; continue
            if not inclone: fetches+=1
            if need: built+=1; base=after; streak=0
            else: ign+=1; streak+=1; mx=max(mx,streak)
        print(f"{pol:10} {mode:9} built={built} ignored={ign} depth-fallback-builds={fb} (needless {fbw}) gap-fetches={fetches} longest-ignored-run={mx}")
