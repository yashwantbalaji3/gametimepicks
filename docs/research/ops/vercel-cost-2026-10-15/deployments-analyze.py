import json,re,collections,statistics,sys
from datetime import datetime,timezone,timedelta
D=sys.argv[1]
NOW=datetime(2026,10,15,4,54,tzinfo=timezone.utc)
def P(s): return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(timezone.utc)
def iso(t): return t.strftime('%Y-%m-%dT%H:%M:%SZ') if t else None
def source(subj):
    if subj.startswith('Merge pull request #'): return 'human merge'
    if subj.startswith('auto-refresh'): return 'auto-refresh (odds)'
    if subj.startswith('auto: '):
        s=subj[6:]
        s=re.split(r'\s\d{4}-\d{2}-\d{2}|\s*\[|\s*\(',s)[0].strip()
        s=re.sub(r'\s+v0\.1$','',s)
        if s.startswith('schedule capture'): s='schedule capture'
        return s.lower()
    if subj.startswith("Merge remote-tracking branch"): return 'other (bot merge-sync)'
    return 'other'
def klass(desc,state):
    if desc.startswith('Deployment has completed'): return 'BUILT'
    if desc.startswith('Deployment has failed'): return 'FAILED'
    if desc.startswith('Canceled by Ignored Build Step'): return 'IGNORED'
    if desc.startswith('Canceled from the Vercel Dashboard'): return 'CANCELED_DASHBOARD'
    if desc.startswith('Deployment was blocked') or desc.startswith('Git author'): return 'BLOCKED'
    if state=='pending': return 'PENDING'
    return 'OTHER:'+desc[:40]
commits=[l.rstrip('\n').split('\t',3) for l in open(f'{D}/commits.tsv')]
rows=[]; deps=[]
for sha,ct,au,subj in commits:
    st=json.load(open(f'{D}/raw/{sha}.json'))
    src=source(subj)
    g=collections.OrderedDict()
    for x in sorted(st,key=lambda x:(x['created_at'],x['id'])):
        tu=x.get('target_url') or ''
        m=re.search(r'dpl_\w+',x['description'])
        if 'teams/invite' in tu: key='__invite__'
        else: key=('dpl_'+tu.rstrip('/').split('/')[-1]) if tu else (m.group(0) if m else '__none__')
        g.setdefault(key,[]).append(x)
    # fold invite-only status into blocked deployment of same commit
    if '__invite__' in g and len(g)>1:
        inv=g.pop('__invite__')
    dl=[]
    for key,xs in g.items():
        first=P(xs[0]['created_at']); last=P(xs[-1]['created_at'])
        fin=xs[-1]
        terms=[x for x in xs if x['state']!='pending']
        if terms: fin=terms[-1]
        c=klass(fin['description'],fin['state'])
        d=dict(sha=sha,dpl=None if key.startswith('__') else key,first=first,last=last,klass=c,desc=fin['description'],source=src,author=au,subject=subj,commit_time=ct,window_min=(last-first).total_seconds()/60)
        dl.append(d); deps.append(d)
    rows.append(dict(sha=sha,commit_time=ct,author=au,subject=subj,source=src,n_deployments=len(dl),deployments=dl))
# serial-queue model over all deployments ordered by first status
# serial machine, completion order (handles Vercel building newest-first / batch cancels); ties: newest-queued first
occ=[d for d in deps if d['klass'] in ('BUILT','FAILED','IGNORED','CANCELED_DASHBOARD')]
occ.sort(key=lambda d:(d['last'],-d['first'].timestamp()))
busy=None
for d in occ:
    start=d['first'] if busy is None else max(d['first'],busy)
    d['serial_build_min']=max(0.0,(d['last']-start).total_seconds()/60)
    busy=d['last'] if busy is None else max(busy,d['last'])
deps.sort(key=lambda d:d['first'])
for d in deps:
    d.setdefault('serial_build_min',0.0)
    if d['klass']=='BUILT': d['est_build_min']=d['serial_build_min']
    elif d['klass']=='FAILED': d['est_build_min']=46.0
    elif d['klass']=='IGNORED': d['est_build_min']=2.0
    elif d['klass']=='CANCELED_DASHBOARD': d['est_build_min']=d['serial_build_min']
    else: d['est_build_min']=0.0
    d['est_cpu_min']=d['est_build_min']*8
    d['est_usd']=d['est_cpu_min']*0.0035
# write rows.json
def ser(d): 
    o=dict(d); o['first']=iso(d['first']); o['last']=iso(d['last']); 
    for k in ('window_min','serial_build_min','est_build_min','est_cpu_min','est_usd'): o[k]=round(o[k],3)
    for k in ('sha','source','author','subject','commit_time'): o.pop(k,None)
    return o
out=[]
for r in rows:
    dl=r['deployments']
    fin=max(dl,key=lambda d:d['first']) if dl else None
    out.append(dict(sha=r['sha'],commit_time=r['commit_time'],author=r['author'],subject=r['subject'],source=r['source'],
      first_status=iso(min(d['first'] for d in dl)) if dl else None,last_status=iso(max(d['last'] for d in dl)) if dl else None,
      final_state=(fin and ('success' if fin['klass'] in('BUILT','IGNORED') else 'pending' if fin['klass']=='PENDING' else 'failure')) or 'NO_STATUS',
      final_class=fin['klass'] if fin else 'NO_STATUS',deployment_id=fin['dpl'] if fin else None,
      minutes_first_to_last=round((max(d['last'] for d in dl)-min(d['first'] for d in dl)).total_seconds()/60,2) if dl else None,
      est_build_min=round(sum(d['est_build_min'] for d in dl),2), est_cpu_min=round(sum(d['est_cpu_min'] for d in dl),2),
      n_deployments=len(dl),deployments=[ser(d) for d in dl]))
json.dump(dict(generated=iso(NOW),notes='measured: timestamps/classes/counts from GitHub commit statuses (context Vercel). ESTIMATED: est_build_min (serial-queue model for BUILT/CANCELED; 46 for FAILED; 2 for IGNORED; 0 for BLOCKED), est_cpu_min = x8, $ at $0.0035/CPU-min.',rows=out),open(f'{D}/rows.json','w'),indent=1)
json.dump([dict(ser(d),sha=d['sha'],source=d['source']) for d in deps],open(f'{D}/deployments.json','w'),indent=1)
import pickle; pickle.dump((rows,deps),open(f'{D}/state.pkl','wb'))
print(len(rows),len(deps),collections.Counter(d['klass'] for d in deps))
print('no-status commits',sum(1 for r in rows if not r['deployments']))
