# COMP-001 — Competitive analysis: ThePropDealer (propdealerbets.com) vs GameTimePicks

- **Date:** 2026-10-16 (ET evening; investigation about 60 minutes)
- **Type:** Read-only research. It is not a launch blocker. No builds were run, no repo code was changed and nothing touched Production.
- **GTP evidence base:** `origin/main` @ `8433d82bd9`, read with `git show origin/main:<path>`. Live Hub V2 files were read from branch `claude/live-hub-v2-foundation`.
- **Planning authority:** `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` stays the plan. This document proposes candidate items and maps each one to existing task IDs. It is not a competing roadmap.

### Evidence labels used throughout

| Label | Meaning |
|---|---|
| **VERIFIED** | Seen on a public page, with the URL cited. |
| **ADVERTISED** | A marketing claim on a public page that I could not inspect further. |
| **INACCESSIBLE** | Behind login or a paywall, rendered by JavaScript I could not inspect, or not fetched because of robots.txt (see below). |

### ⚠ Scope limit found at the start: robots.txt disallows everything

`https://propdealerbets.com/robots.txt` reads `User-agent: * / Disallow: /` (VERIFIED). The brief requires respecting robots and ToS norms, so I made exactly three requests to the site: the homepage, a second read of the homepage served from the fetch tool's 15-minute cache (no new request), and robots.txt. I fetched no other page, and I did not open `/sims`, `/projections/*`, `/parlay-builder`, `/bets` or the sport model pages.

Everything below about those pages is **ADVERTISED**, based on nav labels and homepage copy, or **INACCESSIBLE**.

Web searches for third-party coverage (reviews, Winible storefront, Discord directories) returned nothing about this product. One more caveat: the homepage was read through a summarizing fetch tool, so the wording is paraphrased. Before anyone quotes these findings externally, a human should confirm them in a normal browser.

---

## 1. Executive comparison

| Dimension | ThePropDealer (evidence) | GameTimePicks (evidence) | Net |
|---|---|---|---|
| **Positioning** | Picks and community product. Membership through Winible, Discord login, DraftKings prices and betslip links, "Rewards" and "Bonuses $80" nav items (VERIFIED, homepage). | Educational, paper-only forecasts with explicit validation status and an immutable forecast ledger (roadmap §1 principles; DS-001 §3 probability display). | Different businesses. Copy their visuals, not their monetization. |
| **Breadth of prop boards** | 8 MLB model pages (Scores, Hits, Home Run, Strikeout, NRFI/YRFI, RBI, Total Bases, HRR) and 11 NFL model pages, plus CFB, UFC, NBA, NHL, Soccer and CBB. Several of those sports are marked as returning later (VERIFIED nav, ADVERTISED content). | MLB families on `/mlb/board`. NFL families as tabs on `/nfl/game/[eventId]`. EPL, UFC, partial NBA. | They look broader per family. Ours are more honest per family. |
| **Headline metric** | An unexplained "A.I. score" per pick, e.g. 3.0 on the free strikeout pick (VERIFIED). | "N% of simulated games", model vs market labelled separately, validation status next to it (DS-001 §3). | **GTP stronger**: transparent. Their score is opaque. |
| **Simulated game** | One sample game per slate, labelled as one typical result from 2,000+ simulations, with a "NOT A REAL GAME" banner and a "Watch the simulation" control (VERIFIED labels; playback INACCESSIBLE). | NFL: an explorer of 5 real sampled games (`sampledWorlds`). MLB: distributions and most-likely finals, but **no** persisted single games. Chapter-based `SimulationStory` with step, pause, restart and skip. | **Present but poorly presented** for NFL. **Weaker** for MLB single-game playback. |
| **Run count** | "2,000+" per game (ADVERTISED). | 10,000 (MLB full-game and props, NFL WM2). 20,000 (NFL score-shape). | A larger run count is not a better model. Neither side's accuracy is established by this. |
| **Track record** | No win rate or ROI on the homepage. Disclaimers present (VERIFIED). No results page found in the public nav. | `/results` (forecasts, picks, parlays, model-audit), forecast-of-record policy, graded ledgers. | **GTP stronger**. |
| **Live tracking** | None visible in the nav (INACCESSIBLE / not evidenced). | Live Hub with an eight-state lifecycle, MLB and NFL adapters, and frozen-forecast progress rails. | **GTP stronger** (on public evidence). |
| **Parlay building** | `/parlay-builder` and a betslip (ADVERTISED; behaviour INACCESSIBLE). | `/build` with an honest independence caveat (`lib/build/compatibility.mjs`). | Unknown. Theirs is probably more commerce-integrated. |
| **Community** | Discord "Bet Club" with a live member count widget (VERIFIED widget). | None. | Out of scope; founder decision. |
| **Mobile** | Not inspected (INACCESSIBLE). | DS-001 breakpoints 320/390/768/1440. | Unknown. |

**Bottom line:** the visible advantage ThePropDealer has is **narrative**. It turns 2,000+ simulations into a single game a reader can watch. GTP already has more of the underlying numbers: 10,000-run distributions, joint final-score frequencies, per-player simulated box scores, and five real sampled NFL games. GTP spreads that across report sections, and MLB, its strongest engine, does not persist a single playable game.

---

## 2. Verified competitor capabilities

