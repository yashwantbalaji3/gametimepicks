/**
 * NBA SIMULATION THEATER · POSSESSION RUNS — offline generator of the private event-stream artifact the Theater plays.
 * NBA RESEARCH PROTOTYPE · dataClass PRIVATE_RESEARCH · productEligible: false. Writes ONE file:
 *   data/internal/research/nba/theater-possession/<date>.json
 *
 * AS OF TIP, NO POST-TIP INFORMATION. For each game of the committed v1 receipt (experimental-v1/forecasts/<date>.json)
 * the generator rebuilds EXACTLY the as-of inputs that receipt used, and refuses on any mismatch:
 *   asOf      = the receipt's own inputAsOf (= receipt.generatedAt, strictly before tip — receiptIntegrity + preTip).
 *   rosters   = the git blob of data/internal/research/nba/rosters/latest.json whose sha256 equals receipt.inputs.rosters.sha256.
 *   injuries  = the git blob of data/internal/research/injuries/nba/latest.json whose sha256 equals receipt.inputs.injuries.sha256.
 *   box scores= corpus boxscores/ + the families' fetched boxscores/ folded with season-fold.mjs foldBoxscores({ now: asOf })
 *               (a doc captured after asOf is skipped); the folded count must equal receipt.inputs.fetchedBoxscores.folded
 *               and the doc count receipt.inputs.boxscores.docs.
 *   v1 sides  = roster-gated-pool.mjs gatePool + sim-v1-profile.mjs buildSideProfile — the producer's own calls — and
 *               every reconstructed player must match the receipt's frozen player rows (ids, order, minutes mean/SD,
 *               play rate, per-minute rates, 3P%) to the receipt's stored precision. Any difference REFUSES.
 *   possession sides = profile-ext.mjs buildPossessionSide over the same folded box scores at the same asOf.
 * The engine then plays a FIXED SEED POOL (runIndex 0 … --pool − 1, the engine's default seed policy). EVERY pool draw
 * is checked with checkPossessionDraw (P1–P11); one violation refuses the whole artifact. The stored runs are picked by
 * lib/simulation-theater/nba/possession/selection.mjs against the OFFICIAL snapshot (Elo side + v0.1 players,
 * lib/consistency/official-snapshot.mjs) — the official numbers choose the default run; nothing flows the other way.
 *
 * Run (from app/, single process, low priority; reads git history read-only):
 *   nice -n 19 npx tsx scripts/nba/research/build-theater-possession-runs.mjs --date 2026-10-20 [--pool 1000] [--write]
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { gatePool } from "../../../src/lib/sports/nba/roster-gated-pool.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";
import { simulateGameV1 } from "../../../src/lib/sports/nba/game-sim-v1.mjs";
import { indexExtended, leagueExtended, buildPossessionSide } from "../../../src/lib/sports/nba/research/possession-sim/profile-ext.mjs";
import { preparePossessionGame, simulatePossessionDraw } from "../../../src/lib/sports/nba/research/possession-sim/engine.mjs";
import { checkPossessionDraw } from "../../../src/lib/sports/nba/research/possession-sim/invariants.mjs";
import { BOX_KEYS, boxToJson } from "../../../src/lib/sports/nba/research/possession-sim/events.mjs";
import { POSSESSION_SIM_VERSION, FITTED, FIT_REPORT, POSSESSION_PARAMS } from "../../../src/lib/sports/nba/research/possession-sim/params.mjs";
import { canonicalJson, receiptIntegrity, sha256 } from "../../../src/lib/sports/nba/forecast-receipt.mjs";
import { nbaOfficialSnapshot } from "../../../src/lib/consistency/official-snapshot.mjs";
import { officialTargets } from "../../../src/lib/consistency/representative.mjs";
import { DEFAULT_POOL_SIZE, POSSESSION_SELECTION_RULES, poolFeatures, selectPossessionRuns } from "../../../src/lib/simulation-theater/nba/possession/selection.mjs";
import { officialPanel } from "../../../src/lib/simulation-theater/nba/possession/payload.mjs";
import { POSSESSION_ARTIFACT, POSSESSION_ARTIFACT_SCHEMA, POSSESSION_CHECKER, ledgerColumns, possessionArtifactPath } from "../../../src/lib/simulation-theater/nba/possession/artifact-contract.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const DATE = opt("--date", null);
const POOL = Number(opt("--pool", DEFAULT_POOL_SIZE));
const WRITE = argv.includes("--write");
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(1); }
if (!Number.isInteger(POOL) || POOL < 10) { console.error("REFUSED: --pool must be an integer ≥ 10"); process.exit(1); }

const refuse = (msg) => { console.error(`REFUSED: ${msg}`); process.exit(1); };
const fileSha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

/** The git blob of `relPath` whose sha256 is `want` (newest first), or null. Read-only. */
function blobBySha(relPath, want) {
  const commits = execFileSync("git", ["log", "--format=%H", "-n", "400", "--", relPath], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const c of commits) {
    for (const ref of [c, `${c}^`]) {
      let buf;
      try { buf = execFileSync("git", ["show", `${ref}:${relPath}`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }); } catch { continue; }
      if (fileSha(buf) === want) return { commit: execFileSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" }).trim(), text: buf.toString("utf8") };
    }
  }
  return null;
}

const decimals = (x) => { const s = String(x); const i = s.indexOf("."); return i === -1 ? 0 : s.length - i - 1; };
const sameAt = (mine, stored) => stored == null ? mine == null : Number.isFinite(mine) && Number(mine.toFixed(decimals(stored))) === stored;

/** Reconstructed v1 side vs the receipt's frozen player rows. Returns the list of differences ([] = identical). */
function profileDiffs(profile, frozen) {
  const out = [];
  if (profile.players.length !== frozen.length) out.push(`player count ${profile.players.length} ≠ receipt ${frozen.length}`);
  profile.players.forEach((p, i) => {
    const f = frozen[i];
    if (!f || String(f.providerAthleteId) !== String(p.providerAthleteId)) { out.push(`row ${i}: ${p.providerAthleteId} ≠ receipt ${f?.providerAthleteId}`); return; }
    const checks = [["playRateInput", p.playRate, f.playRateInput], ["p3", p.p3, f.p3], ["starterRate", p.starterRate, f.starterRate], ["shrinkWeight", p.shrinkWeight, f.shrinkWeight], ["gamesUsed", p.gamesUsed, f.gamesUsed], ["gamesThisSeason", p.gamesThisSeason, f.gamesThisSeason], ["gamesPriorSeason", p.gamesPriorSeason, f.gamesPriorSeason]];
    if ((p.historyBasis ?? null) !== (f.historyBasis ?? null)) out.push(`${p.providerAthleteId} historyBasis: rebuilt ${p.historyBasis} ≠ receipt ${f.historyBasis}`);
    for (const k of Object.keys(f.rates ?? {})) checks.push([`rates.${k}`, p.rates?.[k], f.rates[k]]);
    for (const [k, mine, stored] of checks) if (!sameAt(mine, stored)) out.push(`${p.providerAthleteId} ${k}: rebuilt ${mine} ≠ receipt ${stored}`);
  });
  return out;
}

const v1Path = path.join(NBA, "experimental-v1", "forecasts", `${DATE}.json`);
const offPath = path.join(NBA, "experimental-v0.1", "forecasts", `${DATE}.json`);
if (!fs.existsSync(v1Path) || !fs.existsSync(offPath)) refuse(`missing ${rel(v1Path)} or ${rel(offPath)}`);
const v1Bytes = fs.readFileSync(v1Path), offBytes = fs.readFileSync(offPath);
const v1Doc = JSON.parse(v1Bytes.toString("utf8")), offDoc = JSON.parse(offBytes.toString("utf8"));
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const readBoxDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort().map((f) => readJson(path.join(dir, f))) : []);
const corpusBox = readBoxDir(path.join(NBA, "boxscores"));
const fetchedBox = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
const fitBytes = fs.readFileSync(path.join(ROOT, FIT_REPORT));
const ledgerKeys = ledgerColumns();

