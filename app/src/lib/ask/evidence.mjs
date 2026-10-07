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
import { publicRiskLabel } from "../parlays/risk-odds-bands.mjs";
import { legState } from "../results/v2/lane-words.mjs";

/**
 * Build the bundle from the executor's envelopes.
 *
 * @param {Array<object>} envelopes
 * @returns {{ items: Array<object>, facts: Array<{id:string,text:string}>, numbers: Set<string>, identifiers: Set<string>, links: Array<object>, unsupported: Array<object> }}
 */
/**
 * "covering 2026-06-09 to 2026-09-22", or nothing at all.
 *
 * ⚠ The first version interpolated the window unconditionally and produced "covering null to null" for
 * a cell that carries no window — a missing value dressed up as a stated one, in the one family whose
 * whole point is that missing is never zero.
 */
const windowClause = (cell) =>
  cell?.window?.from && cell?.window?.to ? `, covering ${cell.window.from} to ${cell.window.to}` : "";

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
        /* Session 3 · the owner's own stat LABEL ("hits + runs + RBIs"), never the raw key ("hitsRunsRbis"), which a writer
           copied into a reader's answer verbatim. The envelope already carried the labels; this sentence ignored them. */
        const statName = (k) => readableStat(d.families?.find((f) => f?.key === k)?.label) ?? short(k);
        say(`${d.player.label}'s last ${d.returned} recorded games (the player research page's own Last-${d.requested})`, [d.returned, d.requested]);
        for (const [key, w] of Object.entries(d.windows ?? {})) {
          say(`over those ${w.size} games ${d.player.label} recorded ${w.recordedGames} ${statName(key)} entries totalling ${w.sum}, an average of ${w.average}`, [w.size, w.recordedGames, w.sum, w.average]);
        }
        for (const r of (d.rows ?? []).slice(0, 6)) {
          const vals = Object.entries(r.values).map(([k, v]) => `${v == null ? "not recorded" : v} ${statName(k)}`).join(", ");
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
          /*
           * ⚠ THE OWNER'S FIELDS ARE `w` / `l` / `t` (teamSeasonSummary), not `wins` / `losses` (Session 2, Production).
           * This read the wrong names, so every Ask team comparison said "recorded ? wins and ? losses" — a missing
           * value printed as a symbol. An absent figure is now left out of the sentence, never spelled "?".
           */
          const w = s?.w ?? s?.wins ?? null;
          const l = s?.l ?? s?.losses ?? null;
          const t = s?.t ?? s?.ties ?? 0;
          const finals = s?.finals ?? s?.games ?? null;
          if (s && w != null && l != null) say(`in ${d.season.id}, ${label} recorded ${w} wins and ${l} losses${t ? ` and ${t} ties` : ""}${finals != null ? ` from ${finals} recorded finals` : ""}`, [w, l, t, finals]);
          else if (s && finals != null) say(`in ${d.season.id}, ${label} has ${finals} recorded finals; GameTimePicks holds no win–loss split for them`, [finals]);
        }
        say(`this comparison is recorded fact only — GameTime Compare names no winner and carries no forecast`);
        break;
      }

      case "getPlayerComparison":
        if (!d.a || !d.b) break;
        say(`${d.a.label} and ${d.b.label} share these recorded stat families: ${(d.sharedFamilies ?? []).map(short).join(", ") || "none listed"}`);
        // E-4: the recorded numbers, per side, for the family the comparison selected — never a "better player".
        const seasonYear = String(d.selectedSeason ?? "").match(/\d{4}/)?.[0] ?? null; // "NFL-2025" → 2025, stated plainly
        for (const side of [d.a, d.b]) {
          const se = side.season;
          if (d.stat && se && se.n) say(`${side.label} · ${d.stat.label}${seasonYear ? ` in the ${seasonYear} season` : ""}: ${se.n} recorded games, average ${se.mean}${se.total != null ? `, total ${se.total}` : ""}, range ${se.min} to ${se.max}`, [se.n, se.mean, se.total, se.min, se.max, seasonYear ? Number(seasonYear) : null]);
          const w5 = (side.windows ?? []).find((w) => w.size === 5 && w.n);
          if (d.stat && w5) say(`${side.label} · ${d.stat.label} over the last ${w5.n} recorded games: average ${w5.mean}${w5.complete ? "" : " (fewer than 5 games recorded)"}`, [w5.n, w5.mean]);
        }
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
          // E-1: the game's own date travels with it, so "tonight" can never be answered with next month's game.
          say(`for ${f.matchup} (${f.sport}) on ${f.date ?? "an unstated date"}, GameTime has ${tag}${f.updatedAt ? `, updated ${f.updatedAt}` : ""}`);
          /*
           * E-1: THE GAME FORECAST ITSELF. NFL and EPL forecasts were projected without their probabilities (or
           * with them, never turned into evidence), so a writer could say "the model favors X" with nothing to
           * check it against. The owner's numbers go in, labelled experimental, and nothing else.
           */
          const pr = f.probabilities;
          if (pr && pr.draw != null) {
            say(`${f.matchup} · EXPERIMENTAL model probabilities: ${f.home ?? "home"} win ${pct(pr.home)}, draw ${pct(pr.draw)}, ${f.away ?? "away"} win ${pct(pr.away)}`, [pr.home, pr.draw, pr.away]);
            if (f.expectedGoals != null) say(`${f.matchup} · EXPERIMENTAL expected goals: ${f.expectedGoals}${f.over25 != null ? `; chance of over 2.5 goals ${pct(f.over25)}` : ""}`, [f.expectedGoals, f.over25]);
          } else if (pr && pr.home != null && pr.away != null) {
            say(`${f.matchup} · EXPERIMENTAL model win probability: ${f.away ?? "away"} ${pct(pr.away)}, ${f.home ?? "home"} ${pct(pr.home)}${pr.tie != null ? `, tie ${pct(pr.tie)}` : ""}`, [pr.away, pr.home, pr.tie]);
          }
          if (f.projectedScore?.home != null && f.projectedScore?.away != null) {
            /*
             * ⚠ A MEDIAN, NOT A FINAL (2026-10-05 audit). Each side's number is the middle of that team's simulated points,
             * so the pair can tie ("ATL 22, NO 22") beside a 51% win chance for one side. Called a "projected score", a
             * writer restates it as a predicted 22–22 final. The sentence now says what it is, in the NFL game page's own
             * words ("the middle of our simulated outcomes, not a call on the exact final").
             */
            say(`${f.matchup} · EXPERIMENTAL median simulated points — the middle of our simulated outcomes for each team, not a predicted final score: ${f.away ?? "away"} ${f.projectedScore.away}, ${f.home ?? "home"} ${f.projectedScore.home}`, [f.projectedScore.away, f.projectedScore.home]);
          }
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
            /* Session 4: the same touchdown probability the game page lists under "Likely TD scorers". */
            if (typeof pl.anytimeTd === "number") say(`${f.matchup} · ${pl.name} (${pl.team}) anytime touchdown: GameTime's model probability ${pct(pl.anytimeTd)}, conditioned on playing — a player who does not play settles void`, [pl.anytimeTd]);
            for (const m of pl.markets ?? []) say(`${f.matchup} · ${pl.name} ${m.label}: GameTime's simulated median is ${m.median}, with a 10th–90th percentile range of ${m.p10} to ${m.p90}`, [m.median, m.p10, m.p90]);
          }
        }
        break;
      }

      case "getParlayCandidates": {
        say(`GameTime published ${d.totalMatched} parlay candidates for ${d.date}${d.riskProfile ? ` in the ${publicRiskLabel(d.riskProfile) ?? d.riskProfile} band` : ""}; ${d.returned} are described here`, [d.totalMatched, d.returned, d.date]);
        if (d.withheldMarketContext) say(`${d.withheldMarketContext} further candidates for ${d.date} were withheld because they use market-context families, which are not published GameTime projections`, [d.withheldMarketContext, d.date]);
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

      /* Session 5 — the OFFICIAL published cards, verbatim. No-card states are published answers, never pending. */
      case "getOfficialProductCards": {
        const p = d.products ?? {};
        const sp = p.suggestedParlays;
        if (sp?.published) {
          say(`GameTimePicks' official Suggested Parlays for ${sp.date} (published ${sp.generatedAt}): ${sp.cards.length} card(s) published${sp.noCardTiers.length ? `, and no card in ${sp.noCardTiers.map((t) => t.tierLabel).join(", ")}` : ""}`, [sp.cards.length, sp.date]);
          for (const c of sp.cards) {
            say(`${sp.date} official ${c.tierLabel} card, ${c.legs.length} legs, combined ${c.combinedAmerican > 0 ? "+" : ""}${c.combinedAmerican} American at the prices it was published with`, [c.legs.length, c.combinedAmerican]);
            for (const l of c.legs) say(`${sp.date} ${c.tierLabel} card leg: ${l.player}${l.team ? ` (${l.team}${l.opponent ? ` vs ${l.opponent}` : ""})` : ""} ${l.marketLabel} ${l.side ?? ""} ${l.line ?? ""}, priced ${l.odds}${l.result ? `, result ${l.result}` : ""}`, [l.line, l.odds]);
          }
          for (const t of sp.noCardTiers) say(`${sp.date} ${t.tierLabel}: no card was published — the ladder's own reason: ${t.reason ?? "not stated"}`);
          say(`these are the cards as published; GameTime does not model correlation between their legs and publishes no joint win probability for them`);
        } else if (sp) say(`${sp.detail}${sp.latestPublishedDate ? `; the most recent official Suggested Parlays ladder is for ${sp.latestPublishedDate}` : ""}`);
        /* Session 7 — the published-card record (D1), per risk level. Counts cards, never legs; pending is not a loss. */
        if (sp?.record) {
          const rec = sp.record;
          const wlp = (x) => `${x.wins}–${x.losses}${x.pushes ? `–${x.pushes}` : ""}`;
          if (rec.overall) say(`Suggested Parlays record — the cards GameTimePicks PUBLISHED (${rec.sport.toUpperCase()} ladder, one card per risk level a day, since ${rec.since ?? "the current policy"}): ${wlp(rec.overall)} (wins–losses${rec.overall.pushes ? "–pushes" : ""}) over ${rec.settledDays} settled days`, [rec.overall.wins, rec.overall.losses, rec.overall.pushes, rec.settledDays]);
          for (const [, t] of Object.entries(rec.byTier ?? {})) say(`${t.tierLabel} published cards since ${rec.since ?? "the current policy"}: ${wlp(t)} (wins–losses${t.pushes ? "–pushes" : ""}); this counts only published cards, never the optimizer's candidate slips`, [t.wins, t.losses, t.pushes]);
          if (Object.keys(rec.byTier ?? {}).length === 0 && !rec.overall) say(`no settled published card exists yet at that risk level since ${rec.since ?? "the current policy"} — there is no record to state`);
        }
        for (const [key, label] of [["bankBuilder", "Bank Builder"], ["moonshot", "Moonshot"]]) {
          const b = p[key];
          if (!b) continue;
          if (!b.published) { say(`${b.detail}${b.latestPublishedDate ? `; the most recent official portfolio is for ${b.latestPublishedDate}` : ""}`); continue; }
          for (const l of b.lanes) {
            if (l.state === "NO CARD PLACED") { say(`${b.date} ${label} lane ${l.lane} (step ${l.step}): NO CARD PLACED — the product's own reason: ${l.reason ?? "not stated"}`, [l.step]); continue; }
            say(`${b.date} ${label} lane ${l.lane} (step ${l.step}): ${l.state}${l.combinedOdds != null ? `, combined ${l.combinedOdds > 0 ? "+" : ""}${l.combinedOdds} American` : ""}${l.legs.length ? `, ${l.legs.length} legs` : ""}`, [l.step, l.combinedOdds, l.legs.length]);
            /* Session 5 · B6: why the card is what it is — the product's own published words, never a re-derivation. */
            for (const w of l.why ?? []) say(`${b.date} ${label} lane ${l.lane} — the product's own reason for this card: ${w}`);
            if (l.correlationNote) say(`${b.date} ${label} lane ${l.lane} — ${l.correlationNote}`);
            for (const g of l.legs) say(`${b.date} ${label} lane ${l.lane} leg: ${g.selection} (${g.market}, ${g.matchup})${g.odds != null ? `, priced ${g.odds}${g.book ? ` at ${g.book}` : ""}` : ""}${g.probabilityBasis === "market-implied" ? ", its probability is the market's implied price, not a GameTime model" : ""}${g.result ? `, result ${g.result}${g.official ? ` (final ${g.official})` : ""}` : ""}`, [g.odds]);
          }
        }
        break;
      }

      case "getLiveSlate": {
        say(`GameTime Live reports ${d.liveCount} of ${d.total} ${d.sport} games in progress, as of ${d.fetchedAt}`, [d.liveCount, d.total]);
        if (d.preCount != null) say(`of those ${d.total} ${d.sport} games, ${d.liveCount} are in progress, ${d.preCount} have not started and ${d.finalCount ?? 0} are final`, [d.total, d.liveCount, d.preCount, d.finalCount ?? 0]);
        for (const e of (d.events ?? []).slice(0, 8)) {
          /* Session 2: a missing team is never printed as "null" — the game is described without the name it lacks. */
          if (!e.away || !e.home) { say(`one ${d.sport} game's teams are not reported by the live feed — state ${e.state}`); continue; }
          say(e.state === "PRE"
            ? `${e.away} at ${e.home} has not started; no score exists yet`
            : e.awayScore == null || e.homeScore == null
              ? `${e.away} at ${e.home} — state ${e.state}${e.stateDetail ? ` (${e.stateDetail})` : ""}; the live feed reports no score`
              : `${e.away} ${e.awayScore}, ${e.home} ${e.homeScore}${e.period ? `, ${e.period}` : ""} — state ${e.state}${e.stateDetail ? ` (${e.stateDetail})` : ""}`,
            [e.awayScore, e.homeScore]);
        }
        say(`a final score here is the provider's; GameTime's own grading of a game can land later`);
        break;
      }

      /*
       * RESULTS. The sentences below are the whole safety mechanism for this family: the writer is
       * told to repeat them, and the verifier checks the finished answer's numbers against them. So
       * each one states the ERA and the SCOPE it belongs to, and a legacy row is written as legacy in
       * its own sentence. A writer handed "37–36" and "5–0" with no era words would add them; handed
       * "37–36 across the current record" and "5–0, settled under an earlier policy and not part of
       * the current record", it has to contradict its own evidence to do it.
       */
      case "getProductRecord": {
        const c = d.current ?? {};
        say(c.label
          ? `${d.productLabel}'s current settled record is ${c.label} from ${c.n} cards${windowClause(c)}${c.asOf ? `, as of ${c.asOf}` : ""}`
          : `${d.productLabel} has a current record entry with no settled cards yet`,
          [c.counts?.won, c.counts?.lost, c.n]);
        if (c.note) say(`the owner describes that figure as: ${c.note}`);
        if (c.counts?.pending) say(`${c.counts.pending} ${d.productLabel} card(s) are still pending settlement and are counted separately, never as losses`, [c.counts.pending]);
        for (const comp of (d.components ?? []).slice(0, 4)) {
          say(`within that record, the ${comp.era} era${comp.segment ? ` (${comp.segment})` : ""} is ${comp.label} from ${comp.n} cards`, [comp.counts?.won, comp.counts?.lost, comp.n]);
        }
        for (const l of (d.legacy ?? []).slice(0, 4)) {
          say(`separately, ${d.productLabel} has legacy history from the ${l.era} era${l.segment ? ` (${l.segment})` : ""} of ${l.label} — settled under an earlier policy and NOT part of the current record`, [l.counts?.won, l.counts?.lost]);
        }
        if (d.eraRule) say(d.eraRule);
        break;
      }

      case "getForecastRecord": {
        const c = d.current ?? {};
        say(c.label
          ? `GameTime's graded ${String(d.sport).toUpperCase()} forecast record is ${c.label} from ${c.decisive ?? c.n} decided forecasts${windowClause(c)}`
          : `GameTime records ${String(d.sport).toUpperCase()} forecasts but publishes no decided record for them yet`,
          [c.counts?.won, c.counts?.lost, c.decisive, c.n]);
        if (c.ownerState) say(`the owner reports the state of that ${String(d.sport).toUpperCase()} record as ${c.ownerState}`);
        if (c.counts?.pending) say(`${c.counts.pending} ${String(d.sport).toUpperCase()} forecast(s) are pending settlement, counted separately from wins and losses`, [c.counts.pending]);
        say(`this grades published forecasts, and is a different thing from a product's card record`);
        break;
      }

      /* Session 13 · the Forecast Record. Each family speaks in its own yardstick; no sentence pools families, and a pick
         record is only ever the owner's published-pick record (basis named). */
      case "getForecastFamilyPerformance": {
        const sp = String(d.sport ?? "").toUpperCase();
        /* A share as a percent, or the words "not recorded" — a missing value never becomes 0%. */
        const pctW = (v) => (typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 1000) / 10}%` : "not recorded");
        const cnt = (v) => (Number.isInteger(v) ? v : "an unrecorded number of");
        for (const f of d.families ?? []) {
          const c = f.counts ?? {};
          const vm = Number.isInteger(c.void) && Number.isInteger(c.unmeasured) ? c.void + c.unmeasured : null;
          const tail = `${cnt(c.measured)} measured, ${cnt(c.pending)} not final yet, ${cnt(vm)} void or not measurable (none of those counts as a miss)`;
          if (f.kind === "CONTINUOUS_PROJECTION") {
            say(`GameTime's ${sp} ${f.label} projections missed by ${f.mae} on average (median miss ${f.medianAbsError}, bias ${f.bias} where positive means we projected high) across ${f.n} measured forecasts${f.coverage ? `; ${pctW(f.coverage.inside)} landed inside our printed ${pctW(f.coverage.target)} range, and about ${pctW(f.coverage.target)} is the design target` : ""} — ${tail}`,
              [f.mae, f.medianAbsError, f.bias, f.n, f.coverage?.inside]);
          } else if (f.kind === "BINARY_PROBABILITY") {
            say(`GameTime's ${sp} ${f.label} probabilities score a Brier of ${f.brier} and a log loss of ${f.logLoss} (lower is better) across ${f.n} measured forecasts; on average we said ${pctW(f.meanForecast)} and it happened ${pctW(f.observedRate)} of the time (calibration error ${f.ece}) — ${tail}`,
              [f.brier, f.logLoss, f.n, f.meanForecast, f.observedRate, f.ece]);
          } else if (f.kind === "MULTICLASS_PROBABILITY") {
            say(`GameTime's ${sp} ${f.label} forecasts score a log loss of ${f.logLoss} and a Brier of ${f.brier} across ${f.n} measured matches (a blind guess scores ${f.uniformReference?.logLoss} log loss); ${f.topClassLabel ? `our ${f.topClassLabel} is ${pctW(f.topClassAccuracy)}` : `our likeliest outcome happened ${pctW(f.topClassAccuracy)} of the time`} — ${tail}`,
              [f.logLoss, f.brier, f.n, f.uniformReference?.logLoss, f.topClassAccuracy]);
          }
          /*
           * ⚠ THE RECORD SAYS WHAT IT GRADES (2026-10-05 audit). This read "where a … pick was published" for every family,
           * but NFL prop records grade the side of the frozen sportsbook line the projection pointed to, and the NFL
           * winner record grades the side given the better win chance — neither is a published pick. The basis words are
           * the Results family page's own (BASIS_WORDS).
           */
          if (f.pickRecord) say(`graded on ${basisWords(f.pickRecord.basis)}, the ${sp} ${f.label} record is ${f.pickRecord.win}–${f.pickRecord.loss}${f.pickRecord.push ? `–${f.pickRecord.push}` : ""}`, [f.pickRecord.win, f.pickRecord.loss, f.pickRecord.push]);
          // Stage 3E: a family graded on two bases states each record on its own; the two are never added together.
          else if (Array.isArray(f.pickRecords)) for (const r of f.pickRecords) say(`graded on ${basisWords(r.basis)}, the ${sp} ${f.label} record is ${r.win}–${r.loss}${r.push ? `–${r.push}` : ""}, counted separately from the other basis`, [r.win, r.loss, r.push]);
        }
        say(`there is no single accuracy figure across forecast types: a yardage projection and a win probability are measured differently and are never pooled`);
        for (const g of (d.gaps ?? []).slice(0, 3)) say(`${g.sport} ${g.family} is published but not measured yet: ${g.reason}`);
        if (d.asOf) say(`the Forecast Record was last settled ${String(d.asOf).slice(0, 10)}`);
        break;
      }

      case "getForecastHistory": {
        const sp = String(d.sport ?? "").toUpperCase();
        /*
         * ⚠ AN EMPTY FILTER IS NOT "PUBLISHED 0" (2026-10-05 audit). The tool now fails closed when the subject has no
         * rows at all; an empty list here means the subject has rows and none matched the filters, and it says so.
         */
        const who = d.subject ?? "that player";
        if (!d.matched) say(`none of the ${d.subjectTotal} ${sp} forecasts on record for ${who} match this request's filters`, [d.subjectTotal]);
        else say(`GameTime published ${d.matched} ${sp} forecasts matching this request for ${who}; ${d.returned} are listed individually below, newest first — this list is not a record`, [d.matched, d.returned]);
        if (d.scopeNote) say(d.scopeNote);
        /* One decimal for a projection, its range, the actual and the miss — the precision the Forecast Record prints. */
        const r1 = (v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(1)) : v);
        for (const raw of d.rows ?? []) {
          const r = { ...raw, projection: r1(raw.projection), rangeLow: r1(raw.rangeLow), rangeHigh: r1(raw.rangeHigh), finalValue: r1(raw.finalValue), absoluteError: r1(raw.absoluteError) };
          const said = r.kind === "CONTINUOUS_PROJECTION"
            /*
             * ⚠ "X to Y", NEVER "X–Y" (2026-10-05 audit, reproduced offline). A dashed range ("50.8–196.1") contains "8–196",
             * which the verifier's record check reads as a W–L; a writer naming the opponent in the same clause ("at
             * Washington — projected 107.5 (range 50.8–196.1)") was refused as a record given to the wrong owner, the
             * record-rule retry could not help, and every such history answer shipped as the deterministic fallback.
             * Player projections already say "a range of X to Y"; history now matches them. The verifier is unchanged.
             */
            ? `GameTime projected ${r.projection}${r.rangeLow != null ? ` (range ${r.rangeLow} to ${r.rangeHigh})` : ""}`
            : r.kind === "BINARY_PROBABILITY"
              ? (typeof r.probability === "number" ? `GameTime gave it a ${Math.round(r.probability * 1000) / 10}% chance` : "GameTime's probability for it is not recorded")
              : "GameTime published match probabilities";
          const happened = r.state === "WITHDRAWN" ? "the forecast was withdrawn before kickoff, which is not a miss"
            : r.state === "PENDING" ? "it is not final yet, which is not a miss"
              : r.state === "VOID" ? "it was void (did not play, push or tie), which is not a miss"
                : r.state === "NO_MEASUREMENT" ? "the official result has no line for it, so it is not measured"
                  : r.kind === "CONTINUOUS_PROJECTION" ? `the actual was ${r.finalValue}, a miss of ${r.absoluteError}`
                    : r.observed === 1 ? `it happened (Brier ${r.brier})` : r.observed === 0 ? `it did not happen (Brier ${r.brier})` : `it settled as ${r.finalCategory}`;
          say(`${r.date} — ${r.matchup ?? ""} ${r.familyLabel ?? r.family}: ${said}; ${happened}${r.pick ? `; graded on ${basisWords(r.pickBasis)}, that side was a ${r.pick}` : ""}`,
            [r.projection, r.rangeLow, r.rangeHigh, r.probability, r.finalValue, r.absoluteError, r.brier]);
        }
        break;
      }

      case "getRecentResults": {
        // E-3: counts of rows only — never a W–L the owner did not publish (that is getForecastRecord's job).
        say(`GameTime has ${d.totalRecorded} graded ${String(d.sport).toUpperCase()} forecasts on record; ${d.matched} match this request and ${d.returned ?? (d.rows ?? []).length} are listed individually below — this list is not a record`,
          [d.totalRecorded, d.matched, d.returned ?? (d.rows ?? []).length]);
        for (const r of (d.rows ?? []).slice(0, 8)) {
          say(r.hit === null
            ? `${r.when} — ${r.subject} (${r.market}): GameTime predicted ${r.predicted}; this one is not yet graded`
            : `${r.when} — ${r.subject} (${r.market}): GameTime predicted ${r.predicted}, the actual result was ${r.actual}, ${r.hit ? "a correct forecast" : "an incorrect forecast"}`);
        }
        break;
      }

      case "getResultsDay": {
        /*
         * Session 2 · ONE DAY, ITEM BY ITEM, IN THE OWNER'S WORDS. No sentence here totals anything: a lane is one
         * result, a call is one grade. The pick is phrased "GameTime's pick is X" so the verifier's pick rule can match
         * a restatement of THIS day's graded call — and nothing else — and a pending item says it is not a loss.
         */
        const PRODUCT = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };
        const LANE_WORD = {
          won: "won", lost: "lost", void: "void", push: "a push", pending: "pending — not settled yet, which is never a loss", active: "open — a leg is still pending",
          /* Session 3 · lane-words.mjs: a no-card lane and a pending leg of a decided lane, in the ledger's own terms. */
          awaiting: "not played — no card was placed; it was awaiting its next qualified card, so nothing settled",
          "not-graded": "not graded — the lane was already decided",
        };
        const OUTCOME = { WIN: "graded WIN", LOSS: "graded LOSS", PUSH: "graded PUSH", VOID: "graded VOID" };
        say(`results for ${d.date} (ET)${d.isYesterday ? ", which is yesterday" : ""}, as the Results day page records them — each item keeps its own grade, and GameTimePicks publishes no combined day record or percentage`, [d.date]);
        if (d.lanes?.length) {
          for (const l of d.lanes.slice(0, 6)) {
            const name = `${PRODUCT[l.product] ?? l.product}${l.lane ? ` lane ${l.lane}` : ""}`;
            say(`on ${d.date}, ${name} was ${LANE_WORD[l.result] ?? l.result}${l.legs?.length ? `, with ${l.legs.length} leg(s) on its receipt` : l.result === "awaiting" ? "" : ", with no legs on its receipt"}`, [d.date, l.legs?.length ?? 0]);
            for (const g of (l.legs ?? []).slice(0, 4)) {
              const gs = legState(g.result, l.result);
              say(`${name} leg · ${g.selection ?? "a selection"}${g.matchup ? ` (${g.matchup})` : ""}${g.official ? `, official ${g.official}` : ""}: ${LANE_WORD[gs] ?? gs}`);
            }
          }
        } else {
          say(`no Bank Builder or Moonshot card was recorded for ${d.date}`, [d.date]);
        }
        for (const [sport, evs] of Object.entries(d.events ?? {})) {
          for (const e of (evs ?? []).slice(0, 8)) {
            const calls = (e.calls ?? []).map((c) => `· ${c.market}: GameTime's pick is ${String(c.pick).replace(/\s+\((?:home|away)\)$/, "")}, ${OUTCOME[c.outcome] ?? "not yet graded — pending, not a loss"}`).join(" ");
            say(`on ${d.date}, ${sport.toUpperCase()} ${e.title}${e.final ? ` finished ${e.final}` : " has no final recorded"} ${calls}`.trim(), [d.date]);
          }
          const props = (evs ?? []).reduce((n, e) => n + (e.propsNotShown ?? 0), 0);
          if (props) say(`${props} ${sport.toUpperCase()} player-prop lean(s) were also graded that day; they are market-context families and are listed on the Results day page, not here`, [props]);
        }
        if (d.sportsWithout?.length) say(`nothing was graded for ${d.sportsWithout.map((x) => x.toUpperCase()).join(", ")} on ${d.date}`, [d.date]);
        break;
      }

      case "getPendingResults": {
        say(d.totalPending
          ? `GameTime has ${d.totalPending} recorded item(s) awaiting settlement; pending is counted on its own and is never treated as a loss`
          : `GameTime has nothing recorded that is awaiting settlement right now`,
          [d.totalPending]);
        for (const c of (d.pendingCells ?? []).filter((x) => x.pending).slice(0, 6)) {
          say(`${c.product ?? c.sport ?? "one record"} has ${c.pending} item(s) pending in its ${c.era} era${c.segment ? ` (${c.segment})` : ""}`, [c.pending]);
        }
        for (const g of (d.disclosedGaps ?? []).slice(0, 4)) {
          say(`the owner also discloses a gap in the ${g.product ?? g.sport ?? "record"} record for the ${g.era} era${g.note ? `: ${g.note}` : ""} — a period it cannot account for, which is not the same as nothing to report`);
        }
        break;
      }

      case "getCoverage": {
        /*
         * §10 · FIVE LEVELS, SAID SEPARATELY. The whole point of the coverage registry is that
         * "we built it", "we measured it", "the measurement passed", "a reader may treat it as a
         * forecast" and "we can grade it" are different facts. Collapsing them into one sentence —
         * "we cover MLB player props" — is exactly the claim the page used to make.
         */
        if (d.covered === false) { say(d.note ?? `GameTimePicks publishes no coverage entry for that ${d.sport} market`); break; }
        for (const m of (d.markets ?? []).slice(0, 8)) {
          const eligible = m.publicEligible
            ? "may be read as a GameTimePicks forecast"
            : "is NOT eligible to be read as a GameTimePicks forecast";
          say(`${String(d.sport).toUpperCase()} · ${m.label}: status ${m.status}, ${eligible}`);
          /* The verdict, and the families it actually governs — never a summary of them. */
          if (m.currentValidationState === "DEMOTED_TO_MARKET_CONTEXT") {
            say(`${m.label} has been measured against outcomes and DEMOTED to market context${m.demotedFamilies?.length ? ` (${m.demotedFamilies.join(", ")})` : ""} — the model does not out-predict the sportsbook price, so the market price is the better probability`);
          } else if (m.currentValidationState === "PARTIALLY_DEMOTED") {
            say(`part of ${m.label} has been demoted to market context: ${m.demotedFamilies.join(", ")}`);
          } else if (m.currentValidationState === "UNMEASURED") {
            say(`${m.label} has no calibration verdict — it has not been measured against outcomes, which is not the same as having passed`);
          }
          if (!m.settlementSupported) say(`${m.label} cannot be graded: settlement is ${m.settlementSupport}`);
          /* The registry's own words, verbatim — a limitation paraphrased is a limitation softened. */
          if (m.limitation) say(`the published limitation for ${m.label} reads: ${m.limitation}`);
        }
        break;
      }

      case "getNflProductEligibility": {
        /*
         * Session 9 · G — every reason is the record's own blocker, said with its evidence and with what
         * would clear it. Never "coming soon", never a pick: a market is either eligible or it lists what
         * it does not meet.
         */
        const slate = d.slate?.from ? `the NFL slate ${d.slate.from}${d.slate.to && d.slate.to !== d.slate.from ? ` to ${d.slate.to}` : ""} (${d.slate.events} games)` : "the next NFL slate";
        if (d.sport?.says) say(`${d.sport.says}`);
        /* A held price is not a fresh one: say WHEN, and the age products accept — never "current". */
        if (d.prices?.capturedAt) say(`the latest NFL pregame prop prices were captured at ${d.prices.capturedAt}${d.prices.maxAgeHoursForProducts != null ? `; official products only use a price captured within ${d.prices.maxAgeHoursForProducts} hours of activation` : ""}`);
        else if (d.prices) say("GameTimePicks holds no NFL pregame prop-price capture for this slate");
        for (const p of d.products ?? []) say(`${p.label}: NFL ${p.nflEligible ? "is" : "is not"} eligible on ${slate} — ${p.reason}`);
        for (const f of (d.families ?? []).slice(0, 5)) {
          const e = f.evidence ?? {};
          say(`NFL ${f.label}: ${f.eligibleForOfficialProducts ? "eligible for official products" : "not eligible for official products"}; GameTimePicks ${f.gtpProbability ? "publishes a model probability" : "publishes no model probability"} for it`);
          for (const b of f.blockers ?? []) say(`NFL ${f.label} — ${b.says}; this clears when ${b.clearsWhen}`);
          const ft = e.forwardTest;
          if (ft && ft.n != null && ft.needed != null) say(`NFL ${f.label} forward test: ${ft.n} of ${ft.needed} predictions graded so far${ft.calibrationLevel != null ? `, calibration level ${ft.calibrationLevel}` : ""}${ft.ece != null ? `, calibration error ${ft.ece}` : ""}`);
          if (e.slate) say(`NFL ${f.label} on ${slate}: ${e.slate.candidates} candidate legs, ${e.slate.withGtpProbability} with a model probability, ${e.slate.roleConfirmed} with a confirmed role, ${e.slate.priced} with a pregame price; settlement ${e.settlementProven ? "proven" : "not yet proven"}`);
        }
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
    getCoverage: `GameTimePicks publishes no coverage registry for ${env.arguments?.sport ?? "that sport"}`,
    getNflProductEligibility: "GameTimePicks has not published an NFL product-eligibility record for that",
    runGameFinder: `GameTimePicks does not currently hold recorded team game results for ${env.arguments?.sport ?? "that sport"}`,
    getSeasonExplorer: `GameTimePicks does not currently hold recorded season totals for ${env.arguments?.sport ?? "that sport"}`,
    runPlayerResearchQuery: "GameTimePicks does not currently hold that recorded player data",
    getPlayerRecentGames: "GameTimePicks does not currently hold recent recorded games for that player",
    getPlayerComparison: "GameTimePicks cannot compare those two players",
    getTeamComparison: "GameTimePicks cannot compare those two teams",
    getMatchupContext: "GameTimePicks does not have a matchup research page for that game",
    getForecastHistory: "Ask cannot list that forecast history",
    getPublishedForecasts: "GameTimePicks has no currently published forecast matching that",
    getParlayCandidates: "GameTimePicks has no published parlay candidate matching that",
    getOfficialProductCards: "GameTimePicks published no official card matching that",
    searchGameTimeHelp: "the GameTime guide has nothing on that",
    resolveEntity: "GameTimePicks does not have a page for that name",
  }[env.tool] ?? "GameTimePicks does not currently hold data that answers that";
  return env.detail ? `${what} — ${env.detail}` : what;
}

