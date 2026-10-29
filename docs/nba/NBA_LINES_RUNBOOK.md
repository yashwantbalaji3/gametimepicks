# NBA lines: capture to site, end to end (runbook)

Status, 2026-10-29: **switched off and refusing by default.** The display authorization record is all false or null.
The exporter refuses. The build-time reader returns null. Pages render exactly as they did before this path existed.
The social feed carries no line, price or book. When the founder confirms display rights, turning this on should be a
reviewed config change, with no new code.

## The provider terms that shape this design

The Odds API terms (the-odds-api.com/terms-and-conditions.html, updated 2026-08-31):

- **Allowed:** displaying the data "in a UI, website…".
- **Not allowed:** redistributing it "as a standalone data product". The terms name "your own API, data feed,
  downloadable files" as examples.

What follows from that:

1. The comparison artifact is **never** written under `app/public/`. The static export serves everything there as a
   downloadable file. The artifact is a **build input outside public/**. It is read at build time and rendered into page
   HTML only.
2. The social feed `/data/social/nba/v1/*.json` is itself a public data feed. It may carry side, difference, line and
   capture time for COMPARED rows once the `social` surface is authorized. **Prices and book names** need a separate
   switch, `socialFeedPrices`, which requires the provider's **written** confirmation (`socialFeedPricesConfirmationRef`).
3. A post-build guard (`app/src/lib/odds/odds-display-export.test.mjs`) fails if any exported JSON under `out/data/nba/`
   or `out/data/social/nba/` carries a price or book value, or if the artifact itself ever appears in `out/`.

## The pieces

| Piece | Path | Role |
|---|---|---|
| Display authorization record | `app/src/lib/odds/display-authorization.mjs` | The one switch. `displayAuthorization(sport, surface)` returns a verdict. `assertDisplayAuthorized(sport, surface)` throws unless it is authorized. Surfaces: `site`, `social`, `socialPrices`. |
| Derived switch | `app/src/lib/sports/nba/line-board.mjs` `NBA_LINE_DISPLAY` | Computed from the record (`nbaLineDisplayFrom`). It is never edited by hand. |
| Capture | `app/scripts/nba/capture-nba-props-odds.mjs` | Receipt-gated. Writes `gtp.nba.prop-price@1` records to `<private dir>/odds/nba/props/` only. |
| Private board | `app/scripts/nba/compare-nba-lines.mjs` | Optional private review. Writes `<private dir>/odds/nba/line-board/<date>.json`. |
| Exporter | `app/scripts/nba/publish-nba-line-board.mjs`, rules in `app/src/lib/sports/nba/line-publication-build.mjs` | Writes the artifact `gtp.nba.line-comparisons@1`. |
| Contract + reader | `app/src/lib/sports/nba/line-publication.mjs`, `app/src/lib/sports/nba/public-line-records.mjs` | Build-time read of `<date>.json`, gated by the record. `nbaPublicLineRecords(date)` serves the pages. `nbaSocialLineBoard(date)` serves the feed. |
| Site wiring | `app/src/components/nba/nba-prop-lines.tsx` | Used by /nba/projections (and its dated pages), the game page's Official Forecast panel, and settled game pages. |
| Social wiring | `app/src/lib/social/nba-social-data.ts` → `nba-social.mjs` | `lineComparison` per player and family. The Command Center reads `side` verbatim. |

## Where the artifact lives (two options; choosing one is a founder decision)

- **Option A: committed build input** at `data/odds-display/nba/lines/<date>.json`. This path is a `BUILD_INPUT` in
  `app/scripts/vercel-ignore-build.sh`, so a new file rebuilds the site. **The repository is public.** Committing this
  file puts the prices on GitHub, where anyone can read them. That is a redistribution question in its own right, so
  committing it is itself a founder decision under the terms above. The guard
  `app/src/lib/sports/nba/line-publication-guard.test.mjs` fails CI if any file sits there while `site` is not
  authorized.
- **Option B: private build-time path.** Run the exporter with `--out /abs/private/lines` (outside every git working
  tree), then build with `GTP_NBA_LINES_DIR=/abs/private/lines`. The prices never enter the repository; only the
  rendered HTML carries them. This needs a build environment that can read that directory, such as a private Vercel
  build step or a mounted secret store. The current Vercel Git build cannot, so Option B means changing how the build
  is fed.

## Steps

1. **Capture (receipt).** Commit a receipt under `docs/receipts/` that authorizes the NBA prop markets and whose
   *Output* line **allows publication**. The 2026-10-21 pilot receipt says "Output: Private research and shadow
   evaluation only", and the exporter refuses it. Then run
   `npx tsx app/scripts/nba/capture-nba-props-odds.mjs --now <ISO> --authorized --receipt docs/receipts/<file>.md --apply --out-dir /abs/private`
   inside the receipt's window (T-60 with a T-30 fallback, never after tip).
2. **Private board (optional review).**
   `node app/scripts/nba/compare-nba-lines.mjs --date <YYYY-MM-DD> --as-of <ISO> --out-dir /abs/private`.
3. **Authorization record (founder).** In a reviewed commit, fill `DISPLAY_AUTHORIZATION.nba`:
   - `siteDisplay: true`, and `socialDisplay: true` only if the feed is approved;
   - `providerTermsRef`: the committed document recording the provider terms and the clause above (required);
   - `approvedBy`, `approvedAt` (YYYY-MM-DD) (required);
   - `attribution`: optional, because the provider does not require it. When set, it is printed beside every shown
     line;
   - `socialFeedPrices` stays `false` unless the provider confirmed in writing that the feed may carry prices. If it
     did, set `socialFeedPricesConfirmationRef` to that confirmation.

   A partial record refuses every surface.

   This commit **must also update the tests that pin the off state**. They are the second key that makes the flip
   reviewed:
   - `display-authorization.test.mjs` "committed state";
   - `prop-line-switch-off.test.mjs` "the switch is off in this commit";
   - `line-board.test.mjs` "display defaults to private".
4. **Publish.**
   `npx tsx app/scripts/nba/publish-nba-line-board.mjs --date <YYYY-MM-DD> --as-of <ISO> --receipt docs/receipts/<file>.md --private-dir /abs/private [--out /abs/private/lines]`.
   It refuses, exits non-zero and writes nothing in these cases:

   | Exit | Cause |
   |---|---|
   | 2 | Not authorized. |
   | 2 | Bad or missing `--date`, `--as-of` or `--receipt`. |
   | 2 | `--out` is inside a git tree, `app/public` or `out/`. |
   | 2 | The receipt is invalid at a record's fetch instant, or is private-only. |
   | 3 | No committed lane for the date. |
   | 4 | A slate record has an ineligible book, a market not on the receipt, a capture at or after tip, or the wrong schema or provider. |
   | 5 | No comparison survives the rules: pre-tip, at most 6 h old, matched identity, same market. |

   Stale, unmatched, other-slate and unsupported inputs are only **counted**. Their numbers are never written. Rows
   with a one-sided quote are written with both prices `null` and `prices: "PRICE_UNAVAILABLE"`. The output is
   deterministic: the same inputs and `--as-of` give the same bytes. Stdout carries counts only.
5. **Build.** Option A: commit the artifact (with the founder's go-ahead), which triggers a build. Option B: build with
   `GTP_NBA_LINES_DIR`. If the artifact is present but invalid, the reader throws and fails the build loudly. Invalid
   includes a lane that changed since publication, so republish after any lane change.
6. **Verify.**
   - The /nba/projections and NBA game pages show "Model vs. sportsbook line" rows, with the attribution if one is set
     and "Sportsbook availability varies by state."
   - `out/data/` holds no `nba/lines` or `odds-display` directory.
   - The post-build guard `odds-display-export.test.mjs` passes.
   - `/data/social/nba/v1/<date>.json` `lineComparison` rows carry `side`, `difference`, `line` and `capturedAt`, but
     no price or book unless `socialFeedPrices` is set.

## Option, documented only (not implemented): capture on a GitHub runner

Captures run locally today because GitHub Actions logs in a **public** repository are public. A capture job's output
would expose prices before display rights existed. Once display is authorized and the prices are shown on the site
anyway, that objection to *public logs* mostly goes away. A scheduled workflow could then run the capture with
`ODDS_API_KEY` as a repository secret. It would keep the private capture directory in the runner's workspace and run
the exporter, then either:

- commit the artifact (Option A), or
- hand it to the build as `GTP_NBA_LINES_DIR` (Option B).

These caveats remain:

1. The terms still forbid a downloadable file. Workflow **artifacts** and logs must not carry raw records; the job
   must print counts only, as both CLIs already do.
2. Crons in this repository are unreliable (*/30 ran 3 of 48 times). Trigger the capture from events rather than
   timers.
3. The key must stay out of the logs.
4. The capture receipt must still authorize the spend, and the ledger stays in the repository.