All of this is from `https://propdealerbets.com/` (homepage) unless stated otherwise.

| # | Capability | Status | Detail |
|---|---|---|---|
| C1 | Sport navigation | VERIFIED (labels) | NFL "11 models" → `/nfl/scores`; CFB "1 model"; MLB "8 models" → `/mlb/scores`; UFC, NBA, NHL, Soccer, CBB. NBA, NHL, Soccer and CBB cards are marked as returning later. |
| C2 | MLB model sub-nav | VERIFIED (links) | `/mlb/scores`, `/mlb/hits`, `/mlb/home-runs`, `/mlb/strikeouts`, `/mlb/nrfi-yrfi`, `/mlb/rbi`, `/mlb/total-bases`, `/mlb/hrr`. Each card shows a daily posting time. Hero copy says the MLB models are rebuilt each morning around 8 AM ET (ADVERTISED). |
| C3 | NFL model sub-nav | VERIFIED (links) | `/nfl/scores`, `/nfl/touchdowns`, `/nfl/td-value`, `/nfl/primetime-props`, `/nfl/pass-yards`, `/nfl/pass-attempts`, `/nfl/pass-completions`, `/nfl/reception-yards`, `/nfl/receptions`, `/nfl/rush-yards`, `/nfl/rush-attempts`. |
| C4 | Projections | ADVERTISED | `/projections/nfl`, `/projections/mlb`. Contents not fetched (robots). |
| C5 | Free daily pick | VERIFIED | One model per day is free. Today: Strikeout Model, Nick Martinez (TB vs CLE), Over 2.5, "A.I." score 3.0, DraftKings +126, headshot, betslip load control. No projection, hit rate or chart on the card. |
| C6 | Simulated game showcase | VERIFIED (labels), INACCESSIBLE (playback) | "Today's Simulated Game": TB at CLE, 8:00 PM ET, team logos. Caption says every game is simulated 2,000+ times and this is one typical result. A banner says it is not a real game. "Watch the simulation" control. **No score, line score, play-by-play, base state, player lines, distribution or win probability appears in the server-rendered text**, so whatever plays is client-side or behind the link. "View every simulated game" → `/sims`. The footer and nav "Sims" link points to `/projections/mlb` instead (an internal inconsistency). |
| C7 | Parlay builder and bets | ADVERTISED | `/parlay-builder`, `/bets`, a "Slip" placeholder, `/settings` (Book: DraftKings selector). |
| C8 | Account model | VERIFIED (flow description) | Three steps: join through Winible, receive a Discord member role, then log in on the site with Discord (`/auth/discord/login`). No price on the homepage (`/join` not fetched). |
| C9 | Affiliate and rewards | VERIFIED (labels) | `/rewards`, `/bonuses` ("$80"), DraftKings gateway links with tracking parameters. |
| C10 | Community | VERIFIED (widget) | "Bet Club Chat" with a member-online count. |
| C11 | Disclaimers | VERIFIED | Informational only, not betting advice, past output does not guarantee results. No accuracy, win-rate or ROI claims on the homepage. |
| C12 | Rendering | VERIFIED | The homepage is server-rendered and readable. Prices, betslip and chat count depend on JavaScript. |

**Not evidenced anywhere I could look:** live in-game tracking, a public results or track-record page, model methodology, distribution charts, and mobile-specific layout. Treat all of these as unknown, not absent.

---

## 3. UX and visual findings

Only what the homepage shows. Creative assets are described, not copied.

1. **One hero object per slate.** The page commits to a single featured game and a single free pick. That gives a first-time visitor one obvious thing to do ("watch"). GTP's `/simulate` opens with a date and sport chooser plus a coverage count ("N of M events have a report ready"). That is honest and complete, but it asks for a decision before it shows anything.
2. **Fiction is labelled at the point of display.** The banner sits on the object itself, not in a footer. GTP's NFL explorer has an eyebrow line ("Game #N of 10,000 · Middle of the pack") but no equally prominent not-a-real-game marker. DS-001 should have an explicit rule for this (R1).
3. **Per-family navigation.** Every prop family is a first-class nav item with its own posting time. That is how bettors think ("today's strikeout board"). GTP puts MLB families behind `/mlb/board` filters (GTP-14 still open: Total Bases and H+R+RBI filters) and NFL families behind game-page tabs.
4. **One opaque scalar per pick.** "A.I. score" is a sorting key with no stated unit, scale or calibration. GTP must not copy it. It conflicts with DS-001 §3 and with the roadmap principle that every recommendation must trace to forecast, market and eligibility evidence.
5. **Commerce in the chrome.** Book selector, betslip and bonuses sit in the main nav. That is out of scope for GTP's paper-only positioning (open question Q4).
6. **Team logos and player headshots on every card.** GTP already has `TeamLogo` and `PlayerAvatar` with exact-ID sourcing and fallbacks (DS-001). Parity exists here.

---

## 4. Simulation experience analysis

### 4.1 What the competitor shows (as far as is verifiable)

