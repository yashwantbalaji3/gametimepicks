import json, re, subprocess, sys
sys.path.insert(0,'.')
REPO="/Users/yashwantbalaji/Downloads/gametimepicks"
EXT_KEY = re.compile(r'^(.*At|.*_at|.*Stamp|.*stamp|.*AsOf|asOf|now|etTime|runAt|fitThrough|hoursAway|minutesAway|hoursToStart|minutesToStart|age(Hours|Minutes|Days|Seconds)|priceAgeDays)$')
ISO = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?')
def norm(o):
    if isinstance(o, dict): return {k: norm(v) for k, v in o.items() if not EXT_KEY.match(k)}
    if isinstance(o, list): return [norm(v) for v in o]
    if isinstance(o, str): return ISO.sub('<TS>', o)
    return o
def walk(a,b,p,out):
    if type(a)!=type(b): out.append((p,'type',str(a)[:60],str(b)[:60])); return
    if isinstance(a,dict):
        for k in sorted(set(a)|set(b)):
            if k not in a: out.append((p+'.'+k,'added','',str(b[k])[:60]))
            elif k not in b: out.append((p+'.'+k,'removed',str(a[k])[:60],''))
            else: walk(a[k],b[k],p+'.'+k,out)
    elif isinstance(a,list):
        if len(a)!=len(b): out.append((p,'len',len(a),len(b)))
        for i,(x,y) in enumerate(zip(a,b)): walk(x,y,f'{p}[{i}]',out)
    elif a!=b: out.append((p,'val',str(a)[:60],str(b)[:60]))
def g(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True,text=True).stdout
sha,path=sys.argv[1],sys.argv[2]
out=[]; walk(norm(json.loads(g('show',f'{sha}^1:{path}'))),norm(json.loads(g('show',f'{sha}:{path}'))),'',out)
print(sha[:8],path,len(out),'diffs')
for r in out[:int(sys.argv[3]) if len(sys.argv)>3 else 12]: print('  ',r)
