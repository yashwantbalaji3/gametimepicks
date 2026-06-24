# June 23 Soccer Settlement Report

_Generated 2026-06-24 (ET). Status: **READY TO GRADE — BLOCKED ON OFFICIAL RESULTS.** No bankroll touched, nothing persisted._

## Headline
Every June 23 soccer product has been located and normalized into the unified settlement engine. **It
cannot be graded yet** because the official results have not been ingested — and per the non-negotiable
rules I will not fabricate or web-scrape them. The moment official FT scores + player box-score lines are
supplied, the engine grades all of it in one read-only run.

**Money is safe:** the canonical bankroll (`portfolio.json`) shows `currentBankroll 10176.17`, `crown
10376.17`, record `10-2-0-0`, `openExposure 0`. The June 23 lanes live in the **paper** daily-portfolio
(`settlement: pending`) and do **not** move the real bankroll until an explicit, operator-approved write.

## What needs settling — full inventory (10 cards · 35+ legs · 4 matches · 6+ player lines)

### Matches (June 23, eventIds from the data)
| id | match | kickoff ET |
|---|---|---|
| 45 | Portugal vs Uzbekistan | 1:00 PM |
| 46 | England vs Ghana | 4:00 PM |
| 47 | Panama vs Croatia | 7:00 PM |
| 48 | Colombia vs DR Congo | 10:00 PM |

### Mr. Dub daily portfolio — Bank Builder lanes (real paper stakes)
**Lane A · $1,464.71** — parlay (both must win):
- Panama vs Croatia · Match Result · **Croatia** (−230)
- Colombia vs DR Congo · Total Goals · **Under 2.5** (−150)

**Lane B · $277.11** — parlay:
- Portugal vs Uzbekistan · BTTS · **No** (−174)
- England vs Ghana · BTTS · **No** (−164)

### Mr. Dub daily portfolio — Moonshot-style 5-leg lanes ($25 each)
**Lane A · $25**: Perišić O0.5 assists (+210) · Rashford O0.5 assists (+150) · B. Fernandes O0.5 assists
(+120) · Córdoba O0.5 SOT (−152) · Panama/Croatia O2.5 (−127)
**Lane B · $25**: Panama/Croatia BTTS No (−132) · Kane ATGS (−150) · Ronaldo ATGS (−165) · Colombia/DRC
BTTS No (−175) · Portugal/Uzb U3.5 (−168)

### World Cup Specials — 5 paper longshot cards ($0 stake)
Combined odds +1023 / +1442 / +1490 / +1908 / +2407. Each is 4 legs of team moneyline + anytime
goalscorer + shots markets (leg schema `eventId`/`participant`/`market`/`side`/`line`/`odds`). Gradeable
through the same engine via a thin adapter (implementation-plan item).

### World Cup parlay — 1 Low-Risk card ($0 paper)
(Other tiers gated this slate — not enough parlay-eligible legs.)

## Per-leg grading rules (already implemented + unit-tested)
`lib/settlement/soccer-markets.ts` (`gradeLeg` / `settleCard`):
- **Match Result (moneyline_90)** — picked team wins in 90' regulation; draw/loss → lost.
- **Total Goals** — home+away vs the line; exactly on line → push/void.
- **BTTS** — "No" wins if either side is held scoreless.
- **Anytime Goalscorer** — player official goals ≥ 1; DNP → void (never a loss).
- **Assists / Shots on Target O0.5** — player official stat vs line; no official line → void.
- **Parlay** — any lost leg → card lost; voided legs drop out and stake redistributes; all-void → void.
- Any match not **FT**, or any missing official player line → leg returns **pending** (the engine refuses
  to guess).

