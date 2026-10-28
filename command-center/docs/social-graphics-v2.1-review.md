# Social Graphics V2.1: second design review (NFL + NBA)

**Status:** isolated prototypes for your approval, 2026-10-28 (Wednesday).
- Not integrated: the approved calendar, all queue packages and the ledger are untouched.
- Nothing was pushed, deployed, published or bought.
- Data: `origin/main` @ `6e8b6d41be` (09:55 AM ET).
- Images: `command-center/out/social-v2/`. Each file is full resolution, 1080×1350, plus `gallery-v2.png` and `compare-hit-vs-miss.png`.

## 1. Terminology: adopted as a presentation map

**The social wording lives in one place,** `render/social-v2.mjs` → `TERMS`:

| Social term | Canonical concept it presents (unchanged) |
|---|---|
| GameTimePicks Prediction | the game's published `OFFICIAL_FORECAST` |
| Predicted Winner | the published side (`sideDecision.publishedSide`; NBA `nba-winner-side@1`) |
| Win Probability | that side's published probability |
| Top 3 TD Predictions | the event's `anytime_td` forecasts (latest published, or the forecasts of record after kickoff) |
| Prediction vs. Final / Prediction Correct / Prediction Missed | the graded result of the frozen published side |
| Top 5 TD Predictions / Top 5 Projections | the frozen public Top Board rows, unchanged |

"Projected" is used for player statistics and "Predicted" for winners and touchdowns.

**Registry check.**
- **No enforced contract forbids these words.** The site's vocabulary tests ban only the retired hedging phrases, plus "Picks Lab", "Build-a-Pick" and "Parlay Lab". The social terms avoid all of them.
- **One semantic tension, handled in presentation:**
  - The capability registry's badge text reserves "Simulations + Predictions" for FULL_MODEL sports, and NFL's badge is "Experimental simulations".
  - "Prediction products" (Bank Builder, Moonshot, Parlays) are FULL_MODEL only.
  - The mapping therefore uses "Prediction" for a single game's published Official Forecast only.
  - It never says "product", never names a product, and never says pick, lock, bet or edge. The caption checks keep enforcing that.
- **Internal names and the website are unchanged.**

**Integration note.** D1's caption checks currently require the word "forecast" (`MISSING_FORECAST_WORD`) and check misses on "forecast". When V2.1 is integrated, they must accept "prediction" and "projection". That is a small change, listed in §9.

## 2. Refined designs (full resolution)

| File | What it shows |
|---|---|
| `A-pregame-CAR-GB.png` | **TNF** · "GameTimePicks Prediction"; a win-probability ring at **63.8%**; Predicted Winner **Packers**; kickoff · Lambeau Field · "Latest published Oct 27, 8:16 PM". No opponent probability (the tie mass stays in the data) |
| `A-pregame-PIT-NO.png` | Historical sample: Steelers 64.8%, the version frozen 9:29 AM ET; venue as the receipt records it (Stade de France) |
| `B-touchdowns-CAR-GB-pregame.png` | **Top 3 TD Predictions**: player-feature columns, #1 in the centre: Hubbard 54.9%, Jacobs 46.4%, Watson 39.5% |
| `B-touchdowns-PIT-NO-as-published.png` | Warren, Kamara, Olave exactly as published before kickoff |
| `B-touchdowns-SF-ATL-graded.png` | The same layout after grading: McCaffrey ✓ scored (70.5%), Robinson ✗, Kittle ✗ |
| `C-postgame-PIT-NO.png` / `C-postgame-SF-ATL-miss.png` | **Prediction vs. Final**: giant final; a full-width **Prediction Correct** (green) or **Prediction Missed** (amber) banner; the whole card framed in the same colour; Predicted Winner + Win Probability; TD results only when the cohort is completely graded (0 of 3 / 1 of 3) |
| `compare-hit-vs-miss.png` | The correct and missed cards side by side |
| `D-top5-td-2026-10-25.png` · `D-top5-recyds-…` · `D-top5-rec-…` | Top 5 boards (§4) |
| `E-nba-pregame-BKN-BOS.png` · `E-nba-final-BKN-BOS.png` | NBA direction (§5) |

