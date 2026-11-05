#!/usr/bin/env node
/* global document, window -- the page.evaluate callback runs in the Playwright browser page */
/**
 * SOCIAL PACK RENDERER: NFL winner roundup + Monday card, NFL weekly Top 5s, NBA daily Top 5s, results recaps, each as a
 * `gtp-social-package@1` JSON with its images under ~/gtp-private/graphics/packages/.
 *
 *   cd app && npx tsx scripts/social/render-social-pack.mjs --as-of <ISO instant> --nfl-week 8 --nfl-recap-week 7 \
 *       --nba-date 2026-10-30 --nba-recap-date 2026-10-29 [--out <dir>] [--scales 1,2] [--no-png]
 *       [--moneyline <saved capture under ~/gtp-private>] [--moneyline-only] [--approved-captions]
 *   NFL Sunday: --nfl-sunday-pack --nfl-week 8 --nfl-recap-week 7 --approved-captions
 *
 * Reads committed public data through the site's accessors only; no key, no network, no clock. Every printed cell is
 * validated before anything is written. A post that cannot be made honestly is REFUSED and listed in the run report;
 * the other posts still render. FOUNDER REVIEW ONLY: nothing is scheduled or posted.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { execSync } from "node:child_process";
import os from "node:os";

import { assertPrivateOutDir, DEFAULT_PRIVATE_ROOT, APP, loadNbaLineGraphicsExport, PURPOSE_ARG } from "./nba-line-graphics-io.mjs";
import { etWeekday, EXCLUDED_AVAILABILITY } from "../../src/lib/social/nfl-game-graphics-export.mjs";
import { loadForecastViews } from "../../src/lib/sports/nfl/forecast-view-load.mjs";
import { unionFrozenForecasts } from "../../src/lib/sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../../src/lib/sports/nfl/public-record.mjs";
import { formatValue } from "../../src/lib/sports/nfl/forecast-view.mjs";
import { pregameScope, boardRanks, TOP_BOARD_SPECS } from "../../src/lib/sports/nfl/top-boards.mjs";
import { familyStateAcross, poolWithheldTeams, rankFamily } from "../../src/lib/sports/nfl/board-ranking.mjs";
import { opponentIn } from "../../src/lib/sports/nfl/matchup.mjs";
import { shortPricedWindow, withSendWindow } from "../../src/lib/social/send-window.mjs";
import { estimateLabel } from "../../src/lib/sports/nfl/family-publication.mjs";
import { gateLaneTopBoards, laneDisplay, laneProvenance } from "../../src/lib/sports/nba/lane-top-boards.mjs";
import { eloWinProbabilityOf, ELO_WIN_PROBABILITY_LABEL } from "../../src/lib/sports/nba/elo-win-probability.mjs";
import { loadCurrentNbaResults } from "../../src/lib/sports/nba/current-results.mjs";
import {
  nextRevision, validationOf, xWeighted, CC_KIND_MAP, CONTENT_TYPE, ELIGIBILITY, editorialPlan, buildNbaRecap, buildNflRecap, buildSocialPackage, dedupeSlug, denominatorText, etDate, etLabel, instant, recapFinalsProblems, recommendedPostTime, toIso,
} from "../../src/lib/social/social-package.mjs";
import { BOOK_RULE, MONEYLINE_MARKET, americanText, matchMoneylineEvents, observedPrice } from "../../src/lib/social/nba-moneyline.mjs";
import { NFL_LINE_MAX_AGE_HOURS } from "../../src/lib/sports/nfl/prop-line-adapter.mjs";
import { LINE_MAX_AGE_HOURS, REFERENCE_BOOK_ORDER } from "../../src/lib/sports/nba/line-comparison.mjs";
import { NBA_PROP_LINE_ADAPTER } from "../../src/lib/sports/nba/prop-line-adapter.mjs";
import { flaggedCellsShown, withheldKeys } from "../../src/lib/social/display-exception.mjs";
import { anomaliesFor, anomalyPackageList, laneHistory, laneRows, reviewThresholds, runAnomalyCheck } from "../../src/lib/social/nba-anomaly-check.mjs";
import { GAME_POST_MAX_IMAGES, gamePostCaption, gamePostCaptionProblems, gamePostClaims, selectCaptionPlayers } from "../../src/lib/social/nba-game-post.mjs";
import { approvedCaption, nflWindow, quoteAgeFlags, slateWord } from "../../src/lib/social/approved-captions.mjs";
import { quoteRangeText } from "./nba-line-cards.mjs";
import { loadNflCaptures, nflMoneylineQuote, nflPropOfferStatus, NFL_PROP_SLOTS } from "./nfl-line-capture.mjs";
import { COMPARISON_LEGEND, COMPARISON_NOTE, comparisonCell, nflPropComparison } from "../../src/lib/social/nfl-line-comparison.mjs";
import { DESIGN_VERSION, DISCLOSURE, GAME_POST_DESIGN_VERSION, NFL_DISCLOSURE, NFL_GAME_POST_DESIGN_VERSION, nflHeroCard, nflPlayerPages, nflTdCard, nflTeamOf, recapCard, resultsHeroCard, statPages, teamOf, tonightCard, top5Card as v2Top5Card, verifyGameDayCard, winnerCard } from "./game-day-cards.mjs";
import { BOX_FOOTER } from "./nba-boxscore-cards.mjs";
import { layoutErrors as boxLayoutErrors, prepareNbaLineGraphics } from "./render-nba-line-graphics.mjs";
import { FOOT, ROWS_PER_CARD, SIZE, cell, legalLine, packCaptionViolations, pageHtml, verifyPackCard, meterHtml } from "./social-pack-cards.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const PUBLIC = () => path.join(APP, "public");
const ref = (rel) => {
  const f = path.join(PUBLIC(), rel);
  return { ref: `app/public/${rel}`, sha256: sha(fs.readFileSync(f)) };
};
const nbaExcluded = () => new Set((process.env.GTP_NBA_EXCLUDE_IDS ?? "").split(",").filter(Boolean));
/** Operator exclusion: removes audited player rows from social cards only. The file, its snapshot ref and every other number stay as committed. */
const withoutExcludedPlayers = (doc) => {
  const out = nbaExcluded();
  if (!out.size || !doc?.games) return doc;
  return { ...doc, games: doc.games.map((g) => (g.players ? { ...g, players: { away: g.players.away.filter((p) => !out.has(String(p.providerAthleteId))), home: g.players.home.filter((p) => !out.has(String(p.providerAthleteId))) } } : g)) };
};
const readPublic = (rel) => { try { const doc = JSON.parse(fs.readFileSync(path.join(PUBLIC(), rel), "utf8")); return rel.startsWith("data/nba/experimental-public/") ? withoutExcludedPlayers(doc) : doc; } catch { return null; } };
const NO_CLOCK = "--as-of <ISO instant with zone> is required (no clock is read)";
const assertAsOf = (asOf) => { if (!/T.*(Z|[+-]\d\d:\d\d)$/.test(String(asOf)) || !Number.isFinite(Date.parse(asOf))) throw new Error(NO_CLOCK); };
const timeOnly = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const longDay = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(ms));
const dayBefore = (d) => new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
const ageHours = (asOf, gen) => Math.round(((Date.parse(asOf) - Date.parse(gen)) / 3600000) * 10) / 10;
const finishCards = (cards) => {
  for (const c of cards) {
    const e = verifyPackCard(c.html, c.cells);
    if (e.length) throw new Error(`${c.name} failed validation:\n  - ${e.join("\n  - ")}`);
  }
  return cards;
};
const checkCaption = (caption) => {
  const v = packCaptionViolations(caption);
  if (v.length) throw new Error(`caption refused (${v.join("; ")}): ${caption}`);
  return caption.replace(/ +\n/g, "\n");
};
const pagesOf = (items, n = ROWS_PER_CARD) => { const out = []; for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n)); return out; };

const chipDay = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" }).format(new Date(ms));
const weekdayLong = (ms) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date(ms));
const tipClock = (ms) => `${timeOnly(ms)} ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" }).formatToParts(ms).find((p) => p.type === "timeZoneName").value}`;
/** NBA cards print "ET" like the line cards (founder, 2026-11-04), never EST/EDT. */
const etClock = (ms) => `${timeOnly(ms)} ET`;
const v2Cards = (cards, base) => cards.map((c, i) => {
  const e = verifyGameDayCard(c);
  if (e.length) throw new Error(`${base} failed validation:\n  - ${e.join("\n  - ")}`);
  return { ...c, name: cards.length > 1 ? `${base}-part${i + 1}` : base };
});

/* ───────────────────────────── NFL winners ───────────────────────────── */

const pctNumber = (p) => formatValue("probability", p).replace("%", "");
const NFL_V2 = Object.freeze({ disclosure: NFL_DISCLOSURE });
const nflTeamsOf = (views) => new Map(views.flatMap((v) => [[v.away.abbr, nflTeamOf(v.away.abbr, v.away.name)], [v.home.abbr, nflTeamOf(v.home.abbr, v.home.name)]]));
/** The v2 card's view of one checked winner row. */
function nflCardGame(v, r) {
  const t = instant(r.kickoffUtc);
  const away = nflTeamOf(v.away.abbr, v.away.name); const home = nflTeamOf(v.home.abbr, v.home.name);
  const w = v.record.winProbability;
  return { eventId: r.eventId, away, home, winner: r.winner === home.abbr ? home : away, awayP: w.away, homeP: w.home, awayPct: pctNumber(w.away), homePct: pctNumber(w.home), tipDay: weekdayLong(t), tipTime: etClock(t), startWord: "Kickoff", chip: `NFL · ${chipDay(t)} · ${etClock(t)}` };
}

/** The frozen/official record of each game of the week, rebuilt without the view. */
function nflRecords(seasonType, week) {
  const data = path.join(PUBLIC(), "data", "nfl");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(data, f), "utf8"));
  const union = unionFrozenForecasts(read("forecasts/latest.json"), read("forecasts/frozen-latest.json"), { resolve: nflPublicRecordResolver(path.resolve(APP, "..")) });
  return new Map((union.forecasts ?? []).filter((f) => f.seasonType === seasonType && f.week === week).map((f) => [String(f.providerEventId), f]));
}

/** One game row: the view's numbers, each compared with the record rebuilt independently. Throws on any difference. */
export function winnerRow(view, record) {
  const id = String(view.providerEventId);
  if (!record) throw new Error(`${id} ${view.matchup}: no independent record`);
  const r = view.record; const s = record.forecastSummary;
  if (r.winProbability.home !== s.winProbability.home || r.winProbability.away !== s.winProbability.away) throw new Error(`${id}: view win chance differs from the record`);
  if (r.projectedScore?.home !== s.projectedScore?.home || r.projectedScore?.away !== s.projectedScore?.away) throw new Error(`${id}: view projected score differs from the record`);
  if (r.winProbability.home === r.winProbability.away) throw new Error(`${id} ${view.matchup}: even win chance, no official side`);
  const homeFav = r.winProbability.home > r.winProbability.away;
  if ((homeFav ? view.home.abbr : view.away.abbr) !== r.favourite) throw new Error(`${id}: favourite disagrees with the win chance`);
  const p = homeFav ? r.winProbability.home : r.winProbability.away;
  const score = { away: formatValue("yards", r.projectedScore.away), home: formatValue("yards", r.projectedScore.home) };
  const scoreSide = Number(score.home) === Number(score.away) ? "TIE" : Number(score.home) > Number(score.away) ? view.home.abbr : view.away.abbr;
  return { eventId: id, matchup: view.matchup, away: view.away.abbr, home: view.home.abbr, kickoffUtc: view.kickoffUtc, winner: r.favourite, probability: p, winPct: formatValue("probability", p), projectedScore: score, scoreSideDiffers: scoreSide !== r.favourite, snapshotId: view.official?.snapshotId ?? null };
}

const scoreText = (g) => `${g.away} ${g.projectedScore.away} · ${g.home} ${g.projectedScore.home}`;
const DISCLOSE = Object.freeze([DISCLOSURE]);
const ccWeek = (week) => [{ key: "week", display: String(week), evidenceRef: "period" }];

/** One game: GAME WINNER PREDICTIONS with a proportional meter. `g.awayP/homeP` are the exact chances. */
export function gameWinnerCard(g, { name, sub, estimateLabel = null, foot }) {
  const cells = {};
  const body = `<div class="feat">${cell(cells, `${g.eventId}.matchup`, g.matchup, "g")}${cell(cells, `${g.eventId}.kickoff`, g.startText, "m")}${cell(cells, `${g.eventId}.winner`, g.sideText, "big")}${meterHtml(g.eventId, g.awayP, g.homeP)}${cell(cells, `${g.eventId}.split`, g.splitText, "m")}${g.scoreText ? cell(cells, `${g.eventId}.score`, g.scoreText, "r") : ""}</div>`;
  return { name, html: pageHtml({ brand: "GAME TIME PICKS", title: "GAME WINNER PREDICTIONS", sub, body, est: estimateLabel, foot, htmlTitle: name }), cells };
}

/** Per-game NFL posts, one for each Sunday/Monday game not yet started. */
export function prepareNflGameWinners({ seasonType = 2, week, asOf }) {
  assertAsOf(asOf);
  const views = loadForecastViews(PUBLIC()).filter((v) => v.seasonType === seasonType && v.week === week && ["Thu", "Sun", "Mon"].includes(etWeekday(v.kickoffUtc)));
  const records = nflRecords(seasonType, week);
  const refs = [ref("data/nfl/forecasts/latest.json"), ref("data/nfl/forecasts/frozen-latest.json")];
  const posts = []; const refused = [];
  for (const v of views) {
    if (!(instant(v.kickoffUtc) > Date.parse(asOf))) { refused.push({ contentType: CONTENT_TYPE.NFL_GAME_WINNER, variant: String(v.providerEventId), reason: "GAME_STARTED" }); continue; }
    const r = winnerRow(v, records.get(String(v.providerEventId)));
    const cards = v2Cards([winnerCard(nflCardGame(v, r), { meterLabel: "Model win probability", ...NFL_V2 })], `nfl-w${String(week).padStart(2, "0")}-winner-${r.eventId}`);
    const caption = checkCaption(`GameTime Picks NFL Week ${week}: ${r.matchup}, ${r.winner} ${r.winPct} model win probability. ${FOOT.projections} ${legalLine}`);
    const t = instant(r.kickoffUtc);
    posts.push({
      designVersion: DESIGN_VERSION, sport: "nfl", date: etDate(t), contentType: CONTENT_TYPE.NFL_GAME_WINNER, variant: r.eventId, cards, caption, snapshotRefs: refs, eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: DISCLOSE,
      title: `${r.matchup}: game winner prediction`, eventId: r.eventId, firstStartUtc: toIso(t), ccCaption: `${r.matchup}: ${r.winner} ${r.winPct} model win probability, model projection.`,
      checks: ["view == independently rebuilt record", "meter proportional to exact chances", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(t) }, recommended: recommendedPostTime({ games: [r], afterEtDate: dayBefore(etDate(t)), asOf }), recommendedNote: "the two hours before kickoff have passed",
      freshness: { asOf, sourceGeneratedAt: v.record.generatedAt, ageHours: ageHours(asOf, v.record.generatedAt), expiresAt: toIso(t), rule: "valid until kickoff" },
      content: { week, game: r },
    });
  }
  return { posts, refused };
}

