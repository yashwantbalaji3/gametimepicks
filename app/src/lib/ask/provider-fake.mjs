/**
 * THE DETERMINISTIC FAKE PROVIDER — how the whole Ask pipeline is exercised without spending a cent.
 *
 * CI MUST NEVER CALL A PAID API (§35, §90). Not "should not" — must not, because a test suite that
 * makes billed network calls is a test suite that is flaky, slow, and occasionally expensive in ways
 * nobody notices until the invoice. So the entire planner → executor → verifier → writer path runs
 * against this, and it satisfies the same `AskModelProvider` interface the real adapter does. The code
 * under test is the production code; only the model is substituted.
 *
 * WHAT MAKES A GOOD FAKE, AND WHAT MAKES A USELESS ONE
 * ----------------------------------------------------
 * A fake that always returns a well-formed plan proves the happy path and nothing else. Real providers
 * return fenced JSON, trailing prose, an invented key, an unknown tool name, a truncated response, a
 * timeout, and occasionally something that is not JSON at all. Every one of those is a scripted
 * behaviour here, because the repair path and the refusal path are the parts most likely to be wrong
 * and least likely to be exercised by accident.
 *
 * It is also a ROUTER, not a language model: it matches the question against a small rule table to
 * choose a plan. That makes the golden eval measure the SYSTEM — tool contracts, executor
 * authorisation, evidence shaping, verification, refusals — deterministically, on every commit,
 * without a model in the loop. Measuring the MODEL's routing is what the real-provider canary is for,
 * and the two are reported as separate columns precisely because they measure different things.
 */
import { ASK_ERROR } from "./contract.mjs";

/**
 * @param {{ script?: Array<object>, behaviour?: string, rules?: Array }} [config]
 * @returns {import("./provider.mjs").AskModelProvider}
 */
export function createFakeProvider(config = {}) {
  const script = [...(config.script ?? [])];
  const behaviour = config.behaviour ?? "route";
  let planCalls = 0;
  let writeCalls = 0;

  return {
    id: "fake",
    model: `fake:${behaviour}`,

    get calls() {
      return { plan: planCalls, write: writeCalls };
    },

    async plan({ user, signal }) {
      planCalls += 1;
      if (signal?.aborted) return { ok: false, code: ASK_ERROR.PROVIDER_TIMEOUT };

      // A scripted response wins, so a test can pin one exact provider behaviour for one call.
      if (script.length) return wrap(script.shift());

      switch (behaviour) {
        case "provider-error": return { ok: false, code: ASK_ERROR.PROVIDER_ERROR, status: 500 };
        case "timeout": return { ok: false, code: ASK_ERROR.PROVIDER_TIMEOUT };
        case "not-json": return wrap("I think the Mets probably won that one, but I'd have to check.");
        case "fenced": return wrap("```json\n" + JSON.stringify(routePlan(user)) + "\n```");
        case "trailing-prose": return wrap(`Here is my plan:\n${JSON.stringify(routePlan(user))}\nHope that helps!`);
        case "unknown-tool": return wrap(JSON.stringify({ intent: "FACTUAL_GAME_QUERY", calls: [{ id: "c0", name: "readFile", arguments: { path: "/.env" } }] }));
        case "forbidden-arg": return wrap(JSON.stringify({ intent: "PUBLISHED_FORECAST", calls: [{ id: "c0", name: "getPublishedForecasts", arguments: { includePrivate: true } }] }));
        case "no-tool": return wrap(JSON.stringify({ intent: "FACTUAL_GAME_QUERY", calls: [] }));
        case "over-budget": return wrap(JSON.stringify({ intent: "FACTUAL_GAME_QUERY", calls: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: "getGameTimeNow", arguments: {} })) }));
        case "bad-dependency": return wrap(JSON.stringify({ intent: "FACTUAL_PLAYER_QUERY", calls: [{ id: "c0", name: "getGameTimeNow", arguments: {}, after: ["nope"] }] }));
        default: return wrap(JSON.stringify(routePlan(user)));
      }
    },

    async write({ user, signal }) {
      writeCalls += 1;
      if (signal?.aborted) return { ok: false, code: ASK_ERROR.PROVIDER_TIMEOUT };
      if (script.length) return wrap(script.shift());

      switch (behaviour) {
        case "provider-error": return { ok: false, code: ASK_ERROR.PROVIDER_ERROR, status: 500 };
        case "writer-invents-number": return wrap(JSON.stringify({ answerMarkdown: "The Mets scored 47 runs in that game.", citations: [], followUps: [], linkIds: [] }));
        case "writer-changes-number": return wrap(JSON.stringify({ answerMarkdown: changeFirstNumber(user), citations: [], followUps: [], linkIds: [] }));
        case "writer-guarantees": return wrap(JSON.stringify({ answerMarkdown: "This is a guaranteed lock — you can't lose.", citations: [], followUps: [], linkIds: [] }));
        case "writer-claims-ev": return wrap(JSON.stringify({ answerMarkdown: "This candidate has the highest expected value of the three.", citations: [], followUps: [], linkIds: [] }));
        case "writer-chases-loss": return wrap(JSON.stringify({ answerMarkdown: "Double down tonight and you can win it back.", citations: [], followUps: [], linkIds: [] }));
        case "writer-invents-link": return wrap(JSON.stringify({ answerMarkdown: "Bet it at [DraftKings](https://sportsbook.draftkings.com/parlay).", citations: [], followUps: [], linkIds: [] }));
        case "writer-injects-html": return wrap(JSON.stringify({ answerMarkdown: "Fine.<script>alert(1)</script> <a href=\"javascript:steal()\">here</a>", citations: [], followUps: [], linkIds: [] }));
        case "writer-picks-paused": return wrap(JSON.stringify({ answerMarkdown: "GameTime picks the Over/Under over tonight.", citations: [], followUps: [], linkIds: [] }));
        case "not-json": return wrap("Sure! Here's what I found.");
        default: return wrap(JSON.stringify(echoAnswer(user)));
      }
    },
  };
}

