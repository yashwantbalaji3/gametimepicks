/**
 * Route/capability assurance inventory — pure builder (Program 159 · Release A).
 *
 * TRUTH MODEL. Three layers reconciled: the SOURCE route tree (every page.tsx under src/app — the authority
 * on what exists), the COMMITTED OWNERSHIP TABLE below (the authority on what each route is FOR —
 * a route the table cannot explain is itself a P0 finding), and the BUILT OUTPUT when provided
 * (the authority on what actually ships). Findings come from CONTRADICTIONS between layers, each
 * fail-closed with a stable id — never from vibes about a page looking odd.
 *
 * PURE: explicit `now` + roots, stable ordering, same inputs → same bytes, no network, no clocks.
 */
import fs from "node:fs";
import path from "node:path";
import { legalRouteIsPublic } from "../legal/texts.mjs";

export const ROUTE_INVENTORY_VERSION = 1;

/**
 * The ownership table — every route family the source tree contains must appear here.
 * classification: public | internal | redirect | archive. `redirectTo` names the stub target
 * (must be a real destination, one hop). Dynamic families carry a `family` pattern.
 */
export const ROUTE_TABLE = Object.freeze({
  "/": { classification: "public", owner: "product", purpose: "landing: simulation-first story, today hook, product cards, four-sport strip", dataOwner: "daily brief + market coverage + upcoming adapters", freshness: "build-time; freshness badges re-derive client-side" },
  "/today": { classification: "public", owner: "product", purpose: "daily command center: slate, predictions table, category picks", dataOwner: "daily brief + boards", freshness: "slate-date stamped" },
  "/simulate": { classification: "public", owner: "product", purpose: "date-first/sport-first event selection (today view of the day selector, P209)", dataOwner: "lib/simulate/day-view over per-sport owners", freshness: "each owner's own stamp" },
  "/simulate/d/[date]": { classification: "public", owner: "product", family: true, purpose: "one static page per in-window date — same selector, date as the route (P209)", dataOwner: "lib/simulate/day-view over per-sport owners", freshness: "each owner's own stamp" },
  "/markets": { classification: "public", owner: "product", purpose: "Market Center: ranked disagreement list + reading key (pp, never pts)", dataOwner: "market intelligence artifacts", freshness: "capture stamps" },
  "/build": { classification: "public", owner: "product", purpose: "Parlay Center · Suggested Parlays mode (default): risk ladder + optimizer cards + lane links (P208)", dataOwner: "risk-ladder + suggested-cards artifacts", freshness: "sourceDate == productDate gate" },
  "/build/custom": { classification: "public", owner: "product", purpose: "Parlay Center · Build Your Own mode: qualified leg pool + shared slip draft + optimizer marketplace (P208)", dataOwner: "build legs from eligible slate", freshness: "sourceDate == productDate gate" },
  "/bank-builder": { classification: "public", owner: "product", purpose: "conservative paper ladder (ONE 5-step ladder)", dataOwner: "protected locks + lanes", freshness: "product-state contract" },
  "/moonshot": { classification: "public", owner: "product", purpose: "fast three-day paper ladder ($25 → $1,000, two legs a day)", dataOwner: "moonshot-lane active.json", freshness: "product-state contract" },
  /*
   * One dynamic route serving every live lane's card ladder. Added because the Products rail was
   * four destinations and all four were baseball, while EPL and UFC had published ladders for days
   * that were reachable only by scrolling their sport hub. generateStaticParams enumerates only the
   * lanes with a published ladder, so a lane between slates has no page rather than an empty one.
   */
  "/cards/[sport]": { classification: "public", owner: "product", family: true, purpose: "per-sport paper card ladder — one card per price band, from real posted prices", dataOwner: "parlays/risk-ladder-<sport> artifacts", freshness: "ladder generatedAt; dated by its own slate/card" },
  "/mr-dub": { classification: "public", owner: "product", purpose: "trust center: complete paper-bankroll journey + receipts", dataOwner: "protected portfolio + ledger", freshness: "settlement cutoff shown beside current-ops marker" },
  "/results": { classification: "public", owner: "settlement", purpose: "settled track record on the canonical accounting", dataOwner: "results accounting artifacts", freshness: "settled-through date" },
  "/results/mlb": { classification: "public", owner: "settlement", purpose: "MLB settled results detail", dataOwner: "settlement artifacts", freshness: "settled-through date" },
  "/results/nba": { classification: "archive", owner: "settlement", purpose: "NBA settled archive (HISTORICAL_ONLY)", dataOwner: "frozen archive", freshness: "frozen — archive is dated by design" },
  "/results/nfl": { classification: "public", owner: "settlement", purpose: "NFL week report (P296): every team and player prediction published before kickoff, graded against the official box score — hit/miss per prediction, success rate per prop and overall, voids and pending games named", dataOwner: "nfl/reconciliation/<week>.json + index.json (build-nfl-week-reconciliation)", freshness: "the artifact's own generatedAt, printed on the page" },
  "/results/model-audit": { classification: "public", owner: "research", purpose: "deep-dive model-performance ledger (money-independent)", dataOwner: "grading artifacts", freshness: "per-artifact" },
  "/results/picks": { classification: "public", owner: "product", purpose: "every sport's model record side by side — the only page where the four sit together, and the one that has to say why they are not comparable", dataOwner: "public/data/<sport>/graded-picks.json", freshness: "each artifact's own generatedAt" },
  "/results/picks/[sport]": { classification: "public", owner: "product", family: true, purpose: "every graded prediction a sport's model has made against what actually happened — the other half of publishing forecasts, and the same shape for all four sports", dataOwner: "public/data/<sport>/graded-picks.json, built from each sport's own graded ledger", freshness: "artifact generatedAt; rebuilt whenever a sport settles" },
  "/results/parlay-lab": { classification: "public", owner: "product", purpose: "the Parlay Lab's own suggested cards, every sport, with how each settled — distinct from saved slips", dataOwner: "parlays/lab-ledger + lab-settled receipts", freshness: "ledger generatedAt; receipts dated per settled day" },
  "/results/parlays": { classification: "public", owner: "settlement", purpose: "parlay settlement history", dataOwner: "settlement artifacts", freshness: "settled-through date" },
  "/results/date/[date]": { classification: "public", owner: "settlement", purpose: "per-date settled slate", family: true, dataOwner: "settlement artifacts", freshness: "route param date" },
  "/my": { classification: "public", indexable: false, owner: "product", purpose: "My GameTime (v1.1.3) — live games, upcoming matchups, saved forecasts, results and followed players for what THIS device follows. A view over existing owners, never a truth owner; noindex because a crawler has no follows", dataOwner: "build-time public read model (schedules, canonical results) + /data/my/nfl-players.json + /data/my/saved-settlements.json (only with a saved forecast) + the Follow and Saved stores + the /live batch slate + the device observation record (localStorage gtp.observation.v1, v1.1.4 Since your last visit)", freshness: "per module: live on the reader clock; schedules/results per artifact" },
  "/following": { classification: "public", indexable: false, owner: "product", purpose: "Following management (v1.1.2) — the teams and players this device follows, with unfollow and clear-all. Browser-local, account-free", dataOwner: "lib/follow (localStorage gtp.follow.v2) + build-time team label registry", freshness: "static page; the list is read from this browser after load" },
  "/teams/[sport]/[slug]": { classification: "public", owner: "research", family: true, purpose: "Team research (v1.3): one page per eligible MLB/NFL/EPL team — season results from official final scores (MLB runs, NFL points), recent games, reader-clock upcoming games, season game log and player-research links; EPL is PARTIAL (fixtures, no record) and noindex. dynamicParams=false from the research projection registry; exact canonical id behind every slug", dataOwner: "data/research-projection/v1 (built from the Data Platform by scripts/research/build-research-projections.mjs; pages never read the platform)", freshness: "the projection's platform manifest; results through the newest recorded final, printed as absolute dates" },
  "/players/[sport]/[slug]": { classification: "public", owner: "research", family: true, purpose: "Player / fighter research (v1.3): factual game logs by season, Last 3/5/10 recorded games with n, a simple bar chart and coverage notes for eligible NFL/MLB/EPL players and UFC fighters; a current published forecast appears only in its own section, joined by exact id. MLB pages and thin pages are noindex. dynamicParams=false from the research projection registry", dataOwner: "data/research-projection/v1 + (forecast section only) the NFL player-board published families / UFC card-latest", freshness: "recorded history through the player's newest recorded game; forecasts carry their own kickoff" },
  "/compare": { classification: "public", owner: "research", purpose: "Compare tools directory (v1.4): links to Team Compare (MLB, NFL; EPL shown as blocked) and Player Compare (NFL, EPL, MLB) with what each sport supports, read from the compare readiness receipt", dataOwner: "data/compare-projection/v1/readiness.json (build-time read)", freshness: "the compare projection's research content hash" },
  "/compare/teams/[sport]": { classification: "public", owner: "research", family: true, purpose: "Team Compare shell (v1.4): one static page per sport (mlb, nfl; epl renders only the blocked state, noindex). The pair is URL query state composed in the browser from static assets by the pure lib/compare selectors — no page per pair; every query state shares the shell canonical", dataOwner: "public/data/compare/v1/teams/<sport>/{index,<slug>}.json emitted from data/compare-projection/v1", freshness: "results recorded-through dates printed per team" },
  "/compare/players/[sport]": { classification: "public", owner: "research", family: true, purpose: "Player Compare shell (v1.4): one static page per sport (nfl, epl, mlb; UFC has no comparable stat family and no route). Two players on one exact shared stat family with n, missing never zero; composed in the browser from two static entity assets — no page per pair", dataOwner: "public/data/compare/v1/players/<sport>/{index,<slug>}.json emitted from data/compare-projection/v1", freshness: "recorded-from/through dates printed per player" },
  "/matchups/[sport]/[gameId]": { classification: "public", owner: "research", family: true, purpose: "Matchup Explorer (v1.4): one durable page per game in the bounded compare registry (MLB from 2026-09-17, NFL 2026 from Week 1), keyed by exact canonical game id — both teams entering the game, recorded meetings, a recorded final once it exists, and a SEPARATE link to the forecast owner's report joined by exact id. Scheduled vs started on the reader's clock; no Live request. NFL pages with recorded meetings are indexable, MLB pages noindex. dynamicParams=false", dataOwner: "data/compare-projection/v1 (teams + matchups registry) + (forecast link only) nflPageIds / detailByMatchId", freshness: "results through each team's newest recorded final; the builder refuses to drop a published game" },
  "/live": { classification: "public", owner: "product", purpose: "Live hub (v1.1.1) — today's MLB games grouped Live now / Starting soon / Final today, each beside its frozen pregame forecast", dataOwner: "build-time roster (full-game sims + graded results + canonical hrefs) joined at read time to ONE batch /api/live scoreboard call", freshness: "roster per slate artifact; live half per gateway TTL, aged on the reader clock" },
  "/mlb": { classification: "public", owner: "product", purpose: "MLB Simulation Center (the one FULL_MODEL sport)", dataOwner: "boards + sims", freshness: "board date, latest-slate eyebrow when behind" },
  "/mlb/board": { classification: "public", owner: "product", purpose: "MLB daily board", dataOwner: "boards", freshness: "board date" },
  "/mlb/board/[date]": { classification: "public", owner: "product", purpose: "MLB dated board", family: true, dataOwner: "boards", freshness: "route param date" },
  "/mlb/results": { classification: "public", owner: "settlement", purpose: "MLB results view", dataOwner: "settlement artifacts", freshness: "settled-through" },
  "/mlb/power": { classification: "public", owner: "product", purpose: "MLB power rankings view", dataOwner: "boards", freshness: "board date" },
  "/sports": { classification: "public", owner: "product", purpose: "four-sport schedules directory (Schedule only — not modelled, in words)", dataOwner: "upcoming adapters over committed captures", freshness: "absolute capture dates per section" },
  "/nfl/week/[key]": { classification: "public", owner: "product", family: true, purpose: "NFL shareable week route (P248 Release C): one page per official (seasonType, week) period that has committed data — frozen pre-kickoff game table plus the period's weekly top boards, prev/next only when the neighbor exists, never an invented future week; dynamicParams=false from the weekly-boards register", dataOwner: "nfl/weekly-boards/<key>.json + nfl/forecasts/latest.json (build-time reads)", freshness: "board stamp rendered on the page; forecasts carry their own generatedAt" },
  "/nfl/game/[eventId]": { classification: "public", owner: "product", family: true, purpose: "NFL per-game experimental simulation report (P177-A): projected score, win chance, total and margin distributions with percentiles, the market read side by side, a reading key and the full provenance receipt \u2014 statically generated from the committed forecast artifact, dynamicParams=false", dataOwner: "nfl/forecasts/latest.json + nfl/index.json + nfl/player-board/<eventId>.json + nfl/score-shape/latest.json (build-time reads)", freshness: "each report carries its own generatedAt, kickoff and lifecycle" },
  "/nfl": { classification: "public", owner: "product", purpose: "NFL hub (P169-J): real slate + finals from committed captures, market-by-market coverage table with typed states (PRIVATE_ONLY/AUTH_REQUIRED/ROLE_UNCERTAIN/NO_VAULT) — no predictions published", dataOwner: "nfl schedule/results captures (build-time reads)", freshness: "absolute capture stamps in copy" },
  "/games/[sport]/[gameId]": { classification: "public", owner: "product", purpose: "per-game report (browse-game → report)", family: true, dataOwner: "game detail artifacts", freshness: "artifact stamps" },
  "/learn": { classification: "public", owner: "product", purpose: "How It Works", dataOwner: "static copy", freshness: "static" },
  "/methodology": { classification: "public", owner: "research", purpose: "the model, in depth + coverage matrix", dataOwner: "static + coverage registry", freshness: "static" },
  "/market-guide": { classification: "public", owner: "product", purpose: "market terminology guide", dataOwner: "static copy", freshness: "static" },
  "/responsible-use": { classification: "public", owner: "product", purpose: "responsible-use commitments", dataOwner: "static copy", freshness: "static" },
  "/research": { classification: "public", owner: "research", purpose: "public research terminal (fail-closed adapter)", dataOwner: "public research contract", freshness: "contract stamps" },
  "/ask": { classification: "public", owner: "research", purpose: "Ask GameTime (v1.6): ONE static chat shell over a serverless endpoint that answers from fourteen bounded tools wrapping existing owners — Research Lab, Compare, Matchup, published forecasts, the parlay optimizer, the Live gateway and an authored product-help corpus. The model plans and writes; it never sources a sports fact, and every numeric claim is verified against the tool evidence before the answer is emitted. No conversation, bankroll or identity is stored", dataOwner: "public/data/ask/v1/{entities,forecasts,parlays,matchups,help,recent/<sport>/<shard>}.json emitted from data/ask-projection/v1, plus the published lab and compare assets; the Data Platform is never read", freshness: "every forecast, candidate and research answer repeats its own owner's asOf; live state is read at request time through /api/live/" },
  "/research/lab": { classification: "public", owner: "research", purpose: "Research Lab (v1.5): ONE static shell for three factual searches — Game Finder (MLB, NFL recorded finals), Player Stat Explorer (NFL, EPL, MLB captured categories) and Season Explorer (MLB, NFL). The search is URL query state validated by a versioned typed grammar and executed in the browser by a pure engine over two static assets; there is no page per query, season or filter, and no forecast, model output, Live state or settlement grade is read", dataOwner: "public/data/lab/v1/<mode>/<sport>/{index,rows,<season>}.json emitted from data/lab-projection/v1 (built from the compare projection; the Data Platform is never read)", freshness: "coverage period printed per search from the projection's own recorded-through dates" },
  "/system-status": { classification: "public", owner: "ops", purpose: "pipeline stage status in words", dataOwner: "public research contract", freshness: "contract stamps" },
  /* P312 · the research discipline in public: every model's standing, the forward tests and shadows, and what the
     receipts decided — read from receipts and the health scorecard at build time, never restated. */
  /* P310 · the reader's own saved forecasts: browser-local snapshots joined to the graded ledgers on the client. Nothing
     here enters the published record; noindex. */
  "/saved": { classification: "public", indexable: false, owner: "product", purpose: "saved forecasts: immutable snapshots the reader kept, with the graded result once it exists", dataOwner: "the reader's browser (localStorage) + the graded ledgers", freshness: "per reader" },
  "/models": { classification: "public", owner: "research", purpose: "Model Lab: which models are live, tested, paused; recent decisions", dataOwner: "receipts + health scorecard (lib/command-center/model-lab)", freshness: "build-time read of receipts" },
  "/about": { classification: "public", owner: "product", purpose: "what this is", dataOwner: "static copy", freshness: "static" },
  /* P266 · the only surface holding anything personal. Signed out (and until a Supabase project is
     connected) it renders one paragraph saying accounts are not open; signed in it is the reader's own
     bet record, keyed to their id by row-level security. Noindex, and out of the nav until the keys
     land. Its data owner is the READER — nothing here ever enters the site's published record. */
  "/account": { classification: "public", owner: "product", purpose: "the reader's own bet record: add a slip, confirm what was read, see how it has gone", dataOwner: "the reader's own rows (RLS-scoped)", freshness: "per reader" },
  // Rewritten 2026-08-20: this said /epl "publishes nothing predictive" while the page was rendering
  // a per-fixture 1X2 table. The registry describes what a route DOES; a stale description here is a
  // false answer to the audit that reads it.
  "/ufc/bout/[boutId]": { classification: "public", owner: "product", family: true, purpose: "UFC per-bout model report (P251 \u00b7 F3): the winner split over the two fighters, the method distribution (KO / submission / decision, read among fights that end with a winner), the round distribution with goes-the-distance stated as the method head's decision probability rather than a separate model, both fighters' tracked corpus profiles, and the three heads' held-out evidence printed WITH its denominator. Every figure is read from card-latest.json \u2014 nothing is computed here. Statically generated for every bout on the current card including the ones the model refuses to read, which render the producer's own refusal instead of a fabricated read. dynamicParams=false", dataOwner: "public/data/ufc/card-latest.json via lib/sports/ufc/bout (build-time read)", freshness: "the card artifact's own generatedAt, printed in the method section" },
  "/endzone-vault": { classification: "public", owner: "product", family: false, purpose: "The NFL signature product's own page (P251 \u00b7 F4): today's touchdown board ranked by the model's own probability, the closed-set outcome stated before the numbers (CARD or WATCHLIST, with the producer's reason), how the probability is built, and the gates a CARD would have to clear. Renders the SAME artifact and the SAME component the NFL hub's preview uses, so the two cannot drift. Before this the Vault was a section a reader had to scroll /nfl to find while two unbuilt products each had their own route", dataOwner: "public/data/nfl/end-zone-vault/latest.json (build-time read)", freshness: "the Vault artifact's own generatedAt, printed above the board" },
  "/cage-chaos": { classification: "public", owner: "product", family: false, purpose: "The UFC signature product's own page (P251 \u00b7 F4): the next card ranked by how decisively the model reads each bout \u2014 the product's question, where the hub keeps card order, which is the event's \u2014 with winner, method and round per row, the bouts the model refuses named rather than dropped, and the three heads' held-out evidence with denominators. Every row opens that bout's own report", dataOwner: "public/data/ufc/card-latest.json via lib/sports/ufc/bout (build-time read)", freshness: "the card artifact's own generatedAt via the bout pages it links to" },
  "/epl/match/[slug]": { classification: "public", owner: "product", family: true, purpose: "Premier League per-fixture model report (P188): match-result probabilities with the two-of-three outcomes, the ten likeliest scorelines and the mass they account for, the total-goals distribution with an over/under ladder, each side's own goal curve, both-teams-to-score, clean sheets and the winning-margin distribution \u2014 every figure an exact sum over ONE Poisson score matrix, so no run count is quoted because nothing is sampled. Statically generated per priced fixture, dynamicParams=false. Carries the not-validated-out-of-sample statement ABOVE the first number; no pick, rating or price comparison anywhere", dataOwner: "soccer/epl/forecasts/latest.json via lib/sports/epl/forecast-view (build-time read)", freshness: "the artifact's own generatedAt, printed on the page" },
  "/epl": { classification: "public", owner: "product", purpose: "Premier League hub: fixtures grouped by ET day with club crests, PLUS per-fixture model forecasts (1X2, expected goals, over/under 2.5) for the fixtures that can be priced — published under an explicit 'not validated out of sample' statement, with zero matches graded and no track record claimed", dataOwner: "openfootball schedule capture + EPL Poisson forecast artifact (build-time read)", freshness: "schedule capture stamp in copy; forecasts stamped from the artifact's own generatedAt" },
  "/soccer/ligue-1": { classification: "public", owner: "product", purpose: "Ligue 1 model-only match forecasts (P257): the Premier League model applied unchanged to Ligue 1 after its preregistered backtest accepted it — win/draw/win, expected goals, over 2.5, both teams to score and the likeliest scorelines for the next eight days, with the backtest numbers and the closing-market gap disclosed" },
  /*
   * P196 · Release A correction: "archive" was the P186 truth — a settled card and a schedule-only
   * table. The route has since become the current-card hub (lifecycle-aware next-card heading,
   * three-head model reads, live ladder, model-vs-market graded record — P190-P194), and the
   * closure-packet leak guard caught the stale class on its first real build. The settled archive
   * is now a SECTION of a public product route, not the route's identity.
   */
  "/ufc": { classification: "public", owner: "product", purpose: "UFC hub: current card with three-head model reads + live ladder, model-vs-market graded record, settled archive section", dataOwner: "card-latest + graded picks + frozen settlement", freshness: "card artifact generatedAt; lifecycle derives from the card's own startUtc" },
  // Legal pages are internal until the content gate lets them publish (lib/legal/texts.mjs).
  "/terms": { classification: legalRouteIsPublic("terms") ? "public" : "internal", owner: "legal", purpose: "terms of use — draft for review until counsel approval", dataOwner: "lib/legal/texts.mjs + content manifest", freshness: "effective date on approval" },
  "/privacy": { classification: legalRouteIsPublic("privacy") ? "public" : "internal", owner: "legal", purpose: "privacy notice — draft for review until counsel approval", dataOwner: "lib/legal/texts.mjs + content manifest", freshness: "effective date on approval" },
  "/launch": { classification: "internal", owner: "ops", purpose: "founder command center (pruned from public export)", dataOwner: "evidence artifacts + derived boards", freshness: "per-artifact" },
  "/ops": { classification: "internal", owner: "ops", purpose: "ops dashboard (pruned)", dataOwner: "admin status", freshness: "per-artifact" },
  "/preview/epl": { classification: "internal", owner: "research", purpose: "EPL artifact preview (pruned)", dataOwner: "epl lane artifacts", freshness: "per-artifact" },
  "/preview/live": { classification: "internal", owner: "engineering", purpose: "GameTime Live v1.1 preview — live feed beside the frozen pregame forecast (pruned)", dataOwner: "live gateway (read-time) + committed nfl/mlb forecast artifacts (build-time)", freshness: "live half per gateway TTL; forecast half per artifact" },
  "/preview/june20": { classification: "internal", owner: "research", purpose: "dated preview fixture (pruned)", dataOwner: "fixtures", freshness: "frozen" },
  // Redirect stubs — every one must be ONE hop to a real destination.
  "/picks": { classification: "redirect", owner: "product", purpose: "legacy Picks Lab alias", redirectTo: "/build" },
  "/parlays": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/parlay-lab": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/mlb/parlays": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/nba/parlays": { classification: "redirect", owner: "product", purpose: "legacy alias", redirectTo: "/build" },
  "/games": { classification: "redirect", owner: "product", purpose: "game-lab hub alias", redirectTo: "/simulate" },
  "/board": { classification: "redirect", owner: "product", purpose: "legacy board alias", redirectTo: "/mlb/board" },
  "/projections": { classification: "redirect", owner: "product", purpose: "legacy projections alias", redirectTo: "/mlb/board" },
  "/events": { classification: "redirect", owner: "product", purpose: "retired event hub", redirectTo: "/today" },
  "/trends": { classification: "redirect", owner: "product", purpose: "retired trends", redirectTo: "/results" },
  "/nba": { classification: "redirect", owner: "product", purpose: "retired NBA hub", redirectTo: "/results/nba" },
  "/nba/results": { classification: "redirect", owner: "settlement", purpose: "alias", redirectTo: "/results/nba" },
  "/nhl": { classification: "redirect", owner: "product", purpose: "retired NHL hub", redirectTo: "/" },
  "/ipl": { classification: "redirect", owner: "product", purpose: "retired IPL hub", redirectTo: "/" },
  "/goal-rush": { classification: "product", owner: "product", purpose: "Goal Rush (Premier League signature product) — NAMED AND UNBUILT. Publishes no pick: states what is captured today and which of the twelve gate stages remain, both derived from lib/products/product-readiness. Flips on its own when the stages go green", dataOwner: "derived from sport-assessments + the committed EPL fixture capture", freshness: "no freshness claim — the page makes no time-sensitive claim to be stale" },
  "/bucket-blitz": { classification: "product", owner: "product", purpose: "Bucket Blitz (NBA signature product) — NAMED AND UNBUILT. Same contract as /goal-rush: derived gate stages, captured-schedule facts, no pick", dataOwner: "derived from sport-assessments + the committed NBA schedule capture", freshness: "no freshness claim — the page makes no time-sensitive claim to be stale" },
  /*
   * P240 · two rows had drifted from the pages they describe, and the guard class that reconciles
   * this table checks nav→internal and redirect TARGETS — never "does a redirect-classified page
   * actually redirect" — so the drift was invisible until the route audit walked the pages:
   *   · /homer-nukes was revived on P214 (its home-run probabilities now derive from free StatsAPI
   *     data the product owns) but stayed classified "redirect", which dropped a live product from
   *     sitemap.xml — the registry misdescribed a real destination.
   *   · /world-cup-specials renders a noindex ARCHIVE page (no ClientRedirect in it at all); the
   *     "archive" class this table already uses for /results/nba is its truthful row.
   */
  "/homer-nukes": { classification: "public", owner: "product", purpose: "Homer Nukes (revived P214): five independent home-run probabilities per slate, each settling on its own — a list, not a parlay", dataOwner: "home-run board derived from free StatsAPI data", freshness: "board artifact generatedAt" },
  "/world-cup": { classification: "redirect", owner: "product", purpose: "closed WC destination", redirectTo: "/results" },
  "/world-cup-specials": { classification: "archive", owner: "product", purpose: "closed WC product — noindex archive page, proof retained", dataOwner: "frozen archive", freshness: "frozen — archive is dated by design" },
});