| Aspect from the brief | ThePropDealer | Evidence |
|---|---|---|
| How a simulated game progresses visually | A "Watch the simulation" control implies playback. Its frames, granularity (inning, PA, pitch) and animation could not be inspected. | INACCESSIBLE |
| Scoring and possession representation | Not in the server text. | INACCESSIBLE |
| Playback controls | No play, pause, speed, step or replay labels in the text. | Not evidenced |
| Player performance display | Not in the server text. | INACCESSIBLE |
| Alternative outcomes | One typical result on the homepage. "View every simulated game" suggests one sample per game, not many samples per game. | ADVERTISED |
| Simulated vs actual distinction | Strong: a not-a-real-game banner on the object. | VERIFIED |
| Distributions and summaries | None on the homepage. | Not evidenced |
| Mobile adaptation | Not inspected. | INACCESSIBLE |

**Methodological note.** "One typical result" raises the question of how "typical" is chosen: median margin, modal score, or hand-picked. The site does not say. A single sampled game says almost nothing about the probability of any outcome. Without a distribution beside it, it is entertainment. **Polished visuals are not evidence that a model is more accurate.**

### 4.2 What GTP shows today (verified in code on `origin/main`)

| Surface | File | What it does |
|---|---|---|
| `/simulate` and `/simulate/d/[date]` | `app/src/app/simulate/page.tsx` | Date-first and sport-first chooser, `SimulationExplorer` for MLB, `SimulationCoverageMatrix`, "How to read a simulation". |
| Generation stage | `components/simulate/simulation-stage.tsx`, `scenes.tsx` | Honest state machine (`LOADING_INPUTS → VALIDATING → PREPARING → SUMMARIZING → COMPLETE/REFUSED`) over decorative per-sport SVG scenes. It narrates real prefetch work, not fake computation. |
| Simulation Story | `components/simulate/simulation-story.tsx` + `lib/simulate/presentation/{mlb,nfl,epl,ufc}.ts` | Inline chapters: event → outcome ("Who the simulation favours") → distribution ("How many runs") → margin → scores ("Most likely finals") → players → limits ("What this does not know") → closing. Controls: step, pause, skip, restart, jump to report. Reduced-motion support. Every bar has a text sentence (`describeBars`). Mounted on NFL game, EPL match, UFC card and bout, and the shared game-detail page. |
| NFL Simulated Game Explorer | `components/nfl/forecast/game-explorer.tsx`, mounted at `app/nfl/game/[eventId]/page.tsx` `#sampled-games` | **Five real sampled games** from the 10,000-run World Model V2. Each is chosen at a margin quantile (0.1/0.3/0.5/0.7/0.9), labelled "Away-side outlier … Home-side outlier", and shows the final score, scoring composition, both offenses' volume and each named player's line. Nothing is generated in the browser. |
| MLB full-game report | `components/game/mlb-full-game-report.tsx` | Win probability, run distributions, run line, team totals, `finalScores` (most frequent exact finals), `gameStory` sentences, player means. |
| **Retired** staged animation | `components/game/simulation-animation.tsx`, `simulate/presentation-player.tsx`, `presentation-launcher.tsx` | A fixed 10-second diamond animation gated the precomputed report. Marked **DORMANT** (P242): the founder retired the staged reveal and the presentation player on 2026-09-07 because they were ceremony around already-computed numbers. |

**Key insight.** The founder already rejected animation as ceremony. The competitor's "Watch the simulation" is exactly the kind of feature GTP retired. The distinction that makes playback honest is **whether each frame is a real recorded event from the model's own sampled game**. The retired GTP animation showed generic motion while a report loaded. A real trace replay would show actual model output. That is only possible where the engine records events (see §6).

---

## 5. GameTimePicks feature-gap assessment

### GTP stronger
- **Transparency and validation status:** `status.label` UNDER_FORWARD_EVALUATION, `productEligible: false` on WM2; DS-001 §3; `limitations[]` and `unsupported[]` published in the WM2 artifacts.
- **Distributions:** p10/p25/median/p75/p90 and full histograms (see §6), against no visible distributions at the competitor.
- **Track record:** the `/results` family (`forecasts/[sport]/[family]`, `picks`, `parlays`, `model-audit`) and a forecast-of-record policy, against nothing public at the competitor.
- **Live tracking:** a lifecycle-correct Live Hub (`lib/live/v2/event-view.mjs` `LIVE_V2_STATUS`, eight states; `tracked-prediction.mjs`, where a threshold crossed during play is a fact, not a win).
- **Parlay honesty:** `lib/build/compatibility.mjs` states that the multiplied-legs price is not a same-game price.
- **Reproducibility:** a deterministic `SeededRng`, plus `artifactHash` and `frozenPregame` hashes per game.

### GTP weaker
- **A watchable single MLB game.** MLB has no persisted sampled game. The engine plays them and then discards them (§6.1).
- **First-visit hook.** No single featured "game of the day" object above the fold on `/simulate` or Home.
- **Per-family navigation depth.** No dedicated daily board per prop family with its own URL and posting time (they show 8 MLB and 11 NFL family pages).
- **Coverage this season:** NBA and NHL public models. The competitor also shows NBA, NHL and CBB as returning later, so this is roughly at parity, not a loss.

