/**
 * THE ASK HELP CORPUS — authored, public-safe product knowledge, and the reason RAG cannot leak.
 *
 * WHY THIS IS WRITTEN RATHER THAN HARVESTED
 * -----------------------------------------
 * The obvious build is "retrieve over docs/". That directory holds 400+ files: handoffs, execution
 * logs, incident post-mortems, model receipts, provider negotiations, founder decision packets and
 * shadow metrics. An allowlist over it would work exactly until someone adds a 401st file, and the
 * failure mode of a hand-maintained exclusion list is that a new internal document quietly becomes
 * retrievable. A corpus that is AUTHORED cannot acquire a private source by accident, because acquiring
 * a source means writing one here.
 *
 * So every chunk below is written for readers, states only what the public product already shows, and
 * carries the public route it describes. The leak guard in the projection builder then re-checks the
 * serialised text for internal path shapes and forbidden field names — belt and braces, because the
 * claim "this is public-safe" should be enforced, not asserted.
 *
 * ACCURACY IS A CONTRACT. Each chunk states a limitation the product genuinely has as of v1.6. A help
 * answer that over-promises is the same defect class as a fabricated stat, so the coverage sentences
 * here match the capability registry and the projection blockers rather than an aspiration.
 */
import { ASK_PROJECTION_SCHEMA_VERSION } from "./contract.mjs";

/**
 * @typedef {{ id: string, title: string, section: string, route: string|null, keywords: string[], text: string }} HelpChunk
 */

