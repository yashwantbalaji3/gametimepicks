#!/usr/bin/env node
/**
 * Per-game coverage for one NBA date: every game on the published lane (never a typed list), crossed with what is in
 * the Command Center queue, so a count of images can't stand in for a full slate. Read-only: the lane comes from git,
 * the queue from the running console.
 *
 *   node command-center/scripts/coverage-ledger.mjs 2026-10-30
 *
 * Writes ~/gtp-private/graphics/reports/cc-coverage-<date>.json and .md.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "../lib/util.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) throw new Error("usage: coverage-ledger.mjs YYYY-MM-DD");
const port = Number(process.env.GTP_CC_PORT ?? 4190);
const state = () => new Promise((ok, no) => {
  // node:http: fetch refuses port 4190
  http.get(`http://127.0.0.1:${port}/api/state`, { timeout: 180_000 }, (r) => { const c = []; r.on("data", (d) => c.push(d)); r.on("end", () => ok(JSON.parse(Buffer.concat(c).toString("utf8")))); }).on("error", no);
});
const lane = JSON.parse(gitDataSource(REPO_ROOT, "origin/main").read(`app/public/data/nba/experimental-public/${date}.json`) ?? "null");
if (!lane) throw new Error(`no published NBA lane for ${date}`);
const s = await state();
const posts = s.posts.filter((p) => p.package?.imported && p.package.date === date && p.lifecycle !== "superseded");
const of = (type, eventId) => posts.filter((p) => p.package.imported.contentType === type && (eventId == null || String(p.package.eventId ?? p.package.imported.variant).startsWith(String(eventId))));
const brief = (ps) => ps.map((p) => ({ id: p.package.imported.dedupeId, images: p.package.mediaSet.length, design: p.package.template, state: p.lifecycle, status: p.package.status, clean: p.package.imported.socialAuthorized === true, marketData: p.package.imported.containsMarketData === true, blockers: (p.package.blockers ?? []).map((b) => b.code), checked: p.package.imported.verification?.passed === true }));

const games = (lane.games ?? []).map((g) => ({
  eventId: String(g.providerEventId), away: g.away?.abbr ?? g.away, home: g.home?.abbr ?? g.home, tipUtc: g.tipUtc, forecast: g.elo?.state ?? null, players: Array.isArray(g.players) ? g.players.length : Object.values(g.players ?? {}).flat().length,
  gamePost: brief(of("NBA_GAME_POST", g.providerEventId)), winner: brief(of("NBA_GAME_WINNER", g.providerEventId)), stats: brief(of("NBA_PLAYER_STATS", g.providerEventId)), lines: brief(of("NBA_BOXSCORE", g.providerEventId)),
}));
const slate = { tonight: brief(of("NBA_TONIGHT")), top5: brief(of("NBA_DAILY_TOP5")), recap: brief(posts.filter((p) => p.package.imported.contentType === "RESULTS_RECAP")) };
// the recap of the slate before this one, whatever window it now carries
const prev = new Date(Date.parse(`${date}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
slate.recap = brief(s.posts.filter((p) => p.package?.imported?.contentType === "RESULTS_RECAP" && !["superseded", "invalidated"].includes(p.lifecycle) && p.package.sport === "NBA" && p.package.date === prev));
const onePerGame = (k) => games.filter((g) => g[k].length).length;
const summary = {
  date, games: games.length, tonightImages: slate.tonight.reduce((n, p) => n + p.images, 0), top5Boards: slate.top5.length,
  gamePostGames: onePerGame("gamePost"), winnerGames: onePerGame("winner"), statGames: onePerGame("stats"), lineGames: onePerGame("lines"), recap: slate.recap.length,
  targetMet: slate.tonight.length >= 1 && slate.tonight.every((p) => p.images === 1) && games.every((g) => g.gamePost.length && g.winner.length) && slate.recap.length >= 1 && slate.top5.length >= 3,
  imageFiles: posts.reduce((n, p) => n + p.package.mediaSet.length + p.package.hiRes.length, 0), packages: posts.length, blocked: posts.filter((p) => p.package.status === "BLOCKED").length,
  scheduled: s.publishing.jobs.filter((j) => j.status === "scheduled" && posts.some((p) => p.decisionId === j.decisionId)).length,
};
const dir = path.join(os.homedir(), "gtp-private/graphics/reports");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `cc-coverage-${date}.json`), `${JSON.stringify({ summary, games, slate }, null, 2)}\n`);
const cell = (ps) => (ps.length ? ps.map((p) => `${p.images} img, ${p.status === "BLOCKED" ? "blocked" : p.clean ? "clean" : "review copy"}`).join("; ") : "**missing**");
const md = [`# NBA coverage ${date}`, "", `${summary.games} games on the published lane · target met: ${summary.targetMet ? "yes" : "no"}`, "",
  "| Game | Tip (UTC) | Forecast | Players | Game post | Winner (model, moneyline) | Stat lines (model-only) | Real-line card |", "|---|---|---|---|---|---|---|---|",
  ...games.map((g) => `| ${g.away} @ ${g.home} (${g.eventId}) | ${g.tipUtc} | ${g.forecast ?? "none"} | ${g.players} | ${cell(g.gamePost)} | ${cell(g.winner)} | ${cell(g.stats)} | ${cell(g.lines)} |`), "",
  `NBA Tonight: ${cell(slate.tonight)}`, "", `Top 5: ${cell(slate.top5)}`, "", `Recap: ${cell(slate.recap)}`, ""].join("\n");
fs.writeFileSync(path.join(dir, `cc-coverage-${date}.md`), md);
console.log(md);
console.log(JSON.stringify(summary));
