# World Cup Settlement Runbook

## Current state (2026-06-11): team-level projections + suggested parlays LIVE
API-Football **Pro** access is connected, so **team-level 90-minute model projections**
(moneyline H/D/A + match total) and **suggested parlays** are now published for today's games
(`projections/latest.json`, `parlays/latest.json`). These ARE tracked picks and must be graded
once matches finish. The **Market Outlook** remains informational and is never settled.
No World Cup **Bank Builder** slip is tracked (no qualifying Low-risk card near target), so the
Bank Builder ladder is untouched.

**Settlement source = API-Football.** `/fixtures?id=<fixtureId>` (the `matchId` stored on each
projection) returns `goals.home`/`goals.away` once `fixture.status.short == "FT"` — the
**90-minute regulation** score (AET/PEN are separate fields we deliberately do NOT use for
90-minute markets). Grade moneyline on home/draw/away vs that score; grade totals on
`goals.home + goals.away` vs the line. A settler (`pipeline/world_cup/settle.py`) is the next
step — run it only AFTER `status==FT`; it must be idempotent and never alter pre-game
odds/lines.

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
