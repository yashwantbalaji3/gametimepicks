/**
 * APPROVED CAPTION FORMAT, from the founder's 2026-10-30 templates: short lines, blank line between blocks, a closing
 * hashtag, no disclaimer. PURE: no I/O, no clock. The word "today" replaces "tonight" before 5 PM Eastern. The image keeps
 * its footer; every digit here must be a claim, which buildSocialPackage still enforces.
 */
import { CC_MAX_CAPTION, etLabel, instant, xWeighted } from "./social-package.mjs";

const ET = "America/New_York";
export const DAY_SLATE_CUTOFF_HOUR = 17;
const hourEt = (ms) => Number(new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hourCycle: "h23" }).format(new Date(ms)));
/** "today" when the first start is before 5 PM Eastern, otherwise "tonight". */
export const slateWord = (ms) => (hourEt(ms) < DAY_SLATE_CUTOFF_HOUR ? "today" : "tonight");
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen"];
const blocks = (...b) => b.join("\n\n");
const stat1 = (v) => Number(v).toFixed(1);
const longDate = (d) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Sunday NFL windows by kickoff, Eastern. */
export function nflWindow(ms) {
  const day = etLabel(ms).slice(0, 3);
  if (day !== "Sun") return day === "Mon" ? "mnf" : "other";
  const h = hourEt(ms);
  return h < 16 ? "early" : h < 19 ? "late" : "prime";
}

const nbaTop5 = (kind, word, games, model) => {
  const D = cap(word);
  if (kind === "pts") return blocks(`🏀 ${D}'s Top 5 projected NBA scorers! 🔥`, `Five players. ${WORDS[games] ?? games} games. Who's putting up the biggest scoring performance ${word}?`, `Check out our projections${model ? "" : " and the OVER/UNDER comparisons"} below 👇`, "#NBA");
  if (kind === "reb") return blocks(`🏀 Who's dominating the glass ${word}? 💪`, `Our Top 5 projected rebound leaders across ${word}'s NBA slate!`, "Who finishes with the most boards? 👇", "#NBA");
  return blocks(`🏀 Who's dropping dimes ${word}? 🎯`, `Our Top 5 projected assist leaders across ${word}'s NBA matchups!`, `Who's leading the league's playmakers ${word}? 👇`, "#NBA");
};
const verdict = (g) => (g.winnerNickname ? `🎯 Our model projects the ${g.winnerNickname} to win.` : "🎯 Our model has this one too close to call.");
const recap = (p) => {
  const c = p.content;
  const nfl = p.sport === "nfl";
  const when = nfl ? c.period.label : longDate(p.date);
  const claims = [{ key: "caption.correct", display: String(c.correct), evidenceRef: "recap" }, { key: "caption.missed", display: String(c.missed), evidenceRef: "recap" }, { key: "caption.when", display: when, evidenceRef: "recap" }];
  return { claims, caption: blocks(`${nfl ? "🏈 NFL" : "🏀 NBA"} Results, ${when} 📊`, `✅ ${plural(c.correct, "predicted winner")} correct\n❌ ${plural(c.missed, "prediction")} missed`, "We track every prediction, every win and every miss.", "On to the next slate! 🔥", nfl ? "#NFL" : "#NBA") };
};

/** Founder template, 2026-11-01: matchup, winner with chance, ranked TD list, snapshot line, close. */
function nflGamePostCaption(p, claim) {
  const g = p.captionGame; const td = p.content.tdCandidates;
  return {
    caption: blocks(`🏈 ${g.awayName} vs ${g.homeName}!`, `🎯 Our model predicts ${g.winnerName} to win (${g.winnerPct}).`, [`🔥 Top ${td.length} Anytime TD candidates:`, ...td.map((x, i) => `${i + 1}. ${x.name}: ${x.pct}`)].join("\n"), "Early pregame snapshot", "Full predictions below 👇", "#NFL"),
    claims: [claim("winnerPct", g.winnerPct), claim("tdTop", td.map((_, i) => i + 1).join(" ")), ...td.map((x) => claim(`td.${x.playerId}`, x.pct))],
  };
}