### Present but poorly presented
- **NFL Simulated Game Explorer.** It is real model output and directly comparable to "one typical result", but it is placed deep on the game page, has no not-a-real-game banner, and has no link from `/simulate` or Home. It is also experimental (WM2 `productEligible: false`), so promotion must keep that label.
- **MLB `finalScores` and `gameStory`.** The "most likely finals" list is a joint score distribution. It could be the honest "typical game" headline: "TB 3 – CLE 4 happened in 3.2% of 10,000 simulated games."
- **Prop distributions on boards.** `game-simulations/<date>.json` `distributions[*].bins` holds full per-prop histograms (Nick Martinez strikeouts: 0–10 with probabilities), but board rows do not show a range strip against the line.
- **SimulationStory chapters.** These are a good controllable narrative, but they tell an aggregate story. There is no "watch one game" chapter that links to a sampled game.

### Neither has (on public evidence)
- Play-by-play or drive-by-drive simulated sequences, from either side.
- Live conditional re-simulation (GTP: `LIVE-003` NOT_STARTED).
- Pitch or batted-ball coordinate visuals (GTP: `LIVE-002` NOT_STARTED).

---

## 6. Data-capability inventory for simulations (per sport)

Categories: **(a)** event-level traces (play-by-play or possession sequences) · **(b)** individual sampled game outcomes · **(c)** aggregate distributions · **(d)** point predictions only.

### 6.1 MLB: (c) persisted. (a) and (b) are generated inside the engine but **not persisted**.

**Full-game artifact:** `app/public/data/mlb/full-game-simulations/<date>.json`. Example: `2026-10-16.json`, `modelVersion: "mlb-fullgame-2026.08-pa-v2"`, `runCount: 10000`, `simulationVersion: 1`.
- **Per game, aggregates:** `winProbability`, `runs.{away,home}.{mean,median,p10,p90}`, `totalRuns.{mean,median,p10,p90,distribution[{value,count,probability}]}`, `runDifferential.distribution`, `runLine[{line,homeCover,awayCover}]`, `teamTotals`, `extraInningsProbability`.
- **Per game, other fields:** `finalScores[{away,home,probability}]` (top joint exact finals), `gameStory[]`, `completeness.{level,notes,missingFamilies}`, `market` (comparison only), `artifactHash`.
- **Players:** `players.batters[{playerId, battingOrder, plateAppearances, hits, totalBases, homeRuns, runs, rbi, walks, strikeouts, rateSource}]` and `players.pitchers[{role, battersFaced, strikeouts, hitsAllowed, runsAllowed, outsRecorded}]`. These are **means only** (no per-player percentiles in this file).
- **Size:** about 275 KB for a 15-game day. About 11.4 MB across 81 files.

**Prop artifact:** `app/public/data/mlb/game-simulations/<date>.json` (`modelVersion: "mlb-2026.07"`).
- `distributions["<market>__<playerId>__<line>"].bins[{label,lowerEdge,upperEdge,count,probability}]`, `sampleCount: 10000`.
- `generatedPicks[{projection, modelProbability, marketProbability, edgePct, riskTier, paperOnly}]`.
- `unavailableModules[]` with honest "not generated" reasons.
- The prop simulation is **per prop, independent** ("Player-prop props only … 10,000 iterations per prop"). It is not a game world.

**Engine:** `app/src/lib/mlb/full-game/engine.ts`.
- Its header describes a PA → base/out → half-inning → nine innings + extras engine.
- It models the automatic runner in extras, walk-offs, GIDP, productive outs, and starter → **league bullpen aggregate**, with "no fabricated reliever identities".
- `GameResult` keeps only `{awayRuns, homeRuns, innings, extra, awayBatters[], homeBatters[], awayStarter, homeStarter}`. **There is no per-inning linescore and no event log.**
- Seeding: one stream per game, `SeededRng("${date}|mlb-fullgame|${gamePk}|${modelVersion}|${simulationVersion}")` in `simulate.ts`. Any individual world is reproducible by replaying the stream.

**Verdict.** GTP has a genuine event-level engine whose events are real model output. Persisting a few sampled games, with half-inning runs plus compact PA outcome codes and base/out states, is a **producer change, not invention**. Honest limits on what such a trace can show:
- No pitch-level data.
- No batted-ball location.
- No reliever names (bullpen aggregate).
- `completeness.level` may be "degraded"; for example, 2026-10-16 has no CLE probable starter and is missing `park_run_factors`, `weather` and `batter_handedness_splits`.

### 6.2 NFL: (b) and (c) persisted. (a) **not available**, and the current engines cannot produce it honestly.

**World Model V2:** `app/public/data/nfl/world-model-v2/<providerEventId>.json`, index at `world-model-v2/index.json` (version 2.2.0, 10,000 runs, about 59 KB per game).
- **`sampledWorlds[5]`:** `{worldIndex, marginQuantile ∈ {0.1,0.3,0.5,0.7,0.9}, winner, away/home.{points, regulationPoints, scoring.{offensiveTd, rushingTd, receivingTd, fieldGoals, extraPoints, twoPointConversions, safeties, nonOffensiveTd}, volume.{passAttempts, completions, passingYards, carries, rushingYards}, players[{line.{passAttempts, completions, passingYards, passingTd, carries, rushingYards, rushingTd, targets, receptions, receivingYards, receivingTd}}]}}`. These are **real individual sampled games at box-score granularity, with no ordering of events**.
- **Aggregates:**
  - `game.{away,home}.points.{mean,median,p10,p25,p75,p90,sd}`, `game.margin.*`, `game.total.*`
  - `game.histograms.{margin,total}.{from,width,bins,shares[],tails}`, `game.commonFinalScores[{away,home,share}]`, `game.overtime.*`
  - `players[].families.<family>.{mean,…,p90,atLeast[]}`
