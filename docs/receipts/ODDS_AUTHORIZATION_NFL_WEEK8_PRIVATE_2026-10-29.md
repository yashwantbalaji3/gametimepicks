# Founder Odds-API Authorization — NFL, NFL regular season week 8 (2026-10-29 → 2026-11-02 ET), PRIVATE capture

**Provenance:** delivered by the founder in the release-owner session on 2026-10-29 ("Approve NFL Week 8 Odds Capture"). Separate file on purpose: `docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md` (read by the scheduled `nfl-event-window.yml`) stays spent, so no scheduled job is re-armed; only the release owner's local runner passes this receipt via `--receipt`. Ledger continuity: `data/internal/research/odds/nfl/p171-ledger.json` already records 1160 credits under `docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md`; they count against this ceiling.

## Authorization (verbatim)

> I approve proceeding with a new, narrowly scoped NFL Week 8 private sportsbook odds capture receipt, with a maximum of 158 Odds API credits, covering the entire 14-game slate from Thursday, October 29 through Monday, November 2, 2026.
> Keep the total incremental NFL capture spending within the 158-credit ceiling.
> Maintain the shared 3,500-credit weekly cap and 2,000-credit remaining-balance reserve.
> This authorization applies only to the stated NFL Week 8 scope. It does not approve unlimited ongoing NFL spending or paid services beyond the existing Odds API allowance.

## Operative terms

NFL only (`americanfootball_nfl`).

Markets added: `player_anytime_td`, `player_pass_yds`, `player_rush_yds`, `player_reception_yds`, `player_receptions`

Effective cumulative ceiling: 1318 credits

| Term | Value |
|---|---|
| Scope | NFL only; NFL regular season week 8; the markets below; every other sport, market and slate is out of scope |
| Markets | `h2h` (bulk), `spreads` (bulk), `totals` (bulk), `player_anytime_td` (per event), `player_pass_yds` (per event), `player_rush_yds` (per event), `player_reception_yds` (per event), `player_receptions` (per event) |
| Sportsbooks | `regions=us` (1 region-unit), as the existing capture and receipt specify; only eligible-operators@1 books are ever displayed |
| Endpoint | free `/v4/sports/americanfootball_nfl/events` for the join; then bulk `/v4/sports/americanfootball_nfl/odds` and per event `/v4/sports/americanfootball_nfl/events/{id}/odds` |
| Cadence | Initial weekly capture now (one bulk team call + one prop call per not-started game), then ONE targeted recapture per game T-90m..T-20m (one bulk team call per kickoff cluster + one prop call per game). Never at or after kickoff. |
| Requests | at most 34 paid calls (34 capture windows) |
| Credits | at most 158 new (expected 143); cumulative ceiling 1318 = 1160 already on the ledger + 158 |
| Remaining-balance floor | **NONE** for this allowance — the shared `ODDS_API_MIN_CREDITS_REMAINING` floor (2000) still protects the rest of the account |
| Account reserve and weekly cap | 2,000-credit account reserve and the shared 3,500-credit rolling-week cap across all jobs (founder 2026-10-29), enforced by the local runner's free preflight before every run |
| Failures | any 401/429/5xx/unmodelled status or transport error stops the run; do not retry blindly; a transport error is booked as charged |
| Expiry | the 1318-credit effective cumulative ceiling (this capture reader takes no clock; the Scope row limits the purpose to the planned window) |
| Storage | price files (raw capture and derived market rows) are moved to the private directory outside every repository after each run; only the credit ledger may be committed |
| Output | PRIVATE_RESEARCH, productEligible false unless a separate display authorization says otherwise; no recommendation, product leg or promotion threshold changes |

Approved by: founder 2026-10-29
