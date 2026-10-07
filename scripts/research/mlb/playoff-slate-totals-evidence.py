"""Walk-forward check of MLB total over/under evidence (playoff slate 2026-10-07).

Reads only committed artifacts: P317 shadow rows, public full-game simulations and linescores.
Part 1 (ev.py): forward level, disagreement buckets, shape. Part 2 (tilt.py): a pre-registered
re-weighting correction refit daily on earlier games and scored held-out. Run from the repo root.
"""
import json,glob,os,math
R='data/internal/research/mlb/engine-level-shadow'
rows=[]
for f in sorted(glob.glob(R+'/2026-*.json')):
    d=json.load(open(f)); date=os.path.basename(f)[:-5]
    ls=json.load(open('data/internal/mlb/linescores/'+date+'.json')) if os.path.exists('data/internal/mlb/linescores/'+date+'.json') else {'games':[]}
    fin={g['gamePk']:g['homeRuns']+g['awayRuns'] for g in ls.get('games',[]) if g.get('isFinal')}
    tm=None
    p='app/public/data/mlb/team-markets/'+date+'.json'
    for r in d['rows']:
        if r['gamePk'] in fin: r['actual']=fin[r['gamePk']]; r['date']=date; rows.append(r)
print('graded',len(rows))
def pmf(dist):
    m={b['value']:b['probability'] for b in dist['distribution']}; return m
def pover(dist,line):
    m=pmf(dist); o=sum(p for v,p in m.items() if v>line); u=sum(p for v,p in m.items() if v<line); return o,u
for k in ['control','candidate']:
    ll=[];br=[];xs=[];ys=[]
    for r in rows:
        L=r['marketTotalLine']
        if L is None or r['actual']==L: continue
        o,u=pover(r[k],L); p=o/(o+u); p=min(max(p,1e-3),1-1e-3); y=1 if r['actual']>L else 0
        ll.append(-math.log(p if y else 1-p)); br.append((p-y)**2); xs.append(p); ys.append(y)
    n=len(ll); print(k,'n',n,'LL',round(sum(ll)/n,4),'Brier',round(sum(br)/n,4),'meanP',round(sum(xs)/n,3),'overRate',round(sum(ys)/n,3))
    # best shrink k: p'=0.5+k(p-0.5)
    best=min(((sum(-math.log((0.5+kk*(p-0.5)) if y else 1-(0.5+kk*(p-0.5))) for p,y in zip(xs,ys))/n,kk) for kk in [i/20 for i in range(0,21)]))
    print('  best shrink k (in-sample)',best)
    # correlation of sim mean - line with actual - line
    import statistics as st
    a=[r[k]['mean']-r['marketTotalLine'] for r in rows if r['marketTotalLine'] is not None]
    b=[r['actual']-r['marketTotalLine'] for r in rows if r['marketTotalLine'] is not None]
    print('  corr(sim-line, actual-line)',round(st.correlation(a,b),3),'mean sim-line',round(st.mean(a),2),'mean act-line',round(st.mean(b),2))
    # shape: mean pmf vs empirical
    agg={};emp={}
    for r in rows:
        for v,p in pmf(r[k]).items(): agg[v]=agg.get(v,0)+p/len(rows)
        emp[min(r['actual'],21)]=emp.get(min(r['actual'],21),0)+1/len(rows)
    print('  total  pred  actual')
    for v in range(0,16): print('  ',v,round(agg.get(v,0),3),round(emp.get(v,0),3))
print('--- disagreement buckets (candidate)')
for lo,hi in [(-9,-0.5),(-0.5,0.5),(0.5,1.5),(1.5,9)]:
    sub=[r for r in rows if r['marketTotalLine'] is not None and lo<=r['candidate']['mean']-r['marketTotalLine']<hi and r['actual']!=r['marketTotalLine']]
    if not sub: continue
    ov=sum(1 for r in sub if r['actual']>r['marketTotalLine'])
    pm=sum(pover(r['candidate'],r['marketTotalLine'])[0]/sum(pover(r['candidate'],r['marketTotalLine'])) for r in sub)/len(sub)
    print(f'sim-line in [{lo},{hi}) n={len(sub)} model P(over) avg {pm:.3f} actual over rate {ov/len(sub):.3f}')
import statistics as st
po=[r for r in rows if r['date']>='2026-09-29']
print('since 09-29 n',len(po),'level cand',round(st.mean([r['actual']-r['candidate']['mean'] for r in po]),2),'level ctrl',round(st.mean([r['actual']-r['control']['mean'] for r in po]),2))
print('dates', sorted(set(r['date'] for r in po)))
print('--- postseason rows')
for r in po: print(r['date'],r['slug'],'line',r['marketTotalLine'],'cand',r['candidate']['mean'],'ctrl',r['control']['mean'],'actual',r['actual'])
print('mean line',st.mean([r['marketTotalLine'] for r in po if r['marketTotalLine']]),'mean actual',st.mean([r['actual'] for r in po]))