**Changes since V2:**
- one dominant takeaway per card (ring, banner, #1 column or #1 row);
- the empty pregame space is now filled with real facts: kickoff, venue, freeze time;
- player-feature TD columns;
- a 30-character green kicker naming the format on every card;
- the result frame and banner, so correct vs missed reads at feed size;
- all terms from `TERMS`.

**Still out:** projected scores, totals, ranges, the URL, Model Performance text and internal IDs (tested). The short disclosure line stays.

**Photo-free.** No licensed photography exists, so none is used. The tall feature columns and team halves are where licensed portraits would sit.

## 3. Format decisions (applied as you set them)

- **A:** the predicted winner and its win probability only. No opponent probability; the tie mass is preserved in the data.
- **B:** drafts come from current published player forecasts.
  - Players listed OUT, DOUBTFUL or INACTIVE never appear.
  - A QUESTIONABLE player flags the post for review.
  - **Every pregame TD post stays NEEDS_VERIFICATION until you confirm availability.** No source positively confirms a player's role before kickoff (board: AVAILABLE_ROLE_UNCERTAIN). Publishing is blocked without that confirmation.
  - A tie at rank 3, a stale list or an empty list is refused.
  - A list is never padded to three.
- **C:** the actual final, the original frozen Predicted Winner and Win Probability, and Correct or Missed.
  - The TD section appears only when all three published candidates are graded.
  - A pending, void or unverified result is never shown as a miss; the section is left off (tested).

## 4. NFL Top 5 boards: plan and readiness

**Source:** `app/public/data/results/top-boards/<slate date>.json`.
- Frozen **once, before that slate's first kickoff**, and never revised.
- Up to 5 rows per published family (a maximum, not a quota).
- There is one board per slate date (Thursday, Sunday, Monday), so "weekly" means the Sunday board, plus Thursday and Monday boards when they publish.

| Board | Published? | Graphic |
|---|---|---|
| Top 5 TD Predictions (`anytime_td`) | ✓ on the board | `D-top5-td` (prototype from the Oct 25 board: Gibbs 84.3% … Henry 68.7%) |
| Top 5 Receiving Yards Projections (`player_reception_yds`) | ✓ | `D-top5-recyds` (Smith-Njigba 78 … Nabers 58) |
| Top 5 Receptions Projections (`player_receptions`) | ✓ | `D-top5-rec` (Smith-Njigba 7 … Likely 6) |
| Top 5 **Rushing** Yards Projections (`player_rush_yds`) | ✗ **not on the board**: ESTIMATE, failed calibration bar (`calOk`) | **HELD**: no graphic until the family is published |
| Top 5 **Passing** Yards Projections (`player_pass_yds`) | ✗ **not on the board**: rejected at threshold calibration (ECE 0.055 vs 0.05) | **HELD** |

**Rules:**
- **Ranks, players and values** are copied exactly from the board, never re-ranked.
- **Values** are the published median for projections, and the probability, in the site's format, for TD.
- **If a board row's participation has since turned OUT,** the graphic is held for review instead of re-ranked.
- **No sportsbook lines** appear (the board has none).

## 5. NBA direction (only what the product supports)

| NBA format | Supported now? | Basis |
|---|---|---|
| **Pregame Predicted Winner** (`E-nba-pregame`) | ✓ | The public lane publishes the Elo favoured side for every game, frozen before tip-off. **No win probability is drawn:** the value exists in the receipt, but its public display switch is OFF (decision 2026-10-23). |
| **Final score** (`E-nba-final`) | ✓ | The write-once finals record |
| Player stat projections (medians) | ⚠ **your decision** | The lane publishes medians (PTS, REB, AST, 3PM, PRA, P+R, P+A), but it also says "No … rankings". A "Top 5" or "leaders" graphic is a ranking; the site's projections page sorts on demand, which the lane does not. Options: (a) per-game cards with a fixed, non-ranked selection (e.g. both teams' players with the most projected minutes), (b) a registry decision allowing slate rankings, (c) none. |
| Prediction vs. Final | ✗ not yet | No canonical NBA grading record (the registry says no public NBA Model Performance record exists); grading would be a new product claim |
| Win probabilities / team scores | ✗ | Display OFF / WITHHELD |

**Volume without filler:**
- Each NBA day: one Predicted Winner card per game, as a daily carousel or thread (12 games on Oct 28, 15 on Nov 2).
- Next morning: one "last night's finals" card (results-card style, 6 games per card).

## 6. Eligibility and data-readiness matrix

