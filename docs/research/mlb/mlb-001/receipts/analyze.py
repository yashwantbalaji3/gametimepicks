import pickle, math, collections, json, statistics as st
games=pickle.load(open('games.pkl','rb'))
POST='2026-09-28'
def seg(G): return 'post' if G['date']>=POST else 'reg'
ok=[ (gp,G) for gp,G in games.items() if 'fg' in G and G['fg'].get('winProbability')]
print('usable',len(ok), collections.Counter(seg(G) for _,G in ok), collections.Counter(G['fg']['status'] for _,G in ok))
# consistency
bad=0
for gp,G in ok:
    ml=G['rows'].get('moneyline')
    if ml:
        ph=G['fg']['winProbability']['home']
        pick_home = '(home)' in ml['pick']
        mp = ph if pick_home else 1-ph
        if abs(mp-ml['modelProbability'])>0.0015: bad+=1
print('ml prob mismatch',bad)
def ll(p,y):
    p=min(max(p,1e-6),1-1e-6); return -(y*math.log(p)+(1-y)*math.log(1-p))
def report(sel,name):
    n=len(sel)
    if n==0: return
    L=[];B=[];Lm=[];Bm=[];L5=[];nm=0;Lsub=[];Bsub=[];Lmsub=[];Bmsub=[]
    hw=0; ph_sum=0
    for gp,G in sel:
        a=G['actual']; y=1 if a['homeRuns']>a['awayRuns'] else 0
        p=G['fg']['winProbability']['home']
        L.append(ll(p,y)); B.append((p-y)**2); L5.append(math.log(2))
        hw+=y; ph_sum+=p
        mk=(G['fg'].get('market') or {}).get('moneyline') or {}
        if mk.get('home') is not None:
            q=mk['home']; nm+=1
            Lsub.append(ll(p,y)); Bsub.append((p-y)**2); Lmsub.append(ll(q,y)); Bmsub.append((q-y)**2)
    print(f'--- {name} n={n}: LL model {st.mean(L):.4f} vs 0.5 {math.log(2):.4f}; Brier {st.mean(B):.4f} vs 0.25; actual home win {hw/n:.3f}, mean P(home) {ph_sum/n:.3f}')
    if nm: print(f'    with market n={nm}: LL model {st.mean(Lsub):.4f} market {st.mean(Lmsub):.4f}; Brier model {st.mean(Bsub):.4f} market {st.mean(Bmsub):.4f}')
    return
for name,f in [('all',lambda G:True),('reg',lambda G:seg(G)=='reg'),('post',lambda G:seg(G)=='post'),('ready',lambda G:G['fg']['status']=='ready'),('degraded',lambda G:G['fg']['status']=='degraded')]:
    report([(gp,G) for gp,G in ok if f(G)],name)
# bootstrap CI of LL diff model - 0.5 and model - market
import random
random.seed(1)
def boot(vals,B=2000):
    n=len(vals); m=[]
    for _ in range(B):
        s=sum(vals[random.randrange(n)] for _ in range(n))/n; m.append(s)
    m.sort(); return st.mean(vals), m[int(.025*B)], m[int(.975*B)]
d05=[];dmk=[]
for gp,G in ok:
    a=G['actual']; y=1 if a['homeRuns']>a['awayRuns'] else 0; p=G['fg']['winProbability']['home']
    d05.append(ll(p,y)-math.log(2))
    mk=(G['fg'].get('market') or {}).get('moneyline') or {}
    if mk.get('home') is not None: dmk.append(ll(p,y)-ll(mk['home'],y))
print('LL diff vs 0.5 (mean, 95% CI):',boot(d05)); print('LL diff vs market:',boot(dmk), len(dmk))
# calibration deciles on P(home)
bins=collections.defaultdict(list)
for gp,G in ok:
    a=G['actual']; y=1 if a['homeRuns']>a['awayRuns'] else 0; p=G['fg']['winProbability']['home']
    bins[min(9,int(p*10))].append((p,y))
print('calib P(home) bins: bin n meanP actual')
for b in sorted(bins):
    v=bins[b]; print(f'  {b/10:.1f}-{(b+1)/10:.1f} n={len(v)} p={st.mean(x for x,_ in v):.3f} y={st.mean(y for _,y in v):.3f}')
# favourite-side calibration
fb=collections.defaultdict(list)
for gp,G in ok:
    a=G['actual']; y=1 if a['homeRuns']>a['awayRuns'] else 0; p=G['fg']['winProbability']['home']
    pf=max(p,1-p); yf= y if p>=0.5 else 1-y
    fb[min(4,int((pf-0.5)/0.05))].append((pf,yf))
print('fav-side bins')
for b in sorted(fb):
    v=fb[b]; print(f'  {0.5+b*0.05:.2f}+ n={len(v)} p={st.mean(x for x,_ in v):.3f} y={st.mean(y for _,y in v):.3f}')
# calibration slope via logistic regression on logit(p)
def logit(p): p=min(max(p,1e-4),1-1e-4); return math.log(p/(1-p))
xs=[];ys=[]
for gp,G in ok:
    a=G['actual']; ys.append(1 if a['homeRuns']>a['awayRuns'] else 0); xs.append(logit(G['fg']['winProbability']['home']))
a0,a1=0.0,1.0
for it in range(50):
    g0=g1=h00=h01=h11=0
    for x,y in zip(xs,ys):
        p=1/(1+math.exp(-(a0+a1*x))); r=y-p; w=p*(1-p)
        g0+=r; g1+=r*x; h00+=w; h01+=w*x; h11+=w*x*x
    det=h00*h11-h01*h01; a0+=(h11*g0-h01*g1)/det; a1+=(-h01*g0+h00*g1)/det
print(f'calibration intercept {a0:.3f} slope {a1:.3f}; sd of logit(p) {st.pstdev(xs):.3f}')
pickle.dump(ok,open('ok.pkl','wb'))
