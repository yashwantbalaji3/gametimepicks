#!/usr/bin/env node
/**
 * ONE-DAY CEO PUBLICATION EXCEPTION, NBA 2026-10-30.
 *   cd app && npx tsx scripts/social/publication-exception.mjs --oct30-exception --as-of <real now, ISO with zone> [--no-png]
 * Re-emits the reviewed packages banner-free with the founder's captions under ~/gtp-private/graphics/exception-2026-10-30/.
 * Each card is rebuilt at the package's own stored asOf, so the normal validation and 6 hour rule apply and stored quotes
 * are used as they were; --as-of and the real clock (the later of the two) only decide STARTED and quote age. Without
 * GTP_ODDS_DISPLAY_KEY the posts with lines are listed NEEDS_DISPLAY_KEY. Nothing is posted or scheduled.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP, DEFAULT_PRIVATE_ROOT, PURPOSE_ARG, assertPrivateOutDir, loadNbaLineGraphicsExport } from "./nba-line-graphics-io.mjs";
import { renderCleanImages } from "./clean-export.mjs";
import { DISCLOSURE, teamOf } from "./game-day-cards.mjs";
import { loadMoneyline, prepareGameDay, prepareNbaRecap } from "./render-social-pack.mjs";
import { SIZE } from "./social-pack-cards.mjs";
import { sameDisplayProblems, withoutBanner } from "../../src/lib/social/clean-export.mjs";
import { selectCaptionPlayers } from "../../src/lib/social/nba-game-post.mjs";
import { dedupeSlug } from "../../src/lib/social/social-package.mjs";
import { EXCEPTION, EXCEPTION_DATE, EXCEPTION_STATUS, buildExceptionPackage, exceptionCaption, exceptionPackageProblems, exceptionRunProblems, exceptionSlugs, hasStarted, limitationsOf, packageScopeProblems, quoteStatus } from "../../src/lib/social/publication-exception.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const needsLines = (pkg) => pkg.containsMarketData && pkg.contentType !== "NBA_TONIGHT";
const captureOf = (pkg) => pkg.snapshotRefs.find((r) => r.ref.startsWith("gtp-private/"))?.ref ?? null;

function rebuilder(env) {
  const cache = new Map();
  return (pkg) => {
    const asOf = pkg.freshness.asOf;
    if (pkg.contentType === "RESULTS_RECAP") return { posts: prepareNbaRecap({ date: pkg.date, asOf }).posts, lineDoc: null };
    const capture = captureOf(pkg);
    const key = `${asOf}|${capture}|${needsLines(pkg)}`;
    if (!cache.has(key)) {
      const lineDoc = needsLines(pkg) ? loadNbaLineGraphicsExport({ date: pkg.date, asOf, purpose: PURPOSE_ARG["founder-review"], env }).doc : null;
      cache.set(key, { lineDoc, posts: prepareGameDay({ date: pkg.date, asOf, lineDoc, moneyline: capture ? loadMoneyline(path.join(os.homedir(), capture)) : null }).posts });
    }
    return cache.get(key);
  };
}

/** Every stored quote time behind one post. */
function quoteTimes(pkg, lineDoc) {
  const c = pkg.content;
  const out = [c.quotedAt, c.winner?.quotedAt, ...(c.games ?? []).map((g) => g.quotedAt)].filter((q) => Number.isFinite(Date.parse(q)));
  const iso = (rows) => rows.map((r) => r.market?.quotedAt?.iso).filter(Boolean);
  if (!lineDoc) return out;
  if (pkg.contentType === "NBA_GAME_POST") return [...out, ...iso(lineDoc.rows.filter((r) => String(r.identity.eventId) === String(pkg.variant)))];
  const ids = new Set(pkg.commandCenter.claims.map((x) => x.key.split(".")[0]));
  return [...out, ...iso(lineDoc.rows.filter((r) => r.identity.market === pkg.variant && ids.has(String(r.identity.playerId))))];
}

function captionContext(pkg, lane) {
  const evidenceRef = pkg.snapshotRefs[0].ref;
  const raw = lane.games.find((g) => String(g.providerEventId) === String(pkg.content?.eventId ?? pkg.content?.game?.eventId));
  if (!raw) return { evidenceRef };
  const winner = raw.elo?.state === "FAVOURED" ? (raw.elo.favoured === raw.home.abbr ? raw.home : raw.away) : null;
  if (!winner) throw new Error("NO_PREDICTED_TEAM");
  const game = { awayName: raw.away.name, homeName: raw.home.name, winnerNickname: teamOf(winner.abbr, winner.name).nickname };
  return { evidenceRef, game, pick: selectCaptionPlayers([...raw.players.away, ...raw.players.home], pkg.anomalies ?? []) };
}

