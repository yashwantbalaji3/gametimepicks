#!/usr/bin/env node
/* global document -- the page.evaluate callback runs in the Playwright browser page */
/**
 * SOCIAL PACK RENDERER: NFL winner roundup + Monday card, NFL weekly Top 5s, NBA daily Top 5s, results recaps, each as a
 * `gtp-social-package@1` JSON with its images under ~/gtp-private/graphics/packages/.
 *
 *   cd app && npx tsx scripts/social/render-social-pack.mjs --as-of <ISO instant> --nfl-week 8 --nfl-recap-week 7 \
 *       --nba-date 2026-10-30 --nba-recap-date 2026-10-29 [--out <dir>] [--scales 1,2] [--no-png]
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

import { assertPrivateOutDir, DEFAULT_PRIVATE_ROOT, APP, loadNbaLineGraphicsExport, PURPOSE_ARG } from "./nba-line-graphics-io.mjs";
import { etWeekday } from "../../src/lib/social/nfl-game-graphics-export.mjs";
import { loadForecastViews } from "../../src/lib/sports/nfl/forecast-view-load.mjs";
import { unionFrozenForecasts } from "../../src/lib/sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../../src/lib/sports/nfl/public-record.mjs";
import { formatValue } from "../../src/lib/sports/nfl/forecast-view.mjs";
import { pregameScope, boardRanks, TOP_BOARD_SPECS } from "../../src/lib/sports/nfl/top-boards.mjs";
import { gateLaneTopBoards, laneDisplay, laneProvenance } from "../../src/lib/sports/nba/lane-top-boards.mjs";
import { eloWinProbabilityOf, ELO_WIN_PROBABILITY_LABEL } from "../../src/lib/sports/nba/elo-win-probability.mjs";
import { loadCurrentNbaResults } from "../../src/lib/sports/nba/current-results.mjs";
import {
  CC_KIND_MAP, CONTENT_TYPE, ELIGIBILITY, editorialPlan, buildNbaRecap, buildNflRecap, buildSocialPackage, dedupeSlug, denominatorText, etDate, etLabel, instant, recapFinalsProblems, recommendedPostTime, toIso,
} from "../../src/lib/social/social-package.mjs";
import { quoteRangeText } from "./nba-line-cards.mjs";
import { BOX_FOOTER } from "./nba-boxscore-cards.mjs";
import { layoutErrors as boxLayoutErrors, prepareNbaLineGraphics } from "./render-nba-line-graphics.mjs";
import { FOOT, ROWS_PER_CARD, SIZE, cell, legalLine, packCaptionViolations, pageHtml, verifyPackCard, meterHtml } from "./social-pack-cards.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const PUBLIC = () => path.join(APP, "public");
const ref = (rel) => {
  const f = path.join(PUBLIC(), rel);
  return { ref: `app/public/${rel}`, sha256: sha(fs.readFileSync(f)) };
};
const readPublic = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(PUBLIC(), rel), "utf8")); } catch { return null; } };
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
  return caption;
};
const pagesOf = (items, n = ROWS_PER_CARD) => { const out = []; for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n)); return out; };

/* ───────────────────────────── NFL winners ───────────────────────────── */

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
const DISCLOSE = Object.freeze([FOOT.projections, FOOT.advice, FOOT.responsible]);
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
  const views = loadForecastViews(PUBLIC()).filter((v) => v.seasonType === seasonType && v.week === week && ["Sun", "Mon"].includes(etWeekday(v.kickoffUtc)));
  const records = nflRecords(seasonType, week);
  const refs = [ref("data/nfl/forecasts/latest.json"), ref("data/nfl/forecasts/frozen-latest.json")];
  const posts = []; const refused = [];
  for (const v of views) {
    if (!(instant(v.kickoffUtc) > Date.parse(asOf))) { refused.push({ contentType: CONTENT_TYPE.NFL_GAME_WINNER, variant: String(v.providerEventId), reason: "GAME_STARTED" }); continue; }
    const r = winnerRow(v, records.get(String(v.providerEventId)));
    const w = v.record.winProbability;
    const card = gameWinnerCard({ ...r, awayP: w.away, homeP: w.home, startText: `Kickoff ${etLabel(instant(r.kickoffUtc))}`, sideText: `${r.winner} ${r.winPct}`, splitText: `${r.away} ${formatValue("probability", w.away)} · ${r.home} ${formatValue("probability", w.home)}`, scoreText: `Projected score ${scoreText(r)}` }, { name: `nfl-w${String(week).padStart(2, "0")}-winner-${r.eventId}`, sub: `NFL WEEK ${week}`, foot: WINNER_FOOT });
    const cards = finishCards([card]);
    const caption = checkCaption(`GameTime Picks NFL Week ${week}: ${r.matchup}, ${r.winner} ${r.winPct} official win chance. ${FOOT.projections} ${legalLine}`);
    const t = instant(r.kickoffUtc);
    posts.push({
      sport: "nfl", date: etDate(t), contentType: CONTENT_TYPE.NFL_GAME_WINNER, variant: r.eventId, cards, caption, snapshotRefs: refs, eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: DISCLOSE,
      title: `${r.matchup}: game winner prediction`, eventId: r.eventId, firstStartUtc: toIso(t), ccCaption: `${r.matchup}: ${r.winner} ${r.winPct} official win chance, model projection. Not betting advice.`,
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
    ccCaption: `NBA tonight: ${games.length} games, model estimate of each game on the image. Not betting advice.`, extraClaims: [{ key: "games", display: String(games.length), evidenceRef: rel }],
    checks: ["every game through eloWinProbabilityOf", "meters proportional", "card cells == validated text"],
    window: { opensAt: asOf, closesAt: toIso(first) }, recommended: recommendedPostTime({ games, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", content: { games },
  })];
  for (const g of games) {
    const t = instant(g.kickoffUtc);
    posts.push(base({
      contentType: CONTENT_TYPE.NBA_GAME_WINNER, variant: g.eventId, eventId: g.eventId, firstStartUtc: toIso(t), title: `${g.matchup}: game winner prediction`,
      cards: finishCards([gameWinnerCard({ ...g, startText: `Tip-off ${etLabel(t)}` }, { name: `nba-${date}-winner-${g.eventId}`, sub: `NBA · ${longDay(t)}`, estimateLabel: "Estimate", foot })]),
      caption: checkCaption(`GameTime Picks NBA: ${g.matchup}, ${g.sideText}. ${ELO_WIN_PROBABILITY_LABEL}. ${FOOT.projections} ${legalLine}`),
      ccCaption: `${g.matchup}: ${g.sideText}, model estimate. Not betting advice.`, checks: ["eloWinProbabilityOf", "meter proportional", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(t) }, recommended: recommendedPostTime({ games: [g], afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed", content: { game: g },
    }));
  }
  return { posts, refused: [] };
}

const WINNER_FOOT = ["Win chance is the official forecast's. Projected score is the published model score, rounded to a whole point.", `${FOOT.projections} ${FOOT.noLines}`, legalLine];

function roundupCards(rows, week) {
  const kick = instant(rows[0].kickoffUtc);
  return pagesOf(rows).map((chunk, i, all) => {
    const cells = {};
    const body = `<div class="rows">${chunk.map((g) => `<div class="row" style="grid-template-columns:128px 214px 1fr 262px">${cell(cells, `${g.eventId}.kickoff`, timeOnly(instant(g.kickoffUtc)), "m")}${cell(cells, `${g.eventId}.matchup`, g.matchup, "g")}${cell(cells, `${g.eventId}.winner`, `${g.winner} ${g.winPct}`, "w")}${cell(cells, `${g.eventId}.score`, scoreText(g), "r")}</div>`).join("")}</div>`;
    const html = pageHtml({ title: "NFL SUNDAY WINNER PREDICTIONS", sub: `WEEK ${week} · ${longDay(kick)} · Kickoffs ET${all.length > 1 ? ` · ${i + 1} of ${all.length}` : ""}`, body, foot: WINNER_FOOT, htmlTitle: `NFL week ${week} Sunday`, maxRow: 100 });
    return { name: `nfl-w${String(week).padStart(2, "0")}-sunday-${i + 1}of${all.length}`, html, cells };
  });
}

function mnfCards(rows, week) {
  return rows.map((g, i) => {
    const cells = {};
    const body = `<div class="feat">${cell(cells, `${g.eventId}.matchup`, g.matchup, "g")}${cell(cells, `${g.eventId}.kickoff`, `Kickoff ${etLabel(instant(g.kickoffUtc))}`, "m")}${cell(cells, `${g.eventId}.winner`, `${g.winner} ${g.winPct}`, "big")}<span class="m">official win chance</span>${cell(cells, `${g.eventId}.score`, `Projected score ${scoreText(g)}`, "r")}</div>`;
    const html = pageHtml({ title: "MONDAY NIGHT FOOTBALL", sub: `WEEK ${week} · WINNER PREDICTION`, body, foot: WINNER_FOOT, htmlTitle: `NFL week ${week} Monday` });
    return { name: `nfl-w${String(week).padStart(2, "0")}-mnf-${g.eventId}${rows.length > 1 ? `-${i + 1}` : ""}`, html, cells };
  });
}

/** Sunday + Monday posts. A slate with a started game is refused whole: "every Sunday game" must stay true. */
export function prepareNflWinners({ seasonType = 2, week, asOf }) {
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
    const cards = finishCards(build(rows, week));
    const first = instant(rows[0].kickoffUtc);
    const date = etDate(first);
    const lines = rows.map((g) => `${g.winner} ${g.winPct} (${g.matchup})`);
    const caption = checkCaption(`GameTime Picks NFL Week ${week} ${day === "Sun" ? "Sunday" : "Monday Night Football"} model projections, not picks: ${lines.join("; ")}. Official win chance from the published forecast. ${legalLine}`);
    posts.push({
      sport: "nfl", date, contentType, variant: null, cards, caption, snapshotRefs: refs, eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: DISCLOSE, title: `NFL Week ${week} ${day === "Sun" ? "Sunday" : "Monday"} winner predictions`, firstStartUtc: toIso(first),
      eventId: rows.length === 1 ? rows[0].eventId : null, ccCaption: `NFL Week ${week} ${day === "Sun" ? "Sunday" : "Monday night"}: model projections for ${rows.length} ${rows.length === 1 ? "game" : "games"}, official win chance on the image. Not betting advice.`, extraClaims: [...ccWeek(week), { key: "games", display: String(rows.length), evidenceRef: "forecast" }],
      checks: ["view win chance == independently rebuilt record", "view projected score == record", "favourite recomputed from win chance", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(first) },
      recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before kickoff have passed",
      freshness: { asOf, sourceGeneratedAt: toIso(sourceAt), ageHours: ageHours(asOf, toIso(sourceAt)), expiresAt: toIso(first), rule: "valid until first kickoff" },
      content: { week, seasonType, label: "Model projections, not picks", games: rows, scoreSideConflicts: rows.filter((g) => g.scoreSideDiffers).map((g) => g.matchup) },
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
  return { cls: side.toLowerCase(), glyph: m.direction.glyph, text: `${side === "OVER" ? "O" : "U"} ${m.line.text}${price?.state === "SHOWN" ? ` ${price.text}` : ""}` };
}

function top5Card({ name, title, sub, rows, est, foot }) {
  const cells = {};
  const num = (r) => (r.line ? `<div class="lnw">${cell(cells, `${r.key}.num`, `${r.line.glyph ? `${r.line.glyph} ` : ""}${r.text}`, `w ${r.line.cls}`)}${cell(cells, `${r.key}.line`, r.line.text, `ln ${r.line.cls}`)}</div>` : cell(cells, `${r.key}.num`, r.text, "w"));
  const body = `<div class="rows">${rows.map((r) => `<div class="row" style="grid-template-columns:90px 1fr 260px">${cell(cells, `${r.key}.rank`, r.rank, "n")}<div>${cell(cells, `${r.key}.name`, r.name, "g")}<br>${cell(cells, `${r.key}.meta`, r.meta, "m")}</div>${num(r)}</div>`).join("")}</div>`;
  return { name, html: pageHtml({ title, sub, body, est, foot, htmlTitle: name, maxRow: 165 }), cells };
}

const FAMILY_KIND = Object.freeze({ player_pass_yds: "yards", player_rush_yds: "yards", player_reception_yds: "yards", player_receptions: "count", anytime_td: "probability" });

/** The five weekly boards. Each row is compared with the per-game official board it came from. */
export function prepareNflTop5({ seasonType = 2, week, asOf }) {
  assertAsOf(asOf);
  const file = `data/nfl/weekly-boards/${seasonType}-${String(week).padStart(2, "0")}.json`;
  const wb = readPublic(file);
  if (!wb?.topBoards?.weekly) throw new Error(`no topBoards in ${file}`);
  const scope = pregameScope(wb.topBoards.weekly, asOf);
  if (!scope) return { posts: [], refused: [{ contentType: CONTENT_TYPE.NFL_WEEKLY_TOP5, reason: "NO_PREGAME_GAMES" }] };
  const posts = [];
  const refused = [];
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
      const text = `${formatValue(FAMILY_KIND[spec.family], r.value)}${spec.method === "probability" ? "" : b.state === "ESTIMATE" ? " est." : ""}`;
      return { key: r.playerId, rank: r.rank, name: r.name, team: r.team, opponent: r.opponent, kickoffUtc: r.kickoffUtc, value: r.value, text, meta: `${r.team} vs ${r.opponent} · ${etLabel(instant(r.kickoffUtc)).replace(/ E[SD]T$/, " ET")}` };
    });
    const first = Math.min(...rows.map((r) => instant(r.kickoffUtc)));
    const metric = spec.method === "probability" ? "Chance to score at least one rushing or receiving touchdown if he plays." : `Ranked by the official board's projected median ${spec.label.toLowerCase()}.`;
    const est = b.state === "ESTIMATE" ? b.estimate.label : null;
    const cards = finishCards([top5Card({
      name: `nfl-w${String(week).padStart(2, "0")}-${b.id}`, title: `TOP 5 ${spec.label.toUpperCase()}`, sub: `NFL WEEK ${week} · Games still to kick off`, rows, est,
      foot: [metric, `${FOOT.projections} ${FOOT.noLines}`, legalLine],
    })]);
    const caption = checkCaption(`GameTime Picks NFL Week ${week} top 5 ${spec.label.toLowerCase()}${est ? ` (${est.replace(/·/g, "-")})` : ""}: ${rows.map((r) => `${r.rank}. ${r.name} ${r.text}`).join(", ")}. ${FOOT.projections} ${legalLine}`);
    const gen = wb.generatedAt;
    posts.push({
      sport: "nfl", date: etDate(first), contentType: CONTENT_TYPE.NFL_WEEKLY_TOP5, variant: b.id, cards, caption, snapshotRefs: refs, eligibilityClass: est ? ELIGIBILITY.ESTIMATE : ELIGIBILITY.OFFICIAL, disclosures: est ? [est, ...DISCLOSE] : DISCLOSE, title: `NFL Week ${week} top 5 ${spec.label.toLowerCase()}`, firstStartUtc: toIso(first),
      ccCaption: `NFL Week ${week} top 5 ${spec.label.toLowerCase()}${est ? " (estimate)" : ""}. Model projections. Not betting advice.`, extraClaims: [...ccWeek(week), { key: "topN", display: "5", evidenceRef: file }],
      checks: ["pregameScope applied at asOf", "every row == per-game official board at the family metric", "estimate label on card when state is ESTIMATE", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(first) }, recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(etDate(first)), asOf }), recommendedNote: "the two hours before kickoff have passed",
      freshness: { asOf, sourceGeneratedAt: gen, ageHours: ageHours(asOf, gen), expiresAt: toIso(first), rule: "valid until first kickoff of the listed games" },
      content: { week, board: b.id, state: b.state, estimateLabel: est, rows: rows.map(({ key: _k, meta: _m, ...r }) => r) },
    });
  }
  return { posts, refused };
}