- **Governance:** `forecastOfRecord` and `game.disagreement`. `limitations[]` includes: simulated final scores do not cluster on 3- and 7-point margins, so exact-score frequencies are not published; overtime is drawn from the historical record, not simulated play by play. `unsupported[]` lists anytime_td (failed evaluation), passing_td, and interceptions, sacks, kicking and defense. Status: `UNDER_FORWARD_EVALUATION`, `productEligible: false`.

**Score shape:** `app/public/data/nfl/score-shape/<date>.json`.
- Engine `nfl-full-game-v2-regular-season`, 20,000 runs, `finalScores`, `marginDistribution`, `totalDistribution`, `teamPointsDistribution`, `keyNumbers`, `overtimeProbability`, `tieProbability`.
- Engine source `app/scripts/nfl/lib/nfl-score-engine.mjs` uses `SCORING_CHANCES: 11` latent opportunities, "deliberately NOT called a drive count". The corpus has final scores only, with **no drive data**.

**Other NFL artifacts:**
- `full-game-simulations/latest.json` (`nfl-full-game-v1-scoring-events`) is **stale preseason**: date 2026-08-20, generated 2026-08-16.
- Actual per-quarter scores exist for completed games: `data/internal/nfl/official-periods/<id>.json` `periods.{home,away}[]` (internal; ESPN box score).

**Verdict.** An honest NFL "theater" can show **which of 10,000 games** and its **box score and scoring mix**. It cannot show drives, possessions, quarters or clock. Any drive-by-drive animation would be invented and is ruled out. Unlocking that requires the `NFL-002` "drive process" rung, which is not built.

### 6.3 EPL (soccer): (c) analytic distributions. No sampling. No (a) or (b).
- **Public:** `app/public/data/soccer/epl/forecasts/latest.json`, `modelId: "epl-model-v2-elo-poisson"`. Each row has `probs.{home,draw,away}`, `lambdas`, `teamGoals.{home,away}.distribution[]`, `totals.{distribution[], quantiles.{p10…p90}, ladder[]}`, `margin.distribution[]`, `topScorelines[{score,p}]`, `btts`, `cleanSheet`, `doubleChance`.
- **Private only:** Dixon-Coles v2 is a **private forward shadow** for LaLiga, Serie A and Bundesliga (`app/scripts/soccer/dixon-coles-shadow.mjs` → `data/internal/research/soccer/<league>/shadow-dc-v2/`). It is **not** the public EPL model.
- No minute-by-minute goal timing exists. A "goal at 63'" animation would be invented.

### 6.4 UFC: (c) categorical probabilities. No sampled fights, no round-by-round.
- `app/public/data/ufc/projections-latest.json`: moneyline `modelProbability` vs `marketImpliedProbability`, shrunk toward market, `validationStatus: "in_progress"`.
- `expanded-projections-latest.json`: `method.{koTkoProbability, submissionProbability, decisionProbability, perFighter}`, `goesDistance`, `totalRounds.projectedRounds`. These are model-only and not parlay-eligible. The file was generated 2026-06-15; check its currency before use.

### 6.5 NBA: (d) point predictions only, and currently out of season in the data.
- `app/public/data/nba/team_projections/<date>.json` (latest 2026-05-21): `projectedPts` is the **sum of per-player PTS projections** of players with prop lines (bench not modelled).
- There is no simulation artifact. NBA is out of any theater until `NBA-002`.

### 6.6 Summary matrix

| Sport | (a) event trace | (b) sampled games | (c) distributions | (d) point only | Theater-ready today? |
|---|---|---|---|---|---|
| MLB | Engine generates, **not persisted** | Engine generates, **not persisted** (only top `finalScores` frequencies) | ✅ full-game and per-prop | — | Distributions only. Single-game playback needs producer work (R3). |
| NFL | ❌ (no drive data or engine) | ✅ 5 `sampledWorlds` (WM2, experimental) | ✅ WM2 and score-shape | — | Box-score worlds only, labelled experimental. |
| EPL | ❌ | ❌ (analytic) | ✅ analytic Poisson | — | Distribution only. |
| UFC | ❌ | ❌ | ✅ categorical | — | Distribution only. |
| NBA | ❌ | ❌ | ❌ | ✅ (stale) | No. |

---

## 7. Recommended improvements

**Cost rules applied to every item (COST-001/002):**
- Precomputed outputs only; **no per-visit simulation**.
- New data rides in **existing** daily artifacts (a new field, not a new commit cadence; COST-001 found that data commits drive most Production builds).
- **No new static route per sampled game or per family-day.** Render on the client from a compact JSON fetched on demand.
- Localhost-first, with one founder-approved merge at a time.

### Near-term (display-only; no forecast, grade or receipt changes; suitable for post-freeze P2 Phase C)

#### R1 — "Typical game" spotlight with a not-a-real-game banner (NFL now, MLB headline from `finalScores`)

