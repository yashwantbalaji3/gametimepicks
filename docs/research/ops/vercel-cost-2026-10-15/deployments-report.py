import pickle,statistics,collections,sys
from datetime import datetime,timezone,timedelta
D=sys.argv[1]
rows,deps=pickle.load(open(f'{D}/state.pkl','rb'))
NOW=datetime(2026,10,15,4,54,tzinfo=timezone.utc)
RATE=0.0035
K=['BUILT','IGNORED','CANCELED_DASHBOARD','FAILED','BLOCKED','PENDING']
def P(s): return datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(timezone.utc)
def q(xs,p):
    xs=sorted(xs)
    if not xs: return float('nan')
    i=p*(len(xs)-1); lo=int(i); hi=min(lo+1,len(xs)-1); return xs[lo]+(xs[hi]-xs[lo])*(i-lo)
for d in deps:
    d['est46']=d['est_build_min']
    d['est_adj']=d['serial_build_min'] if d['klass']=='FAILED' else d['est_build_min']
nostat=[r for r in rows if not r['deployments']]
def bot(src): return src!='human merge'
L=[]
def p(*a): L.append(' '.join(str(x) for x in a))
def fmt(x,n=0): return f'{x:,.{n}f}'
days=sorted({d['first'].strftime('%Y-%m-%d') for d in deps}|{P(r['commit_time']).strftime('%Y-%m-%d') for r in nostat})
p('# Vercel Production deployments on `main` — 14-day picture (GitHub commit statuses)\n')
p(f'Generated {NOW:%Y-%m-%d %H:%MZ}. Window: first-parent commits on origin/main with commit time since 2026-10-01T04:5xZ (`--since="14 days ago"`): **{len(rows)} commits, {len(deps)} Vercel deployments** (distinct deployment ids from status target_url), {len(nostat)} commits with no Vercel status.\n')
p('**MEASURED** = counts, classes, timestamps from GitHub statuses (context `Vercel`, creator `vercel[bot]`). **ESTIMATE** = every minute/CPU-minute/$ figure. CPU-min = build-min x 8 (Enhanced machine, 8 vCPU). $ = CPU-min x $0.0035 (COST-001 rate assumption) — ESTIMATE.\n')
p('Build-minute model (ESTIMATE): BUILT and CANCELED_DASHBOARD = serial single-builder model: deployments that occupy the builder (BUILT/FAILED/IGNORED/CANCELED) ordered by completion time; build = last − max(first, previous completion), floored 0. Completion order (not queue order) is used because Vercel builds the newest queued Production deployment first and batch-cancels older ones (seen 10-14 14:47Z and 10-15 01:56Z); a FIFO model double-counted ~53 min there; FAILED = 46 min flat (per brief); IGNORED = 2 min (16 CPU-min billed per COST-001; measured status window median 1.2 min); BLOCKED / PENDING = 0. Days are **UTC** calendar days by first status time (ET = UTC−4).\n')
p('## Status contexts\n')
p('All 2,499 statuses on all 1,322 commits (incl. the 20 most recent) have context `Vercel`, creator `vercel[bot]`, and target_url project `yashwantbalaji33-7164s-projects/gametime-picks` (except 10 "Git author bot must have access" statuses whose target_url is a Vercel team-invite link for the same team). **No second context — no evidence of a duplicate `gametimepicks` project posting statuses.**\n')
# per day table
p('## Per-day (UTC) — measured counts\n')
p('| day | commits | deploys | BUILT | IGNORED | CANCELED_DASH | FAILED | BLOCKED | PENDING | no-status commits | human-merge commits | bot commits |')
p('|---|---|---|---|---|---|---|---|---|---|---|---|')
for day in days:
    dd=[d for d in deps if d['first'].strftime('%Y-%m-%d')==day]
    cm=[r for r in rows if (min(x['first'] for x in r['deployments']) if r['deployments'] else P(r['commit_time'])).strftime('%Y-%m-%d')==day]
    c=collections.Counter(d['klass'] for d in dd)
    ns=sum(1 for r in cm if not r['deployments'])
    hm=sum(1 for r in cm if r['source']=='human merge')
    part=' (partial)' if day in (days[0],days[-1]) else ''
    p(f'| {day}{part} | {len(cm)} | {len(dd)} | '+' | '.join(str(c[k]) for k in K)+f' | {ns} | {hm} | {len(cm)-hm} |')
