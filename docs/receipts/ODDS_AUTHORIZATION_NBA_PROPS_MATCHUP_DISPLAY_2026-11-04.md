# Founder authorization — NBA player-prop prices on Nov 4 matchup social graphics (publication of already-captured quotes; no capture, no spend)

**Provenance:**
- Delivered by the founder directly in the November Program Director session on 2026-11-04 at about 5:15 PM ET, and recorded verbatim in `FOUNDER_ODDS_SNAPSHOT_OVERRIDE_2026-11-04.md` (amendment, commit 41c421cf1d).
- The quotes were captured earlier today under `ODDS_AUTHORIZATION_NBA_PROPS_BBM_V2_EARLY_2026-11-04.md` (05:18Z and 19:05Z), `ODDS_AUTHORIZATION_NBA_PROPS_EXPANDED_2026-11-04.md` (19:44Z) and `ODDS_AUTHORIZATION_NBA_PROPS_FINAL_2026-11-04.md` (21:06Z). This receipt authorizes no capture; the shared ledger (`data/internal/research/odds/nba/authorization-ledger.json`) stands at its 101-credit ceiling and nothing more may be spent under it.
- Guard: `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`); publication: `app/scripts/nba/publish-nba-line-board.mjs`.

## Authorization (verbatim)

> I authorize the use of already captured and appropriately sourced November 4 sportsbook moneyline and player-prop prices in our NBA matchup social graphics, subject to the provider's actual publication rights and the historical-snapshot disclosure.
> This is a display authorization, not permission to spend additional credits.
> Captions should disclose: "Odds shown are snapshots captured at the stated time and may have changed."

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-04 ET slate.

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 101 credits

| Term | Value |
|---|---|
| Scope | Publication only: quotes already captured today under the three capture receipts above, shown on NBA matchup social graphics and the site's encrypted display for 2026-11-04 ET, each with its true capture time (`ODDS SNAPSHOT · <time> ET`). |
| Ceiling | 101 = the ledger as it stands; NO new capture or credit is authorized here. |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Cadence | No capture. Publication pregame only; nothing after a game starts. |
| Daily ceiling | Counts within the BBM V2 receipt's 120-credit daily ceiling together with the moneyline captures. |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. An unreadable balance stops the run before any paid call. The shared 3,500/week budget applies across all jobs. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | The 101-credit cumulative ceiling, or 2026-11-04 23:59 ET, whichever comes first. |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | NBA matchup social graphics (2026-11-04 only, images, never a feed or downloadable file), the site's encrypted display, and Bank Builder & Moonshot graphics. No sportsbook logos. |
| Kill switch | Do not run the capture. The receipt refuses on its own after its expiry or ceiling. |

Approved by: founder 2026-11-04
