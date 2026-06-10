# UFC prop-odds provider search (method / distance / rounds)

**Connected-keys check (2026-06-09):** repo secrets are `ODDS_API_KEY` + `BALLDONTLIE_API_KEY` ONLY — no `OPTICODDS_API_KEY`, `SPORTSDATAIO_API_KEY`, or `SPORTSGAMEODDS_API_KEY`. So no paid-provider discovery probe is possible tonight; connecting any of them is a **paid decision requiring user approval**. The Odds API is re-probed automatically by `ufc-prop-discovery.yml` in case it adds MMA props.

**Confirmed:** The Odds API MMA exposes `h2h` ONLY (live probe — totals/method/
distance/rounds all unavailable). To unlock prop projections we need a provider
that actually carries MMA props. Options (NO paid activation here):

| Provider | Prop coverage | API | Cost | ToS/risk | Historical | Rec |
|---|---|---|---|---|---|---|
| The Odds API (current) | h2h only | yes (have key) | in budget | low | h2h snapshots fwd | keep for moneyline |
| SportsDataIO MMA odds | method/round varies | yes | **paid** | low | some | **evaluate (paid decision)** |
| OpticOdds | broad props (method/rounds) | yes | **paid** | low | yes | strong candidate (paid) |
| Pinnacle (direct) | method/distance/rounds | restricted | acct/paid | ToS | limited | hard to access |
| Sportradar MMA | method/rounds (enterprise) | yes | **paid (enterprise)** | low | yes | enterprise pricing — overkill |
| Sports Game Odds | h2h + some MMA props | yes | **paid** | low | some | mid candidate (paid) |
| Betfair Exchange | some MMA markets | yes (acct) | acct | regional/ToS | limited | regional friction |
| BetMGM/DK/FD direct | rich props | no public API | — | **scrape risk** | no | NOT recommended |
| RapidAPI MMA odds | varies/unreliable | yes | varies | varies | varies | low-confidence |

**Recommendation:** moneyline ships first on The Odds API (no new provider needed).
For props, the cleanest paths are **OpticOdds** or **SportsDataIO MMA odds** — both
**paid decisions requiring user approval**. No scraping of sportsbooks. Re-run
`ufc-prop-discovery.yml` periodically in case The Odds API adds MMA props.

## Ranked recommendation
1. **Immediate method/distance/round props:** OpticOdds — broadest MMA prop coverage, modern REST API, per-fight method/rounds. *Paid; needs user approval.*
2. **Historical prop odds (for a prop backtest):** SportsDataIO or OpticOdds historical endpoints. *Paid.*
3. **Cheapest viable:** SportsDataIO MMA odds tier (narrower props than OpticOdds but lower entry cost). *Paid.*
4. **Safest legal/ToS:** any licensed odds API (OpticOdds / SportsDataIO / Sportradar) over sportsbook scraping — **never scrape books**.
5. **Fastest integration:** OpticOdds — implement `pipeline/ufc/providers/prop_odds_base.py` for it, set its market keys, done.

## What can / cannot be built now
- **Now, no activation:** the inactive `prop_odds_base.py` interface, the `build_prop_odds --discover` probe, and the `prop-odds-latest.json` *unavailable* status artifact. `ufc-prop-discovery.yml` re-checks The Odds API automatically.
- **Requires user payment/approval:** connecting OpticOdds or SportsDataIO (a paid decision).
- **Impossible without real prop odds:** any method/distance/round projection. We will not invent prop markets from h2h — props stay fail-closed (`methodPropsReady=distancePropsReady=roundPropsReady=false`).