/** @type {HelpChunk[]} */
const CHUNKS = [
  {
    id: "ask-what-it-can-access",
    title: "What Ask GameTime can access",
    section: "Ask GameTime",
    route: "/ask/",
    keywords: ["ask", "gametime", "ai", "chat", "access", "sources", "what can you do", "capabilities"],
    text:
      "Ask GameTime answers from GameTimePicks' own tools: recorded game and player research, team and " +
      "player comparisons, matchup context, currently published model forecasts, live state for the sports " +
      "GameTime tracks live, published parlay candidates, and this help. It does not search the web, read " +
      "news, or answer sports questions from memory. If GameTime does not hold the data, Ask says so and " +
      "points you at what it does have.",
  },
  {
    id: "forecast-record",
    title: "The Forecast Record: how every published forecast is measured",
    section: "Results",
    route: "/results/forecasts/",
    keywords: ["forecast record", "accuracy", "how accurate", "brier", "log loss", "calibration", "average miss", "measured", "track record"],
    text:
      "The Forecast Record lists every forecast GameTimePicks published, counted once, and checks each against the " +
      "official result. Each kind of forecast gets its own yardstick: a yardage or points projection is measured by " +
      "how far it missed, a probability by Brier score and log loss (lower is better) and by calibration, and a " +
      "match-result forecast by log loss and how often the likeliest outcome happened. There is no single accuracy " +
      "number across forecast types. Forecasts that are not final, void (the player did not play, a push or a tie) " +
      "or withdrawn before kickoff are shown and never counted as misses. Every forecast type has a downloadable CSV.",
  },
  {
    id: "simulation-meaning",
    title: "What \"simulation\" means on GameTimePicks",
    section: "Methodology",
    route: "/results/forecasts/",
    keywords: ["simulation", "simulated", "simulations", "monte carlo", "10,000", "expected statistical summaries", "not one simulated game", "game path"],
    text:
      "A simulation should mean that each run is one coherent possible game, with every team and player number in " +
      "that run agreeing with the others. GameTime's MLB game reports come from complete simulated games. The NFL " +
      "game pages today show expected statistical summaries, not one simulated game, and say so on the page: the win " +
      "chance, score ranges and player projections come from separate models. A drive-by-drive NFL game simulator " +
      "is being tested privately and is not used for any published NFL number until it passes its validation.",
  },
  {
    id: "forecast-vs-fact",
    title: "Forecast versus recorded fact",
    section: "Glossary",
    route: "/methodology/",
    keywords: ["forecast", "fact", "recorded", "difference", "prediction", "history", "what is a forecast"],
    text:
      "A recorded fact is something that already happened and was captured from an official source — a " +
      "final score, a player's stat line. A forecast is a model's view of something that has not happened " +
      "yet. GameTime keeps these apart everywhere: research pages and Research Lab show recorded facts " +
      "only and contain no forecasts, while forecasts live on the game report pages and carry their model's " +
      "status and confidence.",
  },
  {
    id: "confidence-meaning",
    title: "What Confidence means",
    section: "Glossary",
    route: "/methodology/",
    keywords: ["confidence", "strength", "lean", "strong", "very strong", "what does confidence mean"],
    text:
      "Confidence is the model's own strength label for a single forecast — for example LEAN, STRONG " +
      "SIMULATION or VERY STRONG SIMULATION. It describes how far the model's view sits from the market's, " +
      "not how likely you are to win money. A stronger label is not a promise, and no GameTime label ever " +
      "means a result is certain.",
  },
  {
    id: "model-status",
    title: "Model status: published, paused and experimental",
    section: "Glossary",
    route: "/models/",
    keywords: ["model status", "paused", "published", "experimental", "why is this paused", "stopped", "holding"],
    text:
      "Every GameTime model carries a status. Published means it is live and its forecasts appear in the " +
      "product. Paused means GameTime has stopped publishing that market because its own graded record no " +
      "longer supports it. Experimental means forecasts publish under a banner and are graded, but have not " +
      "cleared the bar to become product picks. Market context means a market's numbers are shown for " +
      "context only — the model was demoted and is not a GameTime projection. A market's status can change " +
      "from day to day, so this page states none: Ask reads the live coverage registry (getCoverage) and each " +
      "forecast's own status for the current one. Published as a forecast and eligible to appear as a parlay " +
      "leg are different things. Ask will explain a paused market but will never present one as a forecast.",
  },
  {
    id: "research-lab",
    title: "Research Lab",
    section: "Research",
    route: "/research/lab/",
    keywords: ["research lab", "game finder", "player stat explorer", "season explorer", "query", "filters", "find games"],
    text:
      "Research Lab is GameTimePicks' factual query tool. Game Finder searches recorded final team games " +
      "for MLB and NFL. Player Stat Explorer searches one player's recorded per-game stat lines for one " +
      "season, for NFL, EPL and MLB. Season Explorer shows recorded team-season totals for MLB and NFL. " +
      "Every result is recorded fact — the Lab contains no forecasts, no odds and no rankings. Ask " +
      "summarises Lab results and links you to the full table.",
  },
  {
    id: "lab-limits",
    title: "What Research Lab cannot search",
    section: "Research",
    route: "/research/lab/",
    keywords: ["lab limits", "epl results", "ufc stats", "unsupported", "why cant i search", "missing data"],
    text:
      "Game Finder and Season Explorer do not cover EPL club results or UFC, because GameTime has no " +
      "canonical EPL team final-score history and UFC has no team-game structure. Player Stat Explorer " +
      "does not cover UFC, which has no comparable numeric stat family across fighters. Player Compare " +
      "is blocked for UFC for the same reason. These are data gaps, not settings.",
  },
  {
    id: "compare",
    title: "Comparing teams and players",
    section: "Research",
    route: "/compare/",
    keywords: ["compare", "team compare", "player compare", "side by side", "how do i compare", "versus"],
    text:
      "Compare puts two teams or two players side by side using recorded facts and, for teams, their " +
      "head-to-head meeting history. Team Compare covers MLB and NFL. Player Compare covers NFL, EPL and " +
      "MLB over the stat families both players share. Compare never names a winner and carries no " +
      "forecast — it shows what was recorded and leaves the judgement to you.",
  },
  {
    id: "matchup",
    title: "Matchup research",
    section: "Research",
    route: "/compare/",
    keywords: ["matchup", "matchup explorer", "game preview", "head to head", "what should i know"],
    text:
      "A Matchup page gathers the factual context for one specific game: both teams' season-to-date and " +
      "recent recorded form as of that kickoff, their prior meetings, and a link to the game's own report " +
      "where the published forecast lives. Matchup pages exist for a bounded set of MLB and NFL games.",
  },
  {
    id: "team-player-research",
    title: "Team and player research pages",
    section: "Research",
    route: "/research/",
    keywords: ["team page", "player page", "research", "profile", "last 10", "recent games", "stats"],
    text:
      "Every covered team and player has a research page with their recorded profile, including their last " +
      "3, 5 and 10 recorded games across seasons. Coverage is stated on each page: a player below the " +
      "recorded-games threshold has a partial page rather than an invented one.",
  },
  {
    id: "live",
    title: "Live games",
    section: "Live",
    route: "/live/",
    keywords: ["live", "in progress", "score now", "watching", "current game", "real time"],
    text:
      "GameTime Live shows current state for MLB and NFL games — whether a game is scheduled, in progress or " +
      "final, and the live score — beside the forecasts frozen before kickoff. A provider's final is not GameTime's " +
      "grading: a game reads \"final — grading pending\" until it is settled against the official record.",
  },
  {
    id: "live-vs-settled",
    title: "Final score versus settled result",
    section: "Live",
    route: "/live/",
    keywords: ["final", "settled", "graded", "pending", "result", "why is it still pending"],
    text:
      "A provider reporting a game as final is not the same as GameTime settling it. Settlement grades " +
      "forecasts against the official box score and can land hours after the final whistle, so a game can " +
      "correctly show a final score while its grading is still pending. Ask keeps the two separate.",
  },
  {
    id: "follow",
    title: "Following teams and players",
    section: "Your GameTime",
    route: "/following/",
    keywords: ["follow", "following", "favourite", "favorite", "how do i follow", "my teams"],
    text:
      "You can follow a team or a player from its page, and your follows appear on the Following page. " +
      "Follows are stored in your own browser on the device you set them on — they are not an account and " +
      "do not sync between devices. Ask cannot read your follows; open Following to see them.",
  },
  {
    id: "saved",
    title: "Saved forecasts and cards",
    section: "Your GameTime",
    route: "/saved/",
    keywords: ["saved", "save", "bookmark", "where are my saved", "my saved forecasts"],
    text:
      "Saving a forecast or a card keeps it on the Saved page, along with how it eventually settled. Like " +
      "follows, saves live in your own browser rather than in an account. Ask cannot read what you saved; " +
      "open Saved to see it.",
  },
  {
    id: "my-gametime",
    title: "My GameTime and Since Your Last Visit",
    section: "Your GameTime",
    route: "/my/",
    keywords: ["my gametime", "since your last visit", "what changed", "whats new", "my page"],
    text:
      "My GameTime brings together the teams and players you follow and the forecasts you saved, with what " +
      "happened to them. Since Your Last Visit summarises what changed for the things you follow since you " +
      "were last here, using a marker kept in your own browser. If it cannot tell when you last visited it " +
      "says so rather than claiming nothing changed.",
  },
  {
    id: "parlay-candidates",
    title: "Parlay candidates and risk levels",
    section: "Parlays",
    route: "/build/",
    keywords: ["parlay", "candidates", "risk", "low", "medium", "high", "longshot", "best parlay", "slip"],
    text:
      "GameTime's optimizer publishes parlay candidates each day in four risk levels, set by the card's combined " +
      "price: Low Risk (−200 to +100), Medium Risk (+100 to +300), High Risk (+300 to +600) and Longshot (above " +
      "+600). A risk level changes which existing candidates are surfaced — it never changes a model's " +
      "projection, probability, confidence or price. Candidates are research, not advice, and no parlay is " +
      "safe. Ask can only show candidates the optimizer already produced; it cannot build you a new one.",
  },
  {
    id: "no-ev",
    title: "Why GameTime does not rank parlays by expected value",
    section: "Parlays",
    route: "/methodology/",
    keywords: ["expected value", "ev", "profitable", "value", "why not ranked", "edge"],
    text:
      "Expected value depends on the price you actually get. GameTime publishes a model-versus-line " +
      "difference for each leg, and the combined payout at the prices a candidate was built with, but it " +
      "does not publish a price-aware expected value. So Ask will not tell you which candidate is the " +
      "highest-EV or the most profitable — that is a claim no GameTime model makes.",
  },
  {
    id: "no-stake-advice",
    title: "Stake sizing",
    section: "Parlays",
    route: "/responsible-use/",
    keywords: ["stake", "how much should i bet", "bankroll", "kelly", "unit size", "bet size"],
    text:
      "GameTime does not calculate an optimal stake. There is no approved staking policy in the product, so " +
      "Ask will not tell you how much to put on a candidate, and will not derive one. If you tell Ask an " +
      "entertainment bankroll it is used only as context for that conversation — to keep suggestions inside " +
      "the budget you named — and it is never stored.",
  },
  {
    id: "responsible-use",
    title: "Responsible use",
    section: "Parlays",
    route: "/responsible-use/",
    keywords: ["responsible", "gambling", "problem", "help", "limits", "safe"],
    text:
      "Wagering is entertainment, it is for people of legal age where it is legal, and it should only ever " +
      "use money you can afford to lose. GameTime publishes no guarantees and no locks. Ask will not help " +
      "plan how to win back a loss, will not suggest increasing a stake because of previous results, and " +
      "will not treat a bankroll as income or an investment.",
  },
  {
    id: "sports-coverage",
    title: "Which sports GameTime covers, and how deeply",
    section: "Coverage",
    route: "/sports/",
    keywords: ["sports", "coverage", "which sports", "nba", "ufc", "epl", "nfl", "mlb", "supported"],
    text:
      "MLB is GameTime's most fully modelled sport: daily boards, full-game simulations, published predictions " +
      "and nightly settlement. NFL publishes graded weekly forecasts and player ranges, labelled experimental. " +
      "EPL and Ligue 1 publish experimental match forecasts that are graded. UFC has fighter research and " +
      "market-implied reads. NBA publishes its schedule and official finals; no NBA forecast is published, " +
      "because no NBA model has yet passed its preregistered validation, and the May–June settled archive stays " +
      "published as history. Which markets are published, paused or market context " +
      "today, and which can supply a parlay leg, changes: Ask reads the live coverage registry for it.",
  },
  {
    id: "navigation",
    title: "Finding your way around",
    section: "Navigation",
    route: "/",
    keywords: ["where", "navigation", "find", "menu", "how do i get to", "page"],
    text:
      "The main destinations are Home, Sports, Simulations, Parlays and Results. Research Lab is at " +
      "Research → Lab, Compare is under Research, Live has its own page, and your followed and saved items " +
      "are under My GameTime. Ask links directly to the page behind any answer it gives.",
  },
  /*
   * PRODUCT PAGES (2026-10-05 audit, A6). "What is Moonshot?" had nothing to retrieve. Each chunk below restates
   * its page's own public description (the page's metadata copy) and nothing more: what the product is, that it
   * is paper-only, and whether it publishes yet. Records, hit rates and today's cards are deliberately absent —
   * those change daily and come from the results tools, never from help text.
   */
  {
    id: "bank-builder",
    title: "Bank Builder",
    section: "Products",
    route: "/bank-builder/",
    keywords: ["bank builder", "ladder", "100 to 10000", "$100", "10k", "paper bankroll", "official card", "bankroll ladder"],
    text:
      "Bank Builder is an educational $100 → $10,000 paper-bankroll ladder, one card per step. Its page shows the " +
      "current run, today's official card and previous hits. It is paper-only: GameTimePicks does not take real " +
      "money, and the ladder is not advice on what to stake. Ask can report its published record from Results.",
  },
  {
    id: "moonshot",
    title: "Moonshot",
    section: "Products",
    route: "/moonshot/",
    keywords: ["moonshot", "higher volatility", "volatile", "long shot product", "moonshot record"],
    text:
      "Moonshot is a separate, higher-volatility paper product. It is tracked on its own record, apart from the " +
      "Bank Builder, so its results never mix into the Bank Builder's. Higher volatility means bigger swings, not a " +
      "better chance. It is educational and paper-only.",
  },
  {
    id: "mr-dub",
    title: "Mr. Dub's Portfolio",
    section: "Products",
    route: "/mr-dub/",
    keywords: ["mr dub", "mr. dub", "dub", "portfolio", "paper portfolio", "flagship"],
    text:
      "Mr. Dub's Portfolio is GameTime's flagship paper portfolio: the $100 → $10K Bank Builder ladders in full, " +
      "with headline numbers, the visual ladder, performance analytics, a day-by-day timeline and every paper card " +
      "by product. It uses official results only. It is educational and paper-only, not financial advice.",
  },
  {
    id: "homer-nukes",
    title: "Homer Nukes",
    section: "Products",
    route: "/homer-nukes/",
    keywords: ["homer nukes", "home run", "home runs", "homer", "hr", "most likely home runs"],
    text:
      "Homer Nukes lists the model's five most likely home runs today, each with its own probability and the " +
      "numbers behind it. A probability is the model's chance that it happens, not a call that it will. Homer " +
      "Nukes is paper-only and educational.",
  },
  {
    id: "endzone-vault",
    title: "Endzone Vault",
    section: "Products",
    route: "/endzone-vault/",
    keywords: ["endzone vault", "end zone", "touchdown", "anytime touchdown", "td scorer", "nfl touchdowns"],
    text:
      "Endzone Vault shows who the model thinks is most likely to score a touchdown in every game on the NFL slate, " +
      "with the gates a card would have to clear and why today is or is not one. When no card clears the gates, " +
      "the page says so rather than publishing one. It is paper-only and educational.",
  },
  {
    id: "cage-chaos",
    title: "Cage Chaos",
    section: "Products",
    route: "/cage-chaos/",
    keywords: ["cage chaos", "ufc card", "fight", "method", "round", "how the fight ends", "ufc picks"],
    text:
      "Cage Chaos covers how each fight on the next UFC card ends: winner, method and round. Each of those three " +
      "comes from a separately evaluated part of the model, each tested on past fights against a check set " +
      "before it was fitted. It is experimental: winner picks are graded on every new card, while method and " +
      "round are not yet graded going forward. It is paper-only and educational, not betting advice.",
  },
  {
    id: "goal-rush",
    title: "Goal Rush",
    section: "Products",
    route: "/goal-rush/",
    keywords: ["goal rush", "premier league product", "epl product", "goalscorer product", "soccer product"],
    text:
      "Goal Rush is the Premier League signature product, and it is still in development. Its inputs exist — " +
      "authorised Premier League odds and an anytime-goalscorer model (not validated) on the EPL pages — but the product built " +
      "from them does not yet, so no Goal Rush picks publish.",
  },
  {
    id: "bucket-blitz",
    title: "Bucket Blitz",
    section: "Products",
    route: "/bucket-blitz/",
    keywords: ["bucket blitz", "nba product", "basketball product", "nba picks"],
    text:
      "Bucket Blitz is the NBA signature product, and it is still in development. Its page shows what is captured " +
      "today and every stage still standing between that and a published read. No Bucket Blitz picks publish, " +
      "because no NBA player model has been validated yet.",
  },
  {
    id: "model-lab",
    title: "Model Lab",
    section: "Methodology",
    route: "/models/",
    keywords: ["model lab", "models", "which models are live", "being tested", "receipts", "model receipts"],
    text:
      "Model Lab lists which GameTime models are live, which are being tested and which are paused, and what each " +
      "model's receipts decided, in plain English. For a single market's status right now, Ask reads the live " +
      "coverage registry rather than repeating the page.",
  },
  {
    id: "feedback",
    title: "Sending feedback",
    section: "Account",
    route: "/feedback/",
    keywords: ["feedback", "report a bug", "bug", "something broke", "suggestion", "contact", "beta"],
    text:
      "During the friends beta, signed-in testers can tell the GameTimePicks team what broke, what looked wrong or " +
      "what confused them on the Send feedback page. Only the sender and the team see a report. Ask cannot " +
      "file feedback on your behalf.",
  },
  {
    id: "retired-pages",
    title: "Pages that have moved: player trends and the World Cup",
    section: "Navigation",
    route: "/mlb/board/",
    keywords: ["trends", "player trends", "world cup", "world cup 2026", "retired", "moved", "where did it go"],
    text:
      "Player trends has been retired; its old address now leads to the MLB model board. World Cup 2026 is " +
      "complete, and its old page now leads to Results.",
  },
  {
    id: "freshness",
    title: "How current the data is",
    section: "Coverage",
    route: "/system-status/",
    keywords: ["fresh", "updated", "current", "stale", "when was this updated", "as of"],
    text:
      "Forecasts, parlay candidates and research all carry the time they were produced, and Ask repeats " +
      "that time rather than implying something is current. Live state is read when you ask for it. If an " +
      "artifact is older than it should be, the product says so instead of presenting it as today's.",
  },
];

/** Build the corpus document, with a content hash so a receipt names the exact text that shipped. */
export function buildHelpCorpus() {
  const chunks = CHUNKS.map((c) => ({
    id: c.id,
    title: c.title,
    section: c.section,
    route: c.route,
    keywords: [...c.keywords],
    text: c.text,
  }));
  return {
    schemaVersion: ASK_PROJECTION_SCHEMA_VERSION,
    artifact: "ask-help",
    count: chunks.length,
    /*
     * The corpus identifies itself by a CONTENT FINGERPRINT, not by the module that produced it.
     * Naming the producing file would put a repository path into a public artifact — which the
     * projection's own leak guard refused, correctly, the first time this shipped. A fingerprint gives
     * a receipt everything it needs (did the corpus change?) and a reader nothing about the repo.
     */
    corpusFingerprint: fingerprint(chunks),
    chunks,
  };
}

/** Stable, non-cryptographic digest of the corpus text — identifies a version, protects nothing. */
function fingerprint(chunks) {
  const text = chunks.map((c) => `${c.id}\u0000${c.route ?? ""}\u0000${c.text}`).join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `help-${chunks.length}-${h.toString(16).padStart(8, "0")}`;
}

export { CHUNKS as HELP_CHUNKS };