| Field | Content |
|---|---|
| Description | A featured card on `/simulate` (above the chooser) and optionally on the Home live strip. **NFL:** the WM2 `sampledWorlds` entry with `marginQuantile 0.5`, showing score, scoring mix and top player lines, linking to `#sampled-games`. **MLB:** the top `finalScores` entry, phrased as a frequency ("TB 3 – CLE 4 · 3.2% of 10,000 simulated games"), plus `gameStory[0]`. |
| Competitor inspiration | C6, the one-object hero with an on-object fiction banner. |
| Related GTP | `game-explorer.tsx`, `mlb-full-game-report.tsx`, `simulate-day.tsx`, `featured-simulations.tsx`, DS-001. |
| User benefit | A first-visit hook that is still model output. |
| Complexity | S–M. |
| Data/modeling | None. Existing fields only. |
| Infra | Zero new artifacts. Reads files already shipped. |
| Dependencies | DS-001 rule addition: "a sampled game is always labelled Simulated · not a real game · one of N". |
| Risks | WM2 is `productEligible: false`, so the card must carry the experimental label. Choosing "typical" must be a fixed rule (median margin quantile), never editorial cherry-picking. MLB `finalScores` probabilities are small (about 3%); copy must not read as a prediction of the exact score. |
| Order | 1. |
| Acceptance | Banner present on every sampled-game render. The quantile rule is stated in a tooltip. Experimental status is next to it. Snapshot test that no sampled score renders without the banner. 320 px layout passes. |

#### R2 — Range strip on every prop row (distribution vs line)

| Field | Content |
|---|---|
| Description | A compact horizontal strip: p10–p90 band, median tick, posted line marker, and "x% of simulated games over". MLB uses `distributions[*].bins` (`game-simulations`). NFL uses WM2 `players[].families.<f>.{p10,p25,median,p75,p90}`. This is GTP's honest answer to the competitor's opaque "A.I. score". |
| Competitor inspiration | C5. They show one scalar; we show the shape. |
| Related GTP | `distribution-chart.tsx`, `/mlb/board`, NFL `FamilyTabs`, Live Hub `railLandmarks`. Reuse the same visual on live rails. |
| User benefit | See at a glance how far the line sits from the bulk of outcomes. |
| Complexity | M. |
| Data/modeling | None. |
| Infra | Client render from data already in the page. |
| Dependencies | DS-001 probability display. GTP-14 filters. |
| Risks | MLB full-game player rows are means only, and `rateSource` caveats apply (`TRUTH-001`). Use the prop artifact's bins, not full-game means. Never present ESTIMATE or rejected families with the same weight. |
| Order | 2. |
| Acceptance | Each strip has a text equivalent (`describeBars` pattern). Families with a rejected or ESTIMATE status show their status. Visual-regression fixture in the local gallery. |

#### R3a — Per-family entry points (IA only)

| Field | Content |
|---|---|
| Description | Make each published family reachable in one tap ("MLB · Strikeouts today") as **filter states of the existing board route** (query or hash), not new static pages. |
| Competitor inspiration | C2 and C3 per-family nav. |
| Related GTP | `/mlb/board`, GTP-14, `UX-001` nav, `SportHubShell`. |
| Complexity | S. |
| Data/modeling | None. |
| Infra | No new routes. |
| Risks | Do not list families GTP does not publish (NRFI, RBI, TD value), and do not imply parity. |
| Order | 3. |
| Acceptance | Deep links survive refresh and share. Unsupported families are absent, not "coming soon". |

### Post-launch (producer changes, shadow-safe)

#### R3 — Persist MLB sampled games (traces) from the real engine

| Field | Content |
|---|---|
| Description | Extend `engine.ts` with an optional recorder. In `simulate.ts`, record **K = 5 sampled games** chosen by the same quantile rule as NFL (by run differential at 0.1/0.3/0.5/0.7/0.9; deterministic tie-break on `worldIndex`). Persist `sampledGames[{worldIndex, quantile, linescore: {away:[…], home:[…]}, final, extra, pa: "<compact codes>", box: {batters, starters}}]`. `pa` holds per-PA outcome code, batter slot, outs before, bases before (bit-packed), and runs scored. Bullpen PAs are tagged "BULLPEN" with no invented names. |
| Competitor inspiration | C6, "Watch the simulation", made honest because every frame is a recorded model event. |
| Related GTP | `MLB-005` (shared WorldReceipt), `MLB-003`/`MLB-004`, `PARLAY-001` (same-world joint probability needs world access; compute joint legs at generation time rather than shipping worlds). |
| User benefit | A genuine, replayable simulated game: inning by inning, base state, box score. |
| Complexity | M. Engine instrumentation behind a flag, a two-pass select-then-replay (the RNG is a single stream, so replay the stream to the chosen indices, or buffer traces for candidates), and a `simulationVersion` bump. |
| Data/modeling | None new. Recording only. **The aggregates must be byte-identical with the recorder on vs off**; this is the key test. |
| Infra | About 2–4 KB per sampled game compact, so roughly 15–20 KB per game and 250–300 KB per 15-game day. It rides in the existing daily file, or better a sibling `…/<date>.traces.json` fetched only when the theater opens. No new routes. CPU is negligible next to 10,000 games. |
| Dependencies | `MLB-001` rules audit (the extras runner, safety cap and starter removal must be right before they are shown frame by frame). `TRUTH-001` `rateSource` per row. |
| Risks | Showing a frame-level game amplifies any rules bug (`MLB-001` is NOT_STARTED). A "degraded" `completeness` (missing starter, weather, park) must be shown on the trace. Readers may read one sampled game as a forecast; banner rule R1 applies. |
| Order | 4 (after `MLB-001`). |
| Acceptance | Aggregate hashes unchanged with the recorder on. Every trace replays to its recorded final. Invariant tests: outs ≤ 3 per half, no bottom 9th when home leads, walk-off termination. The artifact validator rejects a trace without `worldIndex`. |

