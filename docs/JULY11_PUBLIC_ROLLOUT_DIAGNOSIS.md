# July-11 Public Rollout Diagnosis (2026-07-10 overnight)

Blunt readiness snapshot. Money untouched (`affe6b21…`, 19-14, $0).

## Readiness by sport

| sport | state | rollout-ready? |
|---|---|---|
| **UFC 329** | 14 fights · 10 market moneylines · **12/14 GameTime V1 reads** · 2 honest "Insufficient data" (Garza, Steveson) · octagon hero + prediction board V2 + methodology + animation · homepage/Today spotlight | **Yes** — market-implied + experimental reads, honestly labeled. Copy cleaned this pass. |
| **World Cup** | market-implied FreeSim reports live; display-only; settlement on 90' team markets | **Yes** for the committed slate. July-11 refresh needs founder-run keys (not run overnight). |
| **MLB** | board + player props + `/mlb/results` honesty banner | **Yes** for committed slate. July-11 refresh needs founder-run keys. |
| **NBA/others** | off-season / retired (Homer Nukes) | n/a |

## Readiness by page

| page | state |
|---|---|
| Home | Event Spotlight (UFC 329) pinned atop; flagship cards; featured sims; trust strip — clean |
| Today | slate header + UFC spotlight + at-a-glance + top picks — clean |
| /ufc | fight simulator: hero → status strip → **Predictions V2** → featured sim → fight sims → advanced odds → validation gate — clean; banned copy removed |
| /picks (Parlay Lab) | model-qualified pool (WC + MLB); UFC excluded by construction |
| Bank Builder / Moonshot | canonical 19-14 ladder; **$0 official exposure**; UFC cannot enter (tested) |
| Results / Track Record | honest paper record + trust center |

## Data / money integrity
- Money md5 `affe6b21…` **unchanged**; forensic PERFECT; health HEALTHY.
- No internal artifacts web-served (`data/internal` absent from `out/`).
- No external images; no forbidden public claims (best bet / lock / positive EV / validated edge / official pick).

## Fixed this pass
- UFC report copy: removed `no model edge is claimed`, `Model pick gated`, `provider-needed` (takeaway) →
  simpler "Market-implied read · paper-only" / "Model-adjusted picks: validation in progress".

## Remaining risks / residuals (founder)
1. **July-11 MLB + WC data refresh not run** — dormant weekend automation needs the founder's API keys; not
   run overnight to avoid paid spend. The site shows the latest committed slate honestly (no fake "live").
2. **UFC model-read policy not fully unified across ALL tabs** — the V2 board + fight reports + animation +
   spotlight are consistent; the older Projections/Expanded/Suggested-Cards tabs still carry some legacy
   gating wording. Scoped larger than a safe overnight slice.
3. **2 UFC fights insufficient** (Garza, Steveson) — genuinely absent from the fighter DB; no safe auto-match.
4. **Bank Builder / Moonshot not regenerated for July 11** — money-path adjacent; left on canonical state
   overnight per the money guardrail. Run the daily refresh (founder, with keys) in the morning.
5. **Validation unchanged** — UFC `cleanGradedRows 0/150`, `publicPicksVisible=false`. Nothing claims a
   verified edge.
