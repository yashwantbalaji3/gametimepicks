# Founder Odds-API Authorization — NBA Bank Builder & Moonshot V2 challenge lanes, 2026-11-04 to 2026-11-10 ET

**Provenance:**
- Delivered by the founder directly in the November Program Director session on 2026-11-04 ("FOUNDER APPROVAL — BANK BUILDER & MOONSHOT V2 REAL ODDS AND SOCIAL GRAPHICS").
- It approves the betting-engine's draft terms, which are reproduced below unchanged.
- Recorded by the Program Director from the founder's own message, not from a relay.
- Guard: `parseBbmOddsReceipt` (`app/src/lib/challenge-lanes/odds.mjs`). Ledger: `data/internal/research/odds/nba/bbm-ledger.json`.

## Authorization (verbatim)

> I approve both pending items: the limited NBA odds-retrieval authorization and enabling selected NBA sportsbook prices on Bank Builder and Moonshot V2 social graphics.
> Please record this as my explicit written authorization and coordinate the implementation directly with the betting engine, Command Center, graphics and website sessions.
> Use our already-active The Odds API subscription. Do not purchase another subscription or increase our spending.
> I approve the proposed receipt covering NBA moneylines and relevant player-prop markets, subject to the existing restrictions:
> Maximum 120 credits daily and 600 total through November 10, 2026, 11:59 PM ET.
> Respect the 3,500-credit shared weekly budget.
> Never allow the balance to fall below 2,000 credits.
> No polling, automatic retries or unnecessary requests.
> Retrieve prices only for actual eligible legs and report credits consumed.
> Keep same-game combinations disabled unless a verifiable combined price is available. Do not represent multiplied same-game prices as an actual sportsbook offer.
> My approval here authorizes price retrieval and the limited social-price display implementation. It does not authorize publishing any X post, deploying unrelated changes, or modifying the already-installed November 4 NBA posting pipeline.

Approved by: founder 2026-11-04

## Operative terms (proposed)

NBA-only (`basketball_nba`), for the Bank Builder & Moonshot V2 challenge lanes only.

Markets authorized: `h2h`, `player_points`, `player_rebounds`, `player_assists`, `player_points_rebounds_assists`, `player_points_rebounds`, `player_points_assists`

Effective cumulative ceiling: 600 credits

BBM daily ceiling: 120 credits

BBM weekly ceiling: 600 credits

Shared weekly ceiling: 3,500 credits

Shared weekly baseline: 306 used at 2026-11-04T04:15Z

Credit floor: 2000

| Term | Value |
|---|---|
| Scope | Prices for legs held by a frozen Bank Builder & Moonshot V2 lane card only. |
| Prop markets | Listed but unused. No lane holds a prop leg until an official prop probability is approved. |
| Sportsbooks | `bookmakers=` takes the nine eligible-operators@1 keys (US operators). No `regions=` is sent; the nine keys cost the same 1 region-unit. |
| Endpoint and cost | First the free `/events` listing. Then ONE bulk `/odds?markets=h2h&eventIds=…` call per run, for the events that hold a candidate leg. Worst case: 1 credit per run. |
| Cadence | On demand only (`lanes-price --apply`): no poller, no LaunchAgent. A price is used only if captured before the first leg's start and at most 90 minutes before the post. |
| Budget | All of these must hold, or the call is not made. ET-day spend plus the worst case is ≤ 120. BBM cumulative plus the worst case is ≤ 600. Provider usage since the baseline plus the worst case is ≤ 3,500, across all jobs. The balance minus the worst case is ≥ 2000. An unreadable balance stops the run. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | The 600-credit cumulative ceiling, or 2026-11-10 23:59 ET, whichever comes first. |
| Storage | Prices go only to `GTP_PRIVATE_DATA_DIR`, outside every repository. Only the credit ledger is committed. The key comes from the environment and is never printed. |
| Output | Allowed: the private lane log, the graphics rendered from it, and the encrypted site display (`gtp.odds-display.enc@1`). Not allowed: prices in plain public JSON, a feed, or a downloadable file. |
| Kill switch | Do not run `lanes-price --apply`. |