export const TONIGHT_ROWS = 8;
/** NBA TONIGHT slides plus one card per game, from the lane through eloWinProbabilityOf. A started slate is refused. */
export function prepareNbaTonight({ date, asOf, laneOverride = null }) {
  assertAsOf(asOf);
  const rel = `data/nba/experimental-public/${date}.json`;
  const lane = laneOverride ?? readPublic(rel);
  if (!lane?.games?.length) throw new Error(`no NBA lane for ${date}: no winner card is made without a published lane`);
  const games = lane.games.map((g) => {
    const wp = eloWinProbabilityOf(g);
    if (!wp) throw new Error(`${g.providerEventId}: the Elo accessor refused this game`);
    const side = g.elo.state === "FAVOURED" ? g.elo.favoured : null;
    const pct = side === g.home.abbr ? wp.homePct : wp.awayPct;
    return { eventId: String(g.providerEventId), matchup: `${g.away.abbr} @ ${g.home.abbr}`, away: g.away.abbr, home: g.home.abbr, kickoffUtc: g.tipUtc, awayP: wp.away, homeP: wp.home, side, sideText: side ? `${side} ${pct}%` : "Too close to call", splitText: `${g.away.abbr} ${wp.awayPct}% · ${g.home.abbr} ${wp.homePct}%` };
  }).sort((a, b) => instant(a.kickoffUtc) - instant(b.kickoffUtc) || a.matchup.localeCompare(b.matchup));
  const started = games.filter((g) => !(instant(g.kickoffUtc) > Date.parse(asOf)));
  if (started.length) return { posts: [], refused: [{ contentType: CONTENT_TYPE.NBA_TONIGHT, date, reason: "GAME_STARTED", games: started.map((g) => g.matchup) }] };
  const first = instant(games[0].kickoffUtc);
  const foot = [`${ELO_WIN_PROBABILITY_LABEL} from the team rating, frozen before tip-off.`, `${FOOT.projections} ${FOOT.noLines}`, legalLine];
  const base = (o) => ({ sport: "nba", date, snapshotRefs: laneOverride ? [{ ref: rel, sha256: sha(JSON.stringify(lane)) }] : [ref(rel)], eligibilityClass: ELIGIBILITY.ESTIMATE, disclosures: [ELO_WIN_PROBABILITY_LABEL, ...DISCLOSE], freshness: { asOf, sourceGeneratedAt: lane.generatedAt, ageHours: ageHours(asOf, lane.generatedAt), expiresAt: toIso(first), rule: "valid until tip-off" }, ...o });
  const slides = pagesOf(games, TONIGHT_ROWS).map((chunk, i, all) => {
    const cells = {};
    const body = `<div class="rows">${chunk.map((g) => `<div class="row" style="grid-template-columns:128px 230px 1fr">${cell(cells, `${g.eventId}.tip`, timeOnly(instant(g.kickoffUtc)), "m")}${cell(cells, `${g.eventId}.matchup`, g.matchup, "g")}<div>${cell(cells, `${g.eventId}.winner`, g.sideText, "w")}${meterHtml(g.eventId, g.awayP, g.homeP)}</div></div>`).join("")}</div>`;
    return { name: `nba-${date}-tonight-${i + 1}of${all.length}`, html: pageHtml({ brand: "GAME TIME PICKS WINNER PREDICTIONS", title: "NBA TONIGHT", sub: `${longDay(first).toUpperCase()} · Tip-offs ET${all.length > 1 ? ` · ${i + 1} of ${all.length}` : ""}`, body, est: "Estimate", foot, htmlTitle: `NBA tonight ${date}`, maxRow: 110 }), cells };
  });
  const posts = [base({
    contentType: CONTENT_TYPE.NBA_TONIGHT, variant: null, cards: finishCards(slides), title: `NBA tonight ${date}`, firstStartUtc: toIso(first),
    caption: checkCaption(`GameTime Picks NBA tonight, ${longDay(first)}: ${games.map((g) => g.sideText).join("; ")}. ${ELO_WIN_PROBABILITY_LABEL}. ${FOOT.projections} ${legalLine}`),
    ccCaption: `NBA tonight: ${games.length} games, model estimate of each game on the image.`, extraClaims: [{ key: "games", display: String(games.length), evidenceRef: rel }],
    checks: ["every game through eloWinProbabilityOf", "meters proportional", "card cells == validated text"],
    window: { opensAt: asOf, closesAt: toIso(first) }, recommended: recommendedPostTime({ games, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", content: { games },
  })];
  for (const g of games) {
    const t = instant(g.kickoffUtc);
    posts.push(base({
      contentType: CONTENT_TYPE.NBA_GAME_WINNER, variant: g.eventId, eventId: g.eventId, firstStartUtc: toIso(t), title: `${g.matchup}: game winner prediction`,
      cards: finishCards([gameWinnerCard({ ...g, startText: `Tip-off ${etLabel(t)}` }, { name: `nba-${date}-winner-${g.eventId}`, sub: `NBA · ${longDay(t)}`, estimateLabel: "Estimate", foot })]),
      caption: checkCaption(`GameTime Picks NBA: ${g.matchup}, ${g.sideText}. ${ELO_WIN_PROBABILITY_LABEL}. ${FOOT.projections} ${legalLine}`),
      ccCaption: `${g.matchup}: ${g.sideText}, model estimate.`, checks: ["eloWinProbabilityOf", "meter proportional", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(t) }, recommended: recommendedPostTime({ games: [g], afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", content: { game: g },
    }));
  }
  return { posts, refused: [] };
}

const WINNER_FOOT = ["Model win probability, from the official forecast. Projected score is the published model score, rounded to a whole point.", `${FOOT.projections} ${FOOT.noLines}`, legalLine];

const quoteAgeOf = (quotes, asOf) => {
  const times = quotes.map((q) => q.quotedAt).sort();
  if (!times.length) return { quotes: 0, stale: false, maxHours: NFL_LINE_MAX_AGE_HOURS, oldestQuotedAt: null, oldestAgeHours: null };
  const oldestAgeHours = ageHours(asOf, times[0]);
  return { quotes: times.length, stale: oldestAgeHours > NFL_LINE_MAX_AGE_HOURS, maxHours: NFL_LINE_MAX_AGE_HOURS, oldestQuotedAt: times[0], oldestAgeHours };
};
/** The observed price of the predicted side. Null when no clean quote exists. */
function nflMarket(view, row, captures, asOf) {
  const side = row.winner === view.home.abbr ? view.home : view.away;
  const q = nflMoneylineQuote(captures?.moneylines ?? [], { eventId: row.eventId, awayName: view.away.name, homeName: view.home.name, sideName: side.name, kickoffUtc: view.kickoffUtc, asOf });
  return q && { sideAbbr: row.winner, priceText: americanText(q.price), bookLabel: NFL_BOOK_LABEL(q.book), book: q.book, price: q.price, quotedAt: q.quotedAt };
}
const NFL_BOOK_LABEL = (k) => NBA_PROP_LINE_ADAPTER.bookLabel(k);

function roundupCards(rows, week, viewOf, markets = null) {
  const games = rows.map((r) => ({ ...nflCardGame(viewOf(r), r), tipTime: etClock(instant(r.kickoffUtc)), market: markets?.get(r.eventId) }));
  return v2Cards([tonightCard({ games, chip: `NFL · Week ${week} · ${chipDay(instant(rows[0].kickoffUtc))}`, kicker: "NFL Sunday", sub: `Week ${week} winner predictions, model win probability`, timeHead: "KICK ET", priced: Boolean(markets), ...NFL_V2 })], `nfl-w${String(week).padStart(2, "0")}-sunday`);
}

function mnfCards(rows, week, viewOf) {
  return v2Cards(rows.map((r) => winnerCard(nflCardGame(viewOf(r), r), { kicker: "Monday Night Football", meterLabel: "Model win probability", ...NFL_V2 })), `nfl-w${String(week).padStart(2, "0")}-mnf`);
}

/** Sunday + Monday posts. A slate with a started game is refused whole: "every Sunday game" must stay true. */
export function prepareNflWinners({ seasonType = 2, week, asOf, captures = null }) {
  assertAsOf(asOf);
  const views = loadForecastViews(PUBLIC()).filter((v) => v.seasonType === seasonType && v.week === week);
  const records = nflRecords(seasonType, week);
  const refused = [];
  const posts = [];
  const refs = [ref("data/nfl/forecasts/latest.json"), ref("data/nfl/forecasts/frozen-latest.json")];
  const sourceAt = Math.max(...views.map((v) => Date.parse(v.record.generatedAt)).filter(Number.isFinite));
  for (const [day, contentType, build] of [["Sun", CONTENT_TYPE.NFL_SUNDAY_WINNERS, roundupCards], ["Mon", CONTENT_TYPE.NFL_MNF_WINNER, mnfCards]]) {
    const slate = views.filter((v) => etWeekday(v.kickoffUtc) === day);
    if (!slate.length) { refused.push({ contentType, reason: "NO_GAMES" }); continue; }
    const started = slate.filter((v) => !(instant(v.kickoffUtc) > Date.parse(asOf)));
    if (started.length) { refused.push({ contentType, reason: "GAME_STARTED", games: started.map((v) => v.matchup) }); continue; }
    const rows = slate.map((v) => winnerRow(v, records.get(String(v.providerEventId)))).sort((a, b) => instant(a.kickoffUtc) - instant(b.kickoffUtc) || a.matchup.localeCompare(b.matchup));
    const viewOf = (r) => slate.find((v) => String(v.providerEventId) === r.eventId);
    const priced = day === "Sun" ? new Map(rows.map((r) => [r.eventId, nflMarket(viewOf(r), r, captures, asOf)]).filter(([, m]) => m)) : new Map();
    const allPriced = priced.size === rows.length;
    if (captures && day === "Sun" && !allPriced) refused.push({ contentType, variant: "priced", reason: "NOT_EVERY_GAME_PRICED", games: rows.filter((r) => !priced.has(r.eventId)).map((r) => r.matchup) });
    const cards = build(rows, week, viewOf, allPriced ? priced : null);
    const first = instant(rows[0].kickoffUtc);
    const date = etDate(first);
    const lines = rows.map((g) => `${g.winner} ${g.winPct} (${g.matchup})`);
    const caption = checkCaption(`GameTime Picks NFL Week ${week} ${day === "Sun" ? "Sunday" : "Monday Night Football"} model projections, not picks: ${lines.join("; ")}. Model win probability from the published forecast. ${legalLine}`);
    posts.push({
      designVersion: DESIGN_VERSION, sport: "nfl", date, contentType, variant: null, cards, caption, snapshotRefs: allPriced ? [...refs, ...captures.refs] : refs, eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: allPriced ? ["Sportsbook prices are observed quotes, separate from the model estimates", ...DISCLOSE] : DISCLOSE, containsMarketData: allPriced, title: `NFL Week ${week} ${day === "Sun" ? "Sunday" : "Monday"} winner predictions`, firstStartUtc: toIso(first),
      eventId: rows.length === 1 ? rows[0].eventId : null, ccCaption: `NFL Week ${week} ${day === "Sun" ? "Sunday" : "Monday night"}: model projections for ${rows.length} ${rows.length === 1 ? "game" : "games"}, model win probability on the image.`, extraClaims: [...ccWeek(week), { key: "games", display: String(rows.length), evidenceRef: "forecast" }],
      checks: ["view win chance == independently rebuilt record", "view projected score == record", "favourite recomputed from win chance", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(first) },
      recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before kickoff have passed",
      freshness: { asOf, sourceGeneratedAt: toIso(sourceAt), ageHours: ageHours(asOf, toIso(sourceAt)), expiresAt: toIso(first), rule: "valid until first kickoff" },
      content: { week, seasonType, label: "Model projections, not picks", games: rows, scoreSideConflicts: rows.filter((g) => g.scoreSideDiffers).map((g) => g.matchup), ...(allPriced ? { prices: [...priced].map(([eventId, m]) => ({ eventId, side: m.sideAbbr, book: m.book, price: m.price, quotedAt: m.quotedAt })), quoteAge: quoteAgeOf([...priced.values()], asOf), socialAuthorized: false } : {}) },
    });
  }
  return { posts, refused };
}

/* ───────────────────────────── Top 5 ───────────────────────────── */

/** The line block under a number, exact strings from the export row. Null when the row shows no line. */
export function lineBlock(row) {
  const m = row?.market;
  if (m?.line?.state !== "SHOWN" || m.direction?.state !== "SHOWN") return null;
  const side = m.direction.side;
  if (side === "NEUTRAL") return { cls: "neutral", glyph: "", text: `Line ${m.line.text}` };
  const price = (side === "OVER" ? m.overPrice : m.underPrice);
  return { cls: side.toLowerCase(), glyph: m.direction.glyph, text: `${side === "OVER" ? "O" : "U"} ${m.line.text}${price?.state === "SHOWN" ? ` ${price.text}` : ""}`, side, sideText: price?.state === "SHOWN" ? `${side} ${m.line.text} · ${price.text}` : null };
}
/** A Top 5 row needs the side's own price: a side with no price is projection only. Neutral (equal) keeps its line. */
export const top5LineOf = (row) => { const l = lineBlock(row); return l && (l.cls === "neutral" || l.sideText) ? l : null; };
const top5Reason = (r) => (!r ? "NO_LINE" : r.market?.line?.state !== "SHOWN" ? `LINE_${r.market?.line?.state ?? "MISSING"}` : r.market?.direction?.state !== "SHOWN" ? `DIRECTION_${r.market?.direction?.state ?? "MISSING"}` : "NO_SIDE_PRICE");

/**
 * One NFL Top 5 row against its one verified quote: the arithmetic of nflPropComparison, nothing else. A printed number
 * rounds (yards are whole), so when the printed number sits on or across the line from the exact projection the row is
 * neutral: the card never shows a side its own digits contradict.
 */
export function nflTop5Line({ value, text, family, eventId, playerId, kickoffUtc, offers, asOf }) {
  const { quote, reason } = nflPropOfferStatus(offers, { eventId, playerId, market: family, kickoffUtc, asOf });
  const stale = Boolean(quote) && ageHours(asOf, quote.capturedAt) > NFL_LINE_MAX_AGE_HOURS;
  const c = nflPropComparison({ projection: value, quote, reason, stale, expected: { eventId, playerId, market: family } });
  const meta = (o) => ({ state: o.state, reason: o.reason, side: o.side, line: o.line ?? null, price: o.price, difference: o.difference ?? null, book: quote?.book ?? null, quotedAt: quote?.capturedAt ?? null, comparisonIsNotEdge: true });
  const printed = Number(String(text).replace(/,/g, ""));
  const lineText = String(c.line);
  if (c.state === "EQUAL") return { line: { cls: "neutral", glyph: "", text: `Line ${lineText}` }, comparison: meta(c), quotedAt: quote.capturedAt };
  if (c.state !== "OVER" && c.state !== "UNDER") return { line: null, comparison: meta(c), quotedAt: null };
  if (!((printed - c.line) * c.difference > 0)) return { line: { cls: "neutral", glyph: "", text: `Line ${lineText}` }, comparison: meta({ ...c, state: "NEUTRAL", side: null, price: null, reason: "ROUNDED_AT_OR_ACROSS_LINE" }), quotedAt: quote.capturedAt };
  return { line: { cls: c.state.toLowerCase(), glyph: c.glyph, text: `${c.state} ${lineText} ${americanText(c.price)}`, side: c.state, sideText: `${c.state} ${lineText} · ${americanText(c.price)}` }, comparison: meta(c), quotedAt: quote.capturedAt };
}

/** The verified anytime TD Yes price: eligible, unambiguous, pre-kickoff, fresh, a real American price. Never over/under. */
export function nflTdYes({ eventId, playerId, kickoffUtc, offers, asOf }) {
  const { quote, reason } = nflPropOfferStatus(offers, { eventId, playerId, market: "anytime_td", kickoffUtc, asOf });
  if (!quote) return { quote: null, reason };
  if (!Number.isInteger(quote.price) || Math.abs(quote.price) < 100) return { quote: null, reason: "INVALID_ODDS" };
  if (ageHours(asOf, quote.capturedAt) > NFL_LINE_MAX_AGE_HOURS) return { quote: null, reason: "STALE_LINE" };
  return { quote, reason: null };
}

const MODEL_SECTION = "MODEL PROJECTION";
const QUOTE_DISCLOSURE = "Sportsbook prices are observed quotes, separate from the model estimates";
function top5Card({ name, title, sub, rows, est, foot }) {
  const cells = {};
  const num = (r) => (r.line ? `<div class="lnw">${cell(cells, `${r.key}.num`, `${r.line.glyph ? `${r.line.glyph} ` : ""}${r.text}`, `w ${r.line.cls}`)}${cell(cells, `${r.key}.line`, r.line.text, `ln ${r.line.cls}`)}</div>` : cell(cells, `${r.key}.num`, r.text, "w"));
  const body = `<div class="rows">${rows.map((r) => `<div class="row" style="grid-template-columns:90px 1fr 260px">${cell(cells, `${r.key}.rank`, r.rank, "n")}<div>${cell(cells, `${r.key}.name`, r.name, "g")}<br>${cell(cells, `${r.key}.meta`, r.meta, "m")}</div>${num(r)}</div>`).join("")}</div>`;
  return { name, html: pageHtml({ title, sub, body, est, foot, htmlTitle: name, maxRow: 165 }), cells };
}

const FAMILY_KIND = Object.freeze({ player_pass_yds: "yards", player_rush_yds: "yards", player_reception_yds: "yards", player_receptions: "count", anytime_td: "probability" });

/** The boards re-ranked by the one shared rule over the Sunday games still to kick off. TNF and MNF never enter. */
export function sundayScope({ seasonType = 2, week, asOf }) {
  const boards = loadForecastViews(PUBLIC()).filter((v) => v.seasonType === seasonType && v.week === week && etWeekday(v.kickoffUtc) === "Sun" && instant(v.kickoffUtc) > Date.parse(asOf)).map((v) => readPublic(`data/nfl/player-board/${v.providerEventId}.json`)).filter((b) => b?.players?.length);
  if (!boards.length) return null;
  return { boards: TOP_BOARD_SPECS.map((spec) => {
    const st = familyStateAcross(boards, spec.family);
    const ranks = (st?.state === "PUBLISHED" || st?.state === "ESTIMATE") && !poolWithheldTeams(boards, spec.family).length;
    if (!ranks) return { id: spec.id, state: "NOT_PUBLISHED", rows: [], readiness: { code: st?.state ?? "NO_OFFICIAL_PROJECTION" } };
    const rows = rankFamily(boards, spec.family, spec.method, { asOf, blocked: [] }).slice(0, 5).map(({ board: b, player: p, market: m }, i) => ({ rank: i + 1, playerId: p.playerId, name: p.name, team: p.team, opponent: opponentIn(b.matchup, p.team), providerEventId: String(b.providerEventId), kickoffUtc: b.kickoffUtc, value: m[spec.method] }));
    return { id: spec.id, state: st.state, rows, ...(st.state === "ESTIMATE" ? { estimate: { label: estimateLabel(st.reason) } } : {}) };
  }) };
}

export const NFL_REC_PAIR = "top5_rec_pair";
/** Receiving yards and receptions as one post: two images, one caption. */
export function recPairPost(yds, rec) {
  const rename = (p, k) => p.cards.map((c) => ({ ...c, name: `${c.name}-${k}`, cells: Object.fromEntries(Object.entries(c.cells).map(([x, v]) => [`${k}.${x}`, v])) }));
  const first = instant(yds.firstStartUtc) <= instant(rec.firstStartUtc) ? yds : rec;
  const label = "Receiving yards + receptions";
  const quoteTimes = [...yds.quoteTimes, ...rec.quoteTimes];
  const lines = { shown: yds.content.lines.shown + rec.content.lines.shown, missing: [...yds.content.lines.missing, ...rec.content.lines.missing] };
  return { ...withSendWindow(first, quoteTimes), quoteTimes, containsMarketData: quoteTimes.length > 0, disclosures: [...new Set([...yds.disclosures, ...rec.disclosures])], variant: NFL_REC_PAIR, title: `NFL Week ${yds.content.week} top 5 ${label.toLowerCase()}`, cards: [...rename(yds, "yds"), ...rename(rec, "rec")], snapshotRefs: [...new Map([...yds.snapshotRefs, ...rec.snapshotRefs].map((r) => [r.ref, r])).values()], content: { week: yds.content.week, board: NFL_REC_PAIR, label, estimateLabel: yds.content.estimateLabel ?? rec.content.estimateLabel, lines, gaps: [...new Set([...yds.content.gaps, ...rec.content.gaps])], parts: [yds.content, rec.content], imageOrder: [yds.variant, rec.variant] }, checks: [...new Set([...yds.checks, "images in order: receiving yards, receptions"])] };
}

/** The Sunday Top 5 set: anytime TD, the receiving pair, rushing, passing. Exactly four posts, or the gaps are listed. */
export function prepareNflSundayTop5({ seasonType = 2, week, asOf, captures = null }) {
  const r = prepareNflTop5({ seasonType, week, asOf, sundayOnly: true, captures });
  const by = (id) => r.posts.find((p) => p.variant === id);
  const yds = by("top5_reception_yds"); const rec = by("top5_receptions");
  const pair = yds && rec ? [recPairPost(yds, rec)] : [];
  if (!pair.length) r.refused.push({ contentType: CONTENT_TYPE.NFL_WEEKLY_TOP5, variant: NFL_REC_PAIR, reason: "MISSING_BOARD" });
  return { posts: [by("top5_anytime_td"), ...pair, by("top5_rush_yds"), by("top5_pass_yds")].filter(Boolean), refused: r.refused };
}

/** The five weekly boards. Each row is compared with the per-game official board it came from. */
export function prepareNflTop5({ seasonType = 2, week, asOf, sundayOnly = false, captures = null }) {
  assertAsOf(asOf);
  const offers = captures?.offers ?? [];
  const file = `data/nfl/weekly-boards/${seasonType}-${String(week).padStart(2, "0")}.json`;
  const wb = readPublic(file);
  if (!wb?.topBoards?.weekly) throw new Error(`no topBoards in ${file}`);
  const scope = sundayOnly ? sundayScope({ seasonType, week, asOf }) : pregameScope(wb.topBoards.weekly, asOf);
  if (!scope) return { posts: [], refused: [{ contentType: CONTENT_TYPE.NFL_WEEKLY_TOP5, reason: "NO_PREGAME_GAMES" }] };
  const posts = [];
  const refused = [];
  const teams = nflTeamsOf(loadForecastViews(PUBLIC()).filter((v) => v.seasonType === seasonType && v.week === week));
  for (const b of scope.boards) {
    const spec = TOP_BOARD_SPECS.find((s) => s.id === b.id);
    if (!spec || !boardRanks(b) || !b.rows?.length) { refused.push({ contentType: CONTENT_TYPE.NFL_WEEKLY_TOP5, variant: b.id, reason: b.readiness?.code ?? "NOT_RANKED" }); continue; }
    if (b.state === "ESTIMATE" && !b.estimate?.label) throw new Error(`${b.id}: estimate without its label`);
    const refs = [ref(file)];
    const rows = b.rows.map((r) => {
      const rel = `data/nfl/player-board/${r.providerEventId}.json`;
      const board = readPublic(rel);
      const m = board?.players?.find((p) => p.playerId === r.playerId)?.markets?.[spec.family];
      if (m?.[spec.method] !== r.value) throw new Error(`${b.id} ${r.name}: board ${m?.[spec.method]} vs top board ${r.value}`);
      if (!refs.some((x) => x.ref.endsWith(rel))) refs.push(ref(rel));
      const text = formatValue(FAMILY_KIND[spec.family], r.value);
      const quoteArgs = { eventId: String(r.providerEventId), playerId: r.playerId, kickoffUtc: r.kickoffUtc, offers, asOf };
      let market;
      if (spec.method === "probability") { const y = nflTdYes(quoteArgs); market = { line: null, note: y.quote ? `Yes ${americanText(y.quote.price)}` : null, quotedAt: y.quote?.capturedAt ?? null, comparison: y.quote ? { state: "YES_PRICE", reason: null, price: y.quote.price, book: y.quote.book, quotedAt: y.quote.capturedAt } : { state: "NEUTRAL", reason: y.reason, price: null } }; }
      else market = { note: null, ...nflTop5Line({ ...quoteArgs, value: r.value, text, family: spec.family }) };
      return { ...market, key: r.playerId, playerId: r.playerId, rank: r.rank, name: r.name, team: r.team, opponent: r.opponent, kickoffUtc: r.kickoffUtc, providerEventId: String(r.providerEventId), value: r.value, text, meta: `${r.team} vs ${r.opponent} · ${etLabel(instant(r.kickoffUtc)).replace(/ E[SD]T$/, " ET")}` };
    });
    const first = Math.min(...rows.map((r) => instant(r.kickoffUtc)));
    const est = b.state === "ESTIMATE" ? b.estimate.label : null;
    const isProb = spec.method === "probability";
    const quoteTimes = rows.map((r) => r.quotedAt).filter(Boolean);
    const missing = rows.filter((r) => !r.quotedAt).map((r) => ({ playerId: r.key, name: r.name, reason: r.comparison.reason }));
    const cards = v2Cards([v2Top5Card({ title: spec.label, chip: `NFL · Week ${week}${sundayOnly ? " · Sunday" : ""}`, rows: rows.map((r) => ({ ...r, team: teams.get(r.team), tip: etClock(instant(r.kickoffUtc)) })), sub: isProb ? "Chance to score a touchdown" : undefined, section: isProb ? null : MODEL_SECTION, real: !isProb, note: !isProb && quoteTimes.length ? COMPARISON_LEGEND : null, ...NFL_V2 })], `nfl-w${String(week).padStart(2, "0")}-${b.id}`);
    const caption = checkCaption(`GameTime Picks NFL Week ${week} top 5 ${spec.label.toLowerCase()}${est ? ` (${est.replace(/·/g, "-")})` : ""}: ${rows.map((r) => `${r.rank}. ${r.name} ${r.text}`).join(", ")}. ${FOOT.projections} ${legalLine}`);
    const gen = wb.generatedAt;
    posts.push(withSendWindow({
      designVersion: DESIGN_VERSION, sport: "nfl", date: etDate(first), contentType: CONTENT_TYPE.NFL_WEEKLY_TOP5, variant: b.id, cards, caption, quoteTimes, containsMarketData: quoteTimes.length > 0, snapshotRefs: quoteTimes.length ? [...refs, ...captures.refs] : refs, eligibilityClass: est ? ELIGIBILITY.ESTIMATE : ELIGIBILITY.OFFICIAL, disclosures: [...(est ? [est] : []), ...(quoteTimes.length ? [QUOTE_DISCLOSURE] : []), ...DISCLOSE], title: `NFL Week ${week} top 5 ${spec.label.toLowerCase()}`, firstStartUtc: toIso(first),
      ccCaption: `NFL Week ${week} top 5 ${spec.label.toLowerCase()}${est ? " (estimate)" : ""}. Model projections.`, extraClaims: [...ccWeek(week), { key: "topN", display: "5", evidenceRef: file }],
      checks: ["pregameScope applied at asOf", "every row == per-game official board at the family metric", "estimate label kept in metadata; the card says MODEL PROJECTION", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(first) }, recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(etDate(first)), asOf }), recommendedNote: "the two hours before kickoff have passed",
      freshness: { asOf, sourceGeneratedAt: gen, ageHours: ageHours(asOf, gen), expiresAt: toIso(first), rule: "valid until first kickoff of the listed games" },
      ...validationOf(est), content: { week, board: b.id, label: spec.label, state: b.state, estimateLabel: est, lines: { shown: quoteTimes.length, missing, note: COMPARISON_NOTE }, gaps: missing.length ? [`NO_COMPARISON_ROWS_${missing.length}`] : [], rows: rows.map(({ key: _k, meta: _m, line: _l, note: _n, ...r }) => r) },
    }, quoteTimes));
  }
  return { posts, refused };
}

const NFL_STAT_FAMILIES = Object.freeze(["player_pass_yds", "player_rush_yds", "player_reception_yds", "anytime_td", "player_receptions"]);
export const NFL_MAX_PLAYERS_PER_TEAM = 12;
/** Per-game player cards from the official board. An ESTIMATE family stays ESTIMATE in metadata; the card prints the number alone. */
export function prepareNflPlayerStats({ seasonType = 2, week, asOf }) {
  assertAsOf(asOf);
  const posts = []; const refused = [];
  for (const v of loadForecastViews(PUBLIC()).filter((x) => x.seasonType === seasonType && x.week === week && ["Sun", "Mon"].includes(etWeekday(x.kickoffUtc)))) {
    const id = String(v.providerEventId);
    const t = instant(v.kickoffUtc);
    if (!(t > Date.parse(asOf))) { refused.push({ contentType: CONTENT_TYPE.NFL_PLAYER_STATS, variant: id, reason: "GAME_STARTED" }); continue; }
    const rel = `data/nfl/player-board/${id}.json`;
    const board = readPublic(rel);
    if (!board?.players?.length) { refused.push({ contentType: CONTENT_TYPE.NFL_PLAYER_STATS, variant: id, reason: "NO_PLAYER_BOARD" }); continue; }
    const estimate = NFL_STAT_FAMILIES.some((f) => board.families?.[f]?.state === "ESTIMATE") ? estimateLabel(board.families.player_pass_yds?.reason ?? board.families.player_rush_yds?.reason) : null;
    const stat = (f, m) => {
      const state = board.families?.[f]?.state;
      if (!m || !["PUBLISHED", "ESTIMATE"].includes(state)) return null;
      const value = f === "anytime_td" ? m.probability : m.median;
      return value == null ? null : formatValue(FAMILY_KIND[f], value);
    };
    const team = (abbr) => board.players.filter((p) => p.team === abbr).map((p) => ({ id: p.playerId, name: p.name, weight: Math.max(...NFL_STAT_FAMILIES.filter((f) => f !== "anytime_td" && f !== "player_receptions").map((f) => p.markets?.[f]?.median ?? 0)), stats: Object.fromEntries(NFL_STAT_FAMILIES.map((f) => [f, stat(f, p.markets?.[f])])) })).filter((p) => Object.values(p.stats).some(Boolean)).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, NFL_MAX_PLAYERS_PER_TEAM);
    const m = `${v.away.abbr} @ ${v.home.abbr}`;
    const awayPlayers = team(v.away.abbr); const homePlayers = team(v.home.abbr);
    const showsEstimate = [...awayPlayers, ...homePlayers].some((p) => Object.entries(p.stats).some(([f, x]) => x != null && board.families?.[f]?.state === "ESTIMATE"));
    const cards = v2Cards(nflPlayerPages({ away: nflTeamOf(v.away.abbr, v.away.name), home: nflTeamOf(v.home.abbr, v.home.name), chip: `NFL · ${chipDay(t)} · ${etClock(t)}`, awayPlayers, homePlayers }), `nfl-w${String(week).padStart(2, "0")}-players-${id}`);
    posts.push({
      designVersion: DESIGN_VERSION, sport: "nfl", date: etDate(t), contentType: CONTENT_TYPE.NFL_PLAYER_STATS, variant: id, eventId: id, cards, snapshotRefs: [ref(rel)], eligibilityClass: showsEstimate ? ELIGIBILITY.ESTIMATE : ELIGIBILITY.OFFICIAL, disclosures: showsEstimate ? [estimate, ...DISCLOSE] : DISCLOSE,
      title: `${m}: projected player stats`, firstStartUtc: toIso(t), caption: checkCaption(`GameTime Picks NFL Week ${week}: ${m} projected player stats. ${FOOT.projections} ${legalLine}`), ccCaption: `${m} projected player stats. Model projections.`, ccCaptionB: `${m} player projections.`, extraClaims: ccWeek(week),
      checks: ["every number from the official player board", "estimate label on card when an ESTIMATE family shows", "card cells == validated text", "fit pass"], window: { opensAt: asOf, closesAt: toIso(t) }, recommended: recommendedPostTime({ games: [{ kickoffUtc: v.kickoffUtc }], afterEtDate: dayBefore(etDate(t)), asOf }), recommendedNote: "the two hours before kickoff have passed",
      freshness: { asOf, sourceGeneratedAt: board.generatedAt, ageHours: ageHours(asOf, board.generatedAt), expiresAt: toIso(t), rule: "valid until kickoff" }, content: { week, players: awayPlayers.length + homePlayers.length, parts: cards.length, estimate: showsEstimate },
    });
  }
  return { posts, refused };
}

export const NFL_TD_CANDIDATES = 3;
const NOT_FIT = new Set([...EXCLUDED_AVAILABILITY, "QUESTIONABLE", "DOUBTFUL"]);
/** Players who may be named: no OUT, injured or questionable status on the view or the board. */
const fitPlayers = (v, board) => {
  const seen = new Map((v.players ?? []).map((p) => [p.playerId, (p.availability ?? []).map((a) => a.state)]));
  return board.players.filter((p) => !NOT_FIT.has(p.participation) && !(seen.get(p.playerId) ?? []).some((x) => NOT_FIT.has(x)));
};

/** Top anytime-TD chances beside the observed Yes price. No implied chance: one-sided, with vig, so never reliable here. */
export function nflTdRows({ players, board, eventId, kickoffUtc, offers, asOf }) {
  if (board.families?.anytime_td?.state !== "PUBLISHED") return [];
  return players.filter((p) => Number.isFinite(p.markets?.anytime_td?.probability)).sort((a, b) => b.markets.anytime_td.probability - a.markets.anytime_td.probability || a.playerId.localeCompare(b.playerId)).slice(0, NFL_TD_CANDIDATES).map((p, i) => {
    const { quote: q, reason } = nflTdYes({ eventId, playerId: p.playerId, kickoffUtc, offers, asOf });
    return { reason, key: p.playerId, playerId: p.playerId, rank: i + 1, name: p.name, teamAbbr: p.team, pct: formatValue("probability", p.markets.anytime_td.probability), value: p.markets.anytime_td.probability, note: q ? `Yes ${americanText(q.price)}` : "No quote", quote: q };
  });
}

/** Passing, rushing and receiving rows beside the line, each with the social comparison (projection vs line, never edge). */
export function nflPropRows({ players, board, eventId, kickoffUtc, offers, asOf }) {
  const rows = [];
  for (const s of NFL_PROP_SLOTS) {
    const state = board.families?.[s.family]?.state;
    if (!["PUBLISHED", "ESTIMATE"].includes(state)) continue;
    const est = state === "ESTIMATE";
    const held = (board.families[s.family].withheldTeams ?? []).map((w) => w?.team);
    const all = players.filter((p) => !held.includes(p.team) && Number.isFinite(p.markets?.[s.family]?.median)).map((p) => { const o = nflPropOfferStatus(offers, { eventId, playerId: p.playerId, market: s.family, kickoffUtc, asOf }); return { p, q: o.quote, why: o.reason }; });
    const priced = all.filter((x) => x.q && !(ageHours(asOf, x.q.capturedAt) > NFL_LINE_MAX_AGE_HOURS));
    for (const { p, q, why } of (priced.length ? priced : all).sort((a, b) => b.p.markets[s.family].median - a.p.markets[s.family].median || a.p.playerId.localeCompare(b.p.playerId)).slice(0, s.rows)) {
      const stale = Boolean(q) && ageHours(asOf, q.capturedAt) > NFL_LINE_MAX_AGE_HOURS;
      const comparison = nflPropComparison({ projection: p.markets[s.family].median, quote: q, reason: why, stale, expected: { eventId, playerId: p.playerId, market: s.family } });
      rows.push({ comparison, vs: comparisonCell(comparison, americanText), key: `${p.playerId}.${s.family}`, playerId: p.playerId, market: s.family, name: p.name, team: p.team, family: s.label, projection: `${formatValue(FAMILY_KIND[s.family], p.markets[s.family].median)}`, line: q && !stale ? String(q.line) : "No line", over: q?.overPrice != null ? americanText(q.overPrice) : "No price", under: q?.underPrice != null ? americanText(q.underPrice) : "No price", estimate: est, quote: q });
    }
  }
  return rows;
}

const kickoffEst = (ms) => `${timeOnly(ms)} ET`;

/** Exactly two images per Sunday game: the priced winner card, then a separate ranked Top 3 anytime TD card. No props graphic. */
export function prepareNflGamePosts({ seasonType = 2, week, asOf, captures = null }) {
  const winners = prepareNflGameWinners({ seasonType, week, asOf });
  const type = CONTENT_TYPE.NFL_GAME_POST;
  const views = new Map(loadForecastViews(PUBLIC()).map((v) => [String(v.providerEventId), v]));
  const offers = captures?.offers ?? [];
  const posts = []; const refused = winners.refused.map((r) => ({ ...r, contentType: type }));
  const wk = String(week).padStart(2, "0");
  for (const w of winners.posts) {
    if (etWeekday(w.firstStartUtc) !== (process.env.GTP_NFL_POST_DAY ?? "Sun")) continue;
    const id = w.variant; const v = views.get(id); const g = w.content.game;
    const rel = `data/nfl/player-board/${id}.json`;
    const board = readPublic(rel);
    if (!board?.players?.length) { refused.push({ contentType: type, variant: id, reason: "NO_PLAYER_BOARD" }); continue; }
    const t = instant(g.kickoffUtc);
    const away = nflTeamOf(v.away.abbr, v.away.name); const home = nflTeamOf(v.home.abbr, v.home.name);
    const rawMarket = nflMarket(v, g, captures, asOf);
    const staleMarket = Boolean(rawMarket) && ageHours(asOf, rawMarket.quotedAt) > NFL_LINE_MAX_AGE_HOURS;
    const market = staleMarket ? null : rawMarket;
    // Confirmed inactive per the injury source when the roster feed lags (operator list, recorded in the run command).
    const inactive = new Set((process.env.GTP_SOCIAL_INACTIVE_IDS ?? "").split(",").filter(Boolean));
    const fit = fitPlayers(v, board).filter((p) => !inactive.has(p.playerId));
    const io = { players: fit, board, eventId: id, kickoffUtc: v.kickoffUtc, offers, asOf };
    const td = nflTdRows(io);
    if (!td.length) { refused.push({ contentType: type, variant: id, reason: "NO_TD_ROWS" }); continue; }
    const shown = [...(market ? [market] : []), ...td.filter((r) => r.quote).map((r) => ({ quotedAt: r.quote.capturedAt }))];
    const tdMissing = td.filter((r) => !r.quote);
    const age = quoteAgeOf(shown, asOf);
    const byTeam = new Map([[away.abbr, away], [home.abbr, home]]);
    const game = { ...nflCardGame(v, g), market, kickoffText: kickoffEst(t) };
    const chip = `NFL · ${chipDay(t)} · ${etClock(t)}`;
    const cards = [
      ...v2Cards([nflHeroCard(game)], "w"),
      ...v2Cards([nflTdCard({ away, home, chip, rows: td.map((r) => ({ ...r, team: byTeam.get(r.teamAbbr) })) })], "t"),
    ].map((c, i) => ({ ...c, name: `nfl-w${wk}-game-post-${id}-${i + 1}` }));
    const winnerTeam = g.winner === v.home.abbr ? v.home : v.away;
    const gaps = [...(market ? [] : [staleMarket ? "STALE_WINNER_PRICE" : "NO_WINNER_PRICE"]), ...(td.length < NFL_TD_CANDIDATES ? [`TD_ROWS_${td.length}`] : []), ...(tdMissing.length ? [`NO_TD_PRICE_${tdMissing.length}`] : []), ...(age.stale ? [`STALE_QUOTES_${age.oldestAgeHours}H`] : [])];
    posts.push(withSendWindow({
      ...w, contentType: type, designVersion: NFL_GAME_POST_DESIGN_VERSION, title: `${g.matchup}: game post`, cards, containsMarketData: age.quotes > 0,
      disclosures: [...new Set([...(age.quotes ? [QUOTE_DISCLOSURE] : []), ...w.disclosures])],
      snapshotRefs: [...new Map([...w.snapshotRefs, ref(rel), ...(age.quotes ? captures.refs : [])].map((r) => [r.ref, r])).values()],
      captionGame: { awayName: v.away.name, homeName: v.home.name, winnerName: winnerTeam.name, winnerPct: `${g.winner === v.home.abbr ? game.homePct : game.awayPct}%` }, extraClaims: ccWeek(week),
      checks: [...new Set([...w.checks, "exactly 2 images: priced winner card, separate Top 3 anytime TD card", "TD card prints the verified Yes price only, never over/under", "no TD on the winner card", "no props graphic", "no OUT, injured or questionable player named", "no implied chance computed", "prices read from one book, never inferred"])],
      ...validationOf(null), content: { week, window: nflWindow(t), winner: { eventId: g.eventId, winner: g.winner }, availabilityCaveats: board.players.filter((p) => !fit.includes(p)).map((p) => ({ playerId: p.playerId, name: p.name, status: p.participation })), game: g, imageTypes: [market ? "WINNER_PRICED" : "WINNER_NO_PRICE", "TOP_TD"], tdCandidates: td.map((r) => ({ playerId: r.playerId, name: r.name, teamAbbr: r.teamAbbr, pct: r.pct, value: r.value, yesPrice: r.quote?.price ?? null, book: r.quote?.book ?? null, quotedAt: r.quote?.capturedAt ?? null, missingReason: r.reason })), impliedProbability: "NOT_SHOWN", market: market ? { side: market.sideAbbr, book: market.book, price: market.price, quotedAt: market.quotedAt } : null, quoteAge: age, gaps, estimate: false, socialAuthorized: false },
    }, shown.map((q) => q.quotedAt)));
  }
  return { posts, refused };
}

const NBA_TOP5 = Object.freeze(["pts", "reb", "ast"]);
const STAT_MARKETS = NBA_TOP5;
const startedIdsAt = (rows, asOf) => (rows ?? []).filter((r) => r.statusRaw !== "STATUS_SCHEDULED" && Date.parse(r.capturedAt) <= Date.parse(asOf)).map((r) => r.providerEventId);

/** Points, rebounds, assists from the official lane through the site's own gate. Throws when there is no lane. */
export function prepareNbaTop5({ date, asOf, lineDoc = null }) {
  assertAsOf(asOf);
  const rel = `data/nba/experimental-public/${date}.json`;
  const lane = readPublic(rel);
  if (!lane) throw new Error(`no NBA lane for ${date}: no Top 5 is made without a published lane`);
  const gate = gateLaneTopBoards(lane, { dated: lane, nowIso: asOf, startedIds: startedIdsAt(readPublic("data/nba/results/latest.json")?.rows, asOf) });
  if (gate?.state !== "PUBLISHED") throw new Error(`NBA ${date} Top 5 gate: ${gate?.reason ?? "closed"} ${gate?.problems?.slice(0, 3).join("; ") ?? ""}`);
  const posts = NBA_TOP5.map((k) => {
    const b = gate.doc.boards.find((x) => x.key === k);
    if (b.state !== "RANKED") throw new Error(`NBA ${date} ${k}: ${b.reason}`);
    const lineRows = new Map((lineDoc?.rows ?? []).filter((x) => x.identity.market === k).map((x) => [String(x.identity.playerId), x]));
    const rows = b.rows.map((r) => ({ line: top5LineOf(lineRows.get(String(r.providerAthleteId))), key: r.providerAthleteId, rank: r.rank, name: r.name, team: r.team, opponent: r.opponent, kickoffUtc: r.tipUtc, value: r.value, text: laneDisplay(r.value), meta: `${r.matchup} · ${timeOnly(instant(r.tipUtc))} ET` }));
    const shownLines = rows.filter((r) => r.line).map((r) => lineRows.get(String(r.key)));
    for (const r of rows) if (r.line && lineRows.get(String(r.key)).model?.display !== undefined && Number(lineRows.get(String(r.key)).model.value) !== Number((Math.round(r.value * 10) / 10).toFixed(1))) throw new Error(`${r.name}: line export median differs from the board`);
    const first = Math.min(...rows.map((r) => instant(r.kickoffUtc)));
    const cards = finishCards([top5Card({ name: `nba-${date}-top5-${k}`, title: `TOP 5 ${b.label.toUpperCase()}`, sub: `NBA · ${longDay(first)} · Highest model projection`, rows, foot: [b.methodText.replace(/ \(the middle.*?\)/, ""), ...(shownLines.length ? [BOX_FOOTER.disclaimer, FOOT.responsible] : [`${FOOT.projections} ${FOOT.noLines}`, legalLine])] })]);
    const caption = checkCaption(`GameTime Picks NBA top 5 projected ${b.label.toLowerCase()} for ${longDay(first)}: ${rows.map((r) => `${r.rank}. ${r.name} ${r.text}`).join(", ")}. ${FOOT.projections} ${legalLine}`);
    return {
      sport: "nba", date, contentType: CONTENT_TYPE.NBA_DAILY_TOP5, variant: k, cards, caption, snapshotRefs: [ref(rel)], eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: DISCLOSE, title: `NBA top 5 ${b.label.toLowerCase()} ${date}`, firstStartUtc: toIso(first),
      ccCaption: `NBA top 5 projected ${b.label.toLowerCase()} tonight. Model projections.`, extraClaims: [{ key: "topN", display: "5", evidenceRef: rel }],
      checks: ["gateLaneTopBoards PUBLISHED (provenance + cross-page)", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(first) }, recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed",
      freshness: { asOf, sourceGeneratedAt: lane.generatedAt, ageHours: ageHours(asOf, lane.generatedAt), expiresAt: toIso(first), rule: "valid until first tip-off" },
      content: { board: k, source: b.source, linesShown: shownLines.length, quotedAt: shownLines.length ? quoteRangeText(shownLines) : null, rows: rows.map(({ key: _k, meta: _m, ...r }) => r), excludedForInjury: gate.doc.excluded.length },
    };
  });
  return { posts, refused: [] };
}

/** PTS, REB and AST real-line boards as one swipeable package. The three separate packages stay. */
/** Rows a Top 5 board still shows after flagged projections are left off. */
export const top5ShownRows = (p) => Object.keys(p.cards[0].cells ?? {}).filter((k) => /^\d+\.num$/.test(k)).length;

/**
 * `minRows`: a board showing fewer rows is left out of the carousel (default 0 keeps all; the Nov 4 runner skips boards under 5
 * until the founder rules on thin boards). A carousel with no board left is refused.
 */
export function nbaTop5Carousel({ posts, date, minRows = 0 }) {
  const type = CONTENT_TYPE.NBA_TOP5_CAROUSEL;
  // Without verified lines only the projection boards exist (`pts-model`); the carousel takes those (rehearsal 2026-11-03).
  const board = (k) => posts.find((p) => p.contentType === CONTENT_TYPE.NBA_DAILY_TOP5 && p.variant === k);
  const all = NBA_TOP5.map((k) => board(k) ?? board(`${k}-model`));
  const missing = NBA_TOP5.filter((_, i) => !all[i]);
  if (missing.length) return { posts: [], refused: [{ contentType: type, reason: "MISSING_BOARD", boards: missing }] };
  const keys = NBA_TOP5.filter((_, i) => top5ShownRows(all[i]) >= minRows);
  const thin = NBA_TOP5.filter((k) => !keys.includes(k));
  const parts = keys.map((k) => all[NBA_TOP5.indexOf(k)]);
  const skipped = thin.length ? [{ contentType: type, reason: "THIN_BOARD_SKIPPED", boards: thin, minRows }] : [];
  if (!parts.length) return { posts: [], refused: skipped };
  const [p0] = parts;
  const firstMs = Math.min(...parts.map((p) => instant(p.firstStartUtc)));
  const firstUtc = toIso(firstMs);
  const opener = parts.find((p) => p.firstStartUtc === firstUtc);
  const check = parts.some((p) => p.anomalyCheck === "REVIEW") ? "REVIEW" : "PASS";
  const anomalies = [...new Map(parts.flatMap((p) => p.anomalies ?? []).map((a) => [`${a.playerId}:${a.market}`, a])).values()];
  const NAMES = { pts: "points", reb: "rebounds", ast: "assists" };
  const listed = keys.map((k) => NAMES[k]);
  const cc = `NBA top 5 projected ${listed.length > 1 ? `${listed.slice(0, -1).join(", ")} and ${listed.at(-1)}` : listed[0]} tonight.`;
  return { posts: [{
    ...p0, contentType: type, variant: null, title: `NBA top 5 carousel ${date}`, firstStartUtc: firstUtc, window: opener.window, recommended: opener.recommended, freshness: opener.freshness,
    cards: parts.map((p, i) => ({ ...p.cards[0], name: `nba-${date}-top5-carousel-${keys[i]}`, cells: Object.fromEntries(Object.entries(p.cards[0].cells).map(([k, x]) => [/^\d+\.num$/.test(k) ? `${k.slice(0, -4)}.${keys[i]}` : `${keys[i]}.${k}`, x])) })), caption: pregameCaption(cc), ccCaption: cc, ccCaptionB: cc,
    anomalyCheck: check, anomalies, disclosures: [...new Set(parts.flatMap((p) => p.disclosures))], snapshotRefs: [...new Map(parts.flatMap((p) => p.snapshotRefs).map((r) => [r.ref, r])).values()], checks: [...new Set([...parts.flatMap((p) => p.checks), `images in order: ${keys.map((k) => k.toUpperCase()).join(", ")}`, "anomalyCheck is the worst of the boards shown"])],
    content: { boards: keys, skippedThin: thin, parts: parts.map((p) => p.content), anomalyChecks: Object.fromEntries(parts.map((p, i) => [keys[i], p.anomalyCheck ?? null])), socialAuthorized: false },
  }], refused: skipped };
}

/** One package per game from the box-score set, already validated by prepareNbaLineGraphics. */
export function boxscorePosts({ doc, cards, captions }, { date, asOf, laneRef }) {
  if (doc.socialAuthorized !== false) throw new Error("box-score packages are founder review only");
  const games = Object.entries(captions.games).map(([eventId, g]) => {
    const rows = doc.rows.filter((r) => String(r.identity.eventId) === eventId);
    const tip = rows[0].identity.tipUtc;
    const t = instant(tip);
    const own = cards.filter((c) => c.eventId === eventId).map((c) => ({ ...c, cells: Object.fromEntries(c.rowIds.map((id) => [id, doc.rows.find((r) => r.rowId === id)?.model.display ?? ""])) }));
    return {
      sport: "nba", date, contentType: CONTENT_TYPE.NBA_BOXSCORE, variant: eventId, eventId, firstStartUtc: toIso(t), title: `${g.matchup}: projected box score`, cards: own, caption: g.cards[0].caption,
      ccCaption: `${g.matchup} projected stat lines. Model projections.`, ccCaptionB: `${g.matchup} stat line projections.`, snapshotRefs: [laneRef], eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: [BOX_FOOTER.disclaimer, FOOT.responsible],
      checks: ["prepareNbaLineGraphics: export contract, card == export rows, captions"], window: { opensAt: asOf, closesAt: toIso(t) }, recommended: recommendedPostTime({ games: [{ kickoffUtc: tip }], afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed",
      freshness: { asOf, sourceGeneratedAt: doc.asOf, ageHours: ageHours(asOf, doc.asOf), expiresAt: toIso(t), rule: "valid until tip-off" },
      content: { matchup: g.matchup, quotedAt: quoteRangeText(rows), comparedRows: rows.length, testData: doc.artifact?.testData === true, socialAuthorized: false },
    };
  });
  return games;
}

/** Runs only with the display key in env; reuses the line renderer's own validation. */
export function prepareNbaBoxscore({ date, asOf, env = process.env }) {
  assertAsOf(asOf);
  if (!env.GTP_ODDS_DISPLAY_KEY) return { posts: [], refused: [{ contentType: CONTENT_TYPE.NBA_BOXSCORE, reason: "NO_DISPLAY_KEY" }] };
  const prepared = prepareNbaLineGraphics({ date, asOf, purpose: PURPOSE_ARG["founder-review"], env, template: "boxscore" });
  return { posts: boxscorePosts(prepared, { date, asOf, laneRef: ref(`data/nba/experimental-public/${date}.json`) }), refused: [] };
}

/* ───────────────────────────── anomaly check inputs ───────────────────────────── */

const NBA_RESEARCH = () => path.resolve(APP, "..", "data", "internal", "research", "nba");

/** Committed graded rows, prior lanes, box scores and the window starter rates the pure check reads. */
export function loadAnomalyInputs(date) {
  const research = NBA_RESEARCH();
  const latest = new Map();
  for (const l of fs.readFileSync(path.join(research, "prop-grades/v0.1/ledger.jsonl"), "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); latest.set(r.key, r); }
  const dir = path.join(PUBLIC(), "data/nba/experimental-public");
  const priorLanes = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < date).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const boxByEvent = new Map();
  for (const g of priorLanes.flatMap((x) => x.games ?? [])) {
    const f = path.join(research, "experimental/boxscores", `${g.providerEventId}.json`);
    if (fs.existsSync(f)) boxByEvent.set(String(g.providerEventId), JSON.parse(fs.readFileSync(f, "utf8")));
  }
  const fc = path.join(research, "experimental-v0.1/forecasts", `${date}.json`);
  const windowStarterRate = new Map((fs.existsSync(fc) ? JSON.parse(fs.readFileSync(fc, "utf8")).games : []).flatMap((g) => ["home", "away"].flatMap((s) => g.forecast.players[s].map((p) => [String(p.providerAthleteId), p.starterRate]))));
  return { thresholds: reviewThresholds([...latest.values()]), history: laneHistory(priorLanes, boxByEvent), windowStarterRate };
}

/* ───────────────────────────── NBA game day, established design ───────────────────────────── */

// NBA game-day publish suggestions (founder, 2026-11-04): about an hour before tip so bettors have time. Winner posts at tip
// - 60 min, stat posts at tip - 57 min (just after the winner), NBA Today at 17:00 ET on the slate date. Windows and expiry
// are unchanged; a suggestion that is not before the first tip or already past becomes no suggestion, as before.
export const NBA_LEAD = Object.freeze({ winnerMin: 60, statsMin: 57, todayEt: "17:00" });
const NBA_REC_NOTE = "the hour before tip-off has passed";
/** UTC ms of a wall-clock HH:MM in America/New_York on an ET date (DST-safe: the offset is checked, not assumed). */
export function etClockUtc(date, hhmm) {
  const [y, m, d] = date.split("-").map(Number); const [hh, mm] = hhmm.split(":").map(Number);
  for (const off of [4, 5]) { const t = Date.UTC(y, m - 1, d, hh + off, mm); if (etDate(t) === date && new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t)) === hhmm) return t; }
  throw new Error(`etClockUtc: no ${hhmm} ET on ${date}`);
}
/** NBA Today: 17:00 ET on the slate date when that is before the first tip, else the winner lead; null once past. */
export function nbaTodayRecommended({ date, firstMs, asOf }) {
  const want = etClockUtc(date, NBA_LEAD.todayEt);
  const at = want < firstMs ? want : firstMs - NBA_LEAD.winnerMin * 60e3;
  return at > instant(asOf) ? { recommendedAt: toIso(at), recommendedAtEt: etLabel(at), firstGameUtc: toIso(firstMs), firstGameEt: etLabel(firstMs), slateEtDate: date, rule: `${NBA_LEAD.todayEt} ET on the slate date` } : null;
}

/** Pregame caption rules: 280 weighted, no dash, no percentage. */
const pregameCaption = (t) => { if (/%|[—–]|\bedge\b/i.test(t) || xWeighted(t) > 280) throw new Error(`pregame caption refused: ${t}`); return t; };
const statOf = (r, k) => (r.medians?.[k] == null ? "-" : Number(r.medians[k]).toFixed(1));
const injuryTag = (s) => (!s ? "" : /day/i.test(s) ? " DTD" : ` ${String(s).slice(0, 3).toUpperCase()}`);
const canonicalSlate = (date) => [...new Map(fs.readdirSync(path.join(PUBLIC(), "data/nba/schedule")).filter((f) => f.endsWith(".json")).sort().flatMap((f) => (readPublic(`data/nba/schedule/${f}`)?.rows ?? []).map((r) => [String(r.providerEventId), r]))).values()].filter((r) => etDate(instant(r.dateUtc)) === date && !/POSTPONED|CANCELED|CANCELLED/.test(String(r.statusRaw)));

/**
 * The whole NBA game-day library for one date. `lineDoc` (validated gtp-graphics-export@2) adds the real-line versions.
 * Returns posts, refused and the per-event coverage.
 */
export function prepareGameDay({ date, asOf, lineDoc = null, laneOverride = null, anomalyInputs = null, moneyline = null }) {
  assertAsOf(asOf);
  const rel = `data/nba/experimental-public/${date}.json`;
  const lane = laneOverride ?? readPublic(rel);
  const schedule = canonicalSlate(date);
  const coverage = new Map(schedule.map((r) => [String(r.providerEventId), { eventId: String(r.providerEventId), away: r.away?.abbr, home: r.home?.abbr, tipUtc: r.dateUtc, forecastAvailable: false, playerCount: 0, comparisonCount: 0, winnerGraphic: "MISSING", statGraphic: "MISSING", render: "NOT_RENDERED", validation: "NOT_RUN", reasonMissing: "no published lane row" }]));
  if (!lane?.games?.length) return { posts: [], refused: [{ job: "nba-game-day", reason: `no NBA lane for ${date}` }], coverage: [...coverage.values()] };
  const laneRef = laneOverride ? { ref: rel, sha256: sha(JSON.stringify(lane)) } : ref(rel);
  const refs = [laneRef];
  const posts = []; const refused = [];
  const lineFor = new Map((lineDoc?.rows ?? []).map((r) => [`${r.identity.playerId}:${r.identity.market}`, r]));
  const fresh = (first) => ({ asOf, sourceGeneratedAt: lane.generatedAt, ageHours: ageHours(asOf, lane.generatedAt), expiresAt: toIso(first), rule: "valid until tip-off" });
  const META = { designVersion: DESIGN_VERSION, eligibilityClass: ELIGIBILITY.ESTIMATE, sport: "nba", date, snapshotRefs: refs, checks: ["lane through eloWinProbabilityOf", "card cells == validated text", "fit pass"] };
  const inputs = anomalyInputs ?? loadAnomalyInputs(date);
  const rowsAll = laneRows(lane);
  const modelCheck = runAnomalyCheck({ rows: rowsAll, ...inputs });
  const realCheck = lineDoc ? runAnomalyCheck({ rows: rowsAll, ...inputs, lines: lineDoc.rows.filter((r) => r.market?.line?.state === "SHOWN").map((r) => ({ playerId: String(r.identity.playerId), market: r.identity.market, line: r.market.line.value, team: r.identity.team ?? null })) }) : null;
  const games = [];
  for (const g of lane.games) {
    const id = String(g.providerEventId);
    const t = instant(g.tipUtc);
    const cov = coverage.get(id) ?? { eventId: id, away: g.away.abbr, home: g.home.abbr, tipUtc: g.tipUtc, comparisonCount: 0, render: "NOT_RENDERED", validation: "NOT_RUN", winnerGraphic: "MISSING", statGraphic: "MISSING", notInSchedule: true };
    coverage.set(id, cov);
    cov.forecastAvailable = true; cov.reasonMissing = null;
    cov.playerCount = (g.players?.away?.length ?? 0) + (g.players?.home?.length ?? 0);
    if (!(t > Date.parse(asOf))) { cov.reasonMissing = "GAME_STARTED"; continue; }
    const wp = eloWinProbabilityOf(g);
    if (!wp) { cov.reasonMissing = "ESTIMATE_ACCESSOR_REFUSED"; continue; }
    const away = teamOf(g.away.abbr, g.away.name); const home = teamOf(g.home.abbr, g.home.name);
    const winner = g.elo.state === "FAVOURED" ? (g.elo.favoured === home.abbr ? home : away) : null;
    games.push({ eventId: id, raw: g, cov, t, away, home, winner, awayP: wp.away, homeP: wp.home, awayPct: wp.awayPct, homePct: wp.homePct, tipTime: etClock(t), tipDay: weekdayLong(t), chip: `NBA · ${chipDay(t)} · ${etClock(t)}` });
  }
  if (!games.length) return { posts, refused: [{ job: "nba-game-day", reason: "no pregame game" }], coverage: [...coverage.values()] };
  games.sort((a, b) => a.t - b.t || a.away.abbr.localeCompare(b.away.abbr));
  const first = games[0].t;
  const chip = `NBA · ${chipDay(first)}`;
  const pkgDisc = ["Estimate from the team rating, not a validated probability", DISCLOSURE];
  const claimGames = [{ key: "games", display: String(games.length), evidenceRef: rel }];
  const tonightCap = pregameCaption(`NBA tonight: ${games.length} games. Model projection: the predicted winner of each.`);
  posts.push({ ...META, contentType: CONTENT_TYPE.NBA_TONIGHT, variant: null, cards: v2Cards([tonightCard({ games, chip, kicker: `NBA ${slateWord(first) === "today" ? "Today" : "Tonight"}` })], `nba-${date}-tonight`), caption: tonightCap, ccCaption: tonightCap, ccCaptionB: `NBA tonight, ${games.length} games. Model projection on the image.`, extraClaims: claimGames, disclosures: pkgDisc, title: `NBA tonight ${date}`, firstStartUtc: toIso(first), window: { opensAt: asOf, closesAt: toIso(first) }, recommended: nbaTodayRecommended({ date, firstMs: first, asOf }), recommendedNote: NBA_REC_NOTE, freshness: fresh(first), content: { games: games.map((g) => ({ eventId: g.eventId, away: g.away.abbr, home: g.home.abbr, tipUtc: g.raw.tipUtc, winner: g.winner?.abbr ?? null, awayEstimate: g.awayP, homeEstimate: g.homeP })) } });
  for (const g of games) {
    const m = `${g.away.abbr} @ ${g.home.abbr}`;
    const captionGame = { awayName: g.away.name, homeName: g.home.name, winnerNickname: g.winner?.nickname ?? null };
    g.captionGame = captionGame;
    const win = (cards, o) => ({ ...META, captionGame, firstStartUtc: toIso(g.t), eventId: g.eventId, window: { opensAt: asOf, closesAt: toIso(g.t) }, recommended: recommendedPostTime({ games: [{ kickoffUtc: g.raw.tipUtc }], afterEtDate: dayBefore(date), asOf, leadMs: NBA_LEAD.winnerMin * 60e3 }), recommendedNote: NBA_REC_NOTE, freshness: fresh(g.t), cards, ...o });
    const wc = (g.winner ? `${m}. Model projection: ${g.winner.nickname} to win.` : `${m}. Model projection: no side.`);
    try {
      posts.push(win(v2Cards([winnerCard(g)], `nba-${date}-winner-${g.eventId}`), { contentType: CONTENT_TYPE.NBA_GAME_WINNER, variant: g.eventId, title: `${m}: game winner prediction`, caption: pregameCaption(wc), ccCaption: wc, ccCaptionB: `${m}: model projection on the image.`, disclosures: pkgDisc, content: { game: { eventId: g.eventId, winner: g.winner?.abbr ?? null, awayEstimate: g.awayP, homeEstimate: g.homeP, moneyline: "NOT_CAPTURED" } } }));
      g.cov.winnerGraphic = "PREPARED";
      // A flagged player-market renders as "-", never a number (rehearsal 2026-11-03 found 2 AST cells printed).
      const withheld = withheldKeys(modelCheck.anomalies);
      const players = (side, withLines) => (g.raw.players?.[side] ?? []).slice().sort((a, b) => (b.medians?.pts ?? -1) - (a.medians?.pts ?? -1) || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId))).map((r) => ({
        id: String(r.providerAthleteId), name: `${r.name}${injuryTag(r.injuryStatus)}`, ...Object.fromEntries(["pts", "reb", "ast"].map((k) => [k, withheld.has(`${r.providerAthleteId}.${k}`) ? "-" : statOf(r, k)])),
        lines: withLines ? Object.fromEntries(["pts", "reb", "ast"].map((k) => [k, lineBlock(lineFor.get(`${r.providerAthleteId}:${k}`))])) : null,
      }));
      const spec = { away: g.away, home: g.home, chip: g.chip };
      const sc = `${m} projected stat lines from the model.`;
      const gameIds = [...g.raw.players.away, ...g.raw.players.home].map((p) => p.providerAthleteId);
      const cardsM = v2Cards(statPages({ ...spec, awayPlayers: players("away", false), homePlayers: players("home", false) }), `nba-${date}-stats-${g.eventId}`);
      posts.push(win(cardsM, { ...anomaliesFor(modelCheck, gameIds, STAT_MARKETS), contentType: CONTENT_TYPE.NBA_PLAYER_STATS, variant: g.eventId, recommended: recommendedPostTime({ games: [{ kickoffUtc: g.raw.tipUtc }], afterEtDate: dayBefore(date), asOf, leadMs: NBA_LEAD.statsMin * 60e3 }), eligibilityClass: ELIGIBILITY.OFFICIAL, title: `${m}: projected stat lines`, caption: pregameCaption(sc), ccCaption: sc, ccCaptionB: `${m} stat line projections.`, disclosures: [DISCLOSURE], content: { players: g.cov.playerCount, parts: cardsM.length, containsLines: false } }));
      g.cov.statGraphic = "PREPARED";
      if (lineDoc) {
        const rows = lineDoc.rows.filter((r) => String(r.identity.eventId) === g.eventId && !nbaExcluded().has(String(r.identity.playerId)));
        g.cov.comparisonCount = rows.length;
        for (const r of rows) { const lr = [...g.raw.players.away, ...g.raw.players.home].find((p) => String(p.providerAthleteId) === String(r.identity.playerId)); if (lr && ["pts", "reb", "ast"].includes(r.identity.market) && Number(r.model.display) !== Number(lr.medians[r.identity.market]?.toFixed?.(1) ?? lr.medians[r.identity.market])) throw new Error(`${r.rowId}: export median differs from the lane`); }
        if (rows.length) {
          const cardsR = v2Cards(statPages({ ...spec, real: true, awayPlayers: players("away", true), homePlayers: players("home", true) }), `nba-${date}-box-${g.eventId}`);
          posts.push(win(cardsR, { ...anomaliesFor(realCheck, gameIds, STAT_MARKETS), contentType: CONTENT_TYPE.NBA_BOXSCORE, variant: g.eventId, eligibilityClass: ELIGIBILITY.OFFICIAL, containsMarketData: true, title: `${m}: projected box score`, caption: pregameCaption(sc), ccCaption: sc, ccCaptionB: `${m} stat line projections.`, disclosures: [DISCLOSURE], snapshotRefs: [...refs, { ref: "gtp-graphics-export@2", sha256: sha(JSON.stringify(rows)) }], content: { quotedAt: quoteRangeText(rows), comparedRows: rows.length, testData: lineDoc.artifact?.testData === true, socialAuthorized: false } }));
        } else g.cov.reasonMissing = "no compared line for this game";
      }
      g.cov.validation = "PASSED";
    } catch (e) { g.cov.validation = "FAILED"; g.cov.reasonMissing = e.message; refused.push({ job: `nba-game-${g.eventId}`, reason: e.message }); }
  }
  const gate = gateLaneTopBoards(lane, { dated: lane, nowIso: asOf, startedIds: startedIdsAt(readPublic("data/nba/results/latest.json")?.rows, asOf) });
  if (gate?.state !== "PUBLISHED") refused.push({ job: "nba-top5", reason: gate?.reason ?? "gate closed" });
  else for (const k of NBA_TOP5) {
    const b = gate.doc.boards.find((x) => x.key === k);
    if (b.state !== "RANKED") { refused.push({ job: `nba-top5-${k}`, reason: b.reason }); continue; }
    const byAbbr = new Map(games.flatMap((g) => [[g.away.abbr, g.away], [g.home.abbr, g.home]]));
    const rows = b.rows.map((r) => ({ key: r.providerAthleteId, rank: r.rank, name: r.name, team: byAbbr.get(r.team), opponent: r.opponent, tip: etClock(instant(r.tipUtc)), text: Number(r.value).toFixed(1), value: r.value, line: top5LineOf(lineFor.get(`${r.providerAthleteId}:${k}`)), kickoffUtc: r.tipUtc }));
    const f = Math.min(...rows.map((r) => instant(r.kickoffUtc)));
    const cap = `Top 5 projected ${b.label.toLowerCase()} in the NBA tonight, from our model.`;
    const base = (o) => ({ ...META, slateGames: games.length, contentType: CONTENT_TYPE.NBA_DAILY_TOP5, eligibilityClass: ELIGIBILITY.OFFICIAL, title: `NBA top 5 ${b.label.toLowerCase()} ${date}`, firstStartUtc: toIso(f), caption: pregameCaption(cap), ccCaption: cap, ccCaptionB: `NBA top 5 ${b.label.toLowerCase()} tonight.`, extraClaims: [{ key: "topN", display: "5", evidenceRef: rel }], window: { opensAt: asOf, closesAt: toIso(f) }, recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", freshness: fresh(f), ...o });
    const content = rows.map(({ team, line: _l, ...r }) => ({ ...r, team: team.abbr }));
    const ids = rows.map((r) => r.key);
    // A flagged projection is left off, never printed; the board keeps the site's ranks and says so (2026-11-02 founder-cleared carousel; rehearsal 2026-11-03 found 7 printed).
    const withheld = withheldKeys(modelCheck.anomalies);
    const shownRows = rows.filter((r) => !withheld.has(`${r.key}.${k}`));
    const held = shownRows.length < rows.length ? { kicker: "Model Projection", sub: "Some projections are held for review." } : { kicker: "Model Projection" };
    posts.push(base({ ...anomaliesFor(modelCheck, ids, [k]), variant: `${k}-model`, cards: v2Cards([v2Top5Card({ title: b.label, chip, rows: shownRows, ...held })], `nba-${date}-top5-${k}-model`), disclosures: [DISCLOSURE], content: { board: k, rows: content, ranking: "projection only" } }));
    if (lineDoc) posts.push(base({ ...anomaliesFor(realCheck, ids, [k]), variant: k, containsMarketData: true, cards: v2Cards([v2Top5Card({ title: b.label, chip, rows, real: true, section: MODEL_SECTION, note: rows.some((r) => r.line) ? COMPARISON_LEGEND : null })], `nba-${date}-top5-${k}`), disclosures: [DISCLOSURE], content: { board: k, rows: content, ranking: "projection only", lines: { shown: rows.filter((r) => r.line).length, missing: rows.filter((r) => !r.line).map((r) => ({ playerId: r.key, name: r.name, reason: top5Reason(lineFor.get(`${r.key}:${k}`)) })) }, quotedAt: quoteRangeText(rows.map((r) => lineFor.get(`${r.key}:${k}`)).filter(Boolean)) } }));
  }
  if (lineDoc) { const c = nbaTop5Carousel({ posts, date }); posts.push(...c.posts); refused.push(...c.refused); }
  let moneylineMatch = null;
  if (moneyline) { moneylineMatch = moneylinePosts({ games, schedule, moneyline, date, asOf, META, refs }); posts.push(...moneylineMatch.posts); refused.push(...moneylineMatch.refused); moneylineMatch = moneylineMatch.match; }
  const gamePosts = gamePostsFrom({ games, posts, date, evidenceRef: rel, hasLines: Boolean(lineDoc), hasMoneyline: Boolean(moneyline) });
  posts.push(...gamePosts.posts); refused.push(...gamePosts.refused);
  for (const g of games) if (g.cov.validation === "PASSED") g.cov.render = "PENDING";
  const quotes = [...(lineDoc?.rows ?? []).filter((r) => r.market?.line?.state === "SHOWN").map((r) => ({ eventId: String(r.identity.eventId), quotedAt: r.market?.quotedAt?.iso ?? null })), ...posts.filter((p) => p.contentType === CONTENT_TYPE.NBA_GAME_WINNER && p.content.quotedAt).map((p) => ({ eventId: p.eventId, quotedAt: p.content.quotedAt }))];
  for (const q of quoteAgeFlags(quotes, Date.parse(asOf), LINE_MAX_AGE_HOURS)) { const c = coverage.get(q.eventId); if (c) c.quoteAge = q; }
  for (const c of coverage.values()) c.quoteAge ??= { quotes: 0, stale: false, note: "no line or price on this event's cards" };
  const lineIso = (rows) => rows.map((r) => r?.market?.quotedAt?.iso).filter(Boolean);
  const quoteTimesOf = (p) => {
    if (!p.containsMarketData) return [];
    const c = p.content;
    const event = p.eventId ? lineIso((lineDoc?.rows ?? []).filter((r) => String(r.identity.eventId) === String(p.eventId))) : [];
    const shownIds = new Set(p.cards.flatMap((x) => Object.keys(x.cells).map((k) => k.replace(/^(pts|reb|ast)\./, "").split(".")[0])));
    const boards = !p.eventId ? lineIso((lineDoc?.rows ?? []).filter((r) => shownIds.has(String(r.identity.playerId)) && (p.contentType !== CONTENT_TYPE.NBA_DAILY_TOP5 || r.identity.market === p.variant))) : [];
    return [c.quotedAt, c.winner?.quotedAt, ...(c.games ?? []).map((g) => g.quotedAt), ...event, ...boards].filter((q) => Number.isFinite(Date.parse(q)));
  };
  return { posts: posts.map((p) => (p.contentType === CONTENT_TYPE.NBA_GAME_POST || p.contentType === CONTENT_TYPE.NBA_TOP5_CAROUSEL || (p.contentType === CONTENT_TYPE.NBA_TONIGHT) ? withSendWindow(p, quoteTimesOf(p)) : p)), refused, coverage: [...coverage.values()], moneylineMatch };
}

const BOOK_LABEL = (k) => NBA_PROP_LINE_ADAPTER.bookLabel(k);
const ML_CAPTION = (t) => t;

/**
 * Priced versions of the winner cards from one saved capture. `moneyline`: { doc, ref }. Every game needs a schedule row, one
 * provider event and a clean quote for the predicted team, or it gets no price and is listed as refused.
 */
export function moneylinePosts({ games, schedule, moneyline, date, asOf, META, refs }) {
  const { doc, ref: source } = moneyline;
  const row = new Map(schedule.map((r) => [String(r.providerEventId), r]));
  const known = games.filter((g) => row.has(g.eventId) && row.get(g.eventId).away?.abbr === g.away.abbr && row.get(g.eventId).home?.abbr === g.home.abbr);
  const match = matchMoneylineEvents({ games: known.map((g) => ({ eventId: g.eventId, awayName: g.raw.away.name, homeName: g.raw.home.name, tipUtc: g.raw.tipUtc })), events: doc.events, date });
  const refused = [...games.filter((g) => !known.includes(g)).map((g) => ({ eventId: g.eventId, reason: "NOT_ON_CANONICAL_SCHEDULE" })), ...match.unmatched].map((x) => ({ contentType: CONTENT_TYPE.NBA_GAME_WINNER, variant: `${x.eventId}-ml`, reason: x.reason }));
  const posts = []; const priced = []; const fails = new Set(refused.map((r) => r.variant.replace(/-ml$/, "")));
  const mlRefs = [...refs, source];
  const closes = (tipMs, quotedAt) => Math.min(tipMs, Date.parse(quotedAt) + LINE_MAX_AGE_HOURS * 3600000);
  const fresh = (closeMs, quotedAt) => ({ asOf, sourceGeneratedAt: doc.fetchedAt, ageHours: ageHours(asOf, quotedAt), expiresAt: toIso(closeMs), rule: `valid until tip-off, at most ${LINE_MAX_AGE_HOURS} hours after the quote` });
  for (const g of games) {
    const hit = match.matched.get(g.eventId);
    if (!hit) continue;
    const m = `${g.away.abbr} @ ${g.home.abbr}`;
    const variant = `${g.eventId}-ml`;
    const q = g.winner && observedPrice(hit.event, { awayName: g.raw.away.name, homeName: g.raw.home.name, sideName: g.winner.name, fetchedAt: doc.fetchedAt, tipUtc: g.raw.tipUtc, asOf });
    if (!q) { refused.push({ contentType: CONTENT_TYPE.NBA_GAME_WINNER, variant, reason: g.winner ? "NO_CLEAN_QUOTE" : "NO_PREDICTED_TEAM" }); fails.add(g.eventId); continue; }
    const market = { sideAbbr: g.winner.abbr, priceText: americanText(q.price), bookLabel: BOOK_LABEL(q.book) };
    priced.push({ ...g, market, q, startDeltaMinutes: hit.startDeltaMinutes });
    const close = closes(g.t, q.quotedAt);
    const cap = ML_CAPTION(`🏀 ${g.raw.away.name} at ${g.raw.home.name} tonight! Our model projects the ${g.winner.nickname} to win. Full prediction below 👇`);
    posts.push({
      ...META, captionGame: g.captionGame, snapshotRefs: mlRefs, containsMarketData: true, contentType: CONTENT_TYPE.NBA_GAME_WINNER, variant, eventId: g.eventId, firstStartUtc: toIso(g.t), title: `${m}: game winner prediction with observed price`,
      cards: v2Cards([winnerCard({ ...g, market })], `nba-${date}-winner-${variant}`), caption: pregameCaption(cap), ccCaption: cap, ccCaptionB: `${m}: model projection on the image.`, disclosures: ["Estimate from the team rating, not a validated probability", "Sportsbook price is an observed quote, separate from the model estimate", DISCLOSURE],
      checks: [...META.checks, "matched by team names to the canonical schedule, start confirmed", "price read from one book, never inferred", "no gap between price and estimate computed"],
      window: { opensAt: asOf, closesAt: toIso(close) }, recommended: recommendedPostTime({ games: [{ kickoffUtc: g.raw.tipUtc }], afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", freshness: fresh(close, q.quotedAt),
      content: { eventId: g.eventId, winner: g.winner.abbr, awayEstimate: g.awayP, homeEstimate: g.homeP, marketKey: MONEYLINE_MARKET, book: q.book, bookLabel: market.bookLabel, bookRule: BOOK_RULE, bookOrder: REFERENCE_BOOK_ORDER, side: g.winner.abbr, price: q.price, quotedAt: q.quotedAt, fetchedAt: doc.fetchedAt, sourceFile: source.ref, sourceSha256: source.sha256, providerEventId: hit.event.id, startDeltaMinutes: hit.startDeltaMinutes, socialAuthorized: false },
    });
  }
  if (fails.size) refused.push({ contentType: CONTENT_TYPE.NBA_TONIGHT, variant: "ml", reason: "NOT_EVERY_GAME_PRICED", games: [...fails] });
  else if (priced.length) {
    const firstQuote = priced.map((g) => g.q.quotedAt).sort()[0];
    const close = Math.min(...priced.map((g) => closes(g.t, g.q.quotedAt)), games[0].t);
    const cap = ML_CAPTION(`🏀 Full NBA slate tonight! ${games.length} games and our model's predicted winner in every one, all on one card 👇`);
    posts.push({
      ...META, snapshotRefs: mlRefs, containsMarketData: true, contentType: CONTENT_TYPE.NBA_TONIGHT, variant: "ml", title: `NBA tonight ${date} with observed prices`, firstStartUtc: toIso(games[0].t),
      cards: v2Cards([tonightCard({ games: priced, chip: `NBA · ${chipDay(games[0].t)}`, priced: true })], `nba-${date}-tonight-ml`), caption: pregameCaption(cap), ccCaption: cap, ccCaptionB: `Full NBA slate tonight: ${games.length} games, one card.`, extraClaims: [{ key: "games", display: String(games.length), evidenceRef: refs[0].ref }],
      disclosures: ["Estimate from the team rating, not a validated probability", "Sportsbook prices are observed quotes, separate from the model estimates", DISCLOSURE], checks: [...META.checks, "matched by team names to the canonical schedule, start confirmed", "prices read from one book per game, never inferred"],
      window: { opensAt: asOf, closesAt: toIso(close) }, recommended: recommendedPostTime({ games: games.map((g) => ({ kickoffUtc: g.raw.tipUtc })), afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", freshness: fresh(close, firstQuote),
      content: { bookLabels: [...new Set(priced.map((g) => g.market.bookLabel))], quotedAt: firstQuote, fetchedAt: doc.fetchedAt, bookRule: BOOK_RULE, bookOrder: REFERENCE_BOOK_ORDER, sourceFile: source.ref, sourceSha256: source.sha256, socialAuthorized: false, games: priced.map((g) => ({ eventId: g.eventId, away: g.away.abbr, home: g.home.abbr, tipUtc: g.raw.tipUtc, winner: g.winner.abbr, awayEstimate: g.awayP, homeEstimate: g.homeP, book: g.q.book, side: g.winner.abbr, price: g.q.price, quotedAt: g.q.quotedAt, startDeltaMinutes: g.startDeltaMinutes })) },
    });
  }
  return { posts, refused, match: { matched: match.matched.size, unmatched: match.unmatched, ignored: match.ignored, unused: match.unused } };
}

/**
 * One NBA_GAME_POST per game: the priced winner card, then the real-line stat card(s). Needs the display key and a saved
 * moneyline capture. Cards keep their validated cells; only the file names change, so no two packages share an image.
 */
const availabilityCaveats = (players) => players.filter((p) => p.injuryStatus).map((p) => ({ playerId: String(p.providerAthleteId), name: p.name, status: p.injuryStatus }));
export function gamePostsFrom({ games, posts, date, evidenceRef, hasLines, hasMoneyline }) {
  const type = CONTENT_TYPE.NBA_GAME_POST;
  if (!hasLines || !hasMoneyline) return { posts: [], refused: [{ contentType: type, reason: hasLines ? "NO_MONEYLINE_CAPTURE" : "NO_DISPLAY_KEY" }] };
  const out = []; const refused = [];
  for (const g of games) {
    const ml = posts.find((p) => p.contentType === CONTENT_TYPE.NBA_GAME_WINNER && p.variant === `${g.eventId}-ml`);
    const box = posts.find((p) => p.contentType === CONTENT_TYPE.NBA_BOXSCORE && p.variant === g.eventId);
    const no = (reason) => refused.push({ contentType: type, variant: g.eventId, reason });
    if (!ml) { no("NO_PRICED_WINNER_CARD"); continue; }
    if (!box) { no("NO_REAL_LINE_STAT_CARD"); continue; }
    const cards = [...ml.cards, ...box.cards].map((c, i) => ({ ...c, name: `nba-${date}-game-post-${g.eventId}-${i + 1}` }));
    if (cards.length > GAME_POST_MAX_IMAGES) { no(`TOO_MANY_IMAGES_${cards.length}`); continue; }
    const unifiedDoc = process.env.GTP_NBA_UNIFIED_ROSTER ? JSON.parse(fs.readFileSync(process.env.GTP_NBA_UNIFIED_ROSTER, "utf8")) : null;
    const heldIds = new Set(Object.keys(unifiedDoc?.__cells ?? {}));
    const shownIds = unifiedDoc ? new Set(Object.entries(unifiedDoc).filter(([k]) => !k.startsWith("__")).flatMap(([, v]) => v).map((e) => String(e.id ?? e)).filter((id) => !heldIds.has(id))) : null;
    const pick = selectCaptionPlayers([...g.raw.players.away, ...g.raw.players.home].filter((p) => !shownIds || shownIds.has(String(p.providerAthleteId))), box.anomalies);
    if (pick.players.length < 2) { no("FEWER_THAN_TWO_PLAYERS"); continue; }
    const caption = gamePostCaption({ awayName: g.away.name, homeName: g.home.name, winnerNickname: g.winner.nickname, players: pick.players });
    const extraClaims = gamePostClaims(pick.players, evidenceRef);
    const bad = gamePostCaptionProblems(caption, extraClaims);
    if (bad.length) { no(`CAPTION: ${bad.join("; ")}`); continue; }
    out.push({
      ...ml, captionPlayers: pick.players, designVersion: GAME_POST_DESIGN_VERSION, contentType: type, variant: g.eventId, eligibilityClass: ELIGIBILITY.ESTIMATE, title: `${g.away.abbr} @ ${g.home.abbr}: game post`, cards, caption, ccCaption: caption,
      ccCaptionB: `🏀 ${g.away.nickname} vs ${g.home.nickname} tonight! Our model projects the ${g.winner.nickname} to win. Full predictions below 👇`, extraClaims, containsMarketData: true,
      anomalyCheck: box.anomalyCheck, anomalies: box.anomalies, snapshotRefs: [...new Map([...ml.snapshotRefs, ...box.snapshotRefs].map((r) => [r.ref, r])).values()],
      checks: [...new Set([...ml.checks, ...box.checks, "images in order: priced winner card, real-line stat card(s)", "caption numbers are claims"])],
      content: { eventId: g.eventId, availabilityCaveats: availabilityCaveats([...g.raw.players.away, ...g.raw.players.home]), imageOrder: [ml.variant, box.variant], captionPlayers: { rule: pick.rule, fallback: pick.fallback, fallbackPlayers: pick.fallbackPlayers, players: pick.players.map((p) => ({ playerId: String(p.providerAthleteId), name: p.name, pts: p.medians.pts, reb: p.medians.reb, ast: p.medians.ast })) }, winner: ml.content, lines: box.content, socialAuthorized: false },
    });
  }
  return { posts: out, refused };
}

/* ───────────────────────────── recaps ───────────────────────────── */

const OUTCOME_TEXT = Object.freeze({ CORRECT: "Correct", MISSED: "Missed" });
const EXCLUDED_TEXT = Object.freeze({ NOT_FINAL: "Not final", NO_FROZEN_SIDE: "No side", NO_FROZEN_PROBABILITY: "No side", TIE_VOID: "Tie, void" });

function recapCards(recap, { name, title, sub, foot }) {
  return pagesOf(recap.games).map((chunk, i, all) => {
    const cells = {};
    const stats = i === 0 ? `<div class="stats">${[["GRADED", recap.graded], ["CORRECT", recap.correct], ["MISSED", recap.missed], ["ACCURACY", recap.accuracy]].map(([l, v]) => `<div class="st"><b>${cell(cells, `stat.${l}`, v ?? "n/a", "")}</b><i>${l}</i></div>`).join("")}</div>` : "";
    const body = `<div class="rows">${chunk.map((g) => {
      const score = g.final ? `${g.away} ${g.final.away} @ ${g.home} ${g.final.home}` : g.matchup;
      const side = g.probabilityText ? `Pre-game ${g.frozenSide} ${g.probabilityText}` : g.frozenSide ? `Pre-game ${g.frozenSide}` : "No frozen side";
      const verdict = OUTCOME_TEXT[g.outcome] ?? EXCLUDED_TEXT[g.reason];
      return `<div class="row ${g.outcome === "MISSED" ? "miss" : g.outcome === "EXCLUDED" ? "void" : ""}" style="grid-template-columns:1fr 290px 130px">${cell(cells, `${g.eventId}.final`, score, "g")}${cell(cells, `${g.eventId}.side`, side, "m")}${cell(cells, `${g.eventId}.outcome`, verdict, "r")}</div>`;
    }).join("")}</div>`;
    return { name: `${name}-${i + 1}of${all.length}`, html: pageHtml({ title, sub: `${sub}${all.length > 1 ? ` · ${i + 1} of ${all.length}` : ""}`, stats, body, foot, htmlTitle: name, maxRow: i === 0 ? 92 : 100 }), cells };
  });
}

function recapPost({ recap, name, title, sub, foot, snapshotRefs, nextGames, asOf, sourceGeneratedAt, checks, sportWord }) {
  const recommended = recommendedPostTime({ games: nextGames, afterEtDate: recap.date, asOf });
  const closes = recommended ? recommended.firstGameUtc : toIso(Date.parse(asOf) + 86400000);
  const missed = recap.games.filter((g) => g.outcome === "MISSED").map((g) => g.matchup);
  const caption = checkCaption(`GameTime Picks ${sportWord} results, ${recap.period.label}: the pre-game favored side was correct in ${recap.correct} of ${recap.graded} (${recap.accuracy}). ${denominatorText(recap)}.${missed.length ? ` Missed: ${missed.join(", ")}.` : ""} Verified finals only. ${legalLine}`);
  return {
    eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: ["Verified finals only", "Winner sides only, never combined with a prop record", DISCLOSURE], title: `${sportWord} results ${recap.period.label}`, firstStartUtc: closes, hasMiss: recap.missed > 0,
    ccCaption: `${sportWord} results: ${recap.correct} of ${recap.graded} predicted winners correct.${missed.length ? ` Missed: ${missed.join(", ")}.` : ""}`, ccCaptionB: `${sportWord} results: ${recap.correct} of ${recap.graded} correct.${missed.length ? ` Missed: ${missed.join(", ")}.` : ""}`, extraClaims: [{ key: "scheduled", display: String(recap.gamesScheduled), evidenceRef: "recap" }],
    sport: recap.sport, date: recap.date, contentType: CONTENT_TYPE.RESULTS_RECAP, variant: null, cards: finishCards(recapCards(recap, { name, title, sub, foot })), caption, snapshotRefs, checks,
    window: { opensAt: asOf, closesAt: closes }, recommended, recommendedNote: "no later slate in the committed schedule",
    freshness: { asOf, sourceGeneratedAt, ageHours: ageHours(asOf, sourceGeneratedAt), expiresAt: closes, rule: "valid until the next slate starts" },
    content: { ...recap, recordsCombined: false },
  };
}

export function prepareNbaRecap({ date, asOf }) {
  assertAsOf(asOf);
  const rel = `data/nba/experimental-public/${date}.json`;
  const lane = readPublic(rel);
  if (!lane?.games?.length) return { posts: [], refused: [{ contentType: CONTENT_TYPE.RESULTS_RECAP, sport: "nba", date, reason: "NO_GAMES_OR_NO_LANE" }] };
  const prov = laneProvenance(lane, lane);
  if (prov.length) throw new Error(`NBA ${date} lane provenance: ${prov.join("; ")}`);
  const res = loadCurrentNbaResults({ nowIso: asOf });
  const recap = buildNbaRecap(lane, res.results);
  if (!recap.graded) return { posts: [], refused: [{ contentType: CONTENT_TYPE.RESULTS_RECAP, sport: "nba", date, reason: "NO_VERIFIED_FINALS", games: recap.gamesScheduled }] };
  const capture = readPublic("data/nba/results/latest.json");
  const p = recapFinalsProblems(recap, capture.rows);
  if (p.length) throw new Error(`NBA recap finals: ${p.join("; ")}`);
  for (const g of recap.games) if (g.outcome !== "EXCLUDED" && eloWinProbabilityOf(lane.games.find((x) => String(x.providerEventId) === g.eventId)) == null) throw new Error(`${g.eventId}: Elo accessor refused`);
  const schedule = readPublic("data/nba/schedule/latest.json");
  const v2 = { designVersion: DESIGN_VERSION, cards: v2Cards([resultsHeroCard({ recap, chip: `NBA · ${chipDay(instant(recap.games[0].kickoffUtc))} · Final` })], `nba-${date}-recap`) };
  return { posts: [{ ...recapPost({
    recap, name: `nba-${date}-recap`, title: "NBA RESULTS", sub: `${longDay(instant(recap.games[0].kickoffUtc)).toUpperCase()} · ${denominatorText(recap)}`,
    foot: [`Pre-game side and chance: the frozen ${ELO_WIN_PROBABILITY_LABEL}, set before tip-off. Finals from the official scoreboard capture.`, "One slate is a small sample.", `Game sides only, player numbers are not in this record. ${legalLine}`],
    snapshotRefs: [ref(rel), ref("data/nba/results/latest.json"), ref("data/nba/schedule/latest.json")], nextGames: schedule.rows.map((r) => ({ kickoffUtc: r.dateUtc, statusRaw: r.statusRaw })),
    asOf, sourceGeneratedAt: capture.generatedAt, sportWord: "NBA",
    checks: ["lane provenance", "finals accepted by loadCurrentNbaResults (schedule lineage, integer, non-tied)", "finals == results capture", "probability through eloWinProbabilityOf", "card cells == validated text"],
  }), ...v2 }], refused: [] };
}

export function prepareNflRecap({ seasonType = 2, week, asOf }) {
  assertAsOf(asOf);
  const rel = `data/nfl/reconciliation/${seasonType}-${String(week).padStart(2, "0")}.json`;
  const doc = readPublic(rel);
  const recap = buildNflRecap(doc);
  if (!recap?.graded) return { posts: [], refused: [{ contentType: CONTENT_TYPE.RESULTS_RECAP, sport: "nfl", week, reason: "NO_SETTLED_RECORD" }] };
  const capture = readPublic("data/nfl/results/latest.json");
  const p = recapFinalsProblems(recap, capture.rows);
  if (p.length) throw new Error(`NFL recap finals: ${p.join("; ")}`);
  const schedule = readPublic("data/nfl/schedule/latest.json");
  const next = [...new Map([...loadForecastViews(PUBLIC()).map((v) => [String(v.providerEventId), { kickoffUtc: v.kickoffUtc }]), ...(schedule?.rows ?? []).map((r) => [String(r.providerEventId), { kickoffUtc: r.dateUtc, statusRaw: r.statusRaw }])]).values()];
  const v2 = { designVersion: DESIGN_VERSION, cards: v2Cards([recapCard({ recap, chip: `NFL · ${recap.period.label} · Final`, kicker: "NFL Results", ...NFL_V2 })], `nfl-w${String(week).padStart(2, "0")}-recap`) };
  return { posts: [{ ...recapPost({
    recap, name: `nfl-w${String(week).padStart(2, "0")}-recap`, title: "NFL RESULTS", sub: `${recap.period.label.toUpperCase()} · ${denominatorText(recap)}`,
    foot: ["Pre-game side and chance: the forecast published before kickoff. A tie is void. Finals from the official record.", `Game sides only, player numbers are not in this record. ${legalLine}`],
    snapshotRefs: [ref(rel), ref("data/nfl/results/latest.json"), ref("data/nfl/schedule/latest.json")], nextGames: next, asOf, sourceGeneratedAt: doc.generatedAt, sportWord: "NFL",
    checks: ["each grade recomputed from the final == reconciliation", "finals == results capture", "card cells == validated text"],
  }), ...v2 }], refused: [] };
}

/* ───────────────────────────── output ───────────────────────────── */

async function layoutErrors(browser, cards) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    const m = await page.evaluate(() => ({
      foot: document.querySelector(".foot").getBoundingClientRect().bottom,
      over: [...document.querySelectorAll(".row")].filter((r) => r.scrollWidth > r.clientWidth + 1 || r.scrollHeight > r.clientHeight + 1 || [...r.querySelectorAll("[data-cell]")].some((s) => { const a = s.getBoundingClientRect(), b = r.getBoundingClientRect(); return a.right > b.right + 1 || a.bottom > b.bottom + 1; })).map((r) => r.textContent.slice(0, 40)),
      head: document.querySelector(".head").scrollWidth > 1081,
    }));
    if (m.foot > SIZE.height + 0.5) errs.push(`${c.name}: footer bottom ${Math.round(m.foot)}px`);
    if (m.over.length) errs.push(`${c.name}: rows overflow: ${m.over.join(" | ")}`);
    if (m.head) errs.push(`${c.name}: header overflows`);
  }
  await ctx.close();
  return errs;
}

async function v2LayoutErrors(browser, cards) {
  const page = await browser.newPage({ viewport: { width: SIZE.width, height: SIZE.height } });
  const errs = [];
  for (const c of cards) {
    await page.setContent(c.html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const box = document.querySelector(".content").getBoundingClientRect();
      const last = [...document.querySelector(".content").children].at(-1).getBoundingClientRect();
      const social = document.querySelector(".social").getBoundingClientRect();
      const blocks = [...document.querySelectorAll(".lines,.t5,.tn,.rc,.strip,.ufl")].map((e) => e.getBoundingClientRect().bottom);
      const lastRow = [...document.querySelectorAll(".lcol,.tnr,.t5row")].map((e) => e.getBoundingClientRect().bottom);
      return { fit: (window.__fit?.items ?? []).filter((i) => !i.fits).map((i) => i.text), over: window.__fit?.pageOverflow, foot: last.bottom, overlap: Math.max(0, ...blocks, ...lastRow) > social.top + 1, box: box.bottom };
    });
    if (m.fit.length || m.over) errs.push(`${c.name}: does not fit: ${m.fit.join(" | ")}`);
    if (m.foot > SIZE.height - 8) errs.push(`${c.name}: footer ${Math.round(m.foot)}px`);
    if (m.overlap) errs.push(`${c.name}: content runs into the footer`);
  }
  await page.close();
  return errs;
}

/** Validates layout for every post, then writes images and packages. */
/** Fonts are part of every render's input; a font change invalidates the render cache. */
const FONTS_KEY = (() => { let k = null; return () => (k ??= sha(fs.readdirSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts")).sort().map((f) => sha(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts", f)))).join(""))); })();

