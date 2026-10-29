# The Odds API display terms — site display of NBA and NFL model-vs-line comparisons

Recorded 2026-10-29. This is the `providerTermsRef` of the `nba` and `nfl` entries in
`app/src/lib/odds/display-authorization.mjs`.

## Source

- Provider: The Odds API.
- Terms: https://the-odds-api.com/terms-and-conditions.html
- Version reviewed: "last updated 31 Aug 2026".

## What the terms say (short quotes; the rest paraphrased)

| Topic | Terms | Effect for us |
|---|---|---|
| Display | Permitted: "Displaying our data in a UI, website, or mobile app" — including for commercial use, provided the data is not the primary product being sold or redistributed. | Lines may be rendered on our site next to our own projections. Our product is the forecast; the line is context. |
| Attribution | "Attribution to The Odds API is not required." | The record's `attribution` stays `null`. A future record may add one; every surface would print it. |
| Storage | Storing the data is allowed. | We keep captured lines, encrypted at rest. |
| Redistribution | Forbidden: to "resell, repackage, or redistribute our data as a standalone data product". The terms name "your own API, data feed, downloadable files" as examples. | No line, price or book name in any JSON file, feed, API route or download. |

## Our compliance design

1. **HTML only.** Lines, prices and book names reach readers only as page HTML rendered at build time. The comparison
   artifacts (`gtp.nba.line-comparisons@1`, `gtp.nfl.prop-lines@1`) are build inputs under `data/odds-display/`,
   outside `app/public/`, so the static export never serves them as files.
2. **Encrypted at rest.** Committed artifacts are AES-256-GCM envelopes (`*.json.enc`, `app/src/lib/odds/display-crypto.mjs`)
   bound to their sport and date/event. Plaintext is never committed. The repository is public; the key
   (`GTP_ODDS_DISPLAY_KEY`) is not. A build without the key, or with a different key, renders the page exactly as it is
   without the feature.
3. **No JSON, feeds or downloads.** A post-build guard (`app/src/lib/odds/odds-display-export.test.mjs`) fails if an
   exported JSON file carries a price or book value, or if an artifact appears in `out/`.
4. **No social prices, no social display.** `socialDisplay` and `socialFeedPrices` stay `false` for both sports. The
   public social feed (`/data/social/nba/v1/*.json`) is itself a data feed, so it keeps `lineComparison.status:
   "NOT_AUTHORIZED"`. Feed prices would additionally need the provider's written confirmation
   (`socialFeedPricesConfirmationRef`).
5. **Directions are gated separately.** A family shows OVER / UNDER only when it is direction-qualified (founder rule
   2026-10-29: graded official above-median share in [0.45, 0.55] with n ≥ 300, supplementary to every other check; not
   proof of advantage). Every other comparable row says "Comparison not shown".
6. **Reference book order.** DraftKings, FanDuel, BetMGM, Caesars, then others, applied within one capture request; a
   later capture still wins.

## Approval

- Site display of NBA and NFL model-vs-line comparisons: approved by the founder on **2026-10-29**, conditional on this
  review.
- Not approved: social display and social feed prices.
