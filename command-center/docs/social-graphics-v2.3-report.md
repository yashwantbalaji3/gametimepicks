# Social Graphics V2.3 + combined NBA game posts: report

**Status:** 2026-10-28, ~5:00 PM ET, local only.
- **Commit:** `a542363b3d` (V2.3), plus this report's commit.
- **Not done:** nothing was pushed, deployed, bought or sent to X.
- **No approval recorded:** neither your design approval nor any post approval.
- **Checked on a copy:** the Queue screenshots and checks come from a review console running on a **copy** of your ledger. Your real console still runs V2.2.1 code until you restart it (section E, step 1).

## A. What changed

| Area | V2.3 |
|---|---|
| Template | `gtp-social@2.3` + `gtp-social@2.3-assets.1`. The 2.2.1 design approval does **not** carry over |
| Matchup boxes | Each team box holds the **team mark**, then city, then nickname. The text colour on a team colour is the team's own ink only when it reaches 4.5:1 contrast, otherwise black or white (tested on all 62 NBA and NFL teams). Long names wrap to two lines at one size |
| Team logos | **None added: no licensed logo exists in the repository** (its own asset audits say so). The website hotlinks ESPN's CDN at runtime, with no licence on record, and I won't post those. The logo slot reads licensed entries from the asset manifest only (file + sha256 + rights). Otherwise it shows a clean team-colour **monogram**: never a broken image. Request R1 in `docs/launch-readiness-requests-v2.3.md` |
| Matchup meter | A horizontal split bar directly under the boxes, showing published values only. See "Probability eligibility" below |
| Predicted winner | Kept large under the meter.<br>• "Predicted Winner" only above 50%.<br>• "Most Likely Winner" for the top outcome at or under 50%.<br>• "Most Likely Result" when a draw is on top.<br>• No winner graphic when the published side isn't the top outcome |
| NFL Predicted Winner | The ring becomes the same split meter, with **three segments: away / tie / home** |
| Stat lines | White values (2.2.1) kept. A team mark beside each team heading. A restrained team-colour edge on each player row; names stay white. One 32 px name size on every game (tested on all 12) |
| X identity | X mark + `@GameTimePicksHQ` on **every** format, as one shared shell component above the unchanged disclosure (tested on NBA winner, stat lines, NBA final, NFL winner, Top 3 TD, Top 5, postgame, EPL, MLB/UFC). Disclaimer unchanged; GameTimePicks logo unchanged at the top |
| Combined NBA post | **One X post per game:** image 1 is the Predicted Winner graphic, image 2 the stat lines; one caption.<br>The approval binds: event ID, forecast version (freeze time + receipt hash), caption, both image hashes (and their order), template / manifest, and the requested publishing time (45 minutes before tip).<br>The separate NBA graphics are now **components**: never proposed, approvable, schedulable or sendable alone. 143 older standalone drafts are shown as superseded; their history is kept |
| Caption | Your style, word for word: "🏀 Miami Heat vs Atlanta Hawks tonight! / Our model picks Atlanta to win. / Two players to watch: / 🔥 … / 🔥 … / Full predictions below 👇".<br>"picks" is allowed only in "Our model picks … to win"; "our picks" and "free picks" stay blocked.<br>Caption B is a nickname variant. No probability appears in NBA captions |
| Featured players | 1. Your editorial list first.<br>2. Otherwise the team's **highest published projected scorer with 20+ projected minutes and no injury designation**, labelled with that basis. No more "most minutes".<br>3. A listed player marked Day-To-Day **holds the post for your availability confirmation**; he is never silently swapped.<br>Ruled-out players are never in the projections |
| Queue | Default section **Today's NBA game posts**, one card per game, soonest post time first. Each card shows:<br>• matchup, event ID, tip-off (ET) and post time;<br>• data commit, forecast freeze and receipt;<br>• freshness check, meter values, design / approval / X status, warnings;<br>• both images, both captions with X counts, the featured basis and the evidence.<br>Actions: approve, revise, reject, defer, check before posting, schedule, dry run now, live test.<br>Status words: Ready to review · Approved · Scheduled · Sent (only with a real X receipt) · Blocked / held · Superseded. "Dry run passed (not sent)" is never shown as sent |
| Publishing gate | Also requires the X `media.write` scope for image posts (your account now has it). Standalone NBA graphics can't be scheduled. The re-check before sending also covers the forecast version and any featured player's injury designation changing |

