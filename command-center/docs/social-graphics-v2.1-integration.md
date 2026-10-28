# Social Graphics V2.1: local queue integration report

**Status:** 2026-10-28, ~11:45 AM ET. Integrated locally and committed: `05afbe77ab` (prototypes), `43bc129363` (integration), `e9675e99d3` (caption fix).
- Nothing was pushed, deployed, published or bought, and no API was called.
- **Nothing is approved.** You have not approved the V2.1 design version in the console, and no post is approved.

## 1. The working queue

**Where:** console http://127.0.0.1:4190 → **Queue** (running on `e9675e99d3`, data `origin/main` @ `e4c29411e7`, 11:26 AM ET).

| Day | V2.1 packages (open for your decision) | Status |
|---|---|---|
| Thu Oct 29 · TNF CAR @ GB | Predicted Winner (Packers 63.8%) · Top 3 TD (Hubbard 54.9%, Jacobs 46.4%, Watson 39.5%) | Prediction READY · TD **needs your availability confirmation** |
| Sun Nov 1 | **12** Predicted Winner cards (all 12 games) · 12 Top 3 TD drafts | 12 READY · 12 need availability confirmation |
| Mon Nov 2 · MNF CHI @ SEA | Predicted Winner · Top 3 TD | READY · needs confirmation |
| Wed Oct 28 (catch-up) | 13 NFL Prediction vs. Final (Oct 25–26) · 20 NBA finals (Oct 25–27) | All READY, ranked below upcoming posts; the older V1 versions are superseded |

**Total:** 61 V2.1 graphics, all 1080×1350.
- **Ready:** 46 (14 predictions, 13 recaps, 20 NBA finals).
- **Needs verification:** 14 TD drafts.
- **Blocked:** none in this build.