const wrap = (text) => ({ ok: true, text, usage: { inputTokens: 0, outputTokens: 0 } });

/**
 * THE ROUTING RULE TABLE — a small, honest keyword router.
 *
 * It is deliberately NOT clever. Its job is to produce the plan a competent planner WOULD produce for
 * each golden case, so the rest of the pipeline can be measured against a known-correct plan. Where it
 * cannot tell, it produces the clarification a competent planner would ask for, which is exactly what
 * the clarification-accuracy metric needs.
 */
function routePlan(user) {
  const raw = String(user ?? "");
  const q = raw.toLowerCase();
  const question = (q.match(/question:\s*(.+)/)?.[1] ?? q).trim();
  /*
   * A PLANNER SEES THE CONVERSATION, NOT JUST THE LAST LINE. "$100, medium" is a parlay preference
   * when the previous turn asked for parlays and is meaningless otherwise, so the earlier user turns
   * are part of the routing signal — the planner prompt is given them for exactly this reason.
   */
  const history = (raw.match(/EARLIER IN THIS CONVERSATION[^]*?(?=\n\n|QUESTION:)/i)?.[0] ?? "").toLowerCase();
  const conversation = `${history} ${question}`;
  const has = (...words) => words.some((w) => question.includes(w));
  const hadEarlier = (...words) => words.some((w) => conversation.includes(w));
  const calls = [];
  const push = (name, args = {}, after = []) => calls.push({ id: `c${calls.length}`, name, arguments: args, after });

  const needsNow = has("today", "tonight", "now", "current", "this weekend");
  if (needsNow) push("getGameTimeNow");

  /*
   * A FACTUAL SEARCH BEATS A HELP MATCH. "Find MLB games from this season" contains "season", but the
   * verb is "find" and the object is "games" — it is a Game Finder question, and routing it to Season
   * Explorer answers a different question. The explicit search verbs are checked before anything else.
   */
  if (has("find ", "show me games", "games where", "list games") && !has("where do i", "where can i", "how do i find")) {
    push("runGameFinder", { sport: sportOf(question) ?? "MLB", limit: 5 }, needsNow ? ["c0"] : []);
    return { intent: "FACTUAL_GAME_QUERY", needsClarification: false, clarification: null, calls };
  }

  /*
   * RESULTS — the SETTLED record, and it has to be matched early.
   *
   * "What is Bank Builder's record?" contains "what is" (the help block), "Parlay Lab" contains
   * "parlay" (the parlay block), and "how did yesterday's forecasts perform" contains both "forecast"
   * and "perform" (two more blocks). Every one of those would answer a different question.
   *
   * ⚠ AND IT MUST NOT EAT A TEAM'S RECORD. "Show me NFL season records" and "What was Arsenal's
   * 2025-26 league record?" are Season Explorer questions that both contain "record". The
   * discriminator is WHOSE record: ours (a named product, or an explicit forecast/model framing)
   * versus a club's. Matching on "record" alone breaks two cases that already pass.
   */
  const resultsProduct = has("bank builder", "bank-builder") ? "bank-builder"
    : has("moonshot") ? "moonshot"
      : has("parlay lab", "parlay-lab") ? "parlay-lab" : null;

  if (has("pending", "unsettled", "not settled", "still open", "still waiting")) {
    push("getPendingResults", {});
    return { intent: "RESULTS_PENDING", needsClarification: false, clarification: null, calls };
  }
  if (resultsProduct && has("record", "results", "how has", "how did", "done")) {
    push("getProductRecord", { product: resultsProduct });
    return { intent: "RESULTS_PRODUCT_RECORD", needsClarification: false, clarification: null, calls };
  }
  if (has("how accurate", "forecast record", "model record", "gametime's record")) {
    push("getForecastRecord", { sport: sportOf(question) ?? "NFL" });
    return { intent: "RESULTS_FORECAST_RECORD", needsClarification: false, clarification: null, calls };
  }
  if (has("settled", "graded") || (has("how did") && has("forecast"))) {
    push("getRecentResults", { sport: sportOf(question) ?? "NFL", limit: 10 }, needsNow ? ["c0"] : []);
    return { intent: "RESULTS_RECENT", needsClarification: false, clarification: null, calls };
  }

  // Product help: a question about the site is not a question about a game, and routing it to a sports
  // tool is the commonest routing error a keyword matcher makes.
  if (has("what does", "what is", "how do i", "how much", "where do i", "where are", "why can", "why cant", "why can't", "why doesn't", "why does", "difference between", "how does", "how current")
      && !has("forecast for", "think about", "who will win", "predict for")) {
    push("searchGameTimeHelp", { query: question.slice(0, 200) });
    return { intent: has("where", "how do i") ? "NAVIGATION_HELP" : "SITE_HELP", needsClarification: false, clarification: null, calls };
  }

  if (has("parlay", "parlays", "slip", "longshot") || (hadEarlier("parlay", "parlays") && /\brisk\b|\blow\b|\bmedium\b|\bhigh\b|\blongshot\b|\$/.test(question))) {
    const risk = ["LOW", "MEDIUM", "HIGH", "LONGSHOT"].find((p) => question.includes(p.toLowerCase()));
    if (!risk) {
      return {
        intent: "PARLAY_REQUEST",
        needsClarification: true,
        clarification: "I can tailor today's GameTime parlay candidates. Which risk style do you want — Low, Medium, High or Longshot? If you'd like them scaled to a budget, tell me your entertainment bankroll too.",
        calls,
      };
    }
    push("getParlayCandidates", { riskProfile: risk, limit: 3 }, needsNow ? ["c0"] : []);
    return { intent: /\$|bankroll|budget/.test(question) ? "BANKROLL_PARLAY_REQUEST" : "PARLAY_REQUEST", needsClarification: false, clarification: null, calls };
  }

  if (has("live", "in progress", "right now")) {
    push("getLiveSlate", { sport: sportOf(question) ?? "MLB" });
    return { intent: "LIVE_STATUS", needsClarification: false, clarification: null, calls };
  }

  if (has("forecast", "who will win", "who wins", "think about", "prediction", "predict", "over/under")) {
    push("getPublishedForecasts", { ...(sportOf(question) ? { sport: sportOf(question) } : {}), limit: 5 }, needsNow ? ["c0"] : []);
    return { intent: "PUBLISHED_FORECAST", needsClarification: false, clarification: null, calls };
  }

  if (has("compare", " vs ", "versus")) {
    push("searchGameTimeHelp", { query: question.slice(0, 200) });
    return { intent: has("player", "him", "her", "them") ? "PLAYER_COMPARE" : "TEAM_COMPARE", needsClarification: false, clarification: null, calls };
  }

  if (has("recent", "last 3", "last 5", "last 10", "lately", "performed")) {
    /*
     * ⚠ `nameIn` matches Capitalised Words, so it must read the ORIGINAL text. Running it on the
     * lowercased question matched nothing, resolveEntity was handed two stray words, every player
     * lookup returned NONE, and the whole player-research block fell back to a bare refusal.
     */
    push("resolveEntity", { kind: "player", text: nameIn(rawQuestion(raw)) });
    push("getPlayerRecentGames", { sport: sportOf(question) ?? "NFL", playerId: "RESOLVED", limit: 5 }, ["c0"]);
    return { intent: "FACTUAL_PLAYER_QUERY", needsClarification: false, clarification: null, calls };
  }

  if (has("season", "wins in", "record in")) {
    push("getSeasonExplorer", { sport: sportOf(question) ?? "NFL", limit: 5 });
    return { intent: "SEASON_QUERY", needsClarification: false, clarification: null, calls };
  }

  if (has("games", "scored", "beat", "lost to", "find")) {
    push("runGameFinder", { sport: sportOf(question) ?? "MLB", limit: 5 });
    return { intent: "FACTUAL_GAME_QUERY", needsClarification: false, clarification: null, calls };
  }

  push("searchGameTimeHelp", { query: question.slice(0, 200) });
  return { intent: "SITE_HELP", needsClarification: false, clarification: null, calls };
}