#### R4 — Pregame ↔ Live ↔ Final overlay (where the actual result lands in the pregame distribution)

| Field | Content |
|---|---|
| Description | On the game page Live panel, show the **frozen** pregame total and margin histograms with the current actual score marked. At `FINAL_CANONICAL`, show "the final landed at the Nth percentile of the pregame simulations". This is descriptive only, never a grade. |
| Competitor inspiration | The simulated-vs-actual distinction (C6), extended into live. |
| Related GTP | `LIVE-001`, Live Hub V2 `event-view.mjs`, `tracked-prediction.mjs`, `frozenPregame` hashes, `RESULTS-001`. |
| User benefit | Connects the pregame story to the real game without inventing anything. |
| Complexity | M. |
| Data/modeling | None. Frozen artifacts and adapters already exist. |
| Infra | Client-side, reusing the live poller (30 s client, 25 s gateway TTL). |
| Dependencies | Live Hub V2 promotion (Thursday acceptance doc), Option B forecast-of-record evidence. |
| Risks | A single game's percentile must never be framed as accuracy. Pooled calibration belongs in Results with intervals (memory rule: no "beats baseline" without an interval excluding 0). Mid-game, a "current total" marker on a final-total histogram can mislead; label it "so far". |
| Order | 5. |
| Acceptance | Simulated is shown hatched or outlined and actual is solid. They never share a visual channel. No WIN/LOSS before `FINAL_CANONICAL`. |

#### R5 — "Watch one game" chapter in SimulationStory

| Field | Content |
|---|---|
| Description | Add an optional chapter kind `sampled-game` to `lib/simulate/presentation/*`. **NFL:** the 5 worlds already exist. **MLB:** after R3. It reuses the existing player machine (step, pause, restart), reduced motion and `describeBars`. MLB playback steps half-inning by half-inning, using recorded events only. |
| Competitor inspiration | C6. |
| Related GTP | `simulation-story.tsx`, `player-machine.mjs`. This is **not** the retired `presentation-player.tsx`: no portal, no autoplay, no countdown gate. |
| Complexity | S for NFL, M for MLB. |
| Dependencies | R1 banner rule. R3 for MLB. |
| Risks | It must not drift back into the retired "ceremony". The founder decision of 2026-09-07 needs explicit re-confirmation (Q1). |
| Order | 6. |
| Acceptance | A reader who never presses play still sees the full aggregate story. Every frame cites `worldIndex`. |

### Strategic (model work; roadmap-owned)

- **R6 — MLB conditional live re-simulation (`LIVE-003`).** The MLB engine is already state-based (inning, outs, bases, batting order), so `actual_so_far + simulated_remainder` is architecturally natural. It requires captured live state, replay archives and a new forecast identity per checkpoint, with the pregame parent left immutable. Shadow first. Compute it in a scheduled job at checkpoints, never per visit.
- **R7 — NFL drive-process engine (`NFL-002` rung "drive process").** This is the only honest route to a drive or possession theater. It needs drive-level training data, which is absent today per `nfl-score-engine.mjs`. Until then NFL theater stays at box-score worlds.
- **R8 — Same-world joint probabilities for Parlay Lab (`PARLAY-001`).** Sampled worlds (R3 for MLB, WM2 for NFL) are the foundation. Compute joint leg hits at generation time and ship only the joint numbers, not 10,000 worlds.
- **R9 — EPL and soccer timeline.** Only with a model that produces goal timing, for example a time-inhomogeneous Poisson. Until then there is no minute-level visual.

---

## 8. Proposed Simulation Theater architecture (grounded in real data)

One shell on the **existing** event pages (`/nfl/game/[eventId]`, the MLB game page, `/epl/match/[slug]`, `/ufc/bout/[boutId]`) and on `/simulate`. There are no new routes. All data is precomputed, and the client renders it.

```
┌──────────────────────┐  ┌──────────────────────────┐  ┌───────────────────────┐  ┌────────────────────────┐
│ 1 PREGAME PROJECTION │→ │ 2 SIMULATED OUTCOMES     │→ │ 3 LIVE TRACKING       │→ │ 4 FINAL RESULTS        │
│ forecast of record   │  │ distribution + sampled   │  │ actual state (feed)   │  │ canonical final +      │
│ (frozen, hashed)     │  │ games (labelled fiction) │  │ vs frozen pregame     │  │ where it landed; ledger│
└──────────────────────┘  └──────────────────────────┘  └───────────────────────┘  └────────────────────────┘
```