p('\n## Per-day (UTC) — ESTIMATED build time\n')
p('| day | est CPU-min BUILT | IGNORED | CANCELED | FAILED | **total CPU-min** | **est $** | BUILT build-min median | p90 | measured BUILT status-window median |')
p('|---|---|---|---|---|---|---|---|---|---|')
for day in days:
    dd=[d for d in deps if d['first'].strftime('%Y-%m-%d')==day]
    s={k:sum(d['est_cpu_min'] for d in dd if d['klass']==k) for k in K}
    tot=sum(s.values())
    b=[d['est_build_min'] for d in dd if d['klass']=='BUILT']; w=[d['window_min'] for d in dd if d['klass']=='BUILT']
    p(f'| {day} | {fmt(s["BUILT"])} | {fmt(s["IGNORED"])} | {fmt(s["CANCELED_DASHBOARD"])} | {fmt(s["FAILED"])} | **{fmt(tot)}** | **${tot*RATE:,.2f}** | {q(b,.5):.2f} | {q(b,.9):.2f} | {q(w,.5):.2f} |')
# windows
p('\n## Trailing windows (ending '+NOW.strftime('%Y-%m-%d %H:%MZ')+')\n')
p('| window | deploys | /day | BUILT | /day | IGNORED | CANCELED | FAILED | BLOCKED | human-merge deploys | bot deploys | est CPU-min | est CPU-min/day | est $ | est $/day | est $/30d run-rate |')
p('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
W={}
for n in (1,7,14):
    lo=NOW-timedelta(days=n)
    dd=[d for d in deps if d['first']>=lo]
    c=collections.Counter(d['klass'] for d in dd)
    cpu=sum(d['est_cpu_min'] for d in dd)
    hm=sum(1 for d in dd if d['source']=='human merge')
    W[n]=(dd,cpu)
    p(f'| {n}d | {len(dd)} | {len(dd)/n:.1f} | {c["BUILT"]} | {c["BUILT"]/n:.1f} | {c["IGNORED"]} | {c["CANCELED_DASHBOARD"]} | {c["FAILED"]} | {c["BLOCKED"]} | {hm} | {len(dd)-hm} | {fmt(cpu)} | {fmt(cpu/n)} | ${cpu*RATE:,.2f} | ${cpu*RATE/n:,.2f} | ${cpu*RATE/n*30:,.0f} |')
p('\nCPU-min by class (ESTIMATE):\n')
p('| window | BUILT | IGNORED | CANCELED | FAILED (46 flat) | FAILED (adj.: serial model instead of 46 flat) | total (adj.) |')
p('|---|---|---|---|---|---|---|')
for n in (1,7,14):
    dd,cpu=W[n]
    s={k:sum(d['est_cpu_min'] for d in dd if d['klass']==k) for k in K}
    fadj=sum(d['est_adj']*8 for d in dd if d['klass']=='FAILED')
    p(f'| {n}d | {fmt(s["BUILT"])} | {fmt(s["IGNORED"])} | {fmt(s["CANCELED_DASHBOARD"])} | {fmt(s["FAILED"])} | {fmt(fadj)} | {fmt(cpu-s["FAILED"]+fadj)} |')
# sources
p('\n## By source workflow — top 15 by est CPU-min (14d)\n')
src=collections.defaultdict(list)
for d in deps: src[d['source']].append(d)
top=sorted(src.items(),key=lambda kv:-sum(d['est_cpu_min'] for d in kv[1]))
p('| # | source | commits (14d) | deploys | BUILT | IGNORED | CANCELED | FAILED | BLOCKED | est CPU-min 14d | share | est $ 14d | est CPU-min 7d | est CPU-min 1d |')
p('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
T14=W[14][1]; lo7=NOW-timedelta(days=7); lo1=NOW-timedelta(days=1)
ccount=collections.Counter(r['source'] for r in rows)
for i,(s,dd) in enumerate(top[:15],1):
    c=collections.Counter(d['klass'] for d in dd); cpu=sum(d['est_cpu_min'] for d in dd)
    p(f'| {i} | {s} | {ccount[s]} | {len(dd)} | {c["BUILT"]} | {c["IGNORED"]} | {c["CANCELED_DASHBOARD"]} | {c["FAILED"]} | {c["BLOCKED"]} | {fmt(cpu)} | {cpu/T14*100:.1f}% | ${cpu*RATE:,.2f} | {fmt(sum(d["est_cpu_min"] for d in dd if d["first"]>=lo7))} | {fmt(sum(d["est_cpu_min"] for d in dd if d["first"]>=lo1))} |')
rest=top[15:]
p(f'\nRemaining {len(rest)} sources: {fmt(sum(d["est_cpu_min"] for _,dd in rest for d in dd))} est CPU-min ({", ".join(s for s,_ in rest)}).\n')
p('## Human merges vs bot\n')
p('| window | human-merge deploys | human est CPU-min | bot deploys | bot est CPU-min | human share of CPU-min |')
p('|---|---|---|---|---|---|')
for n in (1,7,14):
    dd,cpu=W[n]; h=[d for d in dd if d['source']=='human merge']; hc=sum(d['est_cpu_min'] for d in h)
    p(f'| {n}d | {len(h)} | {fmt(hc)} | {len(dd)-len(h)} | {fmt(cpu-hc)} | {hc/cpu*100:.1f}% |')
p('\n## FAILED deployments (measured timestamps)\n')
p('| first status (queued) | failure status | window min | dpl id | source | commit |')
p('|---|---|---|---|---|---|')
for d in deps:
    if d['klass']=='FAILED': p(f'| {d["first"]:%Y-%m-%d %H:%M:%SZ} | {d["last"]:%Y-%m-%d %H:%M:%SZ} | {d["window_min"]:.1f} | {d["dpl"]} | {d["source"]} | {d["sha"][:10]} |')
p('\nTwo kinds: 4 fast failures (<=2 min window, 10-10 to 10-12) and 5 long ones (46-55 min window, 10-14 13:45Z onward). The long ones end ~46.2 min after their serial start (e.g. dpl_8Hf6… queued 00:54:47 behind dpl_4TnK… which failed 01:03:57; it failed 01:50:09 = +46.2 min), consistent with a ~45-min build timeout and serial building.\n')
p('Other non-built: 1 deployment stuck PENDING with no terminal status (dpl_BFPqo11vtRingYTdjWTLHkZg6Y3j, soccer league forecasts, queued 2026-10-11 15:10:14Z). 21 BLOCKED ("Deployment was blocked", 10 also "Git author bot must have access to the project on Vercel"), all 2026-10-07 17:40–23:58Z, author `gtp-bot`.\n')
# gaps
p('## Gaps\n')
allt=sorted(d['first'] for d in deps)
gaps=sorted(((b-a).total_seconds()/3600,a,b) for a,b in zip(allt,allt[1:]))[::-1][:8]
p('No UTC day in the window has zero deployments. Longest intervals between consecutive deployment queue times (measured):\n')
for g,a,b in gaps: p(f'- {g:.2f} h: {a:%Y-%m-%d %H:%MZ} → {b:%Y-%m-%d %H:%MZ}')
p(f'\n{len(nostat)} commits have **no Vercel status at all** (no deployment recorded): '+', '.join(f'{s} x{n}' for s,n in collections.Counter(r['source'] for r in nostat).most_common())+'. Dates: '+', '.join(f'{k} x{v}' for k,v in sorted(collections.Counter(P(r['commit_time']).strftime('%m-%d') for r in nostat).items()))+'. Likely intermediate commits of a multi-commit push (Vercel deploys only the pushed head) — not verified.\n')
multi=[r for r in rows if len(r['deployments'])>1 and not any(d['klass']=='BLOCKED' for d in r['deployments'])]
p(f'{len(multi)} commits had 2 deployments (redeploys of the same sha): '+', '.join(f'{r["sha"][:8]} ({r["source"]})' for r in multi)+'.\n')
p('## Caveats\n')
p('- Status windows include queue time; 416 of 1,001 BUILT deployments were queued while a prior one was still running, so raw windows overstate build time. The serial model assumes 1 concurrent build (supported by the data: queued deployments complete one after another, e.g. the 46.2-min failures back-to-back); if the project ever ran builds in parallel the model would under-count those overlapping builds.')
p('- Serial-model sum of raw build time for BUILT is not billing data; Vercel billing (usage dashboard) is the source of truth. All $ are ESTIMATES at $0.0035/CPU-min.')
p('- FAILED = 46 min flat per brief overstates the 4 fast failures by ~180 build-min (~1,440 CPU-min); the "adj." column uses the serial model instead (fast failures ~0–2 min; long failures ~46 min of builder time).')
p('- IGNORED billed at 2 min (16 CPU-min) per COST-001; measured status windows are ~1.2 min median.')
p('- CANCELED_DASHBOARD partial builds estimated by the serial model (47 of 102 had ~0 min = canceled while queued).')
p('- 1d window = trailing 24 h ending 04:54Z on 10-15; it includes the 10-14/15 run of 46-min failed builds, so it is not a typical day. First and last UTC days are partial.')
open(f'{D}/SUMMARY.md','w').write('\n'.join(L)+'\n')
print('\n'.join(L))