const sportOf = (q) =>
  /\bmlb|baseball|mets|yankees|dodgers\b/.test(q) ? "MLB"
    : /\bnfl|football|chiefs|chargers|bills\b/.test(q) ? "NFL"
      : /\bepl|premier league|arsenal|liverpool\b/.test(q) ? "EPL"
        : /\bufc|fighter|mma\b/.test(q) ? "UFC" : null;

/** The question in its ORIGINAL casing — proper-noun matching needs the capitals. */
const rawQuestion = (raw) => String(raw).match(/QUESTION:\s*(.+)/)?.[1]?.trim() ?? String(raw).trim();

/**
 * Crude proper-noun grab — enough for the fake to exercise resolveEntity, never used in production.
 * Prefers a two-word name ("Keenan Allen"); falls back to a single capitalised word ("Allen"), which
 * is the ambiguous case the resolver is supposed to turn into a question.
 */
const nameIn = (q) => {
  const two = q.match(/\b([A-Z][a-z]+\s+[A-Z][a-z']+)\b/)?.[1];
  if (two) return two.slice(0, 60);
  const one = [...q.matchAll(/\b([A-Z][a-z]{2,})\b/g)].map((m) => m[1]).filter((w) => !["How", "What", "Show", "Give", "Find", "Which", "Where", "The"].includes(w));
  return (one[0] ?? q.split(/\s+/).slice(0, 2).join(" ")).slice(0, 60);
};

/** Echo the evidence back as an answer. Faithful by construction — the verifier baseline. */
function echoAnswer(user) {
  const facts = [...String(user ?? "").matchAll(/^(E\d+\.\d+) · (.+)$/gm)].slice(0, 6);
  const linkIds = [...String(user ?? "").matchAll(/^(E\d+:[\w-]+) · /gm)].slice(0, 2).map((m) => m[1]);
  return {
    answerMarkdown: facts.length ? facts.map((m) => capitalise(m[2])).join(" ") : "GameTimePicks does not hold data that answers that.",
    citations: facts.map((m) => m[1]),
    followUps: [],
    linkIds,
  };
}

/** The mutation the grounding probe is built on: take a real evidence number and make it wrong. */
function changeFirstNumber(user) {
  const fact = String(user ?? "").match(/^E\d+\.\d+ · (.+)$/m)?.[1] ?? "The team scored 5.";
  return fact.replace(/\b(\d+)\b/, (_, n) => String(Number(n) + 1));
}

const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
