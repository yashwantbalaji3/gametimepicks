# Social Graphics V2: prototype review (NFL)

**Status:** prototypes for your design approval, 2026-10-28.
- Isolated: nothing in the daily queue, the ledger or any approved package changed.
- Nothing was published, deployed or bought.
- Data is `origin/main` @ `6e8b6d41be` (renders) and pinned `fe6b9212b8` (tests).

Images are in `command-center/out/social-v2/` (git-ignored): `gallery-v2.png`, `compare-original-vs-v2.png`, and one PNG per prototype.

## 1. Existing system and what V2 reuses

| Piece | Path | V2 |
|---|---|---|
| PNG pipeline (offline Chromium, requests aborted, logo inlined, deterministic) | `render/render-png.mjs` | **Reused** (`loadChromium`, `pngSize`, `escapeHtml` exported; nothing forked) |
| Current recap card | `render/templates/nfl-recap.html` (`nfl-recap@1`) | Unchanged; the D1 queue still uses it |
| Results cards (NBA/EPL) | `render/results-card.mjs`, `templates/results-card.html` | Unchanged; next to port |
| Recap facts and integrity gate | `recap/fact-bundle-nfl.mjs`, `integrity-gate.mjs`, `pipeline.mjs` | **Reused** for Format C |
| Forecast versions (receipts + `-rev-` refreshes) | `recap/freeze-verifier.mjs` | **Reused** for Format A |
| Public labels | `recap/public-registry.mjs` | **Reused** |
| Queue, evidence, digests, receipts | `orchestrator/queue-flow.mjs`, `contracts/post-queue.mjs` | Untouched (integration is the next step, after your approval) |
| **New** verified view-models (A/B/C) | `recap/social-v2.mjs` | — |
| **New** renderer + fit check | `render/social-v2.mjs` | — |
| **New** templates | `render/templates/social-v2/shell.html`, `social-v2.css`, `asset-manifest.json` | `nfl-social@2` |
| **New** tests | `tests/social-v2.test.mjs` (7) | — |

## 2. Assets and licensing audit

| Asset | Have it? | Use |
|---|---|---|
| GameTimePicks logo | ✓ `app/public/brand/gametime-picks-logo.png`, 600×450, sha256 `193a2af6…`, committed `8cf568d965` | Inlined unmodified on every card |
| NFL team colours | ✓ `nfl-team-colors.mjs` + evidence file, all 32 teams (tested) | Team light, name slabs and tags. Each card uses the record's `accent` colour, e.g. Steelers gold, not black |
| NFL shield or club logos | ✗ None in the project, none licensed | Not used. Team identity is the name, abbreviation and verified colours |
| Player photography | ✗ No licensed photos. ESPN headshot URLs exist in `game-simulations/*.json`, but they are third-party images with no reuse licence | **Not used** |
| AI imagery | — | None. The stadium, beams, field and grain are CSS/SVG with a fixed noise seed |
| Fonts | DIN Condensed, Avenir Next (Apple system fonts on this Mac) | **Licence unverified** for commercial graphics, and missing on a Linux runner. Replace with a vendored open-licence font before automation (§9) |

**So every prototype is the photo-free version.** A photo version needs a licensed source, which is your decision (§9). The layouts leave room for portraits: Format B cards have a left zone, and Format A/C have team halves.

**Club names and abbreviations** are used only to identify the teams in a factual result. Every card says "not affiliated with the NFL or its clubs". A trademark check before public use is your call.

## 3. The formats (prototype PNGs)

Your content rules are applied throughout:
- shown: the final score, the official pregame winner and its probability, the top three anytime-TD candidates and their graded results;
- **not shown:** projected scores, totals or ranges, the URL, the Model Performance paragraph, ledger IDs, commit hashes, model versions or field names (asserted by a test);
- kept: one short line, "Model forecast · not betting advice · not affiliated with the NFL or its clubs", plus the freeze time.