const NBA_TOP5 = Object.freeze(["pts", "reb", "ast"]);
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
    const rows = b.rows.map((r) => ({ line: lineBlock(lineRows.get(String(r.providerAthleteId))), key: r.providerAthleteId, rank: r.rank, name: r.name, team: r.team, opponent: r.opponent, kickoffUtc: r.tipUtc, value: r.value, text: laneDisplay(r.value), meta: `${r.matchup} · ${timeOnly(instant(r.tipUtc))} ET` }));
    const shownLines = rows.filter((r) => r.line).map((r) => lineRows.get(String(r.key)));
    for (const r of rows) if (r.line && lineRows.get(String(r.key)).model?.display !== undefined && Number(lineRows.get(String(r.key)).model.value) !== Number((Math.round(r.value * 10) / 10).toFixed(1))) throw new Error(`${r.name}: line export median differs from the board`);
    const first = Math.min(...rows.map((r) => instant(r.kickoffUtc)));
    const cards = finishCards([top5Card({ name: `nba-${date}-top5-${k}`, title: `TOP 5 ${b.label.toUpperCase()}`, sub: `NBA · ${longDay(first)} · Highest projected median`, rows, foot: [b.methodText.replace(/ \(the middle.*?\)/, ""), ...(shownLines.length ? [BOX_FOOTER.disclaimer, FOOT.responsible] : [`${FOOT.projections} ${FOOT.noLines}`, legalLine])] })]);
    const caption = checkCaption(`GameTime Picks NBA top 5 projected ${b.label.toLowerCase()} for ${longDay(first)}: ${rows.map((r) => `${r.rank}. ${r.name} ${r.text}`).join(", ")}. ${FOOT.projections} ${legalLine}`);
    return {
      sport: "nba", date, contentType: CONTENT_TYPE.NBA_DAILY_TOP5, variant: k, cards, caption, snapshotRefs: [ref(rel)], eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: DISCLOSE, title: `NBA top 5 ${b.label.toLowerCase()} ${date}`, firstStartUtc: toIso(first),
      ccCaption: `NBA top 5 projected ${b.label.toLowerCase()} tonight. Model projections. Not betting advice.`, extraClaims: [{ key: "topN", display: "5", evidenceRef: rel }],
      checks: ["gateLaneTopBoards PUBLISHED (provenance + cross-page)", "card cells == validated text"],
      window: { opensAt: asOf, closesAt: toIso(first) }, recommended: recommendedPostTime({ games: rows, afterEtDate: dayBefore(date), asOf }), recommendedNote: "the two hours before tip-off have passed",
      freshness: { asOf, sourceGeneratedAt: lane.generatedAt, ageHours: ageHours(asOf, lane.generatedAt), expiresAt: toIso(first), rule: "valid until first tip-off" },
      content: { board: k, source: b.source, linesShown: shownLines.length, quotedAt: shownLines.length ? quoteRangeText(shownLines) : null, rows: rows.map(({ key: _k, meta: _m, ...r }) => r), excludedForInjury: gate.doc.excluded.length },
    };
  });
  return { posts, refused: [] };
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
      ccCaption: `${g.matchup} projected stat lines. Model projections. Not betting advice.`, ccCaptionB: `${g.matchup} stat line projections. Not betting advice.`, snapshotRefs: [laneRef], eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: [BOX_FOOTER.disclaimer, FOOT.responsible],
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
    eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: ["Verified finals only", "Winner sides only, never combined with a prop record", FOOT.advice, FOOT.responsible], title: `${sportWord} results ${recap.period.label}`, firstStartUtc: closes, hasMiss: recap.missed > 0,
    ccCaption: `${sportWord} results: ${recap.correct} of ${recap.graded} pre-game sides correct (${recap.accuracy}), ${recap.missed} missed, ${recap.gamesScheduled} games on the slate. Not betting advice.`, extraClaims: [{ key: "scheduled", display: String(recap.gamesScheduled), evidenceRef: "recap" }],
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
  return { posts: [recapPost({
    recap, name: `nba-${date}-recap`, title: "NBA RESULTS", sub: `${longDay(instant(recap.games[0].kickoffUtc)).toUpperCase()} · ${denominatorText(recap)}`,
    foot: [`Pre-game side and chance: the frozen ${ELO_WIN_PROBABILITY_LABEL}, set before tip-off. Finals from the official scoreboard capture.`, "One slate is a small sample.", `Game sides only, player numbers are not in this record. ${legalLine}`],
    snapshotRefs: [ref(rel), ref("data/nba/results/latest.json"), ref("data/nba/schedule/latest.json")], nextGames: schedule.rows.map((r) => ({ kickoffUtc: r.dateUtc, statusRaw: r.statusRaw })),
    asOf, sourceGeneratedAt: capture.generatedAt, sportWord: "NBA",
    checks: ["lane provenance", "finals accepted by loadCurrentNbaResults (schedule lineage, integer, non-tied)", "finals == results capture", "probability through eloWinProbabilityOf", "card cells == validated text"],
  })], refused: [] };
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
  return { posts: [recapPost({
    recap, name: `nfl-w${String(week).padStart(2, "0")}-recap`, title: "NFL RESULTS", sub: `${recap.period.label.toUpperCase()} · ${denominatorText(recap)}`,
    foot: ["Pre-game side and chance: the forecast published before kickoff. A tie is void. Finals from the official record.", `Game sides only, player numbers are not in this record. ${legalLine}`],
    snapshotRefs: [ref(rel), ref("data/nfl/results/latest.json"), ref("data/nfl/schedule/latest.json")], nextGames: next, asOf, sourceGeneratedAt: doc.generatedAt, sportWord: "NFL",
    checks: ["each grade recomputed from the final == reconciliation", "finals == results capture", "card cells == validated text"],
  })], refused: [] };
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

