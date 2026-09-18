/**
 * THE EVIDENCE BUNDLE — what the writer is allowed to know, and the reason it is a small structured
 * object rather than a pile of rows.
 *
 * TWO JOBS, AND THE SECOND IS THE ONE PEOPLE FORGET.
 *
 * 1. BOUND THE CONTEXT. A 500-row Game Finder result must not be pasted into a prompt (§58, §169).
 *    Ask SUMMARISES; Research Lab DISPLAYS. So each tool result becomes a compact fact list plus a
 *    handful of representative rows, and the answer links to the Lab for the rest.
 *
 * 2. STATE THE SEMANTICS, NOT THE TUPLES (§16). Handing a model `["NYM", 5, 7, "L"]` invites it to
 *    decide what those mean, and it will decide confidently. So every fact is emitted as an explicit
 *    labelled statement with its own id — "E3.2 · the New York Mets scored 5 and allowed 7, a loss" —
 *    and the writer is told to use those sentences. A model asked to interpret is a model asked to
 *    guess; a model asked to repeat is a model that can be checked.
 *
 * The numeric index this produces is what the verifier checks the finished answer against, so the
 * bundle is simultaneously the writer's input and the grader's answer key. That is deliberate: a
 * number in the answer that is not in this index has no source, whatever it looks like.
 */
import { ASK_BUDGET, ASK_STATUS } from "./contract.mjs";

/**
 * Build the bundle from the executor's envelopes.
 *
 * @param {Array<object>} envelopes
 * @returns {{ items: Array<object>, facts: Array<{id:string,text:string}>, numbers: Set<string>, identifiers: Set<string>, links: Array<object>, unsupported: Array<object> }}
 */