| File | Format | Verified content |
|---|---|---|
| `A-pregame-PIT-NO.png` | A · pregame winner (historical sample) | Steelers **64.8%**, the version frozen Oct 25, 9:29 AM ET (the last before the 9:30 AM ET kickoff) |
| `A-pregame-CAR-GB.png` | A · live example | Packers **63.8%**, "Latest published pregame forecast · frozen Oct 27, 8:16 PM ET". Matches the site's file |
| `B-touchdowns-PIT-NO-as-published.png` | B · top 3 TD, as published before kickoff | Warren 40.8%, Kamara 37.5%, Olave 36.1% (Forecast Ledger, published 9:29 AM ET) |
| `B-touchdowns-CAR-GB-pregame.png` | B · live example | Hubbard 54.9%, Jacobs 46.4%, Watson 39.5% (player board, injuries and rosters "FRESH" at 8:16 PM ET Oct 27) |
| `B-touchdowns-SF-ATL-graded.png` | B · graded view | McCaffrey 70.5% ✓ scored; Robinson 61.4% ✗; Kittle 47.1% ✗ |
| `C-postgame-PIT-NO.png` | C · forecast correct | **Steelers 16, Saints 10**; Steelers 64.8% → **Forecast correct**; Anytime TD calls **0 of 3 scored** (shown, not hidden) |
| `C-postgame-SF-ATL-miss.png` | C · forecast missed | **Falcons 29, 49ers 20**; 49ers 70.6% → **Forecast missed**; Anytime TD calls **1 of 3** |

**PIT @ NO verification.** Every value is checked against the canonical files through the existing integrity gate:
- the final comes from the ledger's team-score settlements;
- the pregame forecast is the receipt's published side, Steelers 0.648, frozen 13:29:54Z;
- the result is WIN;
- the TD list comes from the ledger's anytime-TD forecasts of record, all published before kickoff and settled canonically.

**Rules built into the formats:**
- **A:** labelled "Latest published pregame forecast" until kickoff, and refused once kickoff has passed. The opponent's probability is left off, because the published split keeps a tie mass (63.8% + 33.5% ≠ 100%).
- **B:** players come from the event's published population, ranked by probability.
  - Players listed OUT, DOUBTFUL or INACTIVE are excluded.
  - A QUESTIONABLE player is flagged and sends the post to verification.
  - A tie at rank 3 is refused.
  - Fewer than three eligible players are never padded.
  - A list is refused after kickoff.
  - The footer states the market: "chance to score a TD if he plays · passing TDs don't count · not a guarantee". That is the model card's own definition: probabilities condition on playing, and a non-player settles void.
- **C:** "N of 3 scored" appears only when all three are graded. Pending or void candidates are shown as such, never as misses.
- **Fit:** long names shrink, and a name that still can't fit refuses the render instead of clipping (tested).

**Found while doing this: a formatting mismatch, now fixed.** The site formats probabilities as `(p*100).toFixed(1)`, but the Command Center rounded half-up.
- 84 of 1,928 NFL ledger probabilities would have shown differently from the site. McCaffrey's 0.7055 is 70.5% on the site and was 70.6% in the Command Center.
- All five Command Center formatters now use the site's rule.
- Today's queue had no affected numbers (5 probability claims checked).

## 4. Anytime-TD record and data readiness

**Source:** the Forecast Ledger (`data/internal/forecast-ledger/v1/nfl.jsonl`, family `anytime_td`, 1,773 rows).
- **Cohort:** per game, the three highest probabilities among forecasts **published before kickoff** (deterministic tie-break).
- **Excluded:** 236 rows with no publication time, because they can't be shown to be pregame.
- **Period:** Sep 20 → Oct 27, 2026; 81 games; all EXACT_FROZEN rows.

| Cohort | Graded | Scored | Rate | Model's own expectation | Difference |
|---|---|---|---|---|---|
| Rank 1 per game | 80 | 39 | 48.8% | 46.2 | −7.2 |
| Rank 2 | 77 | 31 | 40.3% | 34.8 | −3.8 |
| Rank 3 | 76 | 23 | 30.3% | 28.7 | −5.7 |
| **Top 3 combined** | **233** | **93** | **39.9%** | **109.6** | **−16.6 (≈ −2.3 standard errors)** |
| Everyone else on the board | 1,022 | 200 | 19.6% | 189.9 | +10.1 |
| All published pregame forecasts | 1,255 | 293 | 23.3% | 299.5 | −6.5 |

Per game, 71 games had all three candidates graded: 0 scored in 16, 1 in 31, 2 in 20, all 3 in 4. 10 candidates are still pending; none are void.

**What this supports.**
- **The ranking separates well.** Ranks 1, 2 and 3 score 48.8%, 40.3% and 30.3%, against 19.6% for everyone else, so "top candidates" is a fair framing.
- **The whole board is roughly calibrated** (293 scored vs 299.5 expected).

**What it does not support.**
- The **top three scored fewer than the model's own probabilities implied** (93 vs 109.6, about 2.3 standard errors; mostly weeks of Sep 20 and Oct 18).
- "Our TD calls perform well" is **not** a claim this record supports. Recap cards state each game's hits and misses; they make no aggregate claim.
- Nothing here compares against the betting market; no pregame prices were captured.