const norm = (r) => (r === "" ? "/" : r);

/** Discover concrete route paths from a src/app tree. */
export function discoverRoutes(appDir) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory()) {
        if (e.name === "page.tsx") out.push(norm(prefix));
        continue;
      }
      walk(path.join(dir, e.name), `${prefix}/${e.name}`);
    }
  };
  walk(appDir, "");
  return out.sort();
}

/** Build the inventory + findings. All inputs explicit; no clocks, no network. */
export function buildRouteInventory({ now, appDir, outDir = null, navSources = [] }) {
  if (!now || !Number.isFinite(Date.parse(now))) throw new Error("buildRouteInventory: now required");
  const discovered = discoverRoutes(appDir);
  const findings = [];
  const find = (id, severity, summary, route) => {
    if (findings.some((f) => f.id === id)) return; // one card per root
    findings.push({ id, severity, summary, route, owner: "ENGINEERING", state: "OPEN" });
  };

  const routes = [];
  for (const r of discovered) {
    const entry = ROUTE_TABLE[r];
    if (!entry) { find(`route-unowned-${r}`, "P0", `active route ${r} has no owner/purpose in the table — an unexplained route is a launch blocker`, r); continue; }
    const rec = { route: r, ...entry };
    // Redirect discipline: target must be a real public/archive destination (one hop).
    if (entry.classification === "redirect") {
      const target = ROUTE_TABLE[entry.redirectTo];
      if (!target) find(`redirect-dangling-${r}`, "P0", `${r} redirects to ${entry.redirectTo}, which the table does not know`, r);
      else if (target.classification === "redirect") find(`redirect-chain-${r}`, "P1", `${r} → ${entry.redirectTo} is a redirect chain (two hops)`, r);
      else if (target.classification === "internal") find(`redirect-internal-${r}`, "P0", `${r} redirects into an internal route`, r);
    }
    // Built-output reconciliation, when an export is provided.
    if (outDir) {
      const htmlPath = r === "/" ? path.join(outDir, "index.html") : path.join(outDir, ...r.slice(1).split("/"), "index.html");
      if (entry.family) {
        /*
         * P196: a family used to be taken on faith ("representative pages generated per fixture"),
         * which is a vacuous check — a public family that generated ZERO pages read exactly like a
         * healthy one. Count the concrete instances under the family's static prefix instead. Zero
         * is P1, not P0: a lane between slates may legitimately have nothing to generate, but it
         * must show up here as a fact rather than hide behind the word FAMILY.
         */
        const staticPrefix = r.split("/[")[0];
        let instances = 0;
        try {
          instances = fs.readdirSync(path.join(outDir, ...staticPrefix.slice(1).split("/")), { withFileTypes: true })
            .filter((d) => d.isDirectory()).length;
        } catch { /* missing prefix dir counts as zero */ }
        rec.built = `FAMILY (${instances} generated page(s))`;
        if (instances === 0) find(`family-empty-${r}`, "P1", `${r} is a public family with zero generated pages in the export`, r);
      } else {
        const built = fs.existsSync(htmlPath);
        rec.built = built;
        if (entry.classification === "internal" && built) find(`internal-exported-${r}`, "P0", `internal route ${r} exists in the public export`, r);
        if ((entry.classification === "public" || entry.classification === "archive" || entry.classification === "redirect") && !built) {
          find(`route-not-built-${r}`, "P0", `${r} is in the table as ${entry.classification} but absent from the built export`, r);
        }
      }
    } else rec.built = "UNVERIFIED (no export provided)";
    routes.push(rec);
  }
  // Inverse reconciliation: table rows whose source route vanished.
  for (const r of Object.keys(ROUTE_TABLE)) {
    if (!discovered.includes(r)) find(`table-stale-${r}`, "P1", `table entry ${r} has no source route — remove or restore`, r);
  }
  // Nav-link reconciliation: every internal href must land on a known, non-internal route.
  for (const { name, source } of navSources) {
    for (const m of source.matchAll(/href(?:=|:\s*)"(\/[^"#]*)/g)) {
      const href = norm(m[1].replace(/\/$/, ""));
      const entry = ROUTE_TABLE[href];
      if (!entry) find(`nav-unknown-${name}-${href}`, "P0", `${name} links ${href}, which the table does not know`, href);
      else if (entry.classification === "internal") find(`nav-internal-${name}-${href}`, "P0", `${name} links internal route ${href}`, href);
    }
  }

  const sev = { P0: 0, P1: 1, P2: 2, P3: 3 };
  findings.sort((a, b) => sev[a.severity] - sev[b.severity] || a.id.localeCompare(b.id));
  return {
    schemaVersion: ROUTE_INVENTORY_VERSION,
    artifact: "route-inventory",
    dataClass: "PRIVATE_AUDIT",
    generatedAt: now,
    totals: {
      routes: routes.length,
      public: routes.filter((x) => x.classification === "public").length,
      internal: routes.filter((x) => x.classification === "internal").length,
      redirects: routes.filter((x) => x.classification === "redirect").length,
      archive: routes.filter((x) => x.classification === "archive").length,
      findings: findings.length,
      p0: findings.filter((f) => f.severity === "P0").length,
    },
    routes,
    findings,
  };
}