/**
 * `renderCache` (or GTP_RENDER_CACHE): a folder of PNGs keyed by the hash of what the browser renders (html, scale, size,
 * fonts). A card whose key is cached is copied, not re-rendered; layout checks run only on cards that render. `stats` counts both.
 */
export async function writePackages(posts, { outRoot, scales = [1], png = true, renderCache = process.env.GTP_RENDER_CACHE ?? null, stats = {} }) {
  const htmlOf = (c) => (process.env.GTP_CLEAN_EXPORT === "1" ? c.html.replace(/<div class="draft">[^<]*<\/div>/, "") : c.html);
  const cards = posts.flatMap((p) => p.cards.map((c) => ({ ...c, dir: path.join(outRoot, dedupeSlug(p), "images") })));
  const keyOf = (c, scale) => sha(JSON.stringify({ html: htmlOf(c), scale, size: SIZE, fonts: FONTS_KEY() }));
  const cached = (c, scale) => (renderCache ? path.join(renderCache, `${keyOf(c, scale)}.png`) : null);
  const written = new Map();
  const record = (c, scale, file) => written.set(c.name, [...(written.get(c.name) ?? []), { path: file, width: SIZE.width, height: SIZE.height, scale, sha256: sha(fs.readFileSync(file)) }]);
  const fileOf = (c, scale) => path.join(c.dir, `${c.name}${scale === 1 ? "" : `@${scale}x`}.png`);
  stats.rendered = 0; stats.skipped = 0;
  const todo = [];
  for (const scale of png ? scales : []) for (const c of cards) {
    const hit = cached(c, scale);
    if (hit && fs.existsSync(hit)) { fs.mkdirSync(c.dir, { recursive: true }); fs.copyFileSync(hit, fileOf(c, scale)); record(c, scale, fileOf(c, scale)); stats.skipped += 1; }
    else todo.push({ c, scale });
  }
  const put = async (browser) => {
    const fresh = [...new Set(todo.map((t) => t.c))];
    const e = [...await layoutErrors(browser, fresh.filter((c) => !c.size && !c.v2)), ...await v2LayoutErrors(browser, fresh.filter((c) => c.v2)), ...await boxLayoutErrors(browser, fresh.filter((c) => c.size))];
    if (e.length) throw new Error(`layout check failed:\n  - ${e.join("\n  - ")}`);
    for (const scale of scales) {
      const mine = todo.filter((t) => t.scale === scale).map((t) => t.c);
      if (!mine.length) continue;
      const ctx = await browser.newContext({ deviceScaleFactor: scale });
      const page = await ctx.newPage();
      await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
      for (const c of mine) {
        fs.mkdirSync(c.dir, { recursive: true });
        await page.setContent(htmlOf(c), { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const file = fileOf(c, scale);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: SIZE.width, height: SIZE.height } });
        record(c, scale, file); stats.rendered += 1;
        const to = cached(c, scale);
        if (to) { fs.mkdirSync(renderCache, { recursive: true }); const tmp = `${to}.${process.pid}.tmp`; fs.copyFileSync(file, tmp); fs.renameSync(tmp, to); }
      }
      await ctx.close();
    }
  };
  if (png && todo.length) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try { await put(browser); } finally { await browser.close(); }
  }
  fs.mkdirSync(outRoot, { recursive: true });
  const dataCommit = process.env.GTP_DATA_COMMIT ?? execSync("git rev-parse HEAD", { cwd: APP, encoding: "utf8" }).trim();
  // The console proves provenance by reading each public snapshot at dataCommit; a worktree commit without the file failed import (2026-11-02).
  for (const r of new Map(posts.flatMap((p) => p.snapshotRefs ?? []).filter((r) => r.ref.startsWith("app/public/")).map((r) => [`${r.ref}:${r.sha256}`, r])).values()) {
    let bytes = null;
    try { bytes = execSync(`git show ${dataCommit}:${r.ref}`, { cwd: path.join(APP, ".."), maxBuffer: 1 << 28 }); } catch { bytes = null; }
    if (!bytes || sha(bytes) !== r.sha256) throw new Error(`dataCommit ${dataCommit.slice(0, 10)} does not hold ${r.ref} with sha ${r.sha256.slice(0, 10)}; set GTP_DATA_COMMIT to a commit that does`);
  }
  for (const p of posts) {
    const board = p.contentType === CONTENT_TYPE.NBA_DAILY_TOP5 ? String(p.variant).replace(/-model$/, "") : null;
    const shown = flaggedCellsShown(p.anomalies, p.cards.flatMap((c) => Object.entries(c.cells)).map(([k, v]) => [k.replace(/^(pts|reb|ast)\.(\d+)\.num$/, "$2.$1").replace(/^(\d+)\.num$/, board ? `$1.${board}` : "$&"), v]));
    if (shown.length) throw new Error(`${p.contentType} ${p.variant}: flagged cells printed as numbers: ${shown.map((a) => `${a.playerId}.${a.market}`).join(", ")}`);
    const left = process.env.GTP_ALLOW_SHORT_PRICED_WINDOW === "1" ? null : shortPricedWindow(p, p.window?.opensAt);
    if (left !== null) throw new Error(`${p.contentType} ${p.variant}: priced quote leaves ${left}h before it expires; refresh the quote within authorization or build winner-only`);
  }
  return posts.map((p) => {
    const images = p.cards.flatMap((c) => written.get(c.name) ?? []);
    const file = path.join(outRoot, `${dedupeSlug(p)}.json`);
    const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    const pkg = buildSocialPackage({ ...p, revision: png ? nextRevision(prior, { images, caption: p.caption, ccCaption: p.ccCaption }) : prior?.revision ?? 1, dataCommit, cells: p.cards.flatMap((c) => Object.entries(c.cells)), images: png ? images : p.cards.map((c) => ({ path: `${c.name}.png`, width: SIZE.width, height: SIZE.height, scale: 1, sha256: sha(c.html) })), containsMarketData: p.containsMarketData === true, designVersion: p.designVersion ?? null, anomalies: p.anomalies ?? null, anomalyCheck: p.anomalyCheck ?? null, verification: { passed: true, checks: p.checks, cellsVerified: p.cards.reduce((n, c) => n + Object.keys(c.cells).length, 0) } });
    const out = p.sendWindow ? { ...pkg, sendWindow: p.sendWindow } : pkg;
    fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
    return { file, pkg: out };
  });
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    if (argv[i] === "--no-png" || argv[i] === "--moneyline-only" || argv[i] === "--approved-captions" || argv[i] === "--nfl-sunday-pack") { out[argv[i].slice(2)] = true; continue; }
    out[argv[i].slice(2)] = argv[(i += 1)];
  }
  return out;
}