**Gaps:**
1. **No positive pregame confirmation of a player's role.** The board marks players AVAILABLE_ROLE_UNCERTAIN; product eligibility lists ROLE_NOT_CONFIRMED and FORWARD_TEST_IN_PROGRESS. The market is published on the site as an Official Forecast; posting it is presentation, not product eligibility.
2. **Versions change until kickoff.** A pregame list can shift, so Format B needs the freeze-time treatment D1 gives Format A: latest version, data under 60 minutes old, and a recheck after kickoff.
3. **The 236 rows without a publication time** can't be graded as pregame calls and are excluded.

## 5. Founder approval workspace (proposal; nothing built yet)

- **A dedicated "Review" page**, full width, beside the Queue tab: a grid of graphics, 4 across on desktop and 1 on iPhone, with swipe between posts.
  - Filters: sport, format, readiness, design-approved, publishing-approved, published.
- **Detail drawer:**
  - a large zoomable image;
  - captions as tabs, each with its character count and check result;
  - one-line evidence ("Final 16–10 · frozen 9:29 AM ET · ledger ✓ receipt ✓"), with the full sources one tap deeper.
  - Engineering warnings are collapsed into a single "checks ✓" chip. They show only when something fails, so they no longer dominate.
- **Three separate states per post, never derived from each other:**
  1. **Evidence:** ready, needs verification or blocked (computed).
  2. **Design:** approved or not, recorded per template and asset-manifest version, e.g. `nfl-social@2` + `assets.0`.
  3. **Publishing:** approved or not, recorded per exact post bundle (today's digest, which would add the template and manifest versions).
- **Changes create new versions.** A new caption, image, asset or template version makes a new package that needs renewed approvals; old packages and approvals stay immutable, as the D1 ledger already does.

## 6. Five-sport architecture

**Shared layers, per-sport adapters:**
- **Data:** `recap/social-v2.mjs` (view-models from verified records) → **template** `render/templates/social-v2/` (shell, stage, tokens) → **renderer** `render/social-v2.mjs` (fit check, determinism) → **queue** (D1 packages and approvals).
- **Each sport adds:** a view-model adapter, its colour data, and only the formats its registry supports.

| Sport | Formats the data supports today | Not offered |
|---|---|---|
| NBA | Final scores; favoured side and player medians (public registry: Official Forecast); results from the finals record | Win chances or team scores (WITHHELD); no NBA ledger grading yet |
| MLB | Winner forecast (FULL_MODEL); player props where published; recaps from the ledger | (Season ending) |
| EPL | Home/draw/away forecast with draw probability; final results; anytime-scorer chances (published; check eligibility first) | — |
| UFC | Fight-week preview from the schedule; results | No forecast graphic until the public and capability registries agree (CP3 item) |

## 7. Tests and evidence

- **`tests/social-v2.test.mjs`, 7 tests:** PIT @ NO and SF @ ATL verified values; no clutter or IDs on any graphic; Format A labelling and refusal; Format B population, refusals (stale, tie, OUT, no padding) and QUESTIONABLE flag; 1080×1350 with identical bytes twice; fit refusal; colour records for all 32 teams.
- **Full suite:** see the commit message.
- **Screenshots:** `out/social-v2/gallery-v2.png`, `compare-original-vs-v2.png`.

## 8. What it would take to add photos

The pages are ready for portraits, but only from a licensed source:
- **a sports-photo licence** (team or league photo services, or a wire agency's editorial-plus-commercial social licence), or
- **the clubs' own media**, with written permission.

Any of these is a paid or contractual decision for you. Until one exists, the photo-free version is the product, and the manifest's `notUsed` list records why.

## 9. Next implementation plan (in order, each needing your go-ahead)

1. **Approve the design** (§3), or ask for changes. Note the per-format decisions:
   - A: whether to show the opponent's probability (needs tie wording);
   - B: whether to show a TD list before role confirmation;
   - C: whether to always include the TD calls section.
2. **Vendor an open-licence display font** (e.g. Anton or Barlow Condensed, SIL OFL) into `render/fonts/` and load it from a local file. This makes renders identical on the hosted runner. It involves a one-time download that needs your OK.
3. **Integrate into D1:**
   - Format C replaces `nfl-recap@1` for new NFL recap packages; old packages stay as they are;
   - Format A for pregame posts, on the existing freeze-time verifier;
   - Format B gets the same two-phase freeze treatment.
   - The template and manifest versions join the post bundle digest.
4. **Build the review workspace** (§5) with the three separated approval states.
5. **TD record page in the Command Center** (§4 table, refreshed nightly), so recap claims come from one place.
6. **Port to NBA and EPL** (the results cards first), then MLB; UFC only after the registry question is settled.
7. **Photography:** only after a licence decision (§8).
