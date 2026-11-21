# Founder Odds-API Authorization — NFL, NFL regular season week 9 (2026-11-05 → 2026-11-09 ET), one capture

**Provenance:** delivered by the founder in the November Program Director session on 2026-11-05 at about 12:05 PM ET (approval of "items 1 through 5"). Verbatim text kept privately at `~/gtp-evidence/nov5-founder-approval-items1-5.md` (sha256 64bbd869…). Ledger continuity: `data/internal/research/odds/nfl/p171-ledger.json` records 1160 credits; they count against this ceiling.

## Authorization (verbatim)

> I approve items 1 through 5 for the November 5 NFL Week 9 execution plan, including the one-time approximately 3 PM ET odds capture, subject to the documented 90-credit maximum, shared credit limits, provider permissions, and no unauthorized repeat captures.
> I approve the dated odds-snapshot display policy for this NFL Week 9 publishing batch, with accurate capture timestamps and no representation that historical prices are live or currently obtainable.

## Operative terms

NFL only (`americanfootball_nfl`).

Markets added: `player_anytime_td`, `player_pass_yds`, `player_rush_yds`, `player_reception_yds`, `player_receptions`

Effective cumulative ceiling: 1243 credits

| Term | Value |
|---|---|
| Scope | NFL only; NFL regular season week 9 (15 games, 401873037–401873051); one capture at about 3 PM ET on 2026-11-05 |
| Markets | `h2h`, `spreads`, `totals` (one bulk call, 3 credits) and, per not-started event, `player_anytime_td`, `player_pass_yds`, `player_rush_yds`, `player_reception_yds`, `player_receptions` (≤ 5 credits each) |
| Sportsbooks | `regions=us` (1 region-unit); only eligible-operators@1 books are ever displayed |
| Endpoint | free `/v4/sports/americanfootball_nfl/events`; bulk `/v4/sports/americanfootball_nfl/odds`; per event `/v4/sports/americanfootball_nfl/events/{id}/odds` |
| Cadence | ONE capture. No polling, no recapture, no alternate lines. Never at or after kickoff. |
| Credits | at most 83 new for NFL (3 bulk + 15 × 5 props, worst case 78), within the founder's 90-credit total for Nov 5 (NFL + NBA) |
| Remaining-balance floor | **NONE** for this allowance — the shared `ODDS_API_MIN_CREDITS_REMAINING` floor (2000) still protects the rest of the account |
| Account reserve and weekly cap | 2,000-credit account reserve and the shared 3,500-credit rolling-week cap across all jobs |
| Failures | any 401/429/5xx/unmodelled status or transport error stops the run; do not retry blindly; a transport error is booked as charged |
| Expiry | the 1243-credit effective cumulative ceiling (this capture reader takes no clock; the Scope and Cadence rows limit the purpose to the one capture described there) |
| Storage | price files are moved to the private directory outside every repository after the run; only the credit ledger may be committed |
| Output | NFL Week 9 social graphics (game posts and Top 5) as dated snapshots "ODDS SNAPSHOT · Thu <time> ET" through 2026-11-09, Bank Builder & Moonshot Step 2 graphics for 2026-11-05 games, and private research. Never a public JSON file, a feed or a downloadable file. No sportsbook names or logos on images. |

Approved by: founder 2026-11-05
