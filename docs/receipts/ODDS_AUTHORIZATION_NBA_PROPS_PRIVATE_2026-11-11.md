# Founder Odds-API Authorization — NBA player props, PRIVATE capture, 2026-11-11 → 2026-11-17 ET

**Receipt ID:** `ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11`

**Provenance:** typed by the founder in the Program Director session and recorded at 2026-11-11T01:06:26Z (`~/gtp-evidence/nov11-founder-nba-line-capture-authorization.md`). This is a new receipt; it revives no earlier NBA receipt. Storage and runner were decided by the Program Director on 2026-11-11 (option B): the founder's 2026-10-22 storage rule stands.

- **Guard:** `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`).
- **Preflight:** `nbaPropsPreflight` (`app/src/lib/sports/odds/nba-props/preflight.mjs`).
- **Runner:** `app/scripts/nba/run-nba-props-local-tick.mjs`.
- **Ledger:** `data/internal/research/odds/nba/authorization-ledger.json`.

## Authorization (verbatim)

> I authorize a new dated NBA line-capture receipt for November 11–17, 2026, subject to the following exact limits:
> 1. Scope: NBA points, rebounds, assists and three-pointers only, using verified The Odds API market identifiers and supported pregame games.
> 2. Maximum usage: 450 API credits for the entire authorization period, not 450 per day. This must also remain within our existing shared 3,500-credit weekly cap and never breach the 2,000-credit reserve floor.
> 3. Cadence: At most one authorized capture per game, between 20 and 75 minutes before scheduled tipoff, using the verified current game schedule.
> 4. Storage: Private data capture only. Save exact game, player, market, line, price, sportsbook, timestamp and provider provenance. No public sportsbook prices or paid-data publication is authorized by this message.
> 5. Preflight: Before any paid call, verify the current subscription, remaining credits, expected request cost, provider permissions and that the dated authorization receipt has been saved. If the expected cost is uncertain or exceeds the remaining budget, do not proceed.
> 6. No additional spending: Do not upgrade subscriptions, purchase extra credits, start uncontrolled polling or exceed the approved provider plan.
> 7. Failure behavior: If the API is unavailable, an event is unmatched, the quote is stale or the authorized budget is exhausted, record the issue without inventing a line. Alert only when action is necessary.
> 8. Integration: Reuse the existing NBA pregame workflow without generating unnecessary Vercel builds. Keep model-threshold hit records and actual sportsbook-line hit records strictly separated.
> 9. Verification: Report the receipt ID, actual credits consumed, records captured, failed or missing markets and whether the Trends data pipeline is functioning.
> Continue the NFL-first work and the existing 04:00 UTC release queue without interruption.
> This approval covers private data collection only. Any subsequent public display of sportsbook lines or prices requires its own authorization and compliance review.

## Operative terms

NBA player props only (`basketball_nba`).

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`, `player_threes`

These are the verified The Odds API market keys for points, rebounds, assists and threes (`app/src/lib/sports/odds/nba-props/contract.mjs`, source: the provider's betting-markets page).

Effective cumulative ceiling: 461 credits

The arithmetic: the committed ledger's `cumulativeCredits` on main at receipt time is **11**, plus the founder's **450** for this period, gives **461**. The local runner books every call into that same committed ledger, so this period can never spend more than 450.

One discrepancy is noted. The 2026-10-29 → 11-03 local captures booked 511 further credits (cumulative 522) only into a local worktree ledger (`gametimepicks-wt/nba-capture`). If that ledger is ever reconciled into main, the cumulative passes 461, and this receipt then refuses every further call. That failure is fail-safe.

| Term | Value |
|---|---|
| Scope | NBA player props only; the four markets above; pregame games of the committed ESPN schedule (`app/public/data/nba/schedule/latest.json`) joined to the provider's free event listing (both teams, ±45 min, home/away aligned). Every other sport, market (game lines included) and product is out of scope |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only (draftkings, fanduel, betmgm, williamhill_us, caesars, betrivers, fanatics, espnbet, betparx); no `regions=`. That is 1 region unit |
| Endpoint | the free `/v4/sports/basketball_nba/events` for the join, then per game `/v4/sports/basketball_nba/events/{id}/odds` with the four markets |
| Expected cost | worst case 4 credits per game (4 markets × 1 region unit; `planNbaPropCapture`). Schedule 2026-11-11 → 11-17 ET: 10 / 4 / 9 / 5 / 9 / 8 / 5 games = 50 games, at most **200 credits** (per night at most 40 / 16 / 36 / 20 / 36 / 32 / 20). An uncertain cost (no plan, or an unpriced market) refuses before any call |
| Cadence | at most ONE successful capture per game, more than 20 and at most 75 minutes before scheduled tip, by the committed schedule; never at or after tip. One local tick every 15 minutes. A game whose window passed with no capture (Mac asleep, runner down) is recorded MISSED_WINDOW: no spend, no retry after tip |
| Preflight | before any paid call, every one of these must hold, or the tick refuses with its reason and makes no paid call: this receipt parses at `now` (present, unexpired, under its ceiling); the free `/v4/sports` reply is 200 with a readable plan balance (`x-requests-used`, `x-requests-remaining`, `x-requests-last` = 0); the expected cost is certain; the credit floor holds; the shared weekly cap holds |
| Credit floor | every paid call requires remaining − worst case ≥ `ODDS_API_MIN_CREDITS_REMAINING` (2000). An unreadable balance stops the run before any paid call |
| Shared weekly cap | 3,500 credits per week across ALL jobs and runners on the key. The local runner reads provider-reported usage (`x-requests-used`, the free `/v4/sports`) before each tick. It stops if usage since the period's baseline, plus the tick's worst case, would exceed 3,500. The baseline is the first preflight reading of the period, kept in the runner's private state. Usage on the key earlier in the same week, before that reading, is not visible to it; the 2,000 floor still bounds it |
| Failures | any 401/429/5xx/unmodelled status or transport error stops the run; do not retry blindly; a transport error is booked as charged. Unmatched events, stale or one-sided quotes and an exhausted budget are recorded with their reason; a line is never invented. An ops alert (`scripts/ops_alert.sh`) is raised only for an action-needing failure: an authorization failure, a rate or credit limit, a provider incident, or a ledger that cannot be written |
| Expiry | the 461-credit cumulative ceiling, or 2026-11-17 23:59 ET, whichever comes first |
| Storage | price records ONLY in a private directory outside every repository (founder storage decision 2026-10-22; `app/src/lib/ops/private-data-dir.mjs`): `~/gtp-private/odds/nba/props/`. Each record holds game, player, market, line, price, sportsbook, timestamp and provider provenance. The capture runs on the release owner's machine (a node launchd job), never on a GitHub-hosted runner (public logs, no private storage). Only the credit ledger (credits, status and provider balance; no line, no price, no book) is committed, to an internal path that is not a Vercel build input |
| Output | PRIVATE_RESEARCH, productEligible false. No price, line or book name reaches any public page, export or social graphic. Sportsbook-line hit records are kept apart from model-threshold hit records. No recommendation, product leg or promotion threshold changes |
| Kill switch | unload the launchd job (`launchctl bootout gui/$(id -u)/com.gametimepicks.nba-props-local-tick`), or create `~/gtp-private/odds/nba/STOP`: a tick that finds it exits before any network call. The receipt refuses on its own after its expiry or ceiling |

Approved by: founder 2026-11-11
