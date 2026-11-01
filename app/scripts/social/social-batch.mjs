#!/usr/bin/env node
/**
 * ONE COMMAND PER BATCH, banner-free review renders. Nothing is posted or scheduled; no network, no key but the display key.
 *   cd app && GTP_CLEAN_EXPORT=1 npx tsx scripts/social/social-batch.mjs --batch A [--as-of ISO] [--date 2026-11-01] [--out dir]
 *   A NFL early game posts · B NFL Sunday Top 5 · C NFL later game posts · D NBA carousel, slate, games before 6 PM ET ·
 *   E NBA games from 6 PM ET (D and E need GTP_ODDS_DISPLAY_KEY in the environment)
 * Each batch writes send-manifest-<batch>.json: quote time, latest valid send, caption, images, per package. Exit 1 on any refusal.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etLabel, instant } from "../../src/lib/social/social-package.mjs";
import { nflWindow } from "../../src/lib/social/approved-captions.mjs";
import { applyDisplayException } from "../../src/lib/social/display-exception.mjs";
import { sendWindow } from "../../src/lib/social/send-window.mjs";
import { loadForecastViews } from "../../src/lib/sports/nfl/forecast-view-load.mjs";
import { APP } from "./nba-line-graphics-io.mjs";
import { latestMoneyline } from "./daily-nba.mjs";
import { weekOf } from "./daily-nfl.mjs";
import { parseArgs, runPack } from "./render-social-pack.mjs";

const NBA_SPLIT_HOUR_ET = 18;
const hourEt = (ms) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(ms)));
const isLateNba = (p) => hourEt(instant(p.firstStartUtc)) >= NBA_SPLIT_HOUR_ET;

/** Which posts belong to a batch. */
export function batchFilter(batch) {
  const nflPost = (p) => p.contentType === "NFL_GAME_POST";
  const nbaGame = (p) => p.contentType === "NBA_GAME_POST";
  const slate = (p) => p.contentType === "NBA_TOP5_CAROUSEL" || (p.contentType === "NBA_TONIGHT" && p.variant === "ml");
  return {
    A: (p) => nflPost(p) && nflWindow(instant(p.firstStartUtc)) === "early",
    B: (p) => p.contentType === "NFL_WEEKLY_TOP5",
    C: (p) => nflPost(p) && nflWindow(instant(p.firstStartUtc)) !== "early",
    D: (p) => slate(p) || (nbaGame(p) && !isLateNba(p)),
    E: (p) => nbaGame(p) && isLateNba(p),
  }[batch];
}

export const manifestRow = (pkg) => {
  const sw = pkg.sendWindow ?? sendWindow({ sport: pkg.sport, firstStartUtc: pkg.commandCenter.firstStartUtc });
  return { dedupeId: pkg.dedupeId, title: pkg.commandCenter.title, firstStartEt: etLabel(instant(sw.firstStartUtc)), quoteTimeUtc: sw.quoteTimeUtc, maxAgeHours: sw.maxAgeHours, latestValidSendUtc: sw.latestValidSendUtc, latestValidSendEt: sw.latestValidSendEt, governedBy: sw.governedBy, anomalyCheck: pkg.anomalyCheck ?? null, publicationException: pkg.publicationException ?? null, gaps: pkg.content.gaps ?? [], omittedRows: pkg.content.omittedRows ?? [], omittedFamilies: pkg.content.omittedFamilies ?? [], images: pkg.images.filter((i) => i.scale === 1).map((i) => i.path), caption: pkg.caption };
};

async function main(argv) {
  const a = parseArgs(argv);
  const batch = a.batch;
  const select = batchFilter(batch);
  if (!select) throw new Error("--batch A|B|C|D|E is required");
  if (process.env.GTP_CLEAN_EXPORT !== "1") throw new Error("set GTP_CLEAN_EXPORT=1");
  const asOf = a["as-of"] ?? new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const date = a.date ?? "2026-11-01";
  const out = a.out ?? path.join(os.homedir(), "gtp-private", "graphics", "clean-1101");
  const nba = batch === "D" || batch === "E";
  if (nba && !process.env.GTP_ODDS_DISPLAY_KEY) throw new Error("batch needs GTP_ODDS_DISPLAY_KEY in the environment");
  const moneyline = nba ? a.moneyline ?? latestMoneyline(date) : null;
  if (nba && !moneyline) throw new Error(`no saved moneyline capture for ${date}`);
  const week = a.week ?? weekOf(date, loadForecastViews(path.join(APP, "public")));
  const r = await runPack({ "as-of": asOf, out, scales: a.scales ?? "1", "approved-captions": true, select, ...(nba ? { "nba-date": date, "nba-recap-date": "none", moneyline } : { "nfl-sunday-pack": true, "nfl-week": String(week) }) });
  const rows = []; const blocked = [];
  const names = nba ? new Map(JSON.parse(fs.readFileSync(path.join(APP, "public", `data/nba/experimental-public/${date}.json`), "utf8")).games.flatMap((g) => [...g.players.away, ...g.players.home].map((p) => [String(p.providerAthleteId), p.name]))) : new Map();
  for (const d of r.done) {
    const e = nba ? applyDisplayException(d.pkg, { id: `${date}-founder-display`, nameOf: (id) => names.get(String(id)) ?? null }) : { pkg: d.pkg };
    if (e.blocked) { blocked.push({ dedupeId: d.pkg.dedupeId, identityErrors: e.blocked }); fs.rmSync(d.file, { force: true }); continue; }
    fs.writeFileSync(d.file, `${JSON.stringify(e.pkg, null, 2)}\n`);
    rows.push(manifestRow(e.pkg));
  }
  const wanted = r.refused.filter((x) => !["NFL_SUNDAY_WINNERS", "NFL_MNF_WINNER", "NFL_GAME_WINNER"].includes(x.contentType) && x.job !== "nba-recap");
  const file = path.join(out, `send-manifest-${batch}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ batch, asOf, date, dataCommit: process.env.GTP_DATA_COMMIT ?? null, packages: rows, blocked, refused: wanted }, null, 2)}\n`);
  for (const x of rows) console.log(`SEND ${x.dedupeId} · quote ${x.quoteTimeUtc ?? "none"} · latest ${x.latestValidSendEt} (${x.governedBy})${x.gaps.length ? ` · gaps ${x.gaps.join(",")}` : ""}`);
  console.log(file);
  return rows.length && !blocked.length ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
