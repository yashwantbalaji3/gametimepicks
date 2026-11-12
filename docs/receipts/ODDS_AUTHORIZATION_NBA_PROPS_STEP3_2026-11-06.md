# Founder Odds-API Authorization — NBA player props, Bank Builder & Moonshot Step 3 candidates, 2026-11-06 ET slate

**Provenance:** delivered by the founder in the November Program Director session on 2026-11-06 at about 6:40 PM ET ("P0 URGENT: GET BANK BUILDER STEP 3 AND MOONSHOT STEP 3 LIVE TONIGHT"). Verbatim excerpts kept privately at `~/gtp-evidence/nov6-founder-step3-directive-excerpts.md` (sha256 fe5bc006e6ad…). The NBA props ledger stands at 107 credits (`data/internal/research/odds/nba/authorization-ledger.json`).

## Authorization (verbatim)

> If genuinely necessary, use the previously proposed one-time November 6 odds-capture budget of up to 35 The Odds API credits, subject to the existing spending caps and reserve. Do not exceed that ceiling or repeat an already completed capture.
> Absolutely no continuous polling or unnecessary recaptures.
> My founder preference for tonight is to prepare the graphics from captured odds rather than continually delaying preparation until close to tipoff.

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-06 ET slate.

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 125 credits

| Term | Value |
|---|---|
| Scope | One main-line capture for the not-yet-started 8 PM and 11 PM ET games (UTAH@DAL, OKC@MEM, TOR@MIL, MIN@NO, POR@LAL, SA@SAC), ≤ 3 credits per game, as Step 3 candidates. Research input; no edge claim. |
| Ceiling | 107 prior + up to 18 new = 125, within the founder's 35-credit Nov 6 total (props + moneylines). |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Cadence | Once, before tip. No polling, no automatic retries. |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. The shared 3,500/week budget applies across all jobs. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | 2026-11-06 (ET end of day); no new captures |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | Bank Builder and Moonshot Step 3 graphics for 2026-11-06 games, with the snapshot time; never in plain public JSON, a feed or a downloadable file. No sportsbook names or logos. |

Approved by: founder 2026-11-06
