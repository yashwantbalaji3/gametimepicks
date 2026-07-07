# Sports Operations Department

*The index for GameTime Picks' sports line department. The Sports Operations Lead (SOL) runs the daily
loop across every sport; sport analysts recommend cards and prepare settlement but never approve or move
money. Part of the [AI Company Operating System](AI_COMPANY_OPERATING_SYSTEM.md).*

## Org chart
```
VP of Product & Operations (Cowork)
  └── Sports Operations Lead (SOL)
        ├── Soccer Analyst      · ACTIVE  (World Cup — flagship)
        ├── Baseball Analyst    · ACTIVE  (MLB — post-WC flagship)
        ├── Basketball Analyst  · STANDBY (NBA off-season)
        ├── Hockey Analyst      · STANDBY (NHL — provider onboarding)
        └── Football Analyst    · STANDBY (NFL — preps for fall)
```

## Missions
| Role | Status | Mission |
|---|---|---|
| Sports Operations Lead | — | [agents/sports-operations-lead/mission.md](../agents/sports-operations-lead/mission.md) |
| Soccer Analyst | **ACTIVE** | [agents/soccer-analyst/mission.md](../agents/soccer-analyst/mission.md) |
| Baseball Analyst | **ACTIVE** | [agents/baseball-analyst/mission.md](../agents/baseball-analyst/mission.md) |
| Basketball Analyst | STANDBY | [agents/basketball-analyst/mission.md](../agents/basketball-analyst/mission.md) |
| Hockey Analyst | STANDBY | [agents/hockey-analyst/mission.md](../agents/hockey-analyst/mission.md) |
| Football Analyst | STANDBY | [agents/football-analyst/mission.md](../agents/football-analyst/mission.md) |

## The daily pipeline (with owners)
1. **Standups** — each ACTIVE analyst hand-verifies its finished slate and sends a [Sport Standup](SPORT_STANDUP_TEMPLATE.md) → *sport analyst*.
2. **Settlement sequencing** — the SOL orders settlement by finality time and runs `--apply` **serially**, with a money gate between each sport → *SOL sequences · Claude Code executes*.
3. **Model review** — each sport writes `docs/MODEL_REVIEW_<sport>_<date>.md` (settled-only; a weight change is a founder call) → *sport analyst*.
4. **Generation** — refresh the next slate per active sport → unify Top 10 → assemble the Bank Builder pool → *analysts → SOL → Code*.
5. **Card proposal** — the SOL assembles the proposal; **the founder approves** a card or confirms the no-play → *SOL proposes · Yash approves · Code promotes*.
6. **Gates + brief** — QA render/route audit, money gates, then the [Sports Ops Daily Brief](SPORT_STANDUP_TEMPLATE.md) + the sequenced Code handoff → *SOL*.

## Prime directives
- **One canonical ledger ⇒ settlement is SERIAL, never parallel.** The SOL exists largely to sequence it.
- **Official results only** — no estimated scores; pending is never a loss.
- **Recommend, don't approve** — analysts recommend cards; the founder approves cards, weight changes, and deploys.
- **No fabrication · no forced card** — a slate that can't field a strong pick is an honest no-play.
- **Canonical money moves only through official settlement** (md5-guarded everywhere else); never deploy red.

See also: [SPORT_STANDUP_TEMPLATE.md](SPORT_STANDUP_TEMPLATE.md) · [DAILY_CLAUDE_RUNBOOK.md](DAILY_CLAUDE_RUNBOOK.md) · [CLAUDE_TEAM_OPERATING_SYSTEM.md](CLAUDE_TEAM_OPERATING_SYSTEM.md).
