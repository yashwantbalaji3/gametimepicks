# Sport Standup + Sports Ops Daily Brief — Templates

*The canonical upward-reporting formats for the Sports Operations Department. Each ACTIVE sport analyst
sends the Sport Standup to the Sports Operations Lead (SOL); the SOL aggregates them into one Sports Ops
Daily Brief for the founder. Keep them short — proof over prose. See [SPORTS_OPERATIONS.md](SPORTS_OPERATIONS.md).*

## Sport Standup (each sport analyst → SOL)
```
SPORT STANDUP — <Sport> — <date>
Status:        ACTIVE | DEGRADED | OFF-SEASON | BLOCKED
Settlement:    <games settled> · record delta <W-L> · each leg hand-verified vs official? Y/N
Model review:  <one line> · findings: proven/directional/insufficient · weight change? none|<proposal>
Generation:    next slate <date> · <n picks> · Top-10 contributions <n>
Missing data:  <none | list: what's absent and why it's not fabricated>
Stale products:<none | list>
Readiness:     <ready | degraded+reason | off-season | blocked+reason>
Card rec:      <Bank Builder/Moonshot candidate | honest NO-PLAY + reason>
Risks/escalations: <none | list, severity-tagged>
Gate impact:   money-md5 unchanged? Y/N · any gate risk?
```

## Sports Ops Daily Brief (SOL → founder)
```
SPORTS OPS DAILY BRIEF — <date>
Canonical: <record · bankroll · crown · md5> · money gate: PASS/FAIL
Per sport: <one line each: status · settlement · readiness · card rec>
Cross-sport: Top 10 unified? BB pool consistent? conflicts resolved?
Gates: <integrity/forensic/idempotence/health/tsc/tests/build/smoke>
Go/No-Go: GO | CONDITIONAL GO | NO-GO (+ conditions)
Founder decisions needed: <cards to approve · weight changes · deploy>
Next action (single highest priority): <...>
Handoff to Claude Code: <the sequenced prompt>
```

**Rules baked in:** settlement is serial (one canonical ledger); analysts recommend cards, the founder
approves; nothing fabricated; money-md5 unchanged unless official settlement ran.
