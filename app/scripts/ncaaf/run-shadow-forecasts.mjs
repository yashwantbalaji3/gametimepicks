/**
 * NCAAF-005 · forward SHADOW forecasts for an upcoming week (docs/ncaaf/FORWARD_CAPTURE_PROTOCOL.md).
 * PRIVATE_RESEARCH — writes research receipts only; nothing is published, nothing is a GameTimePicks pick.
 *
 * Capture time is the REAL wall clock (no --now): a forward receipt's timestamp is evidence, not a label.
 *
 *   1. Refuse unless the forecasting code is committed and clean, and the NCAAF-002/003 freezes are ancestors.
 *   2. One bounded fresh ESPN snapshot: regular weeks 1..--week × FBS/FCS + season membership (cap 40).
 *      Raw bodies → .cache/raw/espn/forward/<capture>/ (gitignored).
 *   3. History = corpus v1 (hash-checked) + this season's played finals with slateDate < the earliest target slate.
 *   4. Warm the frozen models (C1 winner, C2 scores, W1 worlds) on that history; forecast every scheduled game of
 *      --week whose kickoff is ≥ MIN_LEAD_MINUTES away. No result of a target slate is ever observed.
 *   5. One write-once receipt per event (+ a run manifest). An existing receipt is never overwritten.
 *
 * Run (from app/): node scripts/ncaaf/run-shadow-forecasts.mjs --season 2026 --week 6
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSeasonCorpus, reconcileMembership } from "../../src/lib/sports/ncaaf/corpus.mjs";
import { ESPN_CFB_GROUPS, mergeEventRows, normalizeScoreboardEvent } from "../../src/lib/sports/ncaaf/espn-events.mjs";
import { forecastOfRecord, marketFromEvent, pregameRow, receiptPath } from "../../src/lib/sports/ncaaf/forward.mjs";
import { WORLD_ENGINE_VERSION, createWorldModel } from "../../src/lib/sports/ncaaf/game-worlds.mjs";
import { createModel } from "../../src/lib/sports/ncaaf/models.mjs";
import { walkForward } from "../../src/lib/sports/ncaaf/walk-forward.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const RES = path.join(ROOT, "data", "internal", "research", "ncaaf");
const CODE = ["espn-events", "corpus", "forward", "models", "game-worlds", "overtime", "walk-forward", "metrics"].map((f) => `app/src/lib/sports/ncaaf/${f}.mjs`).concat(["app/scripts/ncaaf/run-shadow-forecasts.mjs"]);
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
const CAP = 40;

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const SEASON = Number(arg("--season")), WEEK = Number(arg("--week"));
if (!Number.isInteger(SEASON) || !Number.isInteger(WEEK) || WEEK < 1 || WEEK > 16) { console.error("REFUSED: --season YYYY --week 1..16"); process.exit(1); }
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// 1 ── provenance guards
const head = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain", "--", ...CODE.map((f) => path.join(ROOT, f)));
if (dirty) { console.error(`REFUSED: forecasting code is not committed:\n${dirty}`); process.exit(1); }
const exp = (n) => JSON.parse(fs.readFileSync(path.join(RES, "experiments", n), "utf8"));
const f002 = exp("002-freeze.json"), f003 = exp("003-freeze.json");
for (const c of [f002.codeCommit, f003.codeCommit]) { try { git("merge-base", "--is-ancestor", c, "HEAD"); } catch { console.error(`REFUSED: freeze ${c} is not an ancestor of HEAD`); process.exit(1); } }

// 2 ── one fresh bounded snapshot
const capturedAt = new Date().toISOString();
const compact = capturedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const RAW = path.join(RES, ".cache", "raw", "espn", "forward", compact);
fs.mkdirSync(RAW, { recursive: true });
let requests = 0;
const bodies = [];
async function get(key, url) {
  if (requests >= CAP) throw new Error(`request cap ${CAP}`);
  requests++;
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url} — refusing a partial snapshot`);
  const text = await res.text();
  fs.writeFileSync(path.join(RAW, `${key}.json`), text);
  bodies.push(`${key}:${sha256(text)}`);
  return JSON.parse(text);
}
const rows = [], rawById = new Map();
for (let wk = 1; wk <= WEEK; wk++) {
  for (const grp of [ESPN_CFB_GROUPS.FBS, ESPN_CFB_GROUPS.FCS]) {
    const b = await get(`2-${wk}-${grp}`, `${SITE}/scoreboard?dates=${SEASON}&seasontype=2&week=${wk}&groups=${grp}&limit=500`);
    for (const e of b.events ?? []) {
      const n = normalizeScoreboardEvent(e, { capturedAt, sourceGroup: grp });
      if (!n.row) continue;
      rows.push(n.row);
      if (wk === WEEK) rawById.set(String(e.id), e);
    }
  }
}
const ids = (b) => (b?.items ?? []).map((it) => /\/teams\/(\d+)/.exec(it?.$ref ?? "")?.[1]).filter(Boolean);
const memRaw = { fbs: ids(await get("membership-80", `${CORE}/seasons/${SEASON}/types/2/groups/80/teams?limit=400`)), fcs: ids(await get("membership-81", `${CORE}/seasons/${SEASON}/types/2/groups/81/teams?limit=400`)) };
const snapshotSha256 = sha256(bodies.sort().join("\n"));
const { events, conflicts } = mergeEventRows(rows);
if (conflicts.length) { console.error(`REFUSED: ${conflicts.length} provider conflicts in the snapshot`); process.exit(1); }
const membership = reconcileMembership(memRaw, events);

// 3 ── targets and history
const targets = [], refused = [];
for (const e of events.filter((x) => x.week === WEEK && x.seasonType === 2)) {
  const p = pregameRow(e, membership, capturedAt);
  if (p.refused) { refused.push({ eventId: p.eventId, reason: p.refused }); continue; }
  if (p.row.pairing !== "FBS-FBS" && p.row.pairing !== "FBS-FCS") { refused.push({ eventId: p.row.eventId, reason: `NOT_IN_POPULATION_${p.row.pairing}` }); continue; }
  targets.push({ row: p.row, event: e });
}
if (!targets.length) { console.error("REFUSED: no forecastable events in the snapshot"); process.exit(1); }
const firstTargetSlate = targets.map((t) => t.row.slateDate).sort()[0];
const v1Text = fs.readFileSync(path.join(RES, "corpus", "v1", "manifest.json"), "utf8");
const v1 = JSON.parse(v1Text);
const hist = Object.keys(v1.seasons).map(Number).sort().flatMap((s) => {
  const text = fs.readFileSync(path.join(RES, "corpus", "v1", `games-${s}.jsonl`), "utf8");
  if (sha256(text) !== v1.seasons[s].sha256) { console.error(`REFUSED: corpus v1 ${s} hash mismatch`); process.exit(1); }
  return text.trim().split("\n").map((l) => JSON.parse(l));
});
const seasonFinals = buildSeasonCorpus(SEASON, events, memRaw).rows.filter((r) => r.slateDate < firstTargetSlate);
const history = [...hist, ...seasonFinals];
const otText = fs.readFileSync(path.join(RES, "corpus", "v1", "overtime-periods.json"), "utf8");
const ot = JSON.parse(otText);

// 4 ── warm the frozen models, then forecast each target slate without observing anything from it
const C1 = createModel(f002.winnerChampion.spec), C2 = createModel(f002.scoreChampion.spec);
const W1 = createWorldModel(createModel(f002.scoreChampion.spec), { otRows: ot.games, quarantinedIds: new Set(ot.quarantined.map((q) => q.eventId)) });
for (const m of [C1, C2, W1]) walkForward(m, history);
const out = new Map();
for (const slate of [...new Set(targets.map((t) => t.row.slateDate))].sort()) {
  for (const m of [C1, C2, W1]) m.beginSlate(slate, SEASON);
  for (const t of targets.filter((x) => x.row.slateDate === slate)) out.set(t.row.eventId, { c1: C1.predict(t.row), c2: C2.predict(t.row), w1: W1.predict(t.row) });
}

// 5 ── write-once receipts
const written = [];
for (const { row, event } of targets) {
  const rel = receiptPath(SEASON, row.slateDate, row.eventId, capturedAt);
  const file = path.join(RES, rel);
  if (fs.existsSync(file)) { console.error(`REFUSED: receipt exists (write-once): ${rel}`); process.exit(1); }
  const dir = path.dirname(file);
  const prior = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : [];
  const f = out.get(row.eventId);
  const { worlds, ...c2 } = f.c2;
  const receipt = {
    schemaVersion: "ncaaf-forecast-receipt@1",
    publicationStatus: "SHADOW",
    maturity: "RESEARCH_ONLY",
    disclaimer: "Private research shadow forecast. Not published, not a GameTimePicks pick, not model-qualified.",
    capturedAt,
    event: {
      eventId: row.eventId, season: row.season, seasonType: row.seasonType, week: row.week, slateDate: row.slateDate,
      startUtcAtCapture: event.startUtc, kickoffTimeKnown: event.kickoffTimeKnown, pairing: row.pairing,
      homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId, homeAbbreviation: event.home.abbreviation, awayAbbreviation: event.away.abbreviation,
      neutralSite: row.neutralSite, conferenceGame: row.conferenceGame, providerVenueId: event.providerVenueId,
    },
    asOf: { rule: `results with slateDate < ${firstTargetSlate}`, historyGames: history.length, seasonFinalsUsed: seasonFinals.length, lastResultSlate: seasonFinals.at(-1)?.slateDate ?? null },
    inputs: { corpusV1ManifestSha256: sha256(v1Text), snapshotSha256, overtimeTableSha256: sha256(otText), snapshotRequests: requests },
    code: { commit: head, clean: true, worldEngine: WORLD_ENGINE_VERSION },
    models: {
      winner: { id: "C1", spec: f002.winnerChampion.spec, freezeCommit: f002.codeCommit, status: "research champion; failed NCAAF-002 calibration bar (b)" },
      score: { id: "C2", spec: f002.scoreChampion.spec, freezeCommit: f002.codeCommit },
      worlds: { engine: WORLD_ENGINE_VERSION, freezeCommit: f003.codeCommit, status: "structural gate passed; key margins 3/7 under-produced — not for spread pricing" },
    },
    forecast: {
      winner: { pHome: f.c1.pHome, source: "C1", eloDelta: f.c1.delta },
      score: { pHome: c2.pHome, homeMean: c2.homeMean, awayMean: c2.awayMean, marginMean: c2.marginMean, marginSd: c2.marginSd, totalMean: c2.totalMean, totalSd: c2.totalSd, rho: c2.rho, pointForecasts: "means" },
      worlds: f.w1.worlds,
    },
    market: marketFromEvent(rawById.get(row.eventId), capturedAt),
    lineage: { predecessors: prior.map((n) => `${path.posix.dirname(rel)}/${n}`) },
  };
  const body = `${JSON.stringify(receipt, null, 2)}\n`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, body, { flag: "wx" }); // wx: fail if the file appeared in the meantime
  written.push({ path: rel, sha256: sha256(body) });
  // Sanity: the receipt just written must be its own forecast of record (captured before its kickoff).
  if (forecastOfRecord([receipt]) !== receipt) throw new Error(`${row.eventId}: receipt is not pre-kickoff`);
}
const runRel = `forecasts/${SEASON}/runs/${compact}.json`;
fs.mkdirSync(path.join(RES, path.posix.dirname(runRel)), { recursive: true });
fs.writeFileSync(path.join(RES, runRel), `${JSON.stringify({
  schemaVersion: 1, capturedAt, season: SEASON, week: WEEK, codeCommit: head, snapshotSha256, requests,
  asOfRule: `results with slateDate < ${firstTargetSlate}`, receipts: written, refused: refused.sort((a, b) => a.eventId.localeCompare(b.eventId)),
}, null, 2)}\n`, { flag: "wx" });
const pairings = targets.reduce((o, t) => ((o[t.row.pairing] = (o[t.row.pairing] ?? 0) + 1), o), {});
console.log(`captured ${capturedAt} · ${written.length} receipts ${JSON.stringify(pairings)} · refused ${refused.length} · ${requests} requests · code ${head.slice(0, 10)}`);
