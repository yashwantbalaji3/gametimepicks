# UFC prop-odds provider search (method / distance / rounds)

**Confirmed:** The Odds API MMA exposes `h2h` ONLY (live probe — totals/method/
distance/rounds all unavailable). To unlock prop projections we need a provider
that actually carries MMA props. Options (NO paid activation here):

| Provider | Prop coverage | API | Cost | ToS/risk | Historical | Rec |
|---|---|---|---|---|---|---|
| The Odds API (current) | h2h only | yes (have key) | in budget | low | h2h snapshots fwd | keep for moneyline |
| SportsDataIO MMA odds | method/round varies | yes | **paid** | low | some | **evaluate (paid decision)** |
| OpticOdds | broad props (method/rounds) | yes | **paid** | low | yes | strong candidate (paid) |
| Pinnacle (direct) | method/distance/rounds | restricted | acct/paid | ToS | limited | hard to access |
| Betfair Exchange | some MMA markets | yes (acct) | acct | regional/ToS | limited | regional friction |
| BetMGM/DK/FD direct | rich props | no public API | — | **scrape risk** | no | NOT recommended |
| RapidAPI MMA odds | varies/unreliable | yes | varies | varies | varies | low-confidence |

**Recommendation:** moneyline ships first on The Odds API (no new provider needed).
For props, the cleanest paths are **OpticOdds** or **SportsDataIO MMA odds** — both
**paid decisions requiring user approval**. No scraping of sportsbooks. Re-run
`ufc-prop-discovery.yml` periodically in case The Odds API adds MMA props.
