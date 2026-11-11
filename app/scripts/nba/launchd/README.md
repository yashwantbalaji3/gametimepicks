# NBA prop prices: the local tick (release owner's machine)

Receipt: `docs/receipts/ODDS_AUTHORIZATION_NBA_PROPS_PRIVATE_2026-11-11.md`. It runs on this machine, never on a GitHub-hosted runner. The founder's 2026-10-22 storage rule applies: prices go only to `~/gtp-private`.

## Install (the Program Director does this, after review)
1. **Dedicated checkout** outside `~/Downloads`, because launchd bash and git jobs cannot read `~/Downloads`; node can.
   - Run `git clone <origin> ~/gtp-capture/gametimepicks`, then `touch ~/gtp-capture/gametimepicks/.gtp-capture-checkout`.
   - The runner resets this checkout to `origin/main` every tick, and refuses any checkout without the marker.
   - Its git remote needs push access, for the ledger commit.
2. **Key:** `~/gtp-private/odds/nba/odds.key`, holding the Odds API key, with `chmod 600`. It is never stored in the plist.
3. **plist:** fill `__NODE__` (output of `command -v node`), `__REPO__` and `__HOME__` in `com.gametimepicks.nba-props-local-tick.plist.template`. Copy it to `~/Library/LaunchAgents/`, then run `launchctl bootstrap gui/$(id -u) <plist>`.
4. **Dry check first,** with no paid call: `node <repo>/app/scripts/nba/run-nba-props-local-tick.mjs --repo <repo> --private ~/gtp-private`. It prints `NOTHING_TO_PRICE` or `PLANNED`.

## Kill switch
- `touch ~/gtp-private/odds/nba/STOP`: the next tick exits before any network call.
- Or `launchctl bootout gui/$(id -u)/com.gametimepicks.nba-props-local-tick`.

## What a tick does
1. Kill switch.
2. Sync the checkout.
3. Record `MISSED_WINDOW` games, once each, in the private state only.
4. Find games 20–75 min before tip. With none, it makes no network call at all.
5. Free preflight: receipt, plan balance, certain cost, ceiling, the 2,000 floor and the shared 3,500/week cap.
6. Authorized capture.
7. Commit the ledger alone.

A ledger push that fails blocks every later paid tick until a person resolves it and clears `ledgerUnpushed` in `~/gtp-private/odds/nba/props-runner/state.json`.

Mac asleep means the window is missed: no spend, recorded as `MISSED_WINDOW`, and never retried after tip.
