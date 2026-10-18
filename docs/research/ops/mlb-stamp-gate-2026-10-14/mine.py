# Mines which JSON paths each MLB lineup/daily commit changed (read-only). Usage: python3 mine.py '10 days ago' > paths.txt
import json, subprocess, sys, re, collections
import os
REPO=os.getcwd()  # run from the repo root
def git(*a): return subprocess.run(["git","-C",REPO,*a],capture_output=True,text=True).stdout
def show(rev,p):
    r=subprocess.run(["git","-C",REPO,"show",f"{rev}:{p}"],capture_output=True,text=True)
    return r.stdout if r.returncode==0 else None
def norm(p):
    p=re.sub(r"\d{4}-\d{2}-\d{2}","D",p); p=re.sub(r"snapshot-\d+","snapshot-N",p); p=re.sub(r"mlb-latest","mlb-D",p); return p
def diffpaths(a,b,pre=""):
    out=set()
    if type(a)!=type(b): out.add(pre or "$"); return out
    if isinstance(a,dict):
        for k in set(a)|set(b):
            if k not in a or k not in b: out.add(f"{pre}.{k}+-")
            else: out|=diffpaths(a[k],b[k],f"{pre}.{k}")
    elif isinstance(a,list):
        if len(a)!=len(b): out.add(f"{pre}[len]")
        for i,(x,y) in enumerate(zip(a,b)): out|=diffpaths(x,y,f"{pre}[*]")
    elif a!=b: out.add(pre or "$")
    return out
since=sys.argv[1] if len(sys.argv)>1 else "10 days ago"
log=git("log","origin/main","--first-parent",f"--since={since}","--format=%H\t%s").strip().split("\n")
agg=collections.defaultdict(collections.Counter); rows=[]
for line in log:
    sha,subj=line.split("\t",1)
    if not re.search(r"mlb lineup refresh|mlb daily production",subj): continue
    wf="lineup" if "lineup" in subj else "daily"
    files=[l.split("\t") for l in git("diff-tree","--no-commit-id","-r","--name-status",sha).strip().split("\n") if l]
    per={}
    for st,*ps in files:
        p=ps[-1]
        if not p.endswith(".json"): per[p]={"NONJSON"}; continue
        b=show(sha+"^",p) if st!="A" else None; a=show(sha,p) if st!="D" else None
        if st=="A":
            if "prediction-snapshots" in p:
                d=p.rsplit("/",1)[0]
                prev=sorted(x for x in git("ls-tree","--name-only",sha+"^",d+"/").split() if x.endswith(".json"))
                if prev:
                    b=show(sha+"^",prev[-1])
                    s=diffpaths(json.loads(b),json.loads(a)); per[p]={"SNAP:"+x for x in s} or {"SNAP:="}
                else: per[p]={"ADDED-FIRST"}
            else: per[p]={"ADDED"}
            continue
        if st=="D": per[p]={"DELETED"}; continue
        try: s=diffpaths(json.loads(b),json.loads(a))
        except Exception as e: s={"PARSE"}
        per[p]=s
    for p,s in per.items():
        for x in s: agg[(wf,norm(p))][x]+=1
    rows.append((sha[:10],wf,per))
json.dump([(s,w,{p:sorted(v) for p,v in per.items()}) for s,w,per in rows],open(os.environ.get("OUT",".")+"/commits.json","w"),indent=1)
for (wf,p),c in sorted(agg.items()):
    print(f"\n## {wf} {p}")
    for x,n in c.most_common(25): print(f"  {n:3d} {x}")
print("\ncommits:",len(rows))
