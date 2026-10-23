# Competitor-gap matrix — 2026-10-23

Read-only research for the founder's 2026-10-23 directive (meet or exceed leading sports analytics platforms on usability, transparency, analytical depth and presentation). Docs only; no code changed.

## Scope and method

- **Benchmarked (public pages only):** PropSims (propsims.com), The Spread Sports (thespreadsports.com), plus two contemporaries: Dimers (dimers.com) and Stats Insider (statsinsider.com.au).
- **Already audited independently, not redone:** ThePropDealer, GameScript, SimTheGame, Outlier, Props.Cash, OddsJam, Unabated, Action Network, Juice Reel. Cross-reference only: that audit covers the paid-props/odds-comparison end of the market. This note adds the free-simulation and transparency end.
- **Rules followed:** no accounts, sign-ins, purchases, forms, trials or CAPTCHAs. Non-essential cookies were rejected where a banner appeared (The Spread Sports). No load testing: one browser load per page plus a handful of single `curl` requests. No sportsbook prices or paid data are reproduced here.
- **Our site:** https://gametimepicks.yashwantbalaji.com, observed 2026-10-23 (Friday, a day with 12 NBA games, a Premier League matchweek, a UFC card on Saturday, and NFL Week 7 forecasts published for Sunday).
- **Viewports:** built-in browser at 1440×900 and 390×844 (GameTimePicks, PropSims, The Spread Sports, Dimers at 390; Stats Insider desktop only).

### Label legend

- **[O]** observed by me on the public page at the time of the visit.
- **[C]** vendor claim: something a site says about itself (accuracy, profit, "AI", paywalled features I could not open). Unverified; never treat as fact.
- **[N]** not observed (behind a login/paywall, not found, or not checked).

Competitor text is paraphrased. At most one short phrase per source is quoted: PropSims' banner says "Free NFL simulator: 10,000 sims per game"; The Spread Sports' headline says "Your fantasy edge, backed by real data."

## Matrix: dimension × site

GTP = GameTimePicks. Cells are short on purpose; evidence notes follow in the sections below.