### Probability eligibility, source, precision and fallback per sport

| Sport | Source | Shown as | Rounding | Not eligible → |
|---|---|---|---|---|
| NBA | Public lane `elo.winProbability`, through **the website's own accessor `eloWinProbabilityOf`**, loaded from the same data commit | **"Elo-derived game-winner estimate"**, with the note "Not an independently validated probability · accuracy not yet established". Your 10-23 site wording forbids calling it a probability | The site's: whole %, decimals only to break a tie, <1 / >99 | Winner only, no meter (e.g. Oct 23, published without the field) |
| NFL | The verified frozen receipt `forecastSummary.winProbability` {home, away, tieMass} | "Win probability", away / tie / home | One decimal, as on the site | Sum ≠ 1 or disagrees with the side → winner only |
| EPL | `soccer/epl/forecasts` row `probs` {home, draw, away} | Three segments; the draw never folded into a team | One decimal | Design review only: no freeze-time source yet (R4) |
| MLB | — | — | — | No eligible published game probability: winner only / no post |
| UFC | — | — | — | No independent model: no prediction graphic |

Bar widths are the published shares, and labels are those shares rounded by the stated rule (tested: GB's segment is 63.762% wide and labelled 63.8%).

**Never used:** Simulation Theater outcomes, market prices, or anything reverse-engineered. A test enforces this: the only Theater-folder imports allowed are the two evidence-backed team-*colour* files.

## B. Visual evidence (`command-center/out/social-v23/`)

| Sheet | What |
|---|---|
| `sheet-1-before-after-nba.png` | MIA @ ATL winner and stat lines, V2.2.1 vs V2.3 |
| `sheet-2-nba-color-matchups.png` | 6 colour combinations: heavy favourite WSH 12/88, near-even LAL 48/52, long names (Timberwolves) |
| `sheet-3-nba-stat-lines.png` | Hyphens (Gilgeous-Alexander), suffixes (Jr.), long names |
| `sheet-4-before-after-nfl.png` | NFL winner V2.2 vs V2.3 (three-way meter), PHI @ WSH, Top 3 TD, Top 5 |
| `sheet-5-other-sports-and-cases.png` | EPL three-way, longest club names, no-estimate fallback, postgame, NBA final, MLB/UFC **design specimens** (labelled "not a forecast") |
| `sheet-6-mobile-390.png` | Every format at 390 px |
| `sheet-7-combined-x-post.png` | MIA @ ATL, OKC @ DAL and WSH @ CLE as an X post: caption + both images |
| `queue-desktop.png`, `queue-iphone-390.png` (+ `-full`) | The new Queue section (review copy) |

All 12 games' graphics are `nba-pregame-*.png` / `nba-players-*.png`, logged in `gallery-log.txt`.

## C. Correctness evidence

**Data:** origin/main `64bb64a8ca` (4:25 PM ET Oct 28). NBA lane frozen at 15:23Z; receipts are bound per game.

**Independent checks on the 45 open V2.3 packages** (12 game posts, 13 NFL recaps, 20 NBA finals): **349 / 349 pass.** For every game:
- the meter equals the website accessor's view;
- the forecast version equals the lane's;
- the winner claim equals the published side;
- every caption and claim stat line equals the lane median;
- no featured player has an injury designation;
- no "%" in NBA captions.

**Image fingerprints:** all 24 game-post images (1080×1350) re-hash to their recorded sha256, and all 12 approval fingerprints bind both images in order (36 / 36). Renders: 45 / 45 show the official logo (sha `193a2af6b65f`), one X identity line, one disclosure, no remote image and no overflow.

**Winners and estimates** (away / home):
| Game | Estimate | Winner |
|---|---|---|
| MIA @ ATL | 34 / 66 | ATL |
| WSH @ CLE | 12 / 88 | CLE |
| CHA @ DET | 33 / 67 | DET |
| PHI @ IND | 61 / 39 | PHI |
| ORL @ TOR | 42 / 58 | TOR |
| NY @ CHI | 76 / 24 | NY |
| HOU @ MIL | 59 / 41 | HOU |
| GS @ MIN | 25 / 75 | MIN |
| DEN @ NO | 65 / 35 | DEN |
| SA @ UTAH | 80 / 20 | SA |
| OKC @ DAL | 78 / 22 | OKC |
| LAL @ LAC | 48 / 52 | LAC |

**Tests:** 169 / 169, normal and network-blocked.
- New: `tests/social-v23.test.mjs` (8). It covers:
  - the site-accessor meter, refusal and tampered provenance;
  - the NFL three-way meter and proportions;
  - soccer outcome semantics;
  - one X identity on every format; monogram only; no hotlinks;
  - contrast on 62 teams;
  - game-post binding and the availability hold;
  - caption phrase rules;
  - the source boundary.
- **Mutation check:** making the NBA meter fall back to raw lane numbers when the website's accessor refuses fails a test.
- **Updated to your new rules (not loosened):** caption wording, template version, featured policy, and standalone NBA graphics no longer proposed.

**Limitations:**
- No licensed logos (R1).
- NBA Top 5 held: no official board (R2).
- EPL design-only (R4).
- The NBA number can't be labelled "probability" without reopening the site's wording decision.

## D. Publishing readiness (review copy of your ledger, today's slate)

| Item | State |
|---|---|
| NBA games tonight | **12**; **12 complete game posts**, **12 READY**, 0 held |
| Design | `gtp-social@2.3` **not approved** (yours to click) |
| X | **Connected**: `offline.access tweet.write media.write users.read tweet.read` (confidential app; tokens in the Keychain). `media.write` is present, so two-image posts can upload |
| Dry run | All 12 scheduled at tip minus 45 min (6:15 / 6:45 / 7:15 / 8:15 / 8:45 / 9:45 PM ET) and run through the full gate: **12 DRY_RUN**, 2 images each, $0.045 each if live, nothing sent (`docs/x-publisher-v2.3-dry-run-2026-10-28.md`) |
| Live | Off. A live test needs **Authorize live test posts…** (cap + exact sentence + macOS dialog; scheduled stays dry run), plus X credits on your developer account |
| Blockers to one controlled live post | (1) restart your console on V2.3; (2) approve the design; (3) approve one game post; (4) X credits + a cap. Nothing else |

## E. Your steps, in order

1. **Restart your console on V2.3.** In the Terminal window where you started it, press Ctrl-C, then run:
   `env -u OPENAI_API_KEY -u XAI_API_KEY -u ANTHROPIC_API_KEY node surfaces/console/server.mjs` (from `command-center/`).
   Then rebuild today's queue: type in the console chat "Team, prepare today's content queue", or ask me to.
2. **Approve Social Graphics V2.3.**
   - Review `sheet-1` to `sheet-7`.
   - Then Queue → "Approve this design version" (`gtp-social@2.3`).
3. **Approve one combined game post.**
   - In "Today's NBA game posts", pick a game whose post time hasn't passed.
   - Check both images and the caption.
   - Click **Check before posting**, then **Approve this caption**.
4. **Credits and budget.**
   - In the X Developer Console: buy the minimum credits and set a spend cap (your purchase).
   - One game post costs at most $0.045.
5. **One controlled live test.**
   - Queue → **Authorize live test posts…**: choose a monthly cap and type the exact sentence ("I authorize live X test posts up to $N per month").
   - Click **Allow live tests** in the macOS dialog. Scheduled publishing stays a dry run.
   - On the approved post, click **Live test post…** and confirm in the browser.
   - Then click **Publish live** in the macOS dialog, which shows the exact post and caption from the ledger.
6. **Verify on X.**
   - Open the link in the post's receipt and check that both images are attached in order and the caption is exact.
   - The card shows **Sent** with the X link.
7. **Ongoing scheduled posts (separately).**
   - **Authorize scheduled live publishing…** with the exact sentence and a monthly cap, then the macOS dialog.
   - Then **Schedule for (45 min before tip)** on each approved game post.
   - **Switch scheduled publishing to dry run** turns it off at any time; **Pause publishing** stops everything.
