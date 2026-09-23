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
      "longer supports it — the MLB over/under market is paused for this reason. Experimental means " +
      "forecasts publish under a banner and are graded, but have not cleared the bar to become product " +
      "picks. NFL is mixed rather than wholly experimental: rushing yards, receiving yards, receptions and " +
      "anytime touchdown are published, while passing yards is not — its over/under chance is not yet " +
      "calibrated well enough, so its range is shown instead of a precise chance. Published as a forecast " +
      "and eligible to appear as a parlay leg are different " +
      "things — the signature products currently draw their legs from MLB only. Ask will explain a paused " +
      "market but will never present one as a forecast.",
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
      "GameTime Live shows current state for MLB games — whether a game is scheduled, in progress or final, " +
      "and the live score. NFL live state is not available in GameTimePicks: the endpoint refuses it, so " +
      "Ask cannot report a live NFL score. For NFL you can still open the scheduled matchup, the recorded " +
      "research, or the published pregame forecast.",
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
    title: "Parlay candidates and risk styles",
    section: "Parlays",
    route: "/build/",
    keywords: ["parlay", "candidates", "risk", "low", "medium", "high", "longshot", "best parlay", "slip"],
    text:
      "GameTime's optimizer publishes parlay candidates each day in four risk styles: Low, Medium, High and " +
      "Longshot. A risk style changes which existing candidates are surfaced — it never changes a model's " +
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
      "MLB is GameTime's fully modelled sport: daily boards, full-game simulations, published predictions " +
      "and nightly settlement. NFL publishes graded forecasts too, several at published status — rushing " +
      "yards, receiving yards, receptions and anytime touchdown — with passing yards not yet published. " +
      "EPL publishes experimental forecasts that are graded. Neither sport currently supplies parlay legs: " +
      "the signature products draw from MLB only. UFC has fighter research and market-implied reads. NBA is a " +
      "historical archive — its settled record stays published, but it is off-season with no live " +
      "projection capability, so it produces no current forecasts or parlay candidates.",
  },
  {
    id: "navigation",
    title: "Finding your way around",
    section: "Navigation",
    route: "/",
    keywords: ["where", "navigation", "find", "menu", "how do i get to", "page"],
    text:
      "The main destinations are Home, Sports, Simulations, Picks & Parlays and Results. Research Lab is at " +
      "Research → Lab, Compare is under Research, Live has its own page, and your followed and saved items " +
      "are under My GameTime. Ask links directly to the page behind any answer it gives.",
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
