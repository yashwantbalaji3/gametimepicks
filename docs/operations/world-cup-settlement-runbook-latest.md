# World Cup Settlement Runbook

## Current state: nothing tracked to settle yet
Only the **Market Outlook** (sportsbook-implied, not a model pick) is live. We publish **no
tracked World Cup projections, parlays, or Bank Builder slips**, so there is nothing to grade.
A market outlook is informational and is never settled as a pick.

## When projections/parlays DO go live (after a stats provider connects)
Settle per market, official sources only, regulation-time only:
1. **Final score source** — official FIFA / a reliable soccer results feed; record 90-minute
   regulation score (and separately full-time-after-ET only if a market explicitly included it).
2. **90-minute moneyline (3-way)** — grade Home/Draw/Away on the **regulation** score. Draw is
   a settled outcome. Never settle a 90-minute pick on an extra-time/penalty result.
3. **Match total / team total** — grade on regulation goals vs the line; push on exact line.
4. **Corners / player props** — only if an **official** corner/player-stat settlement source
   exists; otherwise do not publish those markets as tracked (fail closed).
5. Idempotent + no leakage: settle only finished matches; never alter pre-game odds/lines;
   exclude pending from hit-rate denominators; push/void handled separately.

## Guardrails
- Regulation markets are never mixed with to-advance / extra-time / penalty markets.
- No market is published as *tracked* without a real settlement source for it.
- Paper/educational framing throughout; no fabricated results.