# ---- part 2: walk-forward tilt correction ----
import json,glob,os,math,statistics as st
def load_candidate():
    rows=[]
    for f in sorted(glob.glob('data/internal/research/mlb/engine-level-shadow/2026-*.json')):
        d=json.load(open(f)); date=os.path.basename(f)[:-5]
        p='data/internal/mlb/linescores/'+date+'.json'
        if not os.path.exists(p): continue
        fin={g['gamePk']:g['homeRuns']+g['awayRuns'] for g in json.load(open(p)).get('games',[]) if g.get('isFinal')}
        for r in d['rows']:
            if r['gamePk'] in fin:
                rows.append(dict(date=date,line=r['marketTotalLine'],actual=fin[r['gamePk']],pmf={b['value']:b['probability'] for b in r['candidate']['distribution']},mean=r['candidate']['mean']))
    return rows
def load_champion():
    rows=[]
    for f in sorted(glob.glob('app/public/data/mlb/full-game-simulations/2026-*.json')):
        d=json.load(open(f)); date=os.path.basename(f)[:-5]
        if date>='2026-10-07': continue
        p='data/internal/mlb/linescores/'+date+'.json'
        if not os.path.exists(p): continue
        fin={g['gamePk']:g['homeRuns']+g['awayRuns'] for g in json.load(open(p)).get('games',[]) if g.get('isFinal')}
        gen=d.get('generatedAt','')
        carried={x.get('gamePk') for x in (d.get('frozenPregame') or {}).get('games',[])} if isinstance(d.get('frozenPregame'),dict) else set()
        for g in d['games']:
            if g.get('status')=='unavailable' or g['gamePk'] not in fin: continue
            if g.get('completeness',{}).get('startedBeforeGeneration'): continue
            if not (gen and g.get('firstPitch') and gen<g['firstPitch']) and g['gamePk'] not in carried and not d.get('frozenPregame'): continue
            m=(g.get('market') or {}).get('total') or {}
            rows.append(dict(date=date,line=m.get('line'),mkt=m.get('over'),actual=fin[g['gamePk']],pmf={b['value']:b['probability'] for b in g['totalRuns']['distribution']},mean=g['totalRuns']['mean']))
    return rows
def tilt(pmf,target):
    lo,hi=-2.0,2.0
    for _ in range(60):
        th=(lo+hi)/2; w={v:p*math.exp(th*v) for v,p in pmf.items()}; z=sum(w.values()); m=sum(v*x for v,x in w.items())/z
        if m<target: lo=th
        else: hi=th
    return {v:x/z for v,x in w.items()}
def pover(pmf,L):
    o=sum(p for v,p in pmf.items() if v>L); u=sum(p for v,p in pmf.items() if v<L); return o/(o+u)
def ll(p,y): p=min(max(p,1e-3),1-1e-3); return -math.log(p if y else 1-p)
def evaluate(rows,name,minTrain=60):
    dates=sorted(set(r['date'] for r in rows)); res={'raw':[],'tilt':[],'coin':[],'base':[],'mkt':[]}; held=[]
    for d in dates:
        train=[r for r in rows if r['date']<d]; test=[r for r in rows if r['date']==d]
        if len(train)<minTrain: continue
        xs=[r['mean'] for r in train]; ys=[r['actual'] for r in train]
        mx,my=st.mean(xs),st.mean(ys); b=sum((x-mx)*(y-my) for x,y in zip(xs,ys))/sum((x-mx)**2 for x in xs); a=my-b*mx
        tr_lined=[r for r in train if r['line'] is not None and r['actual']!=r['line']]
        base=sum(1 for r in tr_lined if r['actual']>r['line'])/len(tr_lined)
        for r in test:
            if r['line'] is None or r['actual']==r['line']: continue
            y=r['actual']>r['line']; tgt=a+b*r['mean']; pt=tilt(r['pmf'],tgt)
            res['raw'].append(ll(pover(r['pmf'],r['line']),y)); res['tilt'].append(ll(pover(pt,r['line']),y)); res['coin'].append(math.log(2)); res['base'].append(ll(base,y))
            if r.get('mkt') is not None: res['mkt'].append((ll(r['mkt'],y),ll(pover(pt,r['line']),y)))
            held.append((pover(pt,r['line']),y,a,b))
    n=len(res['raw']); print(name,'held-out n',n, {k:round(st.mean(v),4) for k,v in res.items() if v and k!='mkt'})
    if res['mkt']: print('  vs market (n=%d): market LL %.4f, tilt LL %.4f'%(len(res['mkt']),st.mean(x for x,_ in res['mkt']),st.mean(y for _,y in res['mkt'])))
    print('  last fit a=%.2f b=%.3f'%(held[-1][2],held[-1][3]))
    for lo,hi in [(0,.45),(.45,.55),(.55,1)]:
        s=[(p,y) for p,y,_,_ in held if lo<=p<hi]
        if s: print('  band %.2f-%.2f n=%d meanP %.3f overRate %.3f'%(lo,hi,len(s),st.mean(p for p,_ in s),st.mean(y for _,y in s)))
c=load_candidate(); evaluate(c,'P317 candidate',60)
h=load_champion(); print('champion rows',len(h),'dates',h[0]['date'] if h else None,'..',h[-1]['date'] if h else None); evaluate(h,'champion',150)