/** Caption and the claims it adds, for one prepared post. Throws on a type with no template, so nothing ships unworded. */
export function approvedCaption(p) {
  const first = instant(p.firstStartUtc);
  const word = slateWord(first);
  const g = p.captionGame;
  const claim = (key, display) => ({ key: `caption.${key}`, display: String(display), evidenceRef: p.snapshotRefs[0].ref });
  switch (p.contentType) {
    case "RESULTS_RECAP": return recap(p);
    case "NBA_TONIGHT": {
      const n = p.extraClaims.find((c) => c.key === "games").display;
      return { claims: [], caption: blocks(`🏀 ${n} NBA games on ${word}'s slate!`, "Who's taking the W? 👀", "Our model has a predicted winner for every matchup, with the full slate and win probabilities below.", `Who are you backing ${word}? 👇`, "#NBA") };
    }
    case "NBA_DAILY_TOP5": return { claims: [], caption: nbaTop5(String(p.variant).replace(/-model$/, ""), word, p.slateGames, String(p.variant).endsWith("-model")) };
    case "NBA_TOP5_CAROUSEL": return { claims: [], caption: blocks(`🏀 ${cap(word)}'s Top 5 NBA projections! 🔥`, "Points, rebounds and assists across the slate.", "Swipe through all three boards 👇", "#NBA") };
    case "NBA_GAME_WINNER": return { claims: [], caption: blocks(`🏀 ${g.awayName} vs ${g.homeName} ${word}!`, verdict(g), "Full prediction below 👇", "#NBA") };
    case "NBA_PLAYER_STATS": case "NBA_BOXSCORE": return { claims: [], caption: blocks(`🏀 ${g.awayName} vs ${g.homeName} ${word}!`, "📊 Projected stat lines for both teams.", "Full predictions below 👇", "#NBA") };
    case "NBA_GAME_POST": return { claims: [], caption: blocks(`🏀 ${g.awayName} vs ${g.homeName} ${word}!`, verdict(g), ["Two players to watch:", ...p.captionPlayers.map((x) => `🔥 ${x.name}: ${stat1(x.medians.pts)} PTS | ${stat1(x.medians.reb)} REB | ${stat1(x.medians.ast)} AST`)].join("\n"), "Full predictions below 👇", "#NBA") };
    case "NFL_SUNDAY_WINNERS": {
      const n = p.extraClaims.find((c) => c.key === "games").display;
      return { claims: [], caption: blocks(`🏈 ${n} NFL games on the Week ${p.content.week} Sunday slate!`, "Who's taking the W? 👀", "Our model has a predicted winner for every matchup, with the full slate and win chances below.", "Who are you backing? 👇", "#NFL") };
    }
    case "NFL_MNF_WINNER": {
      const r = p.content.games[0];
      return { claims: [], caption: blocks(`🏈 Monday Night Football: ${r.matchup}!`, `🎯 Our model projects ${r.winner} to win.`, "Full prediction below 👇", "#NFL") };
    }
    case "NFL_WEEKLY_TOP5": return { claims: [], caption: blocks(`🏈 NFL Week ${p.content.week} Sunday Top 5: ${p.content.label.toLowerCase()}!`, p.content.estimateLabel ? "Our model's projections, model projections." : "Our model's projections for Sunday.", "Who tops the list? 👇", "#NFL") };
    case "NFL_GAME_POST": return nflGamePostCaption(p, claim);
    default: throw new Error(`no approved caption for ${p.contentType}`);
  }
}

/** Every line older than `maxHours` at the render as-of. `quotes`: { eventId, kind, quotedAt }. Null times count as unknown. */
export function quoteAgeFlags(quotes, asOfMs, maxHours) {
  const out = new Map();
  for (const q of quotes) {
    const t = Date.parse(q.quotedAt);
    const e = out.get(q.eventId) ?? { eventId: q.eventId, quotes: 0, unknownTimes: 0, oldestQuotedAt: null, oldestAgeHours: null, staleQuotes: 0, stale: false };
    e.quotes += 1;
    if (!Number.isFinite(t)) e.unknownTimes += 1;
    else {
      const h = Math.round(((asOfMs - t) / 3600000) * 100) / 100;
      if (e.oldestAgeHours == null || h > e.oldestAgeHours) { e.oldestAgeHours = h; e.oldestQuotedAt = q.quotedAt; }
      if (h > maxHours) { e.staleQuotes += 1; e.stale = true; }
    }
    out.set(q.eventId, e);
  }
  return [...out.values()];
}