| # | Dimension | GTP | PropSims | The Spread Sports | Dimers | Stats Insider |
|---|---|---|---|---|---|---|
| 1 | Homepage clarity | [O] Plain headline ("Today's games, picks and results"), three CTAs, then a five-sport hub where each sport carries its own model status pill. Strong honesty, but the first screen is status vocabulary (Experimental / Paused / Watch) before value. | [O] Utility-first: one banner, then a tools grid (props, start/sit, DFS, rankings) and a games list. Reads as "tools you use now". | [O] Fantasy-edge headline, free-vs-Pro framing, three CTA buttons plus a trial offer and a giveaway. Marketing-led. | [O] Promo hero (seasonal sale), sport chips, "Starting soon" slate widget, then pricing. | [O] Slate-style block of three-way probabilities for soccer; many sections show "Loading" in the first read. |
| 2 | Sports navigation | [O] Left rail (desktop) / bottom bar (mobile) plus a per-sport hub and sport chips: NFL, NBA, MLB, EPL, Ligue 1, UFC. Six sports; nav has about 30 links, several product names that need explaining (Moonshot, Homer Nukes, Cage Chaos). | [O] NFL/NBA toggle in the header; sub-nav per sport. Two sports, very shallow menu. | [O] Top tabs: Football, Basketball, Hockey, UFC, Simulations, Pro. In-page navigation is script-driven (links are `#`), so tabs are not separately addressable on the home page. | [O] Wide sport carousel (NFL, CFB, NBA, WNBA, MLB, NHL, tennis, golf, soccer leagues). | [O] Sports/Best Bets/Live Now menu; AU-centric sport list (AFL, NRL) plus NBA/EPL/NFL. |
| 3 | Game-discovery workflow | [O] Today page, Sports hub, Simulations lobby, per-sport hubs. Date chips ("Today · Oct 23 · 14 events"). On NBA game day before the forecast publishes, all 12 games read "Forecast pending". No cross-sport "all games with a probability, sorted/filterable" table. | [O] One games index listing each week's games, each linking to a full player-projection page; per-game "close calls". | [O] "Tonight's games" chip, game strip along the bottom of the screen, per-sport sim lobby with a collapsible card per game. | [O] Table of games with a 72-hour window and a calendar drop-down. [C] click-through for win probability and box score projections. | [O] Match list with three-way probability and a decimal-price-style number per outcome. |
| 4 | Depth of projections | [O] NFL: team win %, score, margin and total with 80% ranges; per-player ranges for 7 stats; exact-score table; 3/7/10/14 margin shape vs the last 3 seasons. NBA: Elo side + player medians only once published pre-tip. Many families labelled "paused" or "withheld". | [O] Player-first: PPR median/floor/ceiling, role-change tables when starters are out, depth-chart "chance to lead" shares, prop-line comparison. [N] team win probability on the game page. | [O] Win %, projected score, sim line/total, overtime and tie odds, a very long player-prop table. Probabilities are shown next to market-derived numbers and a "blend". | [O] NBA: "next 72 hours" predictions for moneyline/spread/total. [C] player projections and box score projections (mostly Pro). | [O] Win probability only on the home page; [N] depth. |
| 5 | Simulation presentation | [O] Best in this set: "Simulation Story" chaptered walkthrough, histogram of margins and totals, "Five simulated games as generated", an explorer of one simulated game's box, the plain statement that the shown win share (65.2%) differs from the headline win chance (70.7%) and why. Dense for a first-time reader. | [O] Describes "10,000 simulations" and notes that both teams' outcomes come from one set of games so they are correlated. No visual simulation story observed. | [O] "Watch the sim" and "another simulated game" controls; [C] downloadable video of a simulated game for social posts. | [N] simulation visuals not observed; [C] "AI" and "machine learning" language only. | [N] |
| 6 | Player / team stats | [O] Player and team pages exist (about 640 NFL players, 32 NFL teams, 30 MLB teams, EPL and UFC) with recorded game logs, last-3/5/10, and "what we said vs what happened" per forecast. Gaps: current-season (2026) game logs "not available yet", MLB team batting/pitching "not part of data yet", no NBA player/team pages, `/players/nfl/` and `/teams/nfl/` index URLs return 404 (reachable via Compare and game links). | [O] Player and team index pages linked from the home page; ranks (RB3, WR1), player pages. | [O] "Deep Dive" player research (game-by-game chart against a line, hit rates, splits, defence-vs-position). [C] on-page description; most pages are Pro-gated with a top-3 preview. | [O] Player pages are linked. [C] hit rates and sportsbook-line views. | [N] |
| 7 | Game box scores | [O] Settled-game pages show the final score and the frozen pregame forecast; no post-game box score or team stat table in the page text I read (the "live game state" panel loads from a client-side feed). [O] One simulated game's box line is shown on pregame reports. | [N] post-game box score; [O] player projection tables per game. | [C] The home page says the free Thursday-night sim and the NBA sim include full box scores; [N] I did not open a box score. | [C] "box score projections" per game. | [N] |
| 8 | Odds / market comparison | [O] Games say "No current sportsbook capture covers this game"; comparison module is built but empty on the page I read. Picks board is ranked by model probability, never by a gap to a price. **Authorised use only: no live book prices on the site.** | [O] Shows model medians beside a named book's lines and a "best lines" shop. We do not copy this: it needs licensed prices. | [O] Prop table with model chance, a market-blended chance, the price needed to break even, and a computed edge. Same caveat as PropSims. | [O] Lists a dozen books/exchanges on the page; [C] picks and edges in Pro. | [O] A decimal-odds number beside each outcome on the home slate. |
| 9 | Historical performance tracking | [O] Results page: per-sport records by window (today/7d/30d/season/all-time); every product has its own record; losing records are on the home page ("Record 47–52", "Moonshot 7–48", "Suggested cards MLB 21–88"); a Forecast Record of 13,616 graded forecasts; a per-player forecast-vs-actual table. | [O] Track record page: weekly graded lists, a "pre-kickoff public log", CSV and share-image downloads, losing sub-records published (raw-sim picks, unproven markets). [C] hash-chained log and the headline units/ROI. | [O] A "projection scoreboard" and "Our Picks record" are mentioned on the home page; [N] opened. [C] accuracy of projections. | [C] ROI by market "sweet spot" shown on the home page, labelled as returns; [N] methodology. | [N] |
| 10 | Mobile quality (390) | [O] No horizontal overflow on `/`, `/nba/`; bottom bar with 5 destinations + Menu; hero fits the first screen. Home is ~9,300 px tall and `/nba/` ~9,650 px; 57 of 160 link/button targets on the home page render under 32 px tall. | [O] No overflow; NBA home is ~3,250 px; sport toggle always in header, bottom bar with Props / Optimizer / Best line / Ask Sim. | [O] No overflow; sticky bottom bar with six destinations; page ~10,700 px; hero was blank for the first moments of load before filling in. | [O] No overflow; app-install banner on top; page ~14,000 px; slate widget shows loading skeletons first. | [N] |
| 11 | Speed / responsiveness (observed only) | [O] Home: first byte 0.37 s, load 1.0 s in the browser; HTML 236 KB. Single cold requests had two slow first bytes (`/nba/` 2.5 s, `/epl/` 1.5 s), then 0.13–0.32 s on three repeats. Heavy HTML on some routes: `/results/` 1.7 MB, `/ufc/` 0.9 MB (uncompressed single GETs). | [O] Home load ≈ 0.14 s on a warm cache; ~248 KB HTML; game page ~115 KB. | [O] Home load 0.65 s on desktop; content filled in after script load. | [O] Home load 1.9 s; skeleton placeholders on mobile. | [O] One load: first byte 2.7 s, load 4.3 s; slate area still "Loading…" in the first read. |
| 12 | First-time-visitor comprehension | [O] Good on honesty ("paper-only", "not a recommendation", "Settled through Oct 21"), weaker on what to do first: a long page of sections, five sports each with 2–3 status chips, and several product names. A visitor sees real losing records, which builds trust but gives no obvious "start here" for a casual fan. | [O] Clear job-to-be-done ("props, start/sit, DFS"), glossary and FAQ in the nav. | [O] Clear audience (fantasy/DFS) and price ladder; free vs Pro table. | [O] Clear commercial pitch; analysis behind a subscription. | [O] Clear for a betting audience; thin on explanation. |

