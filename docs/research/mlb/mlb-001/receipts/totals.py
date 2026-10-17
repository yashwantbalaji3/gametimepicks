import pickle, math, collections, json, statistics as st, glob
REPO='/Users/yashwantbalaji/Downloads/gametimepicks/.claude/worktrees/gametimepicks-core-intelligence-ebaedd'
ok=pickle.load(open('ok.pkl','rb'))
POST='2026-09-28'
def corr(x,y):
    mx,my=sum(x)/len(x),sum(y)/len(y); import math
    return sum((a-mx)*(b-my) for a,b in zip(x,y))/math.sqrt(sum((a-mx)**2 for a in x)*sum((b-my)**2 for b in y))
# climatology from 2023-2025 history (regular season finals)
hist=[]
for f in sorted(glob.glob(f'{REPO}/data/internal/mlb/linescores-history/20*/*.json')):
    d=json.load(open(f))
    for g in d.get('games',[]):
        if g.get('isFinal') and g.get('homeRuns') is not None: hist.append((g['homeRuns'],g['awayRuns']))
print('hist n',len(hist))
ht=[h+a for h,a in hist]; hd=[h-a for h,a in hist]
print('hist mean total %.3f sd %.3f; home win %.4f; mean home %.3f away %.3f; even-total share %.4f; |margin|=1 share %.4f'%(st.mean(ht),st.pstdev(ht),sum(1 for d in hd if d>0)/len(hd),st.mean(h for h,a in hist),st.mean(a for h,a in hist),sum(1 for t in ht if t%2==0)/len(ht),sum(1 for d in hd if abs(d)==1)/len(hd)))
def pmf_from_list(vals,lo,hi):
    c=collections.Counter(min(hi,max(lo,v)) for v in vals); n=len(vals); return {k:c.get(k,0)/n for k in range(lo,hi+1)}
clim_t=pmf_from_list(ht,0,21); clim_d=pmf_from_list(hd,-13,13)
def crps(pmf,y,lo,hi):
    s=0;F=0
    for k in range(lo,hi+1):
        F+=pmf.get(k,0); s+=(F-(1 if y<=k else 0))**2
    return s
def logs(pmf,y,lo,hi):
    y=min(hi,max(lo,y)); p=pmf.get(y,0); return -math.log(max(p,1e-4))
def sim_pmf(dist):
    n=sum(b['count'] for b in dist); return {b['value']:b['count']/n for b in dist}, n
