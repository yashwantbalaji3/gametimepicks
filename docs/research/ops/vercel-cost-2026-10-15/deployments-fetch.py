import subprocess, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
D=sys.argv[1]
shas=[l.split('\t')[0] for l in open(f'{D}/commits.tsv')]
def get(sha):
    out=f'{D}/raw/{sha}.json'
    if os.path.exists(out): return 'cached'
    for attempt in range(6):
        p=subprocess.run(['gh','api',f'repos/yashwantbalaji3/gametimepicks/commits/{sha}/statuses','--paginate','--slurp'],capture_output=True,text=True)
        if p.returncode==0:
            data=json.loads(p.stdout); flat=[x for page in data for x in page]
            open(out,'w').write(json.dumps(flat)); return 'ok'
        time.sleep(5*(attempt+1))
    return 'fail:'+p.stderr[:200]
with ThreadPoolExecutor(6) as ex:
    res=list(ex.map(get,shas))
from collections import Counter
print(Counter(r if not r.startswith('fail') else 'fail' for r in res))
print([r for r in res if r.startswith('fail')][:3])