Notes on the cells above:

- PropSims, The Spread Sports and Dimers describe accuracy, profit, edge and "AI" in their own words. Those are claims. The matrix records that a record is published, not that it is good.
- Stats Insider: I read only the home page; the game-predictions block had not filled in when I read it, so most cells are [N].
- Dimers' date control said Oct 22 on the morning of Oct 23, which is probably a time-zone cut-off, not a stale model; I did not investigate.

## What we saw in each competitor (one paragraph each)

**PropSims.** A fast, utility-first NFL (and NBA) site: every game has a page with a median/floor/ceiling table for every rostered player, and a "role changes if X is out" panel. Strongest feature relative to us: **player-level depth for every game plus a plain "if X sits" explainer**. Its track-record page is also the strongest transparency pattern in the set: weekly graded lists, CSV downloads and share images, and honest sub-records that lose money. It states a pre-kickoff public log with hashes [C]. It also shows model medians next to a named sportsbook's lines. That is licensed-price territory we do not enter.

**The Spread Sports.** Fantasy/DFS-led, subscription ladder, a free "Thursday night" game sim to show the product. Its sim page pairs win %, projected score, overtime odds and a very long prop table with a market-blended number. Strongest idea for us: **a free full-depth sim for one marquee game per week** as the product demo, and a "Deep Dive" with game-by-game bars against a line. Presentation caveat: heavy script rendering; on mobile the first screen briefly showed an empty hero.

**Dimers.** Broadest sport coverage, 72-hour prediction windows, strong marketing and app push. Public pages show predictions list and many articles; depth is Pro. Strongest idea for us: **a rolling forward window of predictions (today + next 2 days) on one table**.

**Stats Insider.** Australian, three-way soccer/AFL/NRL probabilities on the home page. Observed slow first load and client-side filling. Little to learn beyond using decimal-odds-style presentation sparingly; we will not copy it.

## What GameTimePicks does better — verified on the live site

Each item was seen on the page named, 2026-10-23.