const blobCache = new Map();
const blob = (p, want) => { const k = `${p}@${want}`; if (!blobCache.has(k)) blobCache.set(k, blobBySha(p, want)); return blobCache.get(k); };

const games = [];
const t0 = Date.now();
for (const g of v1Doc.games ?? []) {
  const id = String(g.providerEventId);
  const integ = receiptIntegrity(g);
  if (integ.state !== "OK") refuse(`${id}: v1 receipt ${integ.state}`);
  const asOf = g.forecast?.inputAsOf;
  if (!asOf || asOf !== g.receipt.generatedAt || !(Date.parse(asOf) < Date.parse(g.dateUtc))) refuse(`${id}: inputAsOf ${asOf} is not the receipt instant strictly before tip ${g.dateUtc}`);
  const ri = g.receipt.inputs;
  if (corpus.generatedAt !== ri.corpus.generatedAt || (corpus.rows ?? []).length !== ri.corpus.rows) refuse(`${id}: corpus-v1.json differs from the receipt's (${ri.corpus.generatedAt}/${ri.corpus.rows})`);
  const rosterBlob = blob("data/internal/research/nba/rosters/latest.json", ri.rosters.sha256);
  const injuryBlob = blob("data/internal/research/injuries/nba/latest.json", ri.injuries.sha256);
  if (!rosterBlob) refuse(`${id}: no git blob of rosters/latest.json has sha256 ${ri.rosters.sha256}`);
  if (!injuryBlob) refuse(`${id}: no git blob of injuries/nba/latest.json has sha256 ${ri.injuries.sha256}`);
  const rosters = JSON.parse(rosterBlob.text), injuries = JSON.parse(injuryBlob.text);
  const fold = foldBoxscores(corpusBox, fetchedBox, { now: asOf });
  if (fold.added !== ri.fetchedBoxscores?.folded || fold.docs.length !== ri.boxscores?.docs) refuse(`${id}: box-score fold at ${asOf} gives ${fold.added} folded / ${fold.docs.length} docs, receipt ${ri.fetchedBoxscores?.folded} / ${ri.boxscores?.docs}`);
  const boxscores = fold.docs;
  const population = g.population;
  const index = indexBoxscores(boxscores);
  const league = leagueMeans(index, { asOf, population });
  const cache = new Map();
  const v1Side = (s, key) => {
    const gated = gatePool({ rosters, providerTeamId: s.providerTeamId, boxscores, asOfDateUtc: asOf, injuries: injuries.entries ?? null, population, teamMinutesCache: cache });
    if (gated.state === "REFUSED") refuse(`${id} ${key}: roster gate refused (${gated.reason})`);
    const prof = buildSideProfile(index, { teamId: String(s.providerTeamId), rosterRows: gated.rows, asOf, population, league });
    const diffs = profileDiffs(prof, g.forecast.players[key]);
    if (diffs.length) refuse(`${id} ${key}: rebuilt v1 side differs from the frozen receipt — ${diffs.slice(0, 6).join("; ")}`);
    return prof;
  };
  const ph = v1Side(g.home, "home"), pa = v1Side(g.away, "away");
  // strongest check: replay the v1 engine on the rebuilt sides (receipt's frozen ratings + Elo, its seed policy and draw
  // count) — the frozen players and sim blocks must come back byte-identical, so the profiles are the receipt's own.
  const replay = simulateGameV1({ providerEventId: id, inputAsOf: asOf, neutralSite: g.neutralSite === true, home: { name: g.home.name, providerTeamId: String(g.home.providerTeamId), rating: g.home.rating, profile: ph }, away: { name: g.away.name, providerTeamId: String(g.away.providerTeamId), rating: g.away.rating, profile: pa }, league, eloWinProbability: g.forecast.elo.pHome, simulations: g.forecast.simulations });
  for (const k of ["players", "sim"]) if (canonicalJson(replay[k]) !== canonicalJson(g.forecast[k])) refuse(`${id}: v1 replay on the rebuilt inputs does not reproduce the receipt's frozen ${k} block`);
  const ext = indexExtended(boxscores);
  const fitted = { theta: FITTED.AND_ONE_PER_FGM, tau: FITTED.THREE_SHOT_TRIPS_PER_MIN };
  const leagueExt = leagueExtended(ext, { asOf, population, fitted });
  const home = { name: g.home.name, providerTeamId: String(g.home.providerTeamId), side: buildPossessionSide(ext, { v1Side: ph, asOf, population, leagueExt, fitted }) };
  const away = { name: g.away.name, providerTeamId: String(g.away.providerTeamId), side: buildPossessionSide(ext, { v1Side: pa, asOf, population, leagueExt, fitted }) };
  const engineInputs = { providerEventId: id, inputAsOf: asOf, neutralSite: g.neutralSite === true, home, away, leagueV1: league, leagueExt };
  const prep = preparePossessionGame({ ...engineInputs, params: POSSESSION_PARAMS });

  // official snapshot (the same call the Theater loader makes) → the targets that choose the default run
  const snapshot = nbaOfficialSnapshot(id, { official: { doc: offDoc, path: rel(offPath), sha256: fileSha(offBytes) }, supporting: { doc: v1Doc, path: rel(v1Path), sha256: fileSha(v1Bytes) } });
  const targets = officialTargets(snapshot);
  const officialSide = snapshot.game?.winner?.side ?? null;

  const features = [];
  let checked = 0;
  for (let i = 0; i < POOL; i += 1) {
    const d = simulatePossessionDraw(prep, i);
    const v = checkPossessionDraw(d, prep.rosters);
    if (v.length) refuse(`${id} pool draw ${i}: INVARIANT VIOLATION ${v.slice(0, 5).join("; ")}`);
    checked += 1;
    const lines = prep.rosters.flatMap((ids, t) => ids.map((pid) => ({ providerAthleteId: pid, ...d.box.players[t].get(pid) })));
    features.push(poolFeatures({ runIndex: i, final: d.final, overtimePeriods: d.overtimePeriods, lines }, targets));
  }
  const sel = selectPossessionRuns(features, officialSide);
  const runs = sel.picks.map((pk) => {
    const d = simulatePossessionDraw(prep, pk.runIndex);
    const v = checkPossessionDraw(d, prep.rosters);
    if (v.length) refuse(`${id} stored run ${pk.runIndex}: INVARIANT VIOLATION ${v.slice(0, 5).join("; ")}`);
    const f = features.find((x) => x.runIndex === pk.runIndex);
    return {
      kind: pk.kind, runIndex: pk.runIndex, rule: pk.rule, distance: f.distance,
      final: d.final, periods: d.periods, overtimePeriods: d.overtimePeriods,
      notes: { disqualifiedStayed: d.notes.disqualifiedStayed, fouledOut: d.notes.fouledOut, lateFouls: d.notes.lateFouls, subs: d.notes.subs, segments: d.notes.segments, possessions: d.notes.possessions },
      events: d.events,
      ledger: d.ledger.map((side) => side.map((l) => ledgerKeys.map((k) => l[k]))),
      boxDigest: sha256(canonicalJson(boxToJson(d.box))),
      checker: { ...POSSESSION_CHECKER, violations: 0 },
    };
  });
  const names = new Map([...ph.players, ...pa.players].map((p) => [String(p.providerAthleteId), p.name ?? null]));
  const roster = (t) => prep.rosters[t].map((pid) => ({ providerAthleteId: pid, name: names.get(pid) ?? null }));
  const margins = features.map((f) => f.home - f.away);
  games.push({
    providerEventId: id, dateUtc: g.dateUtc, venue: g.venue ?? null, neutralSite: g.neutralSite === true,
    home: { name: g.home.name, abbr: g.home.abbr, providerTeamId: String(g.home.providerTeamId) },
    away: { name: g.away.name, abbr: g.away.abbr, providerTeamId: String(g.away.providerTeamId) },
    inputAsOf: asOf,
    inputs: {
      v1Receipt: { path: rel(v1Path), payloadSha256: g.receipt.payloadSha256, generatedAt: g.receipt.generatedAt, profileRebuild: "V1_REPLAY_BYTE_IDENTICAL (players + sim blocks)" },
      rosters: { path: "data/internal/research/nba/rosters/latest.json", sha256: ri.rosters.sha256, gitBlobCommit: rosterBlob.commit },
      injuries: { path: "data/internal/research/injuries/nba/latest.json", sha256: ri.injuries.sha256, gitBlobCommit: injuryBlob.commit },
      boxscores: { docs: boxscores.length, folded: fold.added, skipped: fold.skipped },
      engineInputsSha256: sha256(canonicalJson({ ...engineInputs, leagueV1: league })),
    },
    // the official panel, copied verbatim from the snapshot (payload.mjs officialPanel) — what the public candidate
    // renders; possession-loader.mjs refuses the artifact if it ever differs from a fresh rebuild (OFFICIAL_PANEL_DRIFT)
    official: { snapshotId: snapshot.snapshotId, winnerSide: officialSide, modelVersion: snapshot.modelVersions?.game ?? null, targetPlayers: Object.keys(targets.players).length, panel: officialPanel(snapshot) },
    seed: prep.seed, seedPolicy: prep.seedPolicy, poolSize: POOL,
    pool: {
      checkedDraws: checked, violations: 0,
      homeWinShare: Number((features.filter((f) => f.home > f.away).length / POOL).toFixed(4)),
      overtimeShare: Number((features.filter((f) => f.ot > 0).length / POOL).toFixed(4)),
      totals: { p10: sel.poolTotals.p10, p90: sel.poolTotals.p90 },
      margin: { p10: features.length ? [...margins].sort((a, b) => a - b)[Math.ceil(0.1 * POOL) - 1] : null },
      features: features.map((f) => [f.runIndex, f.home, f.away, f.ot, f.distance]),
      featureColumns: ["runIndex", "home", "away", "overtimePeriods", "distance"],
    },
    selection: { missing: sel.missing },
    rosters: { home: roster(0), away: roster(1) },
    runs,
  });
  console.log(`${id} ${g.away.abbr}@${g.home.abbr}: pool ${POOL} checked · official side ${officialSide} · picks ${sel.picks.map((p) => `${p.kind}#${p.runIndex}`).join(" ")} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const doc = {
  schema: POSSESSION_ARTIFACT_SCHEMA, artifact: POSSESSION_ARTIFACT,
  dataClass: "PRIVATE_RESEARCH", productEligible: false, feedsProducts: false,
  neverReadBy: "any product, board, recommendation or official snapshot — the Theater only, labelled as a research simulation",
  date: DATE, generatedAt: new Date().toISOString(),
  modelVersion: POSSESSION_SIM_VERSION,
  engine: { fitReport: { path: FIT_REPORT, sha256: fileSha(fitBytes) }, paramsSha256: sha256(canonicalJson(POSSESSION_PARAMS)), checker: POSSESSION_CHECKER, ledgerColumns: ledgerKeys },
  selectionRules: POSSESSION_SELECTION_RULES,
  sources: { v1: { path: rel(v1Path), sha256: fileSha(v1Bytes) }, official: { path: rel(offPath), sha256: fileSha(offBytes) } },
  games,
};
const out = path.join(ROOT, possessionArtifactPath(DATE));
if (WRITE) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(doc)}\n`);
  console.log(`wrote ${rel(out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KiB)`);
} else console.log(`dry run (pass --write to write ${rel(out)})`);
