# Founder Odds-API Authorization — NBA player props, Bank Builder & Moonshot Step 2 second-leg candidates, 2026-11-05 ET slate

**Provenance:** delivered by the founder in the November Program Director session on 2026-11-05 at about 12:05 PM ET (approval of "items 1 through 5"). Verbatim text kept privately at `~/gtp-evidence/nov5-founder-approval-items1-5.md` (sha256 64bbd869…). The NBA props ledger stands at 101 credits (`data/internal/research/odds/nba/authorization-ledger.json`).

## Authorization (verbatim)

> I approve items 1 through 5 for the November 5 NFL Week 9 execution plan, including the one-time approximately 3 PM ET odds capture, subject to the documented 90-credit maximum, shared credit limits, provider permissions, and no unauthorized repeat captures.

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-05 ET slate.

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 107 credits

| Term | Value |
|---|---|
| Scope | One main-line capture for ORL@PHX and MIA@GS (2 games), ≤ 3 credits per game, as second-leg candidates for Step 2. Research input; no edge claim. |
| Ceiling | 101 prior + up to 6 new = 107, within the founder's 90-credit Nov 5 total (NFL + NBA). |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Cadence | Once, at about 3 PM ET, before tip. No polling, no automatic retries. |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. The shared 3,500/week budget applies across all jobs. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | 2026-11-05 (ET end of day) or the 107-credit cumulative ceiling, whichever first |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | Bank Builder and Moonshot Step 2 graphics for 2026-11-05 games, with the snapshot time; never in plain public JSON, a feed or a downloadable file. |

Approved by: founder 2026-11-05
