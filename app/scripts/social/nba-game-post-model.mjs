#!/usr/bin/env node
/**
 * MODEL-ONLY NBA GAME POSTS from a delivered slate (founder, 2026-11-04: one X post per game, winner card then stat card).
 *   node scripts/social/nba-game-post-model.mjs --attempt <slate attempt dir> --lane <lane json at the delivery's dataCommit> --out <dir>
 * Reads the delivered winner / projonly / winneronly / NBA Today packages, copies their images byte-for-byte and writes
 * <out>/packages/<slug>.json + <slug>/images/. Games whose stat card prints under 3 players on a team also get the winner-only
 * package, both marked founder choice. Writes nothing else, renders nothing, posts and schedules nothing.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { teamOf } from "./game-day-cards.mjs";
import { buildModelGamePost, modelGamePostSchedule } from "../../src/lib/social/nba-game-post-model.mjs";
import { dedupeSlug, etLabel, socialPackageViolations } from "../../src/lib/social/social-package.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const THIN = /^- (\S+) stat card: (\S+) (\d+) printed/;

export function buildSlateGamePosts({ attempt, lane, out }) {
  const P = path.join(attempt, "packages");
  const read = (slug) => JSON.parse(fs.readFileSync(path.join(P, `${slug}.json`), "utf8"));
  const thin = new Map();
  for (const l of fs.readFileSync(path.join(attempt, "report.md"), "utf8").split("\n")) { const m = l.match(THIN); if (m) thin.set(m[1], [...(thin.get(m[1]) ?? []), `${m[2]} ${m[3]}`]); }
  const date = lane.games[0].etDate;
  const games = lane.games.map((g) => ({ eventId: String(g.providerEventId), tipUtc: g.tipUtc }));
  const slots = modelGamePostSchedule(games);
  const dir = path.join(out, "packages");
  fs.mkdirSync(dir, { recursive: true });
  const copy = (pkg, slug) => pkg.images.filter((i) => i.scale === 1).map((i) => {
    const buf = fs.readFileSync(i.path);
    if (sha(buf) !== i.sha256) throw new Error(`${pkg.dedupeId}: delivered image changed on disk`);
    const to = path.join(dir, slug, "images", path.basename(i.path));
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf);
    return { ...i, path: to };
  });
  const put = (pkg) => { const slug = dedupeSlug(pkg); const v = socialPackageViolations(pkg); if (v.length) throw new Error(`${slug}: ${v.join("; ")}`); fs.writeFileSync(path.join(dir, `${slug}.json`), `${JSON.stringify(pkg, null, 2)}\n`); return slug; };
  const rows = [];
  for (const g of lane.games) {
    const id = String(g.providerEventId), matchup = `${g.away.abbr}@${g.home.abbr}`;
    const winner = read(`nba-${date}-nba-game-winner-${id}-winneronly`), stats = read(`nba-${date}-nba-player-stats-${id}-projonly`);
    const fav = g.elo.favoured === g.home.abbr ? g.home : g.away;
    const choice = thin.has(matchup) ? { eventId: id, note: "founder choice: schedule ONE of these two for this game", thin: thin.get(matchup), options: [`gtp-social:nba:${date}:NBA_GAME_POST:${id}-model`, winner.dedupeId] } : null;
    const slug0 = `nba-${date}-nba-game-post-${id}-model`;
    const pkg = buildModelGamePost({
      winner, stats, images: [...copy(winner, slug0), ...copy(stats, slug0)], recommendedAt: slots.get(id), founderChoice: choice,
      game: { awayName: g.away.name, homeName: g.home.name, awayAbbr: g.away.abbr, homeAbbr: g.home.abbr, winnerNickname: teamOf(fav.abbr, fav.name).nickname, tipUtc: g.tipUtc },
    });
    const slugs = [put(pkg)];
    if (choice) {
      const w = { ...winner, images: copy(winner, dedupeSlug(winner)), recommendedAt: slots.get(id), recommendedAtEt: etLabel(Date.parse(slots.get(id))), content: { ...winner.content, founderChoice: choice } };
      w.recommendation = { ...w.recommendation, recommendedAt: w.recommendedAt, recommendedAtEt: w.recommendedAtEt };
      w.commandCenter = { ...w.commandCenter, suggestedPublishAt: w.recommendedAt };
      slugs.push(put(w));
    }
    rows.push({ matchup, eventId: id, tipUtc: g.tipUtc, packages: slugs, dedupeId: pkg.dedupeId, images: pkg.images.map((i) => i.sha256), caption: pkg.caption, scheduledFor: pkg.recommendedAt, scheduledForEt: pkg.recommendedAtEt, anomalyCheck: pkg.anomalyCheck, captionPlayers: pkg.content.captionPlayers.players.map((p) => p.name), founderChoice: Boolean(choice), thin: choice?.thin ?? [] });
  }
  const today = read(`nba-${date}-nba-tonight-slate-today`);
  const todaySlug = put({ ...today, images: copy(today, dedupeSlug(today)) });
  return { date, rows, today: { slug: todaySlug, scheduledFor: today.recommendedAt, images: today.images.map((i) => i.sha256) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  const [attempt, lanePath, out] = [arg("attempt"), arg("lane"), arg("out")];
  if (!attempt || !lanePath || !out) { console.error("usage: --attempt DIR --lane FILE --out DIR"); process.exit(2); }
  if (fs.existsSync(path.join(out, "packages"))) { console.error(`refusing to overwrite ${out}/packages`); process.exit(2); }
  const r = buildSlateGamePosts({ attempt, lane: JSON.parse(fs.readFileSync(lanePath, "utf8")), out });
  fs.writeFileSync(path.join(out, "inventory.json"), `${JSON.stringify(r, null, 2)}\n`);
  for (const x of r.rows) console.log(x.matchup, x.scheduledForEt, x.anomalyCheck, x.founderChoice ? "FOUNDER_CHOICE" : "", x.captionPlayers.join(", "));
}
