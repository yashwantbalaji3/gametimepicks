# Model vs sportsbook line: the shared contract (website ↔ Command Center)

**Status:** contract and validator implemented and tested (`recap/odds-comparison.mjs`, `tests/odds-comparison.test.mjs`).
- Social odds graphics are **gated off** (`SOCIAL_ODDS_ENABLED = false`).
- Social display of sportsbook prices is **not cleared** (decision D3 is open).
- Today every feed row is `NOT_AUTHORIZED`, so no social graphic shows a line.
- Aligned with the GameTimePicks launch-readiness session on 2026-10-29.

**Principle:** the website owns odds and the comparison. The Command Center reads the website's **public social feed** verbatim. It never fetches prices, picks a book, compares, or re-runs any evaluator. Raw prices stay private under the 10-22 storage rule: the repo is public.

## Source: `/data/social/nba/v1/<date>.json` (contract `gtp-social-nba@1`)

**Per player and family, `lineComparison.status` is one of:**
- `NOT_AUTHORIZED`
- `UNAVAILABLE`, with a reason: `STALE`, `CAPTURED_AFTER_TIP`, `NO_LINE`, `UNMATCHED`, `MARKET_MISMATCH`, `WRONG_DAY`, `INVALID_LINE` or `NO_PROJECTION`
- `COMPARED`, carrying:
  - `line`, `overPrice`, `underPrice` (missing means "price unavailable", never 0);
  - `book`, `marketKey`, `capturedAt`;
  - `difference` (model − line, signed);
  - `direction` (`ABOVE` / `BELOW` / `EQUAL`);
  - `side` (`OVER` / `UNDER` / `NEUTRAL`);
  - `freshness`.

**Top-level `lineComparisons`:** legend, graphicRule, `displayPermission`.

**Quote validity is decided by the website:** a line counts only if it was captured before tip and is at most 6 h old (`LINE_MAX_AGE_HOURS`).

**Coming in the website's pending release** (additive, not yet on Production):
- `isLatest`;
- `slateState` (`UPCOMING` / `IN_PROGRESS` / `SETTLED`);
- `today {etDate, status: PUBLISHED | NOT_YET_PUBLISHED | NO_GAMES | DISABLED}` in `latest.json` and `index.json`.

Reference: `COMMAND_CENTER_NBA_CONTRACT.md` in the founder's launch-program folder.

## The display standard (founder, 2026-10-29: same rule on site and social)

- **Colour = the row's `side`:**
  - projection **above** the one verified line → **OVER (green)**;
  - **below** → **UNDER (red)**;
  - equal → **NEUTRAL** (subdued).
- **Model − line** is shown signed, for example +6.5.
- **It is a model direction, not a pick and not an expected-value claim.** Graphics say so in their record and caption context.
- Shown together: player and team, market, official projection, line, book, Over and Under prices where available, side, difference, and quote time and freshness. Beside the book name: "Sportsbook availability varies by state."

## Falls back to projection-only, and holds any line-dependent graphic, when

Any one of these applies:
- the gate is off;
- the feed contract is unknown;
- social display is not permitted;
- the row is not `COMPARED`;
- a field is missing;
- the book is not on the website's eligible-operator allowlist;
- the event has started.

**Never:** a made-up line, a price of 0, an interpolated or "best" price, or a recomputed difference.

## Gates before `SOCIAL_ODDS_ENABLED` can be turned on

1. **D3:** display rights for sportsbook names and prices in social posts.
2. **Feed rows `COMPARED`** for the sport: a verified, fresh feed with an approved API budget, and no auto-recharge.
3. **Founder design approval** of the comparison graphic (a new template version).
4. **An end-to-end test** on a real feed file, with numbers matching the website byte for byte.

NFL follows the same contract once the website publishes an equivalent feed. Until then NFL social posts stay projection-only.
