# Upper bound: of the commits Vercel BUILT (status "Deployment has completed"), how many changed no build input beyond
# stamps / derived ages? Normalisation: drop exact stamp keys + priceAgeDays; replace "<n.n> days old" prose; a JSON
# revision file added (projection rN) counts as churn when it equals the previous revision after normalisation.
import json,os,re,subprocess,sys,collections
R='/Users/yashwantbalaji/Downloads/gametimepicks'; S=sys.argv[1]
g=lambda *a: subprocess.run(['git','-C',R,*a],capture_output=True).stdout
STAMP=re.compile(r'^(generatedAt|gradedAt|settledAt|checkedAt|builtAt|lastRunAt|updatedAt|priceAgeDays|capturedAt|asOf|etTime)$')
AGE=re.compile(r'\d+(\.\d+)? days old')
def norm(o):
    if isinstance(o,dict): return {k:norm(v) for k,v in o.items() if not STAMP.match(k)}
    if isinstance(o,list): return [norm(v) for v in o]
    if isinstance(o,str): return AGE.sub('N days old',o)
    return o
def parse(b,p):
    t=b.decode('utf-8','replace')
    return [json.loads(l) for l in t.splitlines() if l.strip()] if p.endswith('.jsonl') else json.loads(t)
BI=re.compile(r'^(app/|data/(research|compare|lab|ask)-projection/|data/internal/(forecast-ledger|nfl/forecast-receipts|mlb/prediction-snapshots)/|data/internal/mlb/model-learning/calibrator-manifest\.json)')
NONBI=re.compile(r'^app/public/data/ops/|\.test\.mjs$|^app/e2e/|^app/scripts/ci/')
rows=[l.rstrip("\n").split("\t") for l in open(f"{S}/commits.tsv")]
by=collections.Counter(); churn=collections.Counter(); ex=collections.defaultdict(list)
for sha,ci,an,ae,subj in rows:
    try: st=json.load(open(f"{S}/raw/{sha}.json"))
    except Exception: continue
    if not st or sorted(st,key=lambda x:x["created_at"])[-1]["description"]!="Deployment has completed": continue
    wf=re.sub(r'\s*\d{4}-\d\d-\d\d.*$','',subj.replace('[skip ci]','')).strip()[:40]
    by[wf]+=1
    real=False
    for line in g('show','--format=','--name-status','--no-renames',sha).decode().splitlines():
        stt,*ps=line.split('\t'); p=ps[-1]
        if not BI.match(p) or NONBI.search(p): continue
        if not re.search(r'\.jsonl?$',p): real=True; break
        if stt=='M':
            try:
                if norm(parse(g('show',f'{sha}^:{p}'),p))!=norm(parse(g('show',f'{sha}:{p}'),p)): real=True; break
            except Exception: real=True; break
        elif stt=='A':
            m=re.match(r'(.*/\d{4}-\d\d-\d\d)\.r(\d+)\.json$',p)
            if not m: real=True; break
            prev=f"{m.group(1)}.json" if m.group(2)=="2" else f"{m.group(1)}.r{int(m.group(2))-1}.json"
            try:
                if norm(parse(g('show',f'{sha}:{prev}'),prev)) != norm(parse(g('show',f'{sha}:{p}'),p)): real=True; break
            except Exception: real=True; break
        else: real=True; break
    if not real: churn[wf]+=1; ex[wf].append(sha[:10])
tb=sum(by.values()); tc=sum(churn.values())
print(f"built commits (7 days): {tb}; avoidable-by-normalisation (upper bound): {tc} ({100*tc/max(tb,1):.0f}%)")
for wf,n in by.most_common(12): print(f"  {wf:40} built {n:4}  churn-only {churn[wf]:4}  {ex[wf][:2]}")
