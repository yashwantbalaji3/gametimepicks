# Model vs sportsbook line: the shared contract (website ↔ Command Center)

**Status:** contract and validator implemented and tested (`recap/odds-comparison.mjs`, `tests/odds-comparison.test.mjs`).
- Social odds graphics are **gated off** (`SOCIAL_ODDS_ENABLED = false`).
- No social graphic uses a line today.

**Principle:** the website owns odds. The Command Center **consumes** the website's records and results verbatim. It never fetches prices, never chooses a book, and never computes a lean, an edge or an EV.

## Sources of truth (public repo, `main`)

| Concern | Owner module | What the Command Center uses |
|---|---|---|
| Forecast identity and version | `lib/consistency/official-snapshot.mjs` (e.g. `nbaOfficialSnapshot`) | The same snapshot id the website evaluates against |
| Player, team and event ids | Price record: `eventId` (ESPN event id, joined by both teams + start), `providerAthleteId` (ESPN athlete id via roster + reviewed aliases; a name is never the identity) | Copied; a mismatch refuses |
| Market definitions | Family keys of the official snapshot (`pts`, `reb`, `ast`, `threePm`, NFL families …) | Copied; never renamed |
| Line and prices | Price record (`gtp.nba.prop-price@1`, provider `the-odds-api`): `line`, `book`, `bookTitle`, `overAmerican`, `underAmerican`, `capturedAt` (the provider's own update time), `fetchedAt` | Copied verbatim |
| Which book is shown | `sports/odds/prop-display-selection.mjs`: reference book DraftKings, fallback FanDuel, the chosen book named on screen | The record the website selected |
| Which books may be named | `sports/odds/eligible-operators.mjs` allowlist (offshore books refused, fail-closed), plus "Sportsbook availability varies by state." beside any book name | The allowlist plus the same sentence |
| Freshness and availability | `sports/odds/availability.mjs`: `SOURCE_ERROR` / `QUARANTINED` / `STALE` / `CAPTURED` / `AUTHORIZATION_REQUIRED` / `DRY_RUN_READY` / `DISCOVERABLE_ZERO_QUOTA` | Only `CAPTURED` allows a comparison |
| Over/Under calculation | `lib/consistency/market-evaluator.mjs` `evaluateMarket` (`gtp.consistency.market-evaluator@1`): the lean is decided by price (EV ≥ minEv and edge ≥ minEdge); "a projection below the line is never, by itself, an UNDER" | `lean`, `withheldReasons` and `eligibility.qualified`, verbatim |

## What a social comparison shows (only when every check passes)

- Player and team, the market, the **official projection**.
- The **sportsbook line**, the book's name, and the Over and Under prices.
- The lean: **OVER = green, UNDER = red, NONE = neutral**, taken from the evaluator's `lean`.
- **Model − line** as a separate signed number (e.g. +6.5). This is presentation only: not an edge, not an EV.
- Quote time and age, and "Sportsbook availability varies by state."

## When it falls back to projection-only (and holds any line-dependent graphic)

Any one of these triggers the fallback:
- the gate is off;
- no verified price;
- an unknown evaluator version;
- availability is not `CAPTURED` (for example `STALE`);
- the book is not eligible;
- the evaluation doesn't match the record (line or capture time);
- the event has started;
- the evaluation is not qualified (blocking reasons such as stale, one-sided or after-lock prices; or qualification reasons such as family not published, participation not cleared, private snapshot, sport not product-eligible, below the lean threshold).

**Never:** a made-up line, an interpolated price, a "best odds" blend, or a colour taken from projection vs line.

## Facts on `main` today (2026-10-29)

- **NBA player-prop prices:** adapter and contract tests only. No paid Odds API credits are approved for NBA props, so there are no prices.
- **NBA families are not qualified:** they are `PRIVATE_SHADOW`, so the evaluator returns `FAMILY_NOT_PUBLISHED` and `qualified: false` for every NBA price. NBA comparisons are therefore impossible today, by design.
- **NFL:** the website's prop display selection and capture exist. Whether a social board may name a book is also a display-rights question (see below).

## One decision for the founder

You described the side as "projection 36.0 vs line 29.5 → OVER (green), +6.5". The website's evaluator decides the side from **price**, not from projection vs line. Under the one-official-forecast rule, the Command Center shows the website's lean, with **model − line** as its own number. If you want projection-above-line itself coloured, that is a change to the shared evaluator (the website), not to social graphics alone.

## Gates before `SOCIAL_ODDS_ENABLED` can be turned on

1. A verified feed for the sport, with availability `CAPTURED` inside its freshness bound.
2. Display rights for showing sportsbook names and prices in social posts (provider terms and the operator policy).
3. An API budget the founder has approved (no auto-recharge).
4. A design approval for the comparison graphic (a new template version).
5. An end-to-end test on real captured records reproducing the website's numbers byte for byte.