/** One saved capture, private, identified by its bytes. */
export function loadMoneyline(file) {
  const abs = path.resolve(file);
  const root = path.join(os.homedir(), "gtp-private") + path.sep;
  if (!abs.startsWith(root)) throw new Error("--moneyline must name a capture under ~/gtp-private");
  const bytes = fs.readFileSync(abs);
  const doc = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(doc.events) || !Number.isFinite(Date.parse(doc.fetchedAt))) throw new Error(`${file}: not a moneyline capture`);
  return { doc, ref: { ref: `gtp-private/${path.relative(root, abs)}`, sha256: sha(bytes) } };
}

/** Founder format on a prepared post: the same text on the package and in the Command Center block. */
export function withApprovedCaption(p) {
  const { caption, claims } = approvedCaption(p);
  return { ...p, caption, ccCaption: caption, ccCaptionB: caption, extraClaims: [...(p.extraClaims ?? []), ...claims] };
}

export async function runPack(args) {
  const asOf = args["as-of"];
  assertAsOf(asOf);
  const outRoot = assertPrivateOutDir(args.out ?? path.join(DEFAULT_PRIVATE_ROOT, "packages"));
  const scales = String(args.scales ?? "1,2").split(",").map(Number);
  const posts = []; const refused = [];
  const attempt = (label, fn) => { try { const r = fn(); posts.push(...r.posts); refused.push(...r.refused); } catch (e) { refused.push({ job: label, reason: e.message }); } };
  if (args["nfl-sunday-pack"]) {
    const week = Number(args["nfl-week"]);
    const captures = loadNflCaptures();
    attempt("nfl-winners", () => prepareNflWinners({ week, asOf, captures }));
    attempt("nfl-top5", () => prepareNflSundayTop5({ week, asOf, captures }));
    attempt("nfl-game-posts", () => prepareNflGamePosts({ week, asOf, captures }));
  } else if (args["nfl-week"]) {
    const week = Number(args["nfl-week"]);
    attempt("nfl-winners", () => prepareNflWinners({ week, asOf }));
    attempt("nfl-game-winners", () => prepareNflGameWinners({ week, asOf }));
    attempt("nfl-top5", () => prepareNflTop5({ week, asOf }));
    attempt("nfl-player-stats", () => prepareNflPlayerStats({ week, asOf }));
    refused.push({ contentType: "NFL_MOST_CONFIDENT", reason: "WITHHELD: forward winner log loss interval (-0.092 to +0.026) includes the coin-flip baseline, so no confidence ranking is shown" });
  }
  if (args["nfl-recap-week"]) attempt("nfl-recap", () => prepareNflRecap({ week: Number(args["nfl-recap-week"]), asOf }));
  const coverages = [];
  if (args["nba-date"]) {
    const date = args["nba-date"];
    let lineDoc = null;
    if (process.env.GTP_ODDS_DISPLAY_KEY) { try { lineDoc = loadNbaLineGraphicsExport({ date, asOf, purpose: PURPOSE_ARG["founder-review"] }).doc; } catch (e) { refused.push({ job: "nba-lines", reason: e.message }); } }
    else refused.push({ contentType: CONTENT_TYPE.NBA_BOXSCORE, reason: "NO_DISPLAY_KEY: real-line versions not rendered" });
    const moneyline = args.moneyline ? loadMoneyline(args.moneyline) : null;
    const r = prepareGameDay({ date, asOf, lineDoc, moneyline });
    if (r.moneylineMatch) console.log(`MONEYLINE ${JSON.stringify(r.moneylineMatch)}`);
    posts.push(...(args["moneyline-only"] ? r.posts.filter((p) => /(^|-)ml$/.test(String(p.variant)) || p.contentType === CONTENT_TYPE.NBA_GAME_POST) : r.posts)); refused.push(...r.refused);
    if (!args["moneyline-only"]) coverages.push({ date, rows: r.coverage, lines: Boolean(lineDoc), moneyline: moneyline?.ref.ref ?? "NONE" });
  }
  const recapDate = args["moneyline-only"] ? null : args["nba-recap-date"] ?? (args["nba-date"] ? dayBefore(args["nba-date"]) : null);
  if (recapDate) attempt("nba-recap", () => prepareNbaRecap({ date: recapDate, asOf }));
  const recaps = posts.filter((p) => p.contentType === CONTENT_TYPE.RESULTS_RECAP).map((p) => ({ sport: p.sport, date: p.date, correct: p.content.correct, missed: p.content.missed, graded: p.content.graded, scheduled: p.content.gamesScheduled, accuracy: p.content.accuracy, provisional: p.content.excluded.map((g) => ({ eventId: g.eventId, matchup: g.matchup, reason: g.reason })) }));
  const finalPosts = args["approved-captions"] ? posts.map(withApprovedCaption) : posts;
  const selected = args.select ? finalPosts.filter(args.select) : finalPosts;
  const live = selected.filter((p) => !(Date.parse(p.window.closesAt) <= Date.parse(asOf)));
  for (const p of selected) if (!live.includes(p)) refused.push({ contentType: p.contentType, variant: p.variant, reason: "SEND_WINDOW_CLOSED", latestValidSendUtc: p.window.closesAt });
  const done = await writePackages(live, { outRoot, scales, png: !args["no-png"] });
  fs.mkdirSync(path.join(outRoot, "reports"), { recursive: true });
  const report = path.join(outRoot, "reports", `run-${asOf.replace(/[:]/g, "")}.json`);
  fs.writeFileSync(report, `${JSON.stringify({ asOf, packages: done.map((d) => d.pkg.dedupeId), recaps, refused, kindMap: CC_KIND_MAP }, null, 2)}\n`);
  const anomalyList = anomalyPackageList(done.map((d) => d.pkg));
  if (anomalyList.length) fs.writeFileSync(path.join(outRoot, "reports", `anomalies-${asOf.replace(/[:]/g, "")}.json`), `${JSON.stringify(anomalyList, null, 2)}\n`);
  const groups = new Map();
  for (const cov of coverages) {
    for (const c of cov.rows) {
      const made = done.filter((d) => d.pkg.commandCenter.eventId === c.eventId);
      if (made.length) { c.render = args["no-png"] ? "NOT_RENDERED" : "RENDERED"; c.packages = made.map((d) => d.pkg.dedupeId); }
    }
    const dir = path.join(os.homedir(), "gtp-private", "graphics", "reports");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `coverage-${cov.date}.json`), `${JSON.stringify({ date: cov.date, asOf, linesLoaded: cov.lines, moneylineCapture: cov.moneyline, quoteMaxAgeHours: LINE_MAX_AGE_HOURS, staleQuoteEvents: cov.rows.filter((c) => c.quoteAge?.stale).map((c) => c.eventId), events: cov.rows }, null, 2)}\n`);
  }
  for (const { pkg: k } of done) groups.set(k.sport, [...(groups.get(k.sport) ?? []), { sport: k.sport, date: k.date, contentType: k.contentType, variant: k.variant, firstStartUtc: k.commandCenter.firstStartUtc }]);
  for (const [sport, list] of groups) fs.writeFileSync(path.join(outRoot, "reports", `editorial-${sport}-${asOf.replace(/[:]/g, "")}.json`), `${JSON.stringify(editorialPlan(list), null, 2)}\n`);
  for (const { pkg } of done) console.log(`${pkg.dedupeId}${pkg.anomalyCheck ? ` · ${pkg.anomalyCheck} ${pkg.anomalies.length}` : ""} · ${pkg.images.length} images · ${pkg.verification.cellsVerified} cells · rec ${pkg.recommendedAtEt ?? "none"}${pkg.content.scoreSideConflicts?.length ? ` · score/side conflicts: ${pkg.content.scoreSideConflicts.join(", ")}` : ""}`);
  for (const a of anomalyList) if (a.playerMarketsFlagged) console.log(`ANOMALY ${a.dedupeId} · ${a.anomalyCheck} · ${a.playersAffected} players · ${a.playerMarketsFlagged} player-markets · ${a.flagged.map((f) => `${f.player} ${f.market} ${f.verdict}`).join("; ")}`);
  const nflPosts = done.filter((d) => d.pkg.contentType === CONTENT_TYPE.NFL_GAME_POST).map(({ pkg: k }) => ({ eventId: k.variant, matchup: k.content.game.matchup, images: k.content.imageTypes, quoteAge: k.content.quoteAge, gaps: k.content.gaps }));
  if (nflPosts.length) fs.writeFileSync(path.join(outRoot, "reports", `nfl-game-posts-${asOf.replace(/[:]/g, "")}.json`), `${JSON.stringify(nflPosts, null, 2)}\n`);
  for (const n of nflPosts) console.log(`NFL POST ${n.matchup} · ${n.images.join(", ")} · ${n.quoteAge.stale ? `STALE ${n.quoteAge.oldestAgeHours}h` : "fresh"} · ${n.gaps.length} gaps`);
  for (const r of refused) console.log(`REFUSED ${JSON.stringify(r)}`);
  for (const r of recaps) console.log(`RECAP ${JSON.stringify(r)}`);
  console.log(report);
  return { report, packages: done.length, refused, recaps, done };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPack(parseArgs(process.argv.slice(2))).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
}