| Format | Data source | Freshness gate | Availability gate | Graded later by | Status today |
|---|---|---|---|---|---|
| NFL A · Predicted Winner | Receipts + `-rev-` refreshes; site file | Latest frozen version, data under 60 min, before kickoff (D1 verifier) | — | Ledger `nfl_game_winner` | ✓ Ready (CAR @ GB 63.8%) |
| NFL B · Top 3 TD | `player-board/<event>.json`, then ledger `anytime_td` | Latest board version; data under 60 min; before kickoff | OUT/DOUBTFUL/INACTIVE excluded; QUESTIONABLE flagged; **founder confirms roles** (no pregame confirmation source) | Ledger, canonical settlement | ⚠ Draft, needs your availability check |
| NFL C · Prediction vs. Final | Ledger + receipt via the integrity gate | Settled CANONICAL | — | — | ✓ |
| NFL C · TD section | Ledger `anytime_td` (pre-kickoff `publishedAt` only) | Completely graded cohort | — | — | ✓ when complete |
| NFL Top 5 TD / Rec Yds / Receptions | `top-boards/<date>.json` | Frozen before first kickoff | Participation re-checked; hold on change | Ledger | ✓ (next Sunday board not yet published) |
| NFL Top 5 Rush / Pass Yds | — | — | — | — | ✗ Held (not published families) |
| NBA Predicted Winner | `nba/experimental-public/<date>.json` | Today's lane file (latest at this commit is Oct 27; today's not yet landed) | — | — | ✓ once today's file lands |
| NBA Finals | `nba/results/finals-2026-27.json` | — | — | — | ✓ |
| NBA player projections | lane medians | Same | Roster-gated by the lane | — | ⚠ Decision (§5) |

**Measured TD record (from the previous review):** the top 3 per game scored 93 of 233 (39.9%) against 109.6 expected. Recap cards state per-game results only; no aggregate claim is made.

## 7. Proposed seven-day schedule (Oct 28 – Nov 3)

This is a **proposal** for the next calendar; the approved calendar was not edited. Upcoming games come first. The Oct 25–27 recap packages stay in the queue at lower priority.

| Day (ET) | NFL | NBA |
|---|---|---|
| **Wed Oct 28** | Hold old recaps (preserved, low priority) | Predicted Winner for **12 games** (one carousel) once today's lane lands · Finals card for Oct 27 (4 games) |
| **Thu Oct 29 (TNF)** | Morning: **A · CAR @ GB** (re-verified before posting). Afternoon: **B · Top 3 TD** after your availability check · Thursday Top 5 boards, if published | Predicted Winner, 3 games · Oct 28 finals |
| **Fri Oct 30** | **C · CAR @ GB Prediction vs. Final** (+ TD results if fully graded) | Predicted Winner, 10 games · finals |
| **Sat Oct 31** | Sunday preview teaser (no numbers until versions freeze) | Predicted Winner, 7 games · finals |
| **Sun Nov 1** | Morning, after the board freezes: **Top 5 TD · Top 5 Receiving Yds · Top 5 Receptions**. **A** for 4 featured games across the 1:00, 4:05/4:25 and 8:20 windows (PHI @ WSH SNF included). **B** for SNF | Predicted Winner, 4 games · finals |
| **Mon Nov 2 (MNF)** | **C** for all 12 Sunday games as one "Week 9 Prediction vs. Final" thread (every hit and miss) · **A + B · CHI @ SEA** | Predicted Winner, **15 games** · finals |
| **Tue Nov 3** | **C · CHI @ SEA** · weekly Top 5 results thread | Predicted Winner · finals |

**Posting order of the day:** recaps in the morning, then pregame cards. Pregame cards are posted as close to kickoff as review allows, because versions re-freeze until kickoff.

## 8. Missing assets, licensing and portability

| Item | Status | Needed |
|---|---|---|
| Player photography | ✗ none licensed | A licence (league or club media, or an agency social licence) — paid or contractual; your decision |
| NFL/NBA league or club logos | ✗ none, not used | Trademark licence or review if ever wanted; identification by name and colour is the safe default |
| Fonts (DIN Condensed, Avenir Next) | Apple system fonts; licence for commercial graphics unverified; absent on Linux | Vendor an open-licence font (Anton / Barlow Condensed / Oswald) into `render/fonts/`. A one-time download that needs your OK |
| Hosted rendering | Chromium from `app/node_modules`; fonts as above | Same fonts on the runner, or renders differ (determinism holds per machine) |
| NBA colours | ✓ `nba-team-colors.json` (evidence file) | — |
| GameTimePicks logo | ✓ original file, sha256 `193a2af6…` | — |
| Venues | From receipts (e.g. Lambeau Field, Stade de France) | — |

## 9. Decisions for you before integration

1. **Approve these designs as production templates** (`gtp-social@2.1`), or name the changes.
2. **NBA player projections:** option (a), (b) or (c) from §5.
3. **Format A ring vs flat number:** keep the ring (current) or a flat giant number.
4. **Font:** OK to vendor an open-licence font, or license a commercial one.
5. **Sunday volume:** 4 featured Format A games (proposed), or all 12.
6. **Integration scope after approval.** Proposed:
   - replace `nfl-recap@1` with Format C for new NFL recaps;
   - add Formats A and B and the Top 5 boards as package kinds;
   - teach the caption checks "prediction" / "projection";
   - put template and manifest versions into each approval digest.

   Old packages and approvals stay immutable.