/** Validates layout for every post, then writes images and packages. */
export async function writePackages(posts, { outRoot, scales = [1, 2], png = true }) {
  const cards = posts.flatMap((p) => p.cards.map((c) => ({ ...c, dir: path.join(outRoot, dedupeSlug(p), "images") })));
  const written = new Map();
  const put = async (browser) => {
    if (browser) {
      const e = [...await layoutErrors(browser, cards.filter((c) => !c.size)), ...await boxLayoutErrors(browser, cards.filter((c) => c.size))];
      if (e.length) throw new Error(`layout check failed:\n  - ${e.join("\n  - ")}`);
    }
    for (const scale of browser ? scales : []) {
      const ctx = await browser.newContext({ deviceScaleFactor: scale });
      const page = await ctx.newPage();
      await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
      for (const c of cards) {
        fs.mkdirSync(c.dir, { recursive: true });
        await page.setContent(c.html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const file = path.join(c.dir, `${c.name}${scale === 1 ? "" : `@${scale}x`}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: SIZE.width, height: SIZE.height } });
        written.set(c.name, [...(written.get(c.name) ?? []), { path: file, width: SIZE.width, height: SIZE.height, scale, sha256: sha(fs.readFileSync(file)) }]);
      }
      await ctx.close();
    }
  };
  if (png) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try { await put(browser); } finally { await browser.close(); }
  }
  fs.mkdirSync(outRoot, { recursive: true });
  const dataCommit = execSync("git rev-parse HEAD", { cwd: APP, encoding: "utf8" }).trim();
  return posts.map((p) => {
    const images = p.cards.flatMap((c) => written.get(c.name) ?? []);
    const pkg = buildSocialPackage({ ...p, dataCommit, cells: p.cards.flatMap((c) => Object.entries(c.cells)), images: png ? images : p.cards.map((c) => ({ path: `${c.name}.png`, width: SIZE.width, height: SIZE.height, scale: 1, sha256: sha(c.html) })), verification: { passed: true, checks: p.checks, cellsVerified: p.cards.reduce((n, c) => n + Object.keys(c.cells).length, 0) } });
    const file = path.join(outRoot, `${dedupeSlug(p)}.json`);
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    return { file, pkg };
  });
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    if (argv[i] === "--no-png") { out["no-png"] = true; continue; }
    out[argv[i].slice(2)] = argv[(i += 1)];
  }
  return out;
}

async function main(args) {
  const asOf = args["as-of"];
  assertAsOf(asOf);
  const outRoot = assertPrivateOutDir(args.out ?? path.join(DEFAULT_PRIVATE_ROOT, "packages"));
  const scales = String(args.scales ?? "1,2").split(",").map(Number);
  const posts = []; const refused = [];
  const attempt = (label, fn) => { try { const r = fn(); posts.push(...r.posts); refused.push(...r.refused); } catch (e) { refused.push({ job: label, reason: e.message }); } };
  if (args["nfl-week"]) {
    const week = Number(args["nfl-week"]);
    attempt("nfl-winners", () => prepareNflWinners({ week, asOf }));
    attempt("nfl-game-winners", () => prepareNflGameWinners({ week, asOf }));
    attempt("nfl-top5", () => prepareNflTop5({ week, asOf }));
    refused.push({ contentType: "NFL_MOST_CONFIDENT", reason: "WITHHELD: forward winner log loss interval (-0.092 to +0.026) includes the coin-flip baseline, so no confidence ranking is shown" });
  }
  if (args["nfl-recap-week"]) attempt("nfl-recap", () => prepareNflRecap({ week: Number(args["nfl-recap-week"]), asOf }));
  if (args["nba-date"]) {
    const date = args["nba-date"];
    attempt("nba-tonight", () => prepareNbaTonight({ date, asOf }));
    attempt("nba-boxscore", () => prepareNbaBoxscore({ date, asOf }));
    attempt("nba-top5", () => {
      let lineDoc = null;
      if (process.env.GTP_ODDS_DISPLAY_KEY) lineDoc = loadNbaLineGraphicsExport({ date, asOf, purpose: PURPOSE_ARG["founder-review"] }).doc;
      else refused.push({ contentType: CONTENT_TYPE.NBA_DAILY_TOP5, reason: "LINES_NOT_LOADED: no display key in the environment, Top 5 rendered without lines" });
      return prepareNbaTop5({ date, asOf, lineDoc });
    });
  }
  const recapDate = args["nba-recap-date"] ?? (args["nba-date"] ? dayBefore(args["nba-date"]) : null);
  if (recapDate) attempt("nba-recap", () => prepareNbaRecap({ date: recapDate, asOf }));
  const done = await writePackages(posts, { outRoot, scales, png: !args["no-png"] });
  fs.mkdirSync(path.join(outRoot, "reports"), { recursive: true });
  const report = path.join(outRoot, "reports", `run-${asOf.replace(/[:]/g, "")}.json`);
  fs.writeFileSync(report, `${JSON.stringify({ asOf, packages: done.map((d) => d.pkg.dedupeId), refused, kindMap: CC_KIND_MAP }, null, 2)}\n`);
  const groups = new Map();
  for (const { pkg: k } of done) groups.set(k.sport, [...(groups.get(k.sport) ?? []), { sport: k.sport, date: k.date, contentType: k.contentType, variant: k.variant, firstStartUtc: k.commandCenter.firstStartUtc }]);
  for (const [sport, list] of groups) fs.writeFileSync(path.join(outRoot, "reports", `editorial-${sport}-${asOf.replace(/[:]/g, "")}.json`), `${JSON.stringify(editorialPlan(list), null, 2)}\n`);
  for (const { pkg } of done) console.log(`${pkg.dedupeId} · ${pkg.images.length} images · ${pkg.verification.cellsVerified} cells · rec ${pkg.recommendedAtEt ?? "none"}${pkg.content.scoreSideConflicts?.length ? ` · score/side conflicts: ${pkg.content.scoreSideConflicts.join(", ")}` : ""}`);
  for (const r of refused) console.log(`REFUSED ${JSON.stringify(r)}`);
  console.log(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(parseArgs(process.argv.slice(2))).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
}
