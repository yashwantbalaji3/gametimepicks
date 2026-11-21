# Founder authorization — NBA player-prop prices on Nov 5 matchup social graphics (publication of already-captured quotes; no capture, no spend)

**Provenance:**
- Delivered by the founder directly in the November Program Director session on 2026-11-05 at about 5:30 PM ET ("P0: NOVEMBER 5 NBA + COMPLETE NFL WEEK 9 SOCIAL PUBLISHING EXECUTION"); verbatim excerpts kept privately at `~/gtp-evidence/nov5-founder-weekend-directive-excerpts.md`.
- The quotes were captured today under `ODDS_AUTHORIZATION_NBA_PROPS_STEP2_2026-11-05.md` (19:00Z ORL@PHX, 19:02Z MIA@GS). This receipt authorizes no capture; the shared ledger (`data/internal/research/odds/nba/authorization-ledger.json`) stands at its 107-credit ceiling and nothing more may be spent under it.
- Guard: `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`); publication: `app/scripts/nba/publish-nba-line-board.mjs`.

## Authorization (verbatim)

> Use the existing NBA graphic that compares the top eligible players from both teams against the captured sportsbook lines.
> Show the actual sportsbook line. Show the observed Over/Under price where available.
> Apply the founder-approved, date-scoped odds-snapshot permission: Show actual captured prices rather than describing them as live. Include the true capture date and time on the relevant image.

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-05 ET slate.

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 107 credits

| Term | Value |
|---|---|
| Scope | Publication only: quotes already captured today under the Step 2 props receipt, shown on NBA matchup social graphics for 2026-11-05 ET, each with its true capture time (`ODDS SNAPSHOT · <time> ET`). |
| Ceiling | 107 = the ledger as it stands; NO new capture or credit is authorized here (no new spend). |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Cadence | No capture. Publication pregame only; nothing after a game starts. |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. The shared 3,500/week budget applies across all jobs. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | 2026-11-05 (ET end of day); no new captures |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | NBA matchup social graphics for 2026-11-05 (images, never a feed or downloadable file). No sportsbook names or logos. |
| Kill switch | Do not run the capture. The receipt refuses on its own after its expiry or ceiling. |

Approved by: founder 2026-11-05
