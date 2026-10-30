# NBA lines: capture to site, end to end (runbook)

Status, 2026-10-29: **site display authorized for NBA and NFL** (founder, after the provider-terms review in
[`docs/odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md`](../odds/ODDS_API_DISPLAY_TERMS_2026-10-29.md)). Social display and
social feed prices stay **off**: the social feed carries no line, price or book. A page renders the comparison only when
an encrypted artifact for its date or game exists AND the build has the display key. Without one (every CI build, every
historical date) the page is byte-identical to the page without this feature: no section, no "Unavailable" block.

This runbook covers **NBA and NFL** (the same record, the same encryption, the same direction gate). Three
founder-decided rules, all fail-closed, apply to both sports:

1. **Website display only.** Lines are rendered into page HTML. There is no raw public JSON feed and no downloadable
   file. Social prices stay off.
2. **Encrypted at rest.** Artifacts are committed only as `data/odds-display/<sport>/lines/<key>.json.enc`. See
   [Encryption at rest](#encryption-at-rest).
3. **A captured line does not make a direction publishable.** OVER / UNDER / NEUTRAL appears publicly only for a
   statistic whose forecast the founder has direction-qualified. Qualified today: NBA points, rebounds, assists, PRA,
   points + rebounds, points + assists. NBA 3-pointers made and every NFL family are not. See
   [Direction qualification](#direction-qualification).

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

## Encryption at rest

The repository is public. A plaintext price file under `data/odds-display/` would itself be a downloadable file, which
the provider's terms forbid. So:

- **Exporters** (`app/scripts/nba/publish-nba-line-board.mjs`, `app/scripts/nfl/publish-nfl-line-board.mjs`) write
  `<date>.json.enc` (NBA) or `<eventId>.json.enc` (NFL). The format is AES-256-GCM (`gtp.odds-display.enc@1`,
  `app/src/lib/odds/display-crypto.mjs`). The key comes from the environment variable `GTP_ODDS_DISPLAY_KEY`: 64 hex
  characters, 32 bytes. An exporter refuses (exit 2) when the key is missing or malformed. It never writes plaintext and
  never prints the key. Encryption is deterministic, so the same inputs give the same file.
- **Readers** (`public-line-records.mjs` for each sport) decrypt at build time only when the `site` surface is
  authorized **and** the key is present. Otherwise they return null, and the page is byte-identical to the
  projection-only page. Two more cases:
  - A file encrypted under a different key also returns null.
  - A tampered file throws, because authentication fails. That is a release error.
- **Guards:**
  - `app/src/lib/odds/odds-display-at-rest.test.mjs` fails if any file under `data/odds-display/` is not
    `*.json.enc`, or if an envelope is malformed or bound to another path. It also fails if a sport's lines directory
    is non-empty while that sport is unauthorized.
  - The post-build guard `odds-display-export.test.mjs` fails if any `.enc` envelope, or any decrypted artifact
    schema, appears anywhere in the export.

### Founder actions (we never see or print the key)

1. Generate the key on your own machine: `openssl rand -hex 32`.
2. Add it to Vercel as the environment variable `GTP_ODDS_DISPLAY_KEY`, scope **Production** (add Preview only if
   preview builds should render lines).
3. Add the same line, `GTP_ODDS_DISPLAY_KEY=<the 64 hex characters>`, to your local `.env`. The release owner's
   exporter runs read it from the environment.
4. Rotating the key means re-running the exporters. Artifacts encrypted under the old key stop rendering, because the
   readers return null, not an error.

## Direction qualification

A family's comparison shows OVER / UNDER / NEUTRAL publicly **only** when both of these hold:

- the sport's `site` surface is authorized;
- that family's entry in `DISPLAY_AUTHORIZATION.<sport>.directionQualified` is complete and `qualified: true`. A
  complete entry has `evidence`, `approvedBy` and an `approvedAt` date.

Otherwise the row shows the state **"Comparison not shown"** with this wording: *"Model and sportsbook line shown; a
direction is not shown for this statistic yet because its forecast has not met our calibration standard."* The
projection, line, book, prices and quote time are visible. There is no badge, no colour and no difference. The social
feed gets `status: "DIRECTION_WITHHELD"` (line and capture time only). The compact game-card summary shows nothing.

Private diagnostics (coverage reports, evidence renders) still compute every direction (`PRIVATE_DIRECTIONS` in
`app/src/lib/odds/prop-line-view.mjs`). The view's default gate withholds everything, so a surface that forgets the
gate never leaks a direction.

**Committed state (founder 2026-10-29): NBA `pts`, `reb`, `ast`, `pra`, `ptsReb`, `ptsAst` qualified (n = 910 graded
played rows per family); NBA `threePm` and every NFL family `qualified: false`.**

### The rule (APPROVED by the founder 2026-10-29)

Qualify a family when its **graded official above-median share is within [0.45, 0.55] with n ≥ 300**. It is
supplementary to every other check and is not proof of advantage. This is the NBA gate (e) band. A calibrated median puts about half of actuals above it, and a share outside the band means
the median is biased, so the direction against a line is mostly that bias.

| Sport | Family | Evidence (founder message, 2026-10-29) | Decision (2026-10-29) |
|---|---|---|---|
| NBA | Points (`pts`) | above-median share 0.524 (v0.1, 54 games, 910 rows) | **Qualified** (n = 910 ≥ 300) |
| NBA | Rebounds (`reb`) | 0.545 | **Qualified** (n = 910 ≥ 300) |
| NBA | Assists (`ast`) | 0.509 | **Qualified** (n = 910 ≥ 300) |
| NBA | 3-pointers made (`threePm`) | 0.438 | **Fail**: the median runs high |
| NBA | PRA (`pra`) | 0.546 | **Qualified** (n = 910 ≥ 300) |
| NBA | Points + rebounds (`ptsReb`) | 0.540 | **Qualified** (n = 910 ≥ 300) |
| NBA | Points + assists (`ptsAst`) | 0.533 | **Qualified** (n = 910 ≥ 300) |
| NFL | Receptions (`receptions`) | official over-median share 0.42 to 0.45 | **Borderline fail**: the median is slightly high. A tie-adjusted (mid-p) share ≈ 0.50 is pending a founder decision on tie treatment |
| NFL | Receiving yards (`reception_yds`) | actuals beat the median 56.6% historically (interval level 0.845, runs low). On week-8 lines, model median/line = 0.80 (median below the line 95 of 112 times) while mean/line = 1.04 | **Fail**: genuine median bias plus skew. Must stay withheld |
| NFL | Passing / rushing yards | not an official forecast in week 8 (ESTIMATE) | Not applicable: never compared publicly |
| NFL | Anytime touchdown | a yes/no market | Not applicable: never a direction |

The 910 rows are the NBA v0.1 graded set as reported. The per-family n must be confirmed at least 300 from the evaluator
before any family is qualified.

**To qualify a family (founder):** in a reviewed commit, set its entry to
`{ qualified: true, evidence: "<the graded share, n, window, evaluator commit>", approvedBy, approvedAt }`. In the same
commit, update the committed-state test `display-authorization.test.mjs` "direction qualification, committed state".
This is a separate decision from authorizing the site.

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
4. **Publish.** With `GTP_ODDS_DISPLAY_KEY` in the environment (the exporter refuses without it):
   `npx tsx app/scripts/nba/publish-nba-line-board.mjs --date <YYYY-MM-DD> --as-of <ISO> --receipt docs/receipts/<file>.md --private-dir /abs/private [--out /abs/private/lines]`.
   It refuses, exits non-zero and writes nothing in these cases:

   | Exit | Cause |
   |---|---|
   | 2 | Not authorized. |
   | 2 | `GTP_ODDS_DISPLAY_KEY` is missing or malformed. |
   | 2 | Bad or missing `--date`, `--as-of` or `--receipt`. |
   | 2 | `--out` is inside a git tree, `app/public` or `out/`. |
   | 2 | The receipt is invalid at a record's fetch instant, or is private-only. |
   | 3 | No committed lane for the date. |
   | 4 | A slate record has an ineligible book, a market not on the receipt, a capture at or after tip, or the wrong schema or provider. |
   | 5 | No comparison survives the rules: pre-tip, at most 6 h old, matched identity, same market. |

   Stale, unmatched, other-slate and unsupported inputs are only **counted**. Their numbers are never written. Rows
   with a one-sided quote are written with both prices `null` and `prices: "PRICE_UNAVAILABLE"`. The output is
   deterministic: the same inputs and `--as-of` give the same bytes. Stdout carries counts only.
5. **Build.** Option A: commit the encrypted artifact `<date>.json.enc` (with the founder's go-ahead), which triggers a
   build; Vercel decrypts it with its Production `GTP_ODDS_DISPLAY_KEY`. Option B: build with `GTP_NBA_LINES_DIR` (also
   `.json.enc`, same key). If the artifact is present but invalid, the reader throws and fails the build loudly. Invalid
   includes a lane that changed since publication, so republish after any lane change.
6. **Verify.**
   - The /nba/projections and NBA game pages show "Model vs. sportsbook line" rows, with the attribution if one is set
     and "Sportsbook availability varies by state."
   - `out/data/` holds no `nba/lines` or `odds-display` directory.
   - The post-build guard `odds-display-export.test.mjs` passes.
   - `/data/social/nba/v1/<date>.json` `lineComparison` rows carry `side`, `difference`, `line` and `capturedAt`, but
     no price or book unless `socialFeedPrices` is set.

## NFL: the same path

| Piece | Path |
|---|---|
| Record and direction gate | `DISPLAY_AUTHORIZATION.nfl` (site on 2026-10-29, social off; every family unqualified) |
| Derived switch | `app/src/lib/sports/nfl/line-display.mjs` `NFL_LINE_DISPLAY` |
| Adapter (the page's rule) | `app/src/lib/sports/nfl/prop-line-adapter.mjs` (12 h freshness, before kickoff, eligible books, exact identity) |
| Exporter | `app/scripts/nfl/publish-nfl-line-board.mjs`, rules in `app/src/lib/sports/nfl/line-publication-build.mjs` |
| Reader | `app/src/lib/sports/nfl/public-line-records.mjs` (reads `<eventId>.json.enc`; `GTP_NFL_LINES_DIR` for Option B) |
| Site wiring | `app/src/components/nfl/nfl-prop-lines.tsx` (NFL game page) |

Publish, after the founder authorizes NFL `site`:

```
GTP_ODDS_DISPLAY_KEY=… npx tsx app/scripts/nfl/publish-nfl-line-board.mjs --as-of <ISO> \
    --receipt /abs/path/to/docs/receipts/ODDS_AUTHORIZATION_NFL_WEEK8_PRIVATE_2026-10-29.md \
    [--private-dir /abs/gtp-private] [--events <id,id>] [--out /abs/private/nfl-lines]
```

- It reads `<private>/odds/nfl/<stamp>/capture-*.json` and the committed boards `app/public/data/nfl/player-board/<event>.json`.
- `--receipt` may be an absolute path to a `docs/receipts/*.md` in another worktree. Provenance records only
  `docs/receipts/<file>`.
- The week-8 receipt's Output term ("PRIVATE_RESEARCH … unless a separate display authorization says otherwise") is
  accepted only because the display authorization record is that separate authorization. The exporter refuses while
  the record is off.

For each game it writes one chosen offer per (player, market), using the page's own rule. Anything stale, ineligible,
ambiguous, from a not-published family, or unmatched is only counted. The artifact holds offers and no direction.

It refuses in these cases:

| Exit | Cause |
|---|---|
| 2 | Not authorized, no key, bad arguments, or a bad or private-only receipt. |
| 3 | No board. |
| 4 | A market not on the receipt, an unknown market, a capture at or after kickoff, or an invalid artifact. |
| 5 | Nothing survives. |

Stdout carries counts only.

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