export async function runException({ asOf, png = true, env = process.env, nowMs = Math.max(Date.parse(asOf), Date.now()), packages = path.join(DEFAULT_PRIVATE_ROOT, "packages"), outRoot = path.join(DEFAULT_PRIVATE_ROOT, "exception-2026-10-30"), appPublic = path.join(APP, "public") }) {
  const lane = JSON.parse(fs.readFileSync(path.join(appPublic, `data/nba/experimental-public/${EXCEPTION_DATE}.json`), "utf8"));
  const names = new Map(lane.games.flatMap((g) => [...g.players.away, ...g.players.home].map((p) => [String(p.providerAthleteId), p.name])));
  const rebuild = rebuilder(env);
  assertPrivateOutDir(outRoot);
  const report = [];
  for (const slug of exceptionSlugs(lane.games.map((g) => String(g.providerEventId)))) {
    const say = (status, o = {}) => report.push({ slug, status, ...o });
    const file = path.join(packages, `${slug}.json`);
    if (!fs.existsSync(file)) { say("NO_REVIEW_PACKAGE"); continue; }
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    const scope = packageScopeProblems(pkg);
    if (scope.length) { say("REFUSED", { problems: scope }); continue; }
    if (hasStarted(pkg, nowMs)) { say(EXCEPTION_STATUS.STARTED); continue; }
    if (needsLines(pkg) && !env.GTP_ODDS_DISPLAY_KEY) { say("NEEDS_DISPLAY_KEY"); continue; }
    try {
      const { posts, lineDoc } = rebuild(pkg);
      const post = posts.find((p) => dedupeSlug(p) === slug);
      if (!post) throw new Error("the card could not be rebuilt");
      const diffs = [["content", post.content, pkg.content], ["snapshotRefs", post.snapshotRefs, pkg.snapshotRefs], ["anomalies", post.anomalies ?? null, pkg.anomalies ?? null], ["cells", post.cards.flatMap((c) => Object.entries(c.cells)).map(([k, v]) => [k, v]), pkg.commandCenter.claims.filter((c) => !(post.extraClaims ?? []).some((e) => e.key === c.key)).map((c) => [c.key, c.display])]].filter(([, a, b]) => !same(a, b)).map(([k]) => k);
      if (diffs.length) throw new Error(`rebuild differs from the review package: ${diffs.join(", ")}`);
      const cards = post.cards.map((c) => ({ name: c.name, html: withoutBanner(c.html), reviewed: c.html }));
      const bad = cards.flatMap((c) => sameDisplayProblems(c.reviewed, c.html, DISCLOSURE));
      if (bad.length) throw new Error(bad.join("; "));
      const { pick, ...ctx } = captionContext(pkg, lane);
      const { caption, claims } = exceptionCaption(pkg, { ...ctx, players: pick?.players });
      const q = quoteStatus(quoteTimes(pkg, lineDoc), nowMs);
      if (pkg.containsMarketData && q.quoteAgeHours == null) throw new Error("no stored quote time found");
      const dir = path.join(outRoot, slug);
      const images = png ? await renderCleanImages(cards, dir) : cards.map((c) => ({ path: `${c.name}.png`, width: SIZE.width, height: SIZE.height, scale: 1, sha256: sha(c.html) }));
      const out = buildExceptionPackage(pkg, { caption, claims, images, quoteAgeHours: q.quoteAgeHours, limitations: limitationsOf(pkg.anomalies, (id) => names.get(String(id)) ?? null) });
      const problems = exceptionPackageProblems(out, pkg);
      if (problems.length) throw new Error(problems.join("; "));
      if (png) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(out, null, 2)}\n`); }
      const unflagged = pkg.contentType === "NBA_GAME_POST" && pick.fallback ? { captionFallbackPlayers: pick.fallbackPlayers.map((id) => names.get(id)) } : {};
      say(q.status, { dedupeId: pkg.dedupeId, contentSha256: out.contentSha256, quoteAgeHours: q.quoteAgeHours, flagged: out.limitations.flaggedPlayers.length, ...unflagged });
    } catch (e) { say("REFUSED", { problems: [e.message] }); }
  }
  return report;
}

async function main(argv) {
  const flag = argv.includes("--oct30-exception");
  const at = argv.indexOf("--as-of");
  const asOf = at >= 0 ? argv[at + 1] : null;
  const d = argv.indexOf("--date");
  if (!/T.*(Z|[+-]\d\d:\d\d)$/.test(String(asOf)) || !Number.isFinite(Date.parse(asOf))) throw new Error("--as-of <real now, ISO with zone> is required");
  const nowMs = Math.max(Date.parse(asOf), Date.now());
  const run = exceptionRunProblems({ flag, date: d >= 0 ? argv[d + 1] : EXCEPTION_DATE, nowMs });
  if (run.length) throw new Error(run.join("; "));
  const png = !argv.includes("--no-png");
  const report = await runException({ asOf, png, nowMs });
  const dir = path.join(DEFAULT_PRIVATE_ROOT, "reports");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `exception-2026-10-30-${new Date(nowMs).toISOString().replace(/[:.]/g, "")}.json`);
  fs.writeFileSync(f, `${JSON.stringify({ exception: EXCEPTION, asOf, now: new Date(nowMs).toISOString(), png, posts: report }, null, 2)}\n`);
  for (const r of report) console.log(`${r.status} ${r.slug}${r.quoteAgeHours != null ? ` quoteAgeHours=${r.quoteAgeHours}` : ""}${r.flagged ? ` flagged=${r.flagged}` : ""}${r.captionFallbackPlayers ? ` flaggedInCaption=${r.captionFallbackPlayers.join(",")}` : ""}${r.problems ? ` ${r.problems.join(" | ")}` : ""}`);
  console.log(f);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(`REFUSED: ${e.message}`); process.exit(1); });