| Stage | MLB source (today → after R3) | NFL source | EPL / UFC | Rules |
|---|---|---|---|---|
| 1 Pregame | `full-game-simulations` `winProbability`, `runs`, `frozenPregame.{forecastGeneratedAt, artifactHash}`, `completeness` | `forecastOfRecord`, `game.disagreement` (WM2), score-shape `centre` | EPL `probs`, `lambdas`; UFC moneyline | Frozen means frozen. Show the validation status. |
| 2 Simulated outcomes | `totalRuns` and `runDifferential` histograms, `finalScores`, `gameStory` → **R3 `sampledGames` with linescore and PA trace** | `game.histograms`, `commonFinalScores` (WM2 says exact-score frequencies are limited), `sampledWorlds[5]` | EPL `topScorelines`, `totals.distribution`; UFC `method` | Every sampled game: banner, `worldIndex`/N, quantile rule. No invented events. Controls (step/play/pause/speed) only where a trace exists (MLB after R3). NFL is a tab selector, not playback. |
| 3 Live | MLB StatsAPI adapter: inning, `inningState`, outs, balls, strikes, batter, pitcher, `basesOccupied` (`lib/live/adapters/mlb-statsapi.mjs`) | ESPN: clock, `downDistance`, `possessionTeamId`, `yardLine` (`espn-nfl.mjs`) | `DATA_UNAVAILABLE` (no validated adapter) | `LIVE_V2_STATUS` lifecycle. "Last known" on stale data. Actual is solid and simulated is outlined. Do not animate simulated plays alongside the live game. |
| 4 Final | Official final, `FINAL_CANONICAL`, Results ledger | Official final plus `official-periods` quarters (actual only; there is no simulated per-quarter to compare against, so do not fake one) | Settled results | Percentile placement is descriptive. Accuracy claims only from pooled Results with intervals. |

**Payload plan:**
- Stage 1–2 aggregates are already in the page (build-time read).
- Sampled-game traces come from a sibling JSON fetched on demand (one per date, about 300 KB for MLB; NFL already per event, about 59 KB).
- Stage 3 uses the existing poller.
- Stage 4 reads the existing results artifacts.

**Not in the theater (honesty gaps):**
- NFL drives, possessions, quarters or clock in simulation.
- Soccer goal minutes.
- UFC round-by-round.
- NBA anything.
- MLB pitch-level detail, batted-ball locations, reliever identities.

---

## 9. Prioritized roadmap (cross-referenced; proposals for the roadmap owner, not new task IDs)

| Order | Item | Window | Maps to | Gate |
|---|---|---|---|---|
| 1 | R1 Typical-game spotlight + DS-001 fiction-banner rule | P2 Phase C (post Oct 20) | `UX-001` / DS-001, `NFL-005` (display of WM2) | Founder approval; WM2 stays labelled experimental |
| 2 | R2 Range strip on prop rows and live rails | P2 Phase C | `UX-001`, Live Hub V2 (CC-10), `RESULTS-001` visuals | DS-001 |
| 3 | R3a Per-family deep links | P2 Phase C | `UX-001` substream A, GTP-14 | — |
| 4 | R3 MLB sampled-game traces (producer) | Post-launch | `MLB-001` → `MLB-005` | `MLB-001` rules audit; byte-identical aggregates |
| 5 | R4 Pregame↔Live↔Final overlay | Post Live Hub V2 promotion | `LIVE-001`, `RESULTS-001` | Live V2 acceptance passed |
| 6 | R5 Sampled-game chapter in SimulationStory | Post-launch | `UX-001` substream D | Founder re-confirmation (P242 retirement) |
| 7 | R8 Same-world parlay joints | Strategic | `PARLAY-001` | `PRODUCT-001` + world receipts |
| 8 | R6 MLB live re-simulation | Strategic | `LIVE-003` | Replay archive |
| 9 | R7 NFL drive engine | Strategic | `NFL-002` | Drive-level data source |
| 10 | `LIVE-002` MLB visual Game Center (diamond from actual feed) | Strategic | `LIVE-002` | Only real coordinates; none fabricated |

---

## 10. Open questions and what time did not allow

- **Q1 (founder).** The 2026-09-07 decision retired staged animation (P242). Does a **trace-backed** replay (R3/R5), where every frame is a recorded engine event, fall inside or outside that decision?
- **Q2 (founder).** Is a deeper competitor review acceptable given `robots.txt Disallow: /`? If so, a human visit in a normal browser should capture `/sims`, `/projections/mlb`, `/projections/nfl`, the "Watch the simulation" playback (granularity, controls, mobile), `/parlay-builder` and `/join` pricing, as screenshots for internal reference only. I did not do this.
- **Q3.** How does the competitor pick "one typical result" (median, mode or curated)? It is unknown, and it matters for whether R1's fixed quantile rule is a differentiator worth stating in copy.
- **Q4 (founder/legal).** Sportsbook deep links, betslip, bonuses and community are out of scope for a paper-only product. Should they be recorded as a deliberate non-goal?
- **Q5.** NFL `full-game-simulations/latest.json` is preseason (2026-08-20). Is it still read by any public surface, or should it be retired from the coverage matrix? (Not investigated.)
- **Q6.** UFC `expanded-projections-latest.json` was generated 2026-06-15. Confirm whether current cards have method and rounds projections before using them in a theater.
- **Not done:** competitor mobile inspection; any page beyond the homepage; third-party reviews (none found by search); MLB game-page component audit beyond file headers.

**Sources:** https://propdealerbets.com/ (homepage, fetched 2026-10-16) · https://propdealerbets.com/robots.txt. Third-party searches (no relevant results): general web search for "ThePropDealer", "Prop Dealer Winible" and "thepropdealer discord".