1. **Frozen pregame receipts.** Game reports state "Forecast frozen at Oct 22, 7:53 PM ET. It does not change during the game," show the pregame score/win chance beside the live feed, and the settled-game page says the forecast is "read from its committed file and not regenerated". `/nfl/game/401873017/`, `/nfl/game/401872995/`. None of the benchmarked sites showed this on the pages I read.
2. **Explicit abstentions and "no play".** The NBA hub says the official forecast "is frozen before tip-off" and does not show numbers it does not have; Parlay Center says why each lane is closed; MLB says "No game on the slate … carries a prediction"; Bank Builder shows "No-play". `/`, `/nba/`.
3. **Public graded record that includes losses.** Home page shows paper record 47–52, Moonshot 7–48 and suggested MLB cards 21–88; `/results/` splits records by sport and kind and says a tie or void is never a loss; 13,616 published forecasts measured against official results. PropSims also publishes losing sub-records; the Spread Sports and Dimers show only headline claims on their home pages.
4. **Honest model status and calibration disclosure on the page.** NFL game page states the log-loss figure (0.629), the baseline it beat (0.642), the coin flip (0.693) and that it still trails the sportsbooks' own 0.610, and "has NOT been shown to beat the sportsbook market". `/nfl/game/401873017/`.
5. **Forecast-vs-actual per player.** `/players/nfl/dk-metcalf/` lists every published forecast, the range, the actual and the miss.
6. **Simulation presentation.** Chaptered Simulation Story, margin and total histograms, "five simulated games as generated", and a sentence that the headline win chance and the simulated win share differ and why.
7. **Football-specific shape check.** The 3/7/10/14 margin table against 816 real games in the last three regular seasons, with the stated shortfall.
8. **No gambling edge claims.** The home page ranks the "strongest reads" by the model's own probability and says "never by a gap against a sportsbook price"; EPL's strongest reads carry a "66 matches graded — far too few" warning.

Caveat on 3 and 4: PropSims' honesty on its track record is comparable. We lead on breadth (five sports, product-level records) and on the on-page method disclosure; we do not lead on downloadable data (see gap 8).

## Top 10 customer-facing gaps for GameTimePicks

Ordered by customer impact relative to effort. "Meet" = reach what the benchmarks do. "Exceed" = go past them using what we already have. Landing paths are in `app/src/`.

1. **NBA shows nothing until pre-tip; board empty between slates.** On Friday morning all 12 NBA games read "Forecast pending" and `/nba/projections/` is "empty between slates" (the NBA page itself says so). PropSims had 331 NBA players on its board at 00:19 CT and Dimers lists 72 hours ahead.
   - *Landing:* `app/nba/page.tsx`, `app/nba/projections/[date]/page.tsx`, the NBA home panel in `components/nba/`.
   - *Meet:* publish the frozen daily board as soon as the lineup/injury feed allows (morning), not only pre-tip; show the next two days' schedule with "forecast publishes at HH:MM ET" per game.
   - *Exceed:* a countdown "frozen at / publishes at" timeline per game with the stated reason, and a "what changed since the morning read" diff after tip-off.
   - *Caveat:* a forecast-of-record rule limits when numbers may be frozen; the forecast-of-record rules govern what may be frozen and when. This is about the timing of the public publish, not the model.

2. **Home page leads with status, not value; ~9,300 px on a phone.** Five sport cards, each with two or three status chips (Experimental / Paused / Watch), before the first real number.
   - *Landing:* `app/page.tsx`, `components/home/landing-hero.tsx`, `components/home/home-sections.tsx`, `components/homepage-command-hero.tsx`.
   - *Meet:* one "Today's games" strip of every game with the model's probability and a status icon, above the sport cards; collapse repeated chips into a single "what the statuses mean" link.
   - *Exceed:* a first-visit guided strip ("1. pick a sport, 2. open a game, 3. see how it graded") using the existing guided-start component, with one example link to a settled game.

3. **No cross-sport, sortable games table.** Discovery is hub by hub; the benchmarks give a single table (Dimers' window, PropSims' games index).
   - *Landing:* `app/today/`, `app/simulate/page.tsx`, `components/games-experience.tsx`, `components/event-schedule-hub.tsx`.
   - *Meet:* one table: time, matchup, model probability, status, forecast link; filters for sport and date.
   - *Exceed:* a "frozen / pending / graded" column with the receipt time and a one-click jump to the graded result.

4. **Player-level depth is thin per game on some sports.** PropSims shows every rostered player's median, floor and ceiling and a "chance to lead" for roles. Our NFL game page's default view shows one passing-yards pair, behind stat tabs, with some players left out (4 on the game I read).
   - *Landing:* `components/game/game-detail-page.tsx`, `components/game/game-dashboard-panels.tsx`, the NFL player board panel in `components/nfl/`.
   - *Meet:* a default all-players table (position, median, 80% range) for the official board.
   - *Exceed:* keep our "who this forecast leaves out and why" and pair it with the forecast-vs-actual history we already store; add a plain "if X is out" explanation only where the official board supports it.