export function buildEvidence(envelopes) {
  const items = [];
  const facts = [];
  const links = [];
  const unsupported = [];
  const numbers = new Set();
  const identifiers = new Set();

  envelopes.forEach((env, i) => {
    const id = `E${i + 1}`;
    /*
     * Emit one evidence sentence, and register every number it contains.
     *
     * TWO SOURCES OF SUPPORTED NUMBERS, AND THE SECOND IS THE ONE THAT WAS MISSING. The explicit
     * `values` list registers a value in every spelling a writer might legitimately choose (0.674 as
     * "67.4%", say). But the SENTENCE ITSELF is also evidence, so any number appearing in its text is
     * supported by definition — including constants the sentence phrases with, like "per 100 staked".
     * Registering only `values` meant the verifier rejected answers that faithfully repeated a phrase
     * this very function wrote. A fact's own words cannot be an unsupported claim.
     */
    const say = (text, values = []) => {
      if (facts.length >= ASK_BUDGET.maxEvidenceRows) return;
      const fid = `${id}.${facts.filter((f) => f.id.startsWith(`${id}.`)).length + 1}`;
      facts.push({ id: fid, source: env.tool, text });
      for (const v of values) registerNumber(numbers, v);
      for (const m of String(text).matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) registerNumber(numbers, Number(m[0].replace(/,/g, "")));
      /*
       * ⚠ NO TRAILING \b. An evidence sentence carries a full timestamp — "updated
       * 2026-09-17T10:09:03.504Z" — and `\b\d{4}-\d{2}-\d{2}\b` does not match there, because the
       * character after "17" is "T", a word character. The answer then writes the date bare, where the
       * boundary DOES match, and the verifier flagged a date its own evidence had supplied. The
       * asymmetry rejected every forecast answer that mentioned when a forecast was updated.
       */
      for (const m of String(text).matchAll(/\b\d{4}-\d{2}-\d{2}/g)) numbers.add(m[0]);
      /*
       * Identifiers are OPAQUE, not numeric. A slip id like `opt_2026-09-17_public_medium_mlb_513c61`
       * is a name that happens to contain digits; a verifier reading "513" out of it would demand
       * evidence for a number nobody claimed. They are collected so the numeric scan can skip them.
       */
      for (const m of String(text).matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+){2,}\b/g)) identifiers.add(m[0]);
    };

    for (const l of env.links ?? []) if (l?.href) links.push({ id: `${id}:${l.id ?? "link"}`, label: l.label ?? l.href, href: l.href, source: env.tool });

    if (env.status === ASK_STATUS.UNSUPPORTED || env.status === ASK_STATUS.ERROR) {
      unsupported.push({ id, tool: env.tool, error: env.error, detail: env.detail ?? null, alternatives: env.data?.alternatives ?? [] });
      /*
       * A REFUSAL IS AN ANSWER, SO IT HAS TO READ LIKE ONE. The first version of this sentence was
       * "getLiveSlate could not answer: UNSUPPORTED_SPORT" — accurate, and useless to a reader, who
       * then sees an internal tool name and an error code in a chat bubble. The evidence now states
       * the gap in product terms; the code stays in the receipt where it belongs.
       */
      say(unsupportedSentence(env), []);
      items.push({ id, tool: env.tool, status: env.status, error: env.error, detail: env.detail ?? null });
      return;
    }

    const d = env.data ?? {};
    switch (env.tool) {
      case "getGameTimeNow":
        say(`the current GameTime product date is ${d.productDateEt} (Eastern), and the current time is ${d.nowEt} ET`, [d.productDateEt]);
        break;

      case "resolveEntity":
        if (d.resolution === "AMBIGUOUS") {
          say(`"${d.query}" matches ${d.totalCandidates} entities: ${d.candidates.map((c) => c.label).join(", ")} — the user must choose`, [d.totalCandidates]);
        } else if (d.entity) {
          say(`"${d.entity.label}" is the ${d.entity.sport} ${d.entity.kind} with canonical id ${d.entity.id} (${d.resolution})`);
        }
        break;

      case "runGameFinder": {
        say(`Game Finder matched ${d.totalMatched} recorded ${env.arguments.sport} games for that query; ${d.returned} are listed here`, [d.totalMatched, d.returned]);
        for (const r of (d.rows ?? []).slice(0, 8)) {
          /*
           * LOCATION IS PROVEN OR IT IS NEUTRAL. When `hostKnown` is false the source never established
           * which side was at home, so the sentence says "against" rather than "at home to" — the tuple
           * order is canonical id order, not a location claim.
           */
          const where = r.team ? (r.hostKnown && r.homeAway === "H" ? " at home" : r.hostKnown && r.homeAway === "A" ? " away" : "") : "";
          const line = r.team
            ? `on ${day(r.date)} the ${r.team} scored ${r.scored} and allowed ${r.allowed} against the ${r.opponent}${where} — a ${outcome(r.result)}`
            : `on ${day(r.date)} ${r.teamA} ${r.scoreA}, ${r.teamB} ${r.scoreB}`;
          say(line, [r.scored, r.allowed, r.scoreA, r.scoreB, day(r.date)]);
        }
        break;
      }

      case "runPlayerResearchQuery": {
        if (d.availableFamilies) {
          say(`${d.player?.label ?? "that player"} has recorded stat families: ${d.availableFamilies.join(", ")} — the question did not name one`);
          break;
        }
        /*
         * NO IDENTITY, NO SENTENCE (§171). A tool envelope is not guaranteed to carry every key this
         * branch reads: PARTIAL envelopes reach this switch, and some of them are shaped around the
         * REASON a result is partial rather than around the result. Reading through a missing key
         * throws, and a throw here takes down the whole turn — see the getPlayerRecentGames branch
         * below for what that cost in production.
         */
        if (!d.player) break;
        say(`in ${d.season}, ${d.player.label} has ${d.totalMatched} recorded games matching that query for ${d.stat}; ${d.returned} are listed`, [d.totalMatched, d.returned]);
        for (const r of (d.rows ?? []).slice(0, 8)) {
          // MISSING IS NOT ZERO. A null value is stated as "not recorded", never rendered as 0.
          const v = r.value == null ? "not recorded" : String(r.value);
          say(`on ${day(r.date)} against the ${r.opponent}, ${d.player.label} recorded ${v} ${short(d.stat)}`, [r.value, day(r.date)]);
        }
        break;
      }

      case "getSeasonExplorer":
        say(`Season Explorer matched ${d.totalMatched} recorded ${env.arguments.sport} team-seasons; ${d.returned} are listed`, [d.totalMatched, d.returned]);
        for (const r of (d.rows ?? []).slice(0, 8)) {
          say(`in ${r.seasonId} the ${r.team} recorded ${r.recordedFinals} finals: ${r.wins} wins, ${r.losses} losses${r.ties ? `, ${r.ties} ties` : ""}, scoring ${r.scored} and allowing ${r.allowed}`,
            [r.recordedFinals, r.wins, r.losses, r.ties, r.scored, r.allowed]);
        }
        break;

      case "getPlayerRecentGames": {
        /*
         * ⚠ THIS BRANCH CRASHED PRODUCTION, AND THE CRASH WAS REPORTED AS `PROVIDER_ERROR`.
         *
         * `getPlayerRecentGames` returns a PARTIAL envelope when the caller named a stat family the
         * sport does not record — and that envelope is shaped around the FAMILIES, carrying no
         * `player` at all. PARTIAL envelopes reach this switch, so `d.player.label` threw a
         * TypeError, the turn died, and the endpoint's outer catch reported it as a provider failure.
         *
         * It surfaced as an intermittent ~50% failure on player questions, because whether it
         * happened at all depended on whether the planner chose to pass `statFamily` that time. The
         * same question passed and failed minutes apart, help questions never failed, and every
         * failure was ~5s faster than every success — the writer never ran. That pattern was read
         * first as an upstream outage window and then as a question-specific fault. It was neither:
         * it was this line, and the misattribution to the provider is what hid it.
         *
         * The sibling branch above already guarded exactly this case. One of the two was missed.
         */
        if (d.availableFamilies) {
          const names = d.availableFamilies.map((f) => (typeof f === "string" ? f : f?.label ?? f?.key)).filter(Boolean);
          say(`GameTime records these stat families for that player: ${names.join(", ") || "none"} — the question named one that is not recorded`);
          break;
        }
        if (!d.player) break;
        say(`${d.player.label}'s last ${d.returned} recorded games (the player research page's own Last-${d.requested})`, [d.returned, d.requested]);
        for (const [key, w] of Object.entries(d.windows ?? {})) {
          say(`over those ${w.size} games ${d.player.label} recorded ${w.recordedGames} ${short(key)} entries totalling ${w.sum}, an average of ${w.average}`, [w.size, w.recordedGames, w.sum, w.average]);
        }
        for (const r of (d.rows ?? []).slice(0, 6)) {
          const vals = Object.entries(r.values).map(([k, v]) => `${v == null ? "not recorded" : v} ${short(k)}`).join(", ");
          say(`on ${day(r.date)} against the ${r.opponent}, ${d.player.label} recorded ${vals}`, [...Object.values(r.values), day(r.date)]);
        }
        break;
      }

      case "getTeamComparison": {
        if (!d.a || !d.b) break;
        const h = d.headToHead?.allTime?.record;
        if (h) say(`the ${d.a.label} and the ${d.b.label} have ${h.meetings} recorded meetings: ${d.a.label} ${h.aWins}, ${d.b.label} ${h.bWins}${h.ties ? `, ${h.ties} tied` : ""}`, [h.meetings, h.aWins, h.bWins, h.ties]);
        for (const [side, label] of [["a", d.a.label], ["b", d.b.label]]) {
          const s = d.season?.[side];
          if (s) say(`in ${d.season.id}, ${label} recorded ${s.wins ?? "?"} wins and ${s.losses ?? "?"} losses from ${s.finals ?? s.games ?? "?"} recorded finals`, [s.wins, s.losses, s.finals, s.games]);
        }
        say(`this comparison is recorded fact only — GameTime Compare names no winner and carries no forecast`);
        break;
      }

      case "getPlayerComparison":
        if (!d.a || !d.b) break;
        say(`${d.a.label} and ${d.b.label} share these recorded stat families: ${(d.sharedFamilies ?? []).map(short).join(", ") || "none listed"}`);
        say(`this comparison is recorded fact only — it carries no forecast and names no better player`);
        break;

      case "getMatchupContext": {
        if (!d.away || !d.home) break;
        say(`${d.away.label} play ${d.home.label}${d.startUtc ? ` at ${d.startUtc}` : ""}${d.neutralSite ? " at a neutral site" : ""}`);
        if (d.final) say(`that game finished ${d.away.label} ${d.final.away}, ${d.home.label} ${d.final.home}`, [d.final.away, d.final.home]);
        const h = d.headToHead?.record;
        if (h) say(`entering that game they had ${h.meetings} recorded meetings: ${d.away.label} ${h.aWins}, ${d.home.label} ${h.bWins}`, [h.meetings, h.aWins, h.bWins]);
        say(`this matchup page carries factual context only; the published forecast lives on the game's own report`);
        break;
      }

      case "getPublishedForecasts": {
        say(`${d.totalMatched} currently published GameTime forecasts match; ${d.returned} are described here`, [d.totalMatched, d.returned]);
        /*
         * DETAIL FOR THE FIRST FEW, HEADLINES FOR THE REST.
         *
         * Six forecasts × every market × every completeness note × every player range produced ~52
         * evidence sentences, a very long writer prompt, and an answer long enough to be CUT OFF at
         * max_tokens — which the parser then reported as "no JSON object", a failure that looks like
         * disobedience and is actually length. It also made for a worse answer: a reader asking what
         * GameTime forecasts tonight wants the shape of the slate, not every market of every game.
         */
        const DETAILED = 3;
        for (const [fi, f] of (d.forecasts ?? []).entries()) {
          if (fi >= DETAILED) {
            const head = (f.markets ?? [])[0];
            say(`for ${f.matchup} (${f.sport}), GameTime has ${f.experimental ? "an EXPERIMENTAL forecast" : "a published forecast"}${head?.pick ? `; its ${head.label} pick is ${head.pick}` : ""}${head?.confidence ? `, confidence ${head.confidence}` : ""}`,
              [head?.modelProbability]);
            continue;
          }
          const tag = f.experimental ? "an EXPERIMENTAL forecast, which is graded but is not a product pick" : "a published forecast";
          say(`for ${f.matchup} (${f.sport}), GameTime has ${tag}${f.updatedAt ? `, updated ${f.updatedAt}` : ""}`);
          for (const m of f.markets ?? []) {
            say(`${f.matchup} · ${m.label}: GameTime's pick is ${m.pick ?? "none stated"}${m.line != null ? ` at ${m.line}` : ""}, model probability ${pct(m.modelProbability)}, market-implied ${pct(m.marketImpliedProbability)}, confidence ${m.confidence ?? "not stated"}`,
              [m.modelProbability, m.marketImpliedProbability, m.line]);
          }
          for (const p of f.pausedMarkets ?? []) {
            /*
             * A PAUSED MARKET IS EXPLAINABLE, NOT FORECASTABLE. The sentence names the pause and the
             * owner's reason, and deliberately contains no pick and no probability, so there is nothing
             * for the writer to present as a forecast even if it wanted to.
             */
            say(`${f.matchup} · ${p.label} is PAUSED by GameTime and publishes no pick. The stated reason: ${p.reason ?? "not given"}`);
          }
          for (const w of f.why ?? []) say(`${f.matchup} · the model's own note: ${w}`);
          for (const pl of f.players ?? []) {
            for (const m of pl.markets ?? []) say(`${f.matchup} · ${pl.name} ${m.label}: GameTime's simulated median is ${m.median}, with a 10th–90th percentile range of ${m.p10} to ${m.p90}`, [m.median, m.p10, m.p90]);
          }
        }
        break;
      }

      case "getParlayCandidates": {
        say(`GameTime published ${d.totalMatched} parlay candidates for ${d.date}${d.riskProfile ? ` in the ${d.riskProfile} risk style` : ""}; ${d.returned} are described here`, [d.totalMatched, d.returned, d.date]);
        say(`GameTime does not publish a price-aware expected value, so these candidates are NOT ranked by expected value or profitability`);
        say(`GameTime has no staking policy, so there is no recommended stake for any of these`);
        for (const c of d.candidates ?? []) {
          say(`candidate ${c.slipId} is a ${c.legCount}-leg ${c.riskProfile} ${c.sport} candidate${c.sameGame ? " whose legs are from one game" : ""}. The optimizer's own note: ${c.rationale ?? "none"}`, [c.legCount]);
          if (c.payoutPer100) say(`candidate ${c.slipId} pays ${c.payoutPer100.american > 0 ? "+" : ""}${c.payoutPer100.american} American, a profit of ${c.payoutPer100.profitPer100} per 100 staked, at the prices it was built with`, [c.payoutPer100.american, c.payoutPer100.profitPer100]);
          say(c.correlationModelled
            ? `candidate ${c.slipId} has a correlation penalty of ${c.correlationPenalty} from the optimizer`
            : `correlation is NOT modelled for candidate ${c.slipId}; do not describe its legs as independent`, [c.correlationPenalty]);
          for (const l of c.legs ?? []) {
            say(`candidate ${c.slipId} leg: ${l.playerName} (${l.team} vs ${l.opponent}) ${l.marketLabel} ${l.side} ${l.line}, GameTime projection ${l.projection}, confidence ${l.confidence}, priced ${l.oddsForSide} at ${l.bookmaker}`,
              [l.line, l.projection, l.oddsForSide, l.edgePct]);
          }
        }
        break;
      }

      case "getLiveSlate": {
        say(`GameTime Live reports ${d.liveCount} of ${d.total} ${d.sport} games in progress, as of ${d.fetchedAt}`, [d.liveCount, d.total]);
        for (const e of (d.events ?? []).slice(0, 8)) {
          say(e.state === "PRE"
            ? `${e.away} at ${e.home} has not started; no score exists yet`
            : `${e.away} ${e.awayScore ?? "not reported"}, ${e.home} ${e.homeScore ?? "not reported"} — state ${e.state}${e.stateDetail ? ` (${e.stateDetail})` : ""}`,
            [e.awayScore, e.homeScore]);
        }
        say(`a final score here is the provider's; GameTime's own grading of a game can land later`);
        break;
      }

      case "searchGameTimeHelp":
        for (const s of d.sections ?? []) say(`GameTimePicks help — ${s.title}: ${s.text}`);
        break;

      case "calculate":
        if (d.op === "STAKE_RETURN") say(`a stake of ${d.inputs.stake} on a candidate paying ${d.inputs.profitPer100} per 100 returns ${d.totalReturn} in total, a profit of ${d.profit}, ${d.meaning}`, [d.inputs.stake, d.inputs.profitPer100, d.totalReturn, d.profit]);
        else say(`${d.op} of the supplied values is ${d.result}`, [d.result, ...Object.values(d.inputs ?? {})]);
        break;

      default:
        say(`${env.tool} returned a result`);
    }

    items.push({ id, tool: env.tool, status: env.status, arguments: env.arguments });
  });

  return { items, facts, numbers, identifiers, links, unsupported };
}