const trim = (x) => String(Number(x.toFixed(4)).valueOf());
/* What a directional record grades, in the Results family page's words (results/forecasts/[sport]/[family]/page.tsx BASIS_WORDS). */
const BASIS_WORDS = {
  HIGHER_WIN_PROBABILITY_SIDE: "the team we gave the better win chance",
  HISTORICAL_MODEL_FAVORED: "the team with the higher frozen win chance (historical model-favored winner accuracy, not a published pick)",
  IMPLIED_SIDE_OF_FROZEN_LINE: "the side of the sportsbook line our projection pointed to",
  PUBLISHED_PICK: "the pick we published",
};
const basisWords = (basis) => {
  const words = [].concat(basis ?? []).map((b) => BASIS_WORDS[b]).filter(Boolean);
  return words.length ? words.join(" and ") : "the side it graded";
};
const day = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : iso);
/* Exported so the answer display (display.mjs) prints a probability with the SAME rounding as the evidence sentence. */
export const askPercent = (p) => `${Math.round(p * 1000) / 10}%`;
const pct = (p) => (p == null ? "not published" : askPercent(p));
/* "Hits + runs + RBIs" → "hits + runs + RBIs" mid-sentence; an all-caps word ("RBIs", "TD") keeps its case. */
const readableStat = (label) => (typeof label === "string" && label.trim()
  ? (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label).trim()
  : null);
const short = (k) => String(k).slice(String(k).indexOf(".") + 1);
const outcome = (r) => (r === "W" ? "win" : r === "L" ? "loss" : r === "T" ? "tie" : "result not recorded");