**Held and listed with reasons, not invented:**
- **Top 5 boards for Oct 29, Nov 1 and Nov 2:** not frozen yet; each board freezes before that slate's first kickoff, so rebuild that morning.
- **Top 5 rushing and passing:** not published families.
- **NBA predictions and stat lines:** today's NBA public lane isn't published at the data commit yet (yesterday's landed around 11:54 AM ET). Rebuild after it lands.
- **EPL/MLB pregame:** no freeze-time source.

The V1 items from the approved calendar remain (explainers, X replies, EPL result cards, engagement posts).

**Galleries** (`command-center/out/console/review/v21/`):
1. TNF
2. Sunday predictions
3. Sunday Top 3 TD
4. MNF
5. NFL Prediction vs. Final
6. NBA finals

**Flag (data-truthful, your call on wording): PHI @ WSH shows Predicted Winner Eagles at 49.9%.** The published side is PHI at 0.4993, from receipt `401873035`, frozen Oct 27, 8:16 PM ET. The published split keeps a tie share, so the predicted winner can be under 50%. The card is correct, but may read oddly.

## 2. Safeguards (all enforced in code and tests)

**Three separate approvals:**
1. **Evidence readiness** (computed).
2. **Design approval** of the template version `gtp-social@2.1` + `gtp-social@2.1-assets.1`. It is a new ledger record: the **"Approve this design version"** button at the top of the Queue, with step-up when hosted. **No V2.1 post can be approved until you click it.**
3. **Per-post publishing approval.**

**What publishing approval checks and binds:**
- **Fingerprint:** caption, graphic sha256, evidence, verified version, data commit, template and asset manifest.
- **Re-checks at approval:**
  - predicted winner: the freeze-time verifier, data under 60 min, before kickoff;
  - Top 3 TD: the same three players and values, before kickoff;
  - Top 5: the board file unchanged, before the first kickoff;
  - NBA: the same lane values, before tip-off.

  Anything changed or stale is refused (`VERIFICATION_CHANGED`).
- **Top 3 TD** additionally requires your recorded confirmation that all three players are active and in their expected roles.
- **Change invalidates approval:** a new caption, graphic or design version on an approved but unpublished post records `invalidated`. Its X link is then refused, and the new version gets a fresh approval. An identical rebuild keeps the approval.

**Content rules:**
- **NBA:** no probability anywhere; stat lines in the lane's published order, not ranked.
- **Top 5:** copied exactly from the frozen boards.
- **Misses** are always stated, including TD misses on a correct prediction.
- **No publishing path exists:** you post on X yourself and record the link.

## 3. Regression report

- **Full suite: 128/128 pass, normal and network-blocked.** New: `queue-v2.test.mjs` (8), `social-v2.test.mjs` (10). The D1 V1 tests still pass, pinned to `queueTemplate: "v1"`.
- **Independent reviewer (read-only), 7 findings, all fixed with tests:**
  - **High:** an identical rebuild falsely invalidated approvals (the check timestamp was in the fingerprint).
  - **High:** the replacement version could never be approved (the once-only claim key).
  - **Medium:** Top 3 TD, Top 5 and NBA posts weren't start-time-guarded at schedule or publish.
  - **Low:** a tie was treated as a miss; a rebuild overwrote a decided post's image; Top 5 failed open without a kickoff time; a comment misplaced.
- **Found on the first real build:** 5 of 13 Prediction vs. Final captions were **blocked by the checks** (they omitted TD misses on correct predictions). Fixed, with a test over every Oct 25–26 game.
- **Fonts:** Barlow and Barlow Condensed (SIL OFL 1.1), downloaded from the Google Fonts repository and bundled with their licence and sha256s in `render/fonts/`. They are inlined into each render, so no system fonts and no network are needed. **Not yet run on Linux** (the hosted-runner check is part of CP-H1).

## 4. Posting plan

| When (ET) | What | Your action |
|---|---|---|
| **Today** after ~12:00 | Rebuild the queue once today's NBA lane lands → 12 NBA Predicted Winner + 12 stat-line cards | Approve the design, then the posts you want; post by hand before tip-off (7:00 PM) |
| Today | Catch-up: 13 NFL Prediction vs. Final, 20 NBA finals | Optional, lower priority |
| **Thu Oct 29** morning | Rebuild (fresh data) → CAR @ GB prediction re-verified; Thursday Top 5 boards if frozen | Approve; for Top 3 TD, check the injury report, then confirm |
| Thu, before 8:15 PM | Post the TNF prediction and TD cards | Record the X links |
| **Fri Oct 30** | CAR @ GB Prediction vs. Final; NBA finals and NBA predictions (10 games) | Approve and post |
| **Sun Nov 1** morning | Rebuild → 12 predictions re-verified; Top 5 TD / Receiving Yds / Receptions once the board freezes; 12 TD drafts | Approve per post; confirm TD availability after inactives are announced |
| **Mon Nov 2** | Sunday's 12 Prediction vs. Final (all hits and misses); MNF CHI @ SEA prediction + TD; NBA (15 games) | Approve and post |
| **Tue Nov 3** | MNF recap; NBA | Approve and post |

**Versions keep re-freezing until kickoff,** so post predictions close to game time. Each approval re-checks automatically.

## 5. Remaining blockers

- **NBA lane:** not published at this data commit (rebuild later).
- **Top boards:** next ones not frozen yet.
- **Schedule capture still from Oct 27:** engagement posts stay at needs-verification.
- **TD role confirmation:** no source exists; it stays your manual check.
- **EPL/MLB pregame:** no freeze-time source.
- **Hosted:** Linux rendering untested.
- **Worker invalidations (low):** the database lets the worker record invalidations (denial only, not forgery). Tie them to a build ID before hosting.

## 6. What still needs your approval

1. **The V2.1 design version** (one click in the Queue). Your chat approval of the direction isn't recorded as a design approval; you click it yourself.
2. **Each individual post**, including TD availability confirmation, and then posting it yourself on X.
3. Your call on the **sub-50% predicted-winner wording** (PHI @ WSH).
4. Anything hosted, pushed, merged or paid: separately.