/**
 * Register every spelling of a number the writer might legitimately use.
 *
 * A model asked to repeat `0.674` may write "67.4%", "67%", or "0.67". All of those are faithful, and
 * a verifier that only accepted the literal string would reject correct answers and train everyone to
 * ignore it — a noisy guard is as bad as a vacuous one. So the index carries the canonical forms of a
 * value; anything OUTSIDE that set is what gets flagged.
 */
function registerNumber(set, v) {
  if (v === null || v === undefined) return;
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) set.add(v);
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== "") registerNumber(set, n);
    return;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return;

  const add = (x) => { if (Number.isFinite(x)) set.add(trim(x)); };
  add(v);
  add(Math.abs(v));
  add(Math.round(v));
  add(Math.round(v * 10) / 10);
  add(Math.round(v * 100) / 100);
  // A probability may be read back as a percentage, and vice versa.
  if (v > 0 && v < 1) {
    add(v * 100);
    add(Math.round(v * 1000) / 10);
    add(Math.round(v * 100));
  }
  if (v > 1 && v <= 100) add(v / 100);
}

/** Reader-facing wording for a tool that could not answer. Never a tool name, never an error code. */
function unsupportedSentence(env) {
  const what = {
    getLiveSlate: `GameTimePicks does not currently hold live game state for ${env.arguments?.sport ?? "that sport"}`,
    runGameFinder: `GameTimePicks does not currently hold recorded team game results for ${env.arguments?.sport ?? "that sport"}`,
    getSeasonExplorer: `GameTimePicks does not currently hold recorded season totals for ${env.arguments?.sport ?? "that sport"}`,
    runPlayerResearchQuery: "GameTimePicks does not currently hold that recorded player data",
    getPlayerRecentGames: "GameTimePicks does not currently hold recent recorded games for that player",
    getPlayerComparison: "GameTimePicks cannot compare those two players",
    getTeamComparison: "GameTimePicks cannot compare those two teams",
    getMatchupContext: "GameTimePicks does not have a matchup research page for that game",
    getPublishedForecasts: "GameTimePicks has no currently published forecast matching that",
    getParlayCandidates: "GameTimePicks has no published parlay candidate matching that",
    searchGameTimeHelp: "the GameTime guide has nothing on that",
    resolveEntity: "GameTimePicks does not have a page for that name",
  }[env.tool] ?? "GameTimePicks does not currently hold data that answers that";
  return env.detail ? `${what} — ${env.detail}` : what;
}

const trim = (x) => String(Number(x.toFixed(4)).valueOf());
const day = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : iso);
const pct = (p) => (p == null ? "not published" : `${Math.round(p * 1000) / 10}%`);
const short = (k) => String(k).slice(String(k).indexOf(".") + 1);
const outcome = (r) => (r === "W" ? "win" : r === "L" ? "loss" : r === "T" ? "tie" : "result not recorded");
