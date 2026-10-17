# Output equivalence of two static exports, normalizing ONLY values that come from the build instant/identity:
# the build id, content-hashed chunk names (they embed the build-time env), and timestamps within ±10 min of
# the build's own builtAt (ISO, epoch-ms, and ET clock text). Everything else must be byte-identical.
import os,re,sys,json,datetime as dt
from zoneinfo import ZoneInfo
dirs=sys.argv[1:3]; ET=ZoneInfo("America/New_York")
def mk(d):
    bid=[x for x in os.listdir(f"{d}/_next/static") if os.path.exists(f"{d}/_next/static/{x}/_buildManifest.js")][0]
    b0=dt.datetime.fromisoformat(json.load(open(f"{d}/data/build-info.json"))["builtAt"].replace("Z","+00:00"))
    lo,hi=b0-dt.timedelta(minutes=10),b0+dt.timedelta(minutes=10); ets=set(); t=lo
    while t<=hi:
        e=t.astimezone(ET); ets.add(e.strftime("%b ")+str(e.day)+", "+e.strftime("%I:%M").lstrip("0")+e.strftime(" %p")); t+=dt.timedelta(minutes=1)
    def iso_in(m):
        try: v=dt.datetime.fromisoformat(m.group(0).replace("Z","+00:00"))
        except Exception: return m.group(0)
        return "<NOW>" if lo<=v<=hi else m.group(0)
    def ms_in(m):
        v=dt.datetime.fromtimestamp(int(m.group(1))/1000,dt.timezone.utc)
        return "<NOWMS>" if lo<=v<=hi else m.group(0)
    def norm(s):
        s=s.replace(bid,"<BID>")
        s=re.sub(r'[\w\[\]%-]+-[0-9a-f]{16}\.js','<CHUNK>.js',s)
        s=re.sub(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z',iso_in,s)
        s=re.sub(r'(?<!\d)(\d{13})(?!\d)',ms_in,s)
        for x in ets: s=s.replace(x,"<NOWET>")
        return s
    return norm
N=[mk(d) for d in dirs]
files=sorted(os.path.relpath(os.path.join(dp,f),dirs[0]) for dp,dn,fn in os.walk(dirs[0]) for f in fn)
files=[f for f in files if not f.startswith("_next/")]
diff=[f for f in files if open(f"{dirs[0]}/{f}","rb").read()!=open(f"{dirs[1]}/{f}","rb").read() and N[0](open(f"{dirs[0]}/{f}",encoding="utf-8",errors="ignore").read())!=N[1](open(f"{dirs[1]}/{f}",encoding="utf-8",errors="ignore").read())]
print(f"export files compared: {len(files)} · differing beyond build-instant/identity values: {len(diff)}"); print(diff[:10])
