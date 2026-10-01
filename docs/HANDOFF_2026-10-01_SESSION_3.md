# Handoff: 2026-10-01, Session 3: Ask presentation → Results lifecycle + UX → Soccer readiness

**Scope:** Phase A (Ask answer presentation), Phase B (Results lifecycle proof + Results UX), Phase C (read-only soccer readiness). This is a point-in-time snapshot; for current truth read the repo, `/data/build-info.json` and `gh pr list`. It continues [`HANDOFF_2026-09-30_SESSION_2.md`](./HANDOFF_2026-09-30_SESSION_2.md).

- **Final main (product):** `1bd581fa5a` (#871). Bot data commits follow it.
- **Production:** `1bd581fa` at the time of writing, verified at 390px and 1280px.
- **PRs:** #869 (Ask), #870 (P0 daily-products), #871 (Results UX + #870 guard follow-up). All merged with founder GO. #716 untouched (HOLD).

## Oct 1 settlement runtime (F1) — PROVEN

| Slot | Artifact | Result |
|---|---|---|
| 11:36Z | `2026-10-01.json` (`75f50fdd`) | base written, workflow green |
| 13:55Z | `2026-10-01.r2.json` (`100b026c`) | restates the base; changed owners `lab-ledger`, `risk-ladder` (6 cells, 0 added); green |
| 15:24Z | `2026-10-01.r3.json` | restates **r2** (chain, not the original); changed owner `lab-ledger`; green |

- The original `2026-10-01.json` is byte-identical across all slots (md5 `b5d1e2e8…`).
- `latest.json` equals the newest effective revision. This is already pinned by `projection-restatement.test.mjs` ("COMMITTED").

## P0 found and fixed: daily-products refused every run on 2026-10-01 (#870)

- **What:** `daily-products` failed at 11:46Z, 14:05Z and 15:36Z at the step *Refresh the canonical projection chain*: "MLB matchup registry would DROP 3 published page(s) (849850, 849847, 849840)". Products were generated but **Commit was skipped**, so Bank Builder read "Waiting on today's data" and Moonshot "Not published today".
- **Cause:** those three games are Wild Card **Game 3s** ("if necessary"). Every series ended 2–0, and StatsAPI removed the games after their matchup pages were published. The page for 849850 still said "Scheduled start: Thu, Oct 1, 5:00 PM ET".
- **Fix:** a published registry row that **never had a final** and left the source is carried forward verbatim:
  - `scheduleState: "REMOVED_FROM_SCHEDULE"`, noindex, `final: null`, same URL;
  - the page says "Not played as scheduled… no start time and no result" and "Was scheduled for…";
  - a row that **had** a final and vanished is still refused (data loss).
- **Proof:** after the merge, the natural chain ran green four times (17:00–17:30Z). The registry on main carries exactly the 3 removed rows.
  - The manual dispatch I ran at 17:48Z (founder GO) was redundant, but green.
  - Today's "no card" is now an honest **input** state: the books posted 0 MLB props for the single postseason game.
- ⚠ **My regression:** after the bot regenerated the registry, CX1/CX4 (ids-only assembly) and CB4 (required "pending" for every non-final page) went red on main.
  - #870's own CI could not see it, because the games were still in the source when it ran.
  - Fixed in #871: the tests now assemble exactly like the producer, and CB4 knows the removed state.
  - **Lesson:** a producer fix whose new branch only fires once the bot regenerates data needs a test that runs on the *post-regeneration* shape.

## Phase A — Ask presentation (#869)

- **Architecture:** verified answer + structured metadata → deterministic presenter.
  - `lib/ask/display.mjs` projects the **same tool envelopes the evidence is built from** into a typed `display`: forecasts, live, results day or team compare.
  - Owner values use the evidence's own rounding; nothing is computed.
  - PAUSED carries only label + reason; ungraded is PENDING; missing is `null`.
  - Only evidence-issued `/` hrefs are used, read from the **envelope** (the executor lifts `links` out of `data`).
  - Anything else → `GenericAnswer` (the Session 2 renderer). Typed cards are progressive enhancement, never a gate.
- **UI:** `components/ask/ask-answer.tsx` renders, in order:
  - the verified text, unchanged;
  - one card per game with its own action;
  - de-duplicated chips, minus any href a card already shows;
  - "Ask next";
  - Sources in a closed `<details>`.
  - With a card, the writer's bullet lists fold into a closed "Written breakdown". Collapsed, never deleted.
- **Follow-ups:** come from ONE allowlist shared with the starters (`lib/ask/prompts.mjs`). The writer's free follow-ups are no longer shipped; they had restated link chips as questions — the founder's "duplicate action".
- **Writer:** a length-only line when cards exist. Hard rules, kinds of evidence and the verifier are unchanged.
- **Found on the preview with the real provider, fixed:**
  - the raw stat key `hitsRunsRbis` (now uses the owner's `families[].label`);
  - "Here is what GameTime's own tools returned:" → "From GameTimePicks' own data:";
  - a function name copied into an answer (refusals in the writer's input now use reader labels);
  - compare failing when the planner omitted `sport` (the sport is taken from canonical ids only when both agree).
- **Evidence:**
  - real-provider turns: 27 of 27 verified on attempt 1 (9 on Production after merge, 18 on previews), zero verifier rules, no fallback;
  - eval 1054/1054, unchanged;
  - 21 new tests, including "every number on a card is in the evidence";
  - 14 mutation probes, all caught;
  - all 101 text nodes in the cards pass WCAG AA contrast;
  - 390/1280 on Production: no overflow, errors or leaks.
- **Also:** three MLB vacuity guards that had failed on untouched main from postseason calendar data were repaired, with the bar unchanged.
- **Phase-A acceptance:** all 11 items met.

## Phase B — Results lifecycle + UX (#871)

### Lifecycle receipt (real game: CHC @ SD, 2026-09-30, gamePk 849842)

| Step | Owner / artifact | Timestamp | Immutable boundary |
|---|---|---|---|
| Published forecast | `data/ask/v1/forecasts.json` (MLB board) — ML SD 52.8% LEAN, RL CHC +1.5 63.7%, O/U **PAUSED** | updated 2026-09-30T11:16Z | pre-game publication |
| Pregame freeze (internal research) | `data/internal/mlb/pregame-archive/freezes/2026-09-30/849842.json` (`approvedForProduction:false`) | re-frozen 06:17Z, 16:40Z, 19:44Z — all before first pitch 02:00Z | never after `eventStartTime` |
| Event → canonical final | StatsAPI official box score (feed/live), joined by gamePk | final CHC 1 – 4 SD | provider final ≠ settlement |
| Settlement | nightly-settle 11:36Z slot | `settledAt 2026-10-01T11:38:06Z` | settled grades |
| Projection / restatement | `results/projection/2026-10-01.json` → `.r2` → `.r3` | 11:36Z / 13:55Z / 15:24Z | original `wx`, append-only |
| Results | `/results/date/2026-09-30/` | — | reads the effective projection + V2 owners |
| Ask | `getResultsDay` (same owners) | — | new post-build parity guard |
| Social feed | `build-results-social-feed.mjs --date 2026-09-30` | — | draft: "MLB game calls 7–4–1", matches the day page |

- **Top-5:** the `2026-10-01` NFL board was **frozen 00:33:58Z** before the first kickoff (2026-10-02T00:15Z PIT @ CLE).
  - 4 families × 5 rows. The ineligible pass-yds family is recorded with its reason.
  - Written once with `wx`; one commit ever touched it.
  - **Board settlement is pending** (it needs tonight's game). Verify on Oct 2.

### Parity

- **Product:** 43–42 · $15,240.40 on `/results`, `/bank-builder` and home. Moonshot 5–41 on `/results` and `/moonshot`.
- **Restatement:** `latest.json` = effective.
- **Social:** = day page.
- **Ask:** = day page. New post-build guard, probed.

### UX shipped (P1s)

1. **Truth:** a receipt lane with `status:"awaiting"` and no legs means **no card placed**, in the ledger's own words.
   - It had read "Pending — not settled yet" over an empty table (09-28, 09-29: all lanes; 09-30: Moonshot A).
   - It now reads "No card placed" on the day page and in Ask.
2. **Truth (§44, copy only):** a pending leg of a decided lane now reads "Not graded — lane already decided".
   - One owner, `lib/results/v2/lane-words.mjs`, serves Results, Ask evidence and Ask cards.
3. **Navigation:** breadcrumb, ← prev / next →, and **Latest settled** (the V2 owner's newest graded day) under the date. Through `surfaceHref` only; the NO SECOND ROUTER guard caught a hand-built fallback.
4. **Mobile length:** the legacy audit stack under "Deeper transparency & model audit" is one `<details>`.
   - **/results at 390: 33,017 → 17,383px. At 1280: 19,930 → 11,271px.**
   - Nothing removed.

- **Phase-B acceptance:** all met, except two partials:
  - per-game Results drilldown (no route; see backlog);
  - Top-5 settlement pending (needs tonight's game).

## Phase C — Soccer readiness (read-only; nothing implemented)

| Competition | Stage (registry) | History | Validation | Odds receipt | Sim / settle | Public | Main blocker |
|---|---|---|---|---|---|---|---|
| EPL | LIVE | 17 seasons, 6,130 rows | replay ELIGIBLE; forward ACCUMULATING; sim backtest ACCEPTED | **yes** (500 credits, h2h+totals; ~102 used) | EPL-only sim + settler | `/epl` | has not beaten the market |
| Ligue 1 | ACCEPTED_V1 | 13 seasons, 4,281 rows | `ACCEPTED_FOR_MODEL_ONLY_FORECASTS` (draw ECE 0.0271 ≤ 0.030); forward 18 graded, too small | none | score matrix only; forward grading, no bet settlement | `/soccer/ligue-1` | no odds; real calendar gap 09-21→10-08 |
| La Liga | REJECTED_V1 | 15 seasons, 5,379 rows | REJECTED (draw ECE 0.0305); DC v2 shadow 17 graded | none | shadow only | — | DC v2 needs ≥250 forward matches |
| Serie A | REJECTED_V1 | 14 seasons, 4,980 rows | REJECTED (0.0431); DC 9 graded | none | shadow only | — | same |
| Bundesliga | REJECTED_V1 | 17 seasons, 4,932 rows | REJECTED (0.045); DC 8 graded | none | shadow only | — | same |
| MLS | PLANNED | none | none (SCAFFOLD_ONLY) | none | none | — | no history at all |
| UCL / Europa | HOLD | none | none | none | none | — | two legs + extra time; no data |
| World Cup | ARCHIVE | 2022 reference only | `publicReady:false` | none (odds were pulled without a receipt) | separate Python stack | redirect | tournament over; national-team population |

- **Architecture: partly competition-agnostic.**
  - **Shared:** the registry `lib/sports/soccer/leagues.mjs`, event identity, the walk-forward harness, grading, openfootball capture, the `/soccer/[league]` shell, and `soccer-leagues.yml`.
  - **Not shared:**
    - the model *is* EPL code (Ligue 1 imports `lib/sports/epl/strength-state.mjs`);
    - simulation and bet settlement are EPL-only;
    - EPL is hard-coded in ~20 files, 27 `scripts/epl/*` and its own workflows (also wired into `sport-schedules` and `nightly-settle`);
    - `soccer-dc-shadow.yml` hard-codes its three leagues.
- **Populations:** club and national-team populations are not pooled. The only cross-league pooling is the DC shadow summary, marked "never gating".
- **Recommended next soccer session, by evidence:**
  1. **Competition-neutral core (no publication change):** move the match model, simulation and settlement out of the `epl/` namespace behind the registry. Drive `soccer-dc-shadow` from the registry.
  2. **Ligue 1 operations:** keep forward grading through the calendar gap. An odds receipt for Ligue 1 is a **founder decision** (paid).
  3. **La Liga / Serie A / Bundesliga:** confirm the DC v2 shadow is still running. Its last commit was 09-23, possibly the fixture gap; unverified. Let it reach 250 forward matches; no early look.
  4. **MLS:** a history-capture scaffold only; the season is ending, so low value now.
  5. **UCL / Europa:** stay on HOLD until a two-leg/extra-time format is modelled and data is captured.
  6. **International / World Cup:** separate population and a separate stack; no work before the next tournament.

## Founder decisions required

1. **Paused-market calls in the public record.**
   - Results "game by game" grades MLB totals that were **PAUSED, "publishes no pick"** at publication. Example: CHC @ SD 09-30 "Total runs OVER 7 · Loss", while the forecast card said the O/U was paused.
   - These calls count in the "MLB game calls" record (7–4–1 that day; 80–63–2 over 7 days).
   - The paused reason itself says the call "is still made and graded every day".
   - **Decide:** exclude paused-market calls from the public game-call record, or keep them but label them "paused — not published".
   - This is a record/methodology change, so it was not touched.
2. **UX-1 nav charter** (carried over from Session 1B).
3. **Ligue 1 odds receipt** (paid), if it's wanted.

## Backlog

- **Ask**, unchanged from Session 2 except:
  - "What's happening today?" occasionally resolves to a sport with no live feed (planner variance; honest refusal);
  - "this week's NFL forecasts" needs a window argument.
- **Results:**
  - no per-game Results route (games are cards in the day page);
  - `/results` is still ~17k px at 390 (Trust Center + explorer could be paged next);
  - the windows in `results-overview` compute in the browser from canonical daily series (by design);
  - stale comment in `v2/day.ts:134` (`/results/day/[date]`).
- **Top-5:** verify the 2026-10-01 board's settlement on Oct 2 (PIT @ CLE).
- **Ops:**
  - on game days, bot data commits move main faster than CI. The founder approved merging a CI-green head with data-only drift after a full local suite on the merged head;
  - old worktrees from earlier sessions remain (`pd`, `sa1`, `sa3`, `v18-*`); not touched.

## Not changed

- Settlement semantics, grades, money, the protected record, model publication status, product eligibility, and product methodology.
- No paid API calls; no soccer implementation; #716.

## DP

No tasks assigned. Onboarding only.

## Next recommended fresh session

1. Read Oct 2: Top-5 board settlement (PIT @ CLE) and whether daily-products published a card.
2. Founder decision 1 (paused-market calls).
3. Then the competition-neutral soccer core (Phase C item 1), with no publication change.