## The blocker (exactly why it can't settle yet)
Settlement requires `world-cup/settlement/official-scores-2026-06-23.json` with:
1. **4 match FT scores** (homeGoals/awayGoals/status) — for the ML, totals, BTTS legs.
2. **6+ player box-score lines** (goals / assists / shotsOnTarget) for Perišić, Rashford, B. Fernandes,
   Córdoba, Kane, Ronaldo (+ the WC Specials goalscorers) — for the player-prop legs.

That file **does not exist** (latest settlement is June 20). The documented source is operator-verified
official FT scores (ESPN / API-Football); the API-Football key is dormant. June 23, 2026 results are past
my training cutoff, and the standing rule is *"grade from the official source, never web-search snippets."*
A parlay can't half-settle, so even partial data won't unblock the multi-leg lanes.

## To unblock (one of)
- **Paste the official results** — the 4 FT scores + the player lines above — and I run
  `node scripts/settle-soccer-slate.mjs --date 2026-06-23 --official <file>` for the graded report.
- **Add `API_FOOTBALL_KEY`** as a repo secret so the existing automation fetches + writes the
  official-scores file, then settle.

## What the runner produces today (read-only, no fabrication)
`node scripts/settle-soccer-slate.mjs --date 2026-06-23` prints the inventory above **and emits the exact
`official-scores` template** (the 4 matches + player lines with `null` blanks) for the operator/automation
to fill. It writes nothing and grades nothing without real data.

## Next (only after you approve the graded numbers)
Per your instruction, once official results are in and you review the graded report, the
operator-approved write step updates: settled-history → product ledgers → public results pages. Until then:
**nothing is persisted.**

---

## ⚑ UPDATE — June 23 IS settleable; graded from official results (read-only, not persisted)

The "blocked" status above was **wrong** (audit corrected it — see `june-23-settlement-source-audit.md`).
A read-only API-Football pull with the existing key returned final results; the engine graded everything.

**Official FT results:** Portugal 5-0 Uzbekistan · England 0-0 Ghana · Panama 0-1 Croatia · Colombia 1-0 DR Congo.

| Product | Card | Result | Stake | Payout | Paper P/L |
|---|---|---|---|---|---|
| Bank Builder | Lane A (Croatia ML + COL/DRC U2.5) | **WON** | $1,464.71 | $3,502.57 | **+$2,037.86** |
| Bank Builder | Lane B (POR/UZB + ENG/GHA BTTS No) | **WON** | $277.11 | $702.45 | **+$425.34** |
| Moonshot | Lane A (assists/SOT/O2.5) | LOST | $25 | $0 | −$25.00 |
| Moonshot | Lane B (Kane/Ronaldo GS, BTTS, U3.5) | LOST | $25 | $0 | −$25.00 |
| WC Specials | 5 longshot cards | LOST ×5 | $10 ea | $0 | −$50.00 |
| WC Parlay | Low-Risk card | PENDING* | $0 | — | — |
| | | | | **Net** | **+$2,363.20** |

*The single WC-parlay card has an empty/double_chance leg that didn't parse — flagged for review, $0 paper.

**Per-leg detail (verified against official box scores):**
- Lane A: Panama 0-1 Croatia → Croatia ML ✓ · Colombia 1-0 → Under 2.5 ✓
- Lane B: Portugal 5-0 → BTTS No ✓ · England 0-0 → BTTS No ✓
- Moonshot A: Perišić 0 ast ✗ · Rashford 0 ast ✗ · B.Fernandes 1 ast ✓ · J.Córdoba 0 SOT ✗ · PAN/CRO 1 goal Over 2.5 ✗
- Moonshot B: PAN/CRO BTTS No ✓ · Kane 0 goals ✗ · Ronaldo 2 goals ✓ · COL/DRC BTTS No ✓ · POR/UZB 5 goals U3.5 ✗

**Money note:** these are paper lanes; the canonical bankroll/crown are **unchanged**. Persisting the won
Bank Builder lanes (+$2,463.20) WOULD move the active bankroll — so per your rule it requires your
**explicit approval** before any write. Nothing is persisted yet.