5. **No box score after the game.** Settled-game pages show the final score and the frozen forecast, but not the played game. The Spread Sports lists box scores and PropSims has per-game tables.
   - *Landing:* `components/game/game-detail-page.tsx` (post-game state), `components/live/`, `app/nfl/game/[eventId]/`.
   - *Meet:* official team and player box score under "What happened".
   - *Exceed:* the box score beside the frozen forecast per player ("we said 40, he had 93"), reusing the player-forecast table.

6. **Player/team coverage holes and no index.** 2026 NFL game logs "not available yet"; MLB team batting/pitching not in the data; no NBA player or team pages; `/players/nfl/` and `/teams/nfl/` return 404 (the list lives under Compare).
   - *Landing:* `app/players/[sport]/`, `app/teams/[sport]/`, `app/research/lab/`, `app/compare/page.tsx`.
   - *Meet:* index pages for each sport; add current-season logs once the data lands.
   - *Exceed:* keep the "n games behind every figure" rule and the recorded-facts-only compare; add an NBA player page that shows only frozen forecasts and graded results (no stats we do not hold).

7. **Mobile: very long pages and small tap targets.** Home ≈ 9,300 px, `/nba/` ≈ 9,650 px; 57 of 160 link/button targets under 32 px tall on the home page.
   - *Landing:* `components/home/*`, `components/mobile-bottom-nav.tsx`, `components/event-card.tsx`, `components/game-card.tsx`.
   - *Meet:* a minimum 40 px tap height on chips and "Save/Open report" links; collapse long lists behind "show all".
   - *Exceed:* keep each sport's first screen to one summary + one game card with a horizontal swipe for the rest. We already pass the no-overflow check at 390.

8. **Record is readable but not downloadable or shareable.** PropSims offers weekly lists with CSV and share images.
   - *Landing:* `app/results/page.tsx`, `app/results/forecasts/`, `app/results/picks/`.
   - *Meet:* CSV per graded window and sport (rows already exist in the page).
   - *Exceed:* a per-row link to the frozen forecast file and its timestamp, so a reader can verify the receipt themselves.

9. **First-time comprehension of product names and jargon.** Moonshot, Homer Nukes, Endzone Vault, Cage Chaos and Mr. Dub's Portfolio appear in nav without a one-line meaning on every route; "frozen", "simulation-ready", "world-model" and "family" are internal terms in the reports.
   - *Landing:* `components/nav.tsx`, `components/nav/`, `components/how-to-read.tsx`, `app/learn/`.
   - *Meet:* a glossary linked from every report; the sidebar already carries one-line subtitles.
   - *Exceed:* an inline "what does this mean" toggle on the five terms readers meet first (win chance, 80% range, frozen, experimental, paused).

10. **Heavy HTML and cold-start spikes on a few routes.** `/results/` is 1.7 MB and `/ufc/` 0.9 MB of HTML in a single uncompressed GET; `/nba/` and `/epl/` each had one slow first byte (2.5 s, 1.5 s) before settling at 0.13–0.32 s on repeats.
    - *Landing:* `app/results/page.tsx`, `app/ufc/page.tsx`, `components/defer-until-visible.tsx`.
    - *Meet:* paginate or defer the long settled tables; cache the cold paths.
    - *Exceed:* publish a per-route weight budget on `/system-status/`. Measure with a full-slate fixture, since budgets set on small slates have broken at full-slate size before. (Observation only; not a load test.)

### Competitor ideas we deliberately do not take

- Real sportsbook prices or "edges" in tables (needs licensed data; the repo is public).
- Units/ROI headline claims on our picks.
- Subscription/trial/giveaway framing.
- Video export of a simulated game as a growth tactic: skip until simulation storytelling is validated.

## Suggested next steps (for the release owner)

Gaps 1, 3 and 5 are the highest-impact customer-facing items. Gaps 2 and 7 share files and should be done together. Gap 8 is small and independent. Gap 6 depends on the data decision already tracked in the NBA projection coverage notes.

## Evidence ledger

- GTP pages read: `/`, `/nba/`, `/nba/projections/`, `/results/`, `/nfl/game/401873017/`, `/nfl/game/401872995/`, `/players/nfl/dk-metcalf/`, `/teams/mlb/athletics/`, `/compare/`, `/sitemap.xml` (1,556 URLs); 15 route timings.
- PropSims: `/`, `/games/sf-at-atl/`, `/track-record/`, `/nba/`.
- The Spread Sports: `/`, `/nfl-sim`.
- Dimers: `/`, `/nba/predictions`. Stats Insider: `/`.
- Timings are one-off single observations from this machine on 2026-10-23, not benchmarks.