def run(sel,name):
    R=collections.defaultdict(list)
    for gp,G in sel:
        fg=G['fg']; a=G['actual']; y=a['homeRuns']+a['awayRuns']; dy=a['homeRuns']-a['awayRuns']
        pt,n=sim_pmf(fg['totalRuns']['distribution']); assert n==fg['runCount']
        pdm,_=sim_pmf(fg['runDifferential']['distribution'])
        R['crps_sim'].append(crps(pt,y,0,21)); R['crps_clim'].append(crps(clim_t,y,0,21))
        R['ls_sim'].append(logs(pt,y,0,21)); R['ls_clim'].append(logs(clim_t,y,0,21))
        R['dls_sim'].append(logs(pdm,dy,-13,13)); R['dls_clim'].append(logs(clim_d,dy,-13,13))
        R['dcrps_sim'].append(crps(pdm,dy,-13,13)); R['dcrps_clim'].append(crps(clim_d,dy,-13,13))
        R['mae_med'].append(abs(fg['totalRuns']['median']-y)); R['mae_clim'].append(abs(8-y)); R['err_mean'].append(y-fg['totalRuns']['mean'])
        R['cov'].append(1 if fg['totalRuns']['p10']<=y<=fg['totalRuns']['p90'] else 0)
        R['width'].append(fg['totalRuns']['p90']-fg['totalRuns']['p10'])
        # PIT randomized-ish: mid
        Fm=sum(p for k,p in pt.items() if k<y); R['pit'].append(Fm+0.5*pt.get(min(y,21),0))
        R['simmean'].append(fg['totalRuns']['mean']); R['act'].append(y)
        R['simsd'].append(math.sqrt(sum(p*(k-fg['totalRuns']['mean'])**2 for k,p in pt.items())))
        mk=(fg.get('market') or {}).get('total') or {}
        if mk.get('line') is not None:
            R['line'].append(mk['line']); R['sm_l'].append(fg['totalRuns']['mean']); R['act_l'].append(y); R['mae_line'].append(abs(mk['line']-y))
        R['xi'].append(fg.get('extraInningsProbability') or 0)
        R['evensim'].append(sum(p for k,p in pt.items() if k%2==0 and k<21)); R['evenact'].append(1 if y%2==0 else 0)
        R['one_sim'].append(pdm.get(1,0)+pdm.get(-1,0)); R['one_act'].append(1 if abs(dy)==1 else 0)
        R['hm_sim'].append(fg['runs']['home']['mean']); R['am_sim'].append(fg['runs']['away']['mean'])
        R['hm_act'].append(a['homeRuns']); R['am_act'].append(a['awayRuns'])
    m=lambda k: st.mean(R[k])
    print(f'=== {name} n={len(sel)}')
    print(f' total CRPS sim {m("crps_sim"):.3f} clim {m("crps_clim"):.3f}; total logscore sim {m("ls_sim"):.3f} clim {m("ls_clim"):.3f}')
    print(f' diff logscore sim {m("dls_sim"):.3f} clim {m("dls_clim"):.3f}; diff CRPS sim {m("dcrps_sim"):.3f} clim {m("dcrps_clim"):.3f}')
    print(f' MAE median {m("mae_med"):.3f}; MAE const8 {m("mae_clim"):.3f}; MAE market line {st.mean(R["mae_line"]):.3f} (n={len(R["mae_line"])})')
    print(f' mean sim total {m("simmean"):.3f} vs actual {m("act"):.3f} (bias actual-sim {m("err_mean"):.3f}); mean line {st.mean(R["line"]):.3f}')
    print(f' p10-p90 coverage {m("cov"):.3f} mean width {m("width"):.2f}; sim SD mean {m("simsd"):.2f}; actual SD across games {st.pstdev(R["act"]):.2f}; SD of sim means {st.pstdev(R["simmean"]):.2f}')
    pit=R['pit']; hb=collections.Counter(min(9,int(p*10)) for p in pit); print(' PIT deciles',[hb.get(i,0) for i in range(10)])
    # slope sim mean on line, actual on line
    def slope(x,y):
        mx,my=st.mean(x),st.mean(y); return sum((a-mx)*(b-my) for a,b in zip(x,y))/sum((a-mx)**2 for a in x)
    print(f' slope sim-mean~line {slope(R["line"],R["sm_l"]):.3f}; actual~line {slope(R["line"],R["act_l"]):.3f}; actual~simmean {slope(R["simmean"],R["act"]):.3f}; corr(sim,actual) {corr(R["simmean"],R["act"]):.3f}; corr(line,actual) {corr(R["line"],R["act_l"]):.3f}')
    print(f' extra-innings sim mean {m("xi"):.4f} (min {min(R["xi"]):.3f} max {max(R["xi"]):.3f})')
    print(f' even-total share sim {m("evensim"):.4f} actual {m("evenact"):.4f}; 1-run margin sim {m("one_sim"):.4f} actual {m("one_act"):.4f}')
    print(f' home runs mean sim {m("hm_sim"):.3f} act {m("hm_act"):.3f}; away sim {m("am_sim"):.3f} act {m("am_act"):.3f}')
    return R
POST='2026-09-28'
run(ok,'all'); run([x for x in ok if x[1]['date']<POST],'reg'); run([x for x in ok if x[1]['date']>=POST],'post')
run([x for x in ok if x[1]['fg']['status']=='ready'],'ready')
# historical even totals by total
c=collections.Counter(ht); print('hist total pmf', {k:round(c[k]/len(ht),4) for k in range(0,16)})
