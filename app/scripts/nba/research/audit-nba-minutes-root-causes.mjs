/**
 * NBA minutes root-cause audit. RESEARCH ONLY: dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 *   npx tsx scripts/nba/research/audit-nba-minutes-root-causes.mjs --out-dir <dir outside the repo> [--bootstrap 2000]
 *
 * Needs the candidate commits locally: git fetch origin claude/nba-projection-coverage-gap claude/nba-minutes-eligibility-challenger
 *
 * Reads committed data and git history only. No network, no paid API, no build. Writes ONLY to --out-dir, which must be
 * outside the repository; it never touches a forecast, lane, ledger or receipt. Doc: docs/nba/NBA_MINUTES_ROOT_CAUSE_AUDIT_2026-11-02.md.
 *
 * WHAT IT DOES
 *   1. For every committed lane date it re-derives the frozen v0.1 pool (gatePool + prepareRoster) from the receipt's own
 *      roster and injury blobs and REFUSES unless every side matches the frozen raw sum, factor and player minutes.
 *   2. It re-derives v0.3 the same way from the frozen v0.3 receipts (forward receipts, 10-22 on).
 *   3. It replays v0.4 (PR 1180) and v0.5 (PR 1281) from their pinned source commits, on v0.3's freeze inputs. Those two
 *      are replays, never receipts; only games after the pinned commit count as out-of-sample.
 *   4. It joins actual box scores and writes report.md (every table the doc quotes), summary.json, sides.json and rows.json to --out-dir.
 * Intervals are percentile bootstraps resampling GAMES. Below MIN_CLUSTERS the interval is labelled FEW_CLUSTERS and
 * must not be quoted (few-cluster bootstrap rule).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { gatePool } from "../../../src/lib/sports/nba/roster-gated-pool.mjs";
import { prepareRoster, mulberry32 } from "../../../src/lib/sports/nba/game-sim.mjs";
import { prepareRosterV03 } from "../../../src/lib/sports/nba/game-sim-v03.mjs";
import { gatePoolV03, indexRoleHistory, NORMALISATION } from "../../../src/lib/sports/nba/minutes-model-v03.mjs";
import { inPopulation } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src", "lib", "sports", "nba");
const APP = path.resolve(SRC_DIR, "..", "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const LANES = path.join(APP, "public", "data", "nba", "experimental-public");
const V04_SHA = "3ff030b0b28d56acb77269a44ae68c3b425eb06c"; // PR 1180 head
const V05_SHA = "d5119832bf3275bfb709c0b12c5135682056378b"; // PR 1281 head
const MIN_CLUSTERS = 10;
const TRIGGER = 41;

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const OUT = arg("--out-dir") ? path.resolve(arg("--out-dir")) : null;
const B = Number(arg("--bootstrap") ?? 2000);
const refuse = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };
if (!OUT) refuse("--out-dir <dir> required (outside the repository)");
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) refuse(`--out-dir ${OUT} is inside the repository`);

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const readBoxDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(dir, f))) : []);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(1)));
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(3)));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, ...opts });

/* ---------- candidate sources, at their pinned commits, with imports pointed at this tree ---------- */
async function loadCandidate(commit, rel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nba-audit-"));
  const src = git(["show", `${commit}:${rel}`], { encoding: "utf8" }).replace(/from "\.\/([^"]+)"/g, (_, f) => `from ${JSON.stringify(pathToFileURL(path.join(SRC_DIR, f)).href)}`);
  const f = path.join(dir, path.basename(rel));
  fs.writeFileSync(f, src);
  return import(pathToFileURL(f).href);
}

/* ---------- git blobs by sha256 ---------- */
const blobCache = new Map(); // `${rel}` → Map(sha256 → text)
function blobIndex(rel, wanted) {
  const have = blobCache.get(rel) ?? new Map();
  blobCache.set(rel, have);
  if ([...wanted].every((w) => have.has(w))) return have;
  const commits = git(["log", "--format=%H", "--", rel], { encoding: "utf8" }).split("\n").filter(Boolean);
  const seen = new Set();
  for (const c of commits) {
    if ([...wanted].every((w) => have.has(w))) break;
    for (const ref of [c, `${c}^`]) {
      let b;
      try { b = git(["rev-parse", `${ref}:${rel}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { continue; }
      if (seen.has(b)) continue;
      seen.add(b);
      const buf = git(["cat-file", "blob", b]);
      have.set(sha(buf), buf.toString("utf8"));
    }
  }
  return have;
}

/* ---------- interval text ---------- */
const fmt = (c) => (c.mean == null ? "n/a" : `${c.mean} (${c.lo}, ${c.hi}) n=${c.n} g=${c.clusters}${c.label === "FEW_CLUSTERS" ? " FEW_CLUSTERS" : ""}`);

/* ---------- load ---------- */
console.error("loading corpus and box scores");
const corpusBox = readBoxDir(path.join(NBA, "boxscores"));
const fetchedBox = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
const FAR = "2099-01-01T00:00:00Z";
const allDocs = foldBoxscores(corpusBox, fetchedBox, { now: FAR }).docs;
const docById = new Map(allDocs.map((d) => [String(d.providerEventId), d]));
const ledger = readJson(path.join(NBA, "experimental-v0.1", "ledger.json"));
const lastGrade = new Map();
for (const e of ledger.gradeEntries ?? []) lastGrade.set(String(e.providerEventId), e);

const laneDates = fs.readdirSync(LANES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d >= "2026-10-20").sort();
const v04 = await loadCandidate(V04_SHA, "app/src/lib/sports/nba/minutes-model-v04.mjs");
const v05 = await loadCandidate(V05_SHA, "app/src/lib/sports/nba/eligibility-gate-v05.mjs");
const commitDate = (c) => git(["log", "-1", "--format=%cI", c], { encoding: "utf8" }).trim();
const candidateFrozenAt = { v04: commitDate(V04_SHA), v05: commitDate(V05_SHA) };

/* ---------- corpus per-athlete history (for the trace and the coverage causes) ---------- */
const hist = new Map(); // id → { reg: {season: [{min,team,date}]}, post: {...}, dnp: {season:n}, name }
for (const d of corpusBox) {
  if (!d?.boxscoreAvailable) continue;
  const season = d.season;
  const isReg = inPopulation(d.phase, "regular");
  for (const p of d.players ?? []) {
    if (p?.providerAthleteId == null) continue;
    const id = String(p.providerAthleteId);
    let h = hist.get(id);
    if (!h) { h = { name: p.name, reg: {}, post: {}, dnp: {} }; hist.set(id, h); }
    if (d.phase === 1) continue;
    if (p.didNotPlay || !Number.isInteger(p.minutes)) { h.dnp[season] = (h.dnp[season] ?? 0) + 1; continue; }
    if (p.minutes <= 0) continue;
    const b = isReg ? h.reg : h.post;
    (b[season] ??= []).push({ min: p.minutes, team: String(p.providerTeamId), date: d.dateUtc, starter: p.starter === true, event: String(d.providerEventId) });
  }
}

/* current-season ledger of minutes by athlete (regular only), oldest first */
const curSeason = 2027;
const curGames = allDocs.filter((d) => d?.boxscoreAvailable && d.season === curSeason && inPopulation(d.phase, "regular")).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));
const curByAthlete = new Map();
const teamSchedule = new Map(); // team → sorted [dateUtc]
for (const d of curGames) {
  for (const t of d.teams ?? []) { const k = String(t.providerTeamId); if (!teamSchedule.has(k)) teamSchedule.set(k, []); teamSchedule.get(k).push(Date.parse(d.dateUtc)); }
  for (const p of d.players ?? []) {
    if (p?.providerAthleteId == null || p.didNotPlay || !Number.isInteger(p.minutes) || p.minutes <= 0) continue;
    const id = String(p.providerAthleteId);
    if (!curByAthlete.has(id)) curByAthlete.set(id, []);
    curByAthlete.get(id).push({ t: Date.parse(d.dateUtc), min: p.minutes, starter: p.starter === true, event: String(d.providerEventId), team: String(p.providerTeamId) });
  }
}

/* ---------- replay every freeze ---------- */
const sides = []; // one per team-game
const rows = []; // one per player-game-side (pool ∪ box)
const fidelity = { v01Sides: 0, v01Match: 0, v03Sides: 0, v03Match: 0, v01Mismatch: [], v03Mismatch: [], laneRows: 0, laneRowsMatchFrozen: 0, laneDatesMissingGames: [] };

const wantRoster = new Set(), wantInj = new Set();
const v01Docs = new Map(), v03Docs = new Map(), laneDocs = new Map();
for (const date of laneDates) {
  laneDocs.set(date, readJson(path.join(LANES, `${date}.json`)));
  const f1 = path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`);
  const f3 = path.join(NBA, "experimental-v0.3", "forecasts", `${date}.json`);
  if (fs.existsSync(f1)) { const d = readJson(f1); v01Docs.set(date, d); for (const g of d.games) { wantRoster.add(g.receipt.inputs.rosters.sha256); wantInj.add(g.receipt.inputs.injuries.sha256); } }
  if (fs.existsSync(f3)) v03Docs.set(date, readJson(f3));
}
console.error(`blobs wanted: rosters ${wantRoster.size}, injuries ${wantInj.size}`);
const rosterBlobs = blobIndex("data/internal/research/nba/rosters/latest.json", wantRoster);
const injBlobs = blobIndex("data/internal/research/injuries/nba/latest.json", wantInj);
const parsed = new Map();
const parse = (m, s) => { if (!m.has(s)) return null; if (!parsed.has(s)) parsed.set(s, JSON.parse(m.get(s))); return parsed.get(s); };

/** the 2×2×2 factor ladder for one side: W window (0 v0.1 window, 1 whole S−1 regular), C current season, S normalisation. */
function ladderRow({ v01raw, rec, seasons }) {
  const P = rec?.apps?.[seasons.priorSeason] ?? [], Cur = rec?.apps?.[seasons.currentSeason] ?? [];
  const nC = Cur.length, sumC = Cur.reduce((s, a) => s + a.minutes, 0);
  return (W, C, k = 10) => {
    let mP, nP;
    if (W === 0) { mP = v01raw?.expectedMinutes ?? null; nP = v01raw?.gamesUsed ?? 0; } else { nP = P.length; mP = nP ? P.reduce((s, a) => s + a.minutes, 0) / nP : null; }
    if (C === 0 || nC === 0) return mP;
    if (mP == null || !nP) return sumC / nC;
    const w = Math.min(1, k / nP);
    return (w * nP * mP + sumC) / (w * nP + nC);
  };
}

for (const date of laneDates) {
  const doc = v01Docs.get(date);
  if (!doc) continue;
  const v03Doc = v03Docs.get(date) ?? null;
  const v03ById = new Map((v03Doc?.games ?? []).map((g) => [String(g.providerEventId), g]));
  const lane = laneDocs.get(date);
  const laneById = new Map((lane.games ?? []).map((g) => [String(g.providerEventId), g]));
  const byFreeze = new Map();
  for (const g of doc.games) { const k = g.receipt.generatedAt; if (!byFreeze.has(k)) byFreeze.set(k, []); byFreeze.get(k).push(g); }
  for (const [now, games] of byFreeze) {
    const ri = games[0].receipt.inputs;
    const rosters = parse(rosterBlobs, ri.rosters.sha256);
    const injDoc = parse(injBlobs, ri.injuries.sha256);
    if (!rosters || !injDoc) refuse(`${date} @ ${now}: no git blob for the receipt's ${!rosters ? "rosters" : "injuries"} sha256`);
    const injuries = injDoc.entries ?? null;
    const fold = foldBoxscores(corpusBox, fetchedBox, { now });
    const roleIdx = indexRoleHistory(fold.docs, { asOfDateUtc: now, population: "regular" });
    const roleIdxV04 = v04.indexRoleHistoryV04(fold.docs, { asOfDateUtc: now, population: "regular" });
    const statusIdx = v05.indexCurrentSeasonStatus(fold.docs, { asOfDateUtc: now });
    const seasons = { priorSeason: roleIdx.priorSeason, currentSeason: roleIdx.currentSeason };
    const cache = new Map();
    const cacheNoInj = new Map();
    const rosterTeamById = new Map(), rosterNames = new Set();
    for (const t of rosters.teams ?? []) for (const p of t.players ?? []) { rosterTeamById.set(String(p.providerAthleteId), String(t.providerTeamId)); rosterNames.add(String(p.displayName ?? "").toLowerCase()); }
    for (const g of games) {
      const gameId = String(g.providerEventId);
      const box = docById.get(gameId) ?? null;
      const grade = lastGrade.get(gameId) ?? null;
      const graded = !!(box?.boxscoreAvailable && grade?.status === "GRADED");
      const laneG = laneById.get(gameId) ?? null;
      if (!laneG) fidelity.laneDatesMissingGames.push(`${date}:${gameId}`);
      const v03G = v03ById.get(gameId) ?? null;
      for (const sideKey of ["home", "away"]) {
        const s = g[sideKey];
        const teamId = String(s.providerTeamId);
        const frozenPlayers = g.forecast.players[sideKey];
        const frozenMin = g.forecast.assumptions.minutes[sideKey];
        const gated = gatePool({ rosters, providerTeamId: teamId, boxscores: corpusBox, asOfDateUtc: now, injuries, population: "regular", teamMinutesCache: cache });
        if (gated.state !== "GATED") refuse(`${date} ${gameId} ${sideKey}: gate ${gated.reason}`);
        const prep = prepareRoster(gated);
        // FIDELITY v0.1
        fidelity.v01Sides += 1;
        const frozenById = new Map(frozenPlayers.map((p) => [String(p.providerAthleteId), p]));
        const prepById = new Map(prep.players.map((p) => [String(p.providerAthleteId), p]));
        const okV01 = prep.players.length === frozenPlayers.length
          && prep.assumptions.minutes.rawPoolMinutes === frozenMin.rawPoolMinutes
          && prep.assumptions.minutes.rescaleFactor === frozenMin.rescaleFactor
          && prep.players.every((p) => frozenById.get(String(p.providerAthleteId))?.expectedMinutes === p.expectedMinutes);
        if (okV01) fidelity.v01Match += 1; else fidelity.v01Mismatch.push(`${date}:${gameId}:${sideKey}`);

        // what the pool would have been with nobody Out (raw minutes the injuries feed removed)
        const gatedNoInj = gatePool({ rosters, providerTeamId: teamId, boxscores: corpusBox, asOfDateUtc: now, injuries: [], population: "regular", teamMinutesCache: cacheNoInj });
        const rawNoInj = new Map(gatedNoInj.rows.map((r) => [String(r.providerAthleteId), r]));
        const outIds = new Set(gated.gate.out.map((o) => String(o.providerAthleteId)));
        const omittedOut = gated.gate.out.reduce((t, o) => t + (rawNoInj.get(String(o.providerAthleteId))?.expectedMinutes ?? 0), 0);
        const omittedDeparted = gated.gate.excludedNotOnRoster.reduce((t, o) => t + (o.expectedMinutes ?? 0), 0);

        // v0.3 (frozen when it exists, and re-derived)
        const gV03 = gatePoolV03({ rosters, providerTeamId: teamId, boxscores: fold.docs, asOfDateUtc: now, injuries, population: "regular", roleIndex: roleIdx });
        const prepV03 = prepareRosterV03(gV03);
        const prepV03ById = new Map(prepV03.players.map((p) => [String(p.providerAthleteId), p]));
        let v03Frozen = null;
        if (v03G) {
          v03Frozen = new Map(v03G.forecast.players[sideKey].map((p) => [String(p.providerAthleteId), p]));
          fidelity.v03Sides += 1;
          const ok = prepV03.players.length === v03Frozen.size && prepV03.players.every((p) => v03Frozen.get(String(p.providerAthleteId))?.expectedMinutes === p.expectedMinutes);
          if (ok) fidelity.v03Match += 1; else fidelity.v03Mismatch.push(`${date}:${gameId}:${sideKey}`);
        }
        // v0.4 replay
        const gV04 = v04.gatePoolV04({ rosters, providerTeamId: teamId, boxscores: fold.docs, asOfDateUtc: now, injuries, population: "regular", roleIndex: roleIdxV04 });
        const prepV04 = prepareRosterV03(gV04);
        const prepV04ById = new Map(prepV04.players.map((p) => [String(p.providerAthleteId), p]));
        // v0.5 replay
        const gV05 = v05.applyEligibilityGate(gV03, { statusIndex: statusIdx });
        const prepV05 = prepareRosterV03(gV05);
        const prepV05ById = new Map(prepV05.players.map((p) => [String(p.providerAthleteId), p]));
        const qById = new Map(gV05.rows.map((r) => [String(r.providerAthleteId), r]));

        // the ladder (W,C) × S
        const v01RawById = new Map(gated.rows.map((r) => [String(r.providerAthleteId), r]));
        const rosterIds = gated.rows.map((r) => String(r.providerAthleteId));
        const ladderPred = {};
        for (const W of [0, 1]) for (const C of [0, 1]) {
          const lrows = [];
          for (const r of gated.rows) {
            const id = String(r.providerAthleteId);
            const isOut = r.availability === "out";
            const m = isOut ? null : ladderRow({ v01raw: v01RawById.get(id), rec: roleIdx.byAthlete.get(id), seasons })(W, C);
            const v3 = gV03.rows.find((x) => String(x.providerAthleteId) === id);
            lrows.push({ ...r, expectedMinutes: m == null || !(m > 0) ? null : m, minutesSd: null, rates: null, rateSd: null, playRate: v3?.playRate ?? null });
          }
          const base = { rows: lrows, injuriesProvided: true };
          const s0 = new Map(prepareRoster(base).players.map((p) => [String(p.providerAthleteId), p.expectedMinutes]));
          const s1 = new Map(prepareRosterV03({ ...base, normalisation: { ...NORMALISATION } }).players.map((p) => [String(p.providerAthleteId), p.expectedMinutes]));
          ladderPred[`W${W}C${C}S0`] = s0; ladderPred[`W${W}C${C}S1`] = s1;
        }

        // descriptive: v0.3 rules with the prior worth 3 games (MIN_GAMES_FOR_RATES), chosen on completed seasons only (section 4b)
        const k3Rows = (qOf) => gated.rows.map((r) => { const id = String(r.providerAthleteId); const isOut = r.availability === "out"; const m = isOut ? null : ladderRow({ v01raw: v01RawById.get(id), rec: roleIdx.byAthlete.get(id), seasons })(1, 1, 3); return { ...r, expectedMinutes: m == null || !(m > 0) ? null : m, minutesSd: null, rates: null, rateSd: null, playRate: qOf(id) }; });
        const k3 = new Map(prepareRosterV03({ rows: k3Rows((id) => gV03.rows.find((x) => String(x.providerAthleteId) === id)?.playRate ?? null), injuriesProvided: true, normalisation: { ...NORMALISATION } }).players.map((p) => [String(p.providerAthleteId), p.expectedMinutes]));
        const k3q = new Map(prepareRosterV03({ rows: k3Rows((id) => qById.get(id)?.playRate ?? null), injuriesProvided: true, normalisation: { ...NORMALISATION } }).players.map((p) => [String(p.providerAthleteId), p.expectedMinutes]));

        const onLaneIds = new Set((laneG?.players?.[sideKey] ?? []).map((p) => String(p.providerAthleteId)));
        for (const lp of laneG?.players?.[sideKey] ?? []) {
          fidelity.laneRows += 1;
          const f = frozenById.get(String(lp.providerAthleteId));
          if (f && r1(f.expectedMinutes) === r1(lp.expectedMinutes)) fidelity.laneRowsMatchFrozen += 1;
        }
        const scaledSum = frozenMin.scaledPoolMinutes;
        const capped = prep.players.filter((p) => p.expectedMinutes >= 48).length;
        const preCapMax = Math.max(0, ...gated.rows.filter((r) => r.availability !== "out" && Number.isFinite(r.expectedMinutes)).map((r) => r.expectedMinutes * (frozenMin.rescaleFactor ?? 1)));
        const t = Date.parse(g.dateUtc);
        const sched = teamSchedule.get(teamId) ?? [];
        const prevGame = sched.filter((x) => x < t).at(-1) ?? null;
        const b2b = prevGame != null && t - prevGame < 30 * 3600 * 1000;
        const boxPlayers = (box?.players ?? []).filter((p) => String(p.providerTeamId) === teamId);
        const teamActualMin = boxPlayers.reduce((u, p) => u + (Number.isInteger(p.minutes) ? p.minutes : 0), 0);
        const inOT = teamActualMin > 245;
        const side = {
          date, gameId, team: s.abbr, teamId, sideKey, now, tipUtc: g.dateUtc, graded,
          rosterSize: gated.gate.rosterSize, poolSize: prep.players.length, nOut: gated.gate.out.length, nInsufficient: gated.gate.insufficientHistory.length,
          rawSum: frozenMin.rawPoolMinutes, factor: frozenMin.rescaleFactor, scaledSum, capped, preCapMax: r1(preCapMax),
          omittedOutMinutes: r1(omittedOut), omittedDepartedMinutes: r1(omittedDeparted), departed: gated.gate.excludedNotOnRoster.length, otherTeam: gated.gate.otherTeamHistory.length,
          b2b, inOT, teamActualMin, window: frozenMin.window,
          windowPost: null,
        };
        sides.push(side);

        const addRow = (id, name) => {
          const raw = v01RawById.get(id) ?? null;
          const p = prepById.get(id) ?? null;
          const a = boxPlayers.find((x) => String(x.providerAthleteId) === id) ?? null;
          const played = !!(a && !a.didNotPlay && Number.isInteger(a.minutes) && a.minutes > 0);
          const f = frozenById.get(id) ?? null;
          const h = hist.get(id);
          const cur = (curByAthlete.get(id) ?? []).filter((x) => x.t < t);
          const inRoster = rosterIds.includes(id);
          const rec = roleIdx.byAthlete.get(id);
          const row = {
            date, gameId, teamId, team: s.abbr, sideKey, id, name: name ?? raw?.name ?? a?.name ?? null, graded, onLane: onLaneIds.has(id), inRoster, b2b, inOT,
            availability: raw?.availability ?? null, injuryStatus: raw?.injuryStatus ?? null, experienceYears: raw?.rosterExperienceYears ?? null,
            basis: raw?.basis ?? null, gamesUsed: raw?.gamesUsed ?? 0, historyBasis: raw?.historyBasis ?? null, historyTeam: raw?.historyTeam ?? null, starterRate: raw?.starterRate ?? null,
            raw: raw?.expectedMinutes ?? null, factor: frozenMin.rescaleFactor, poolSize: prep.players.length, rawSum: frozenMin.rawPoolMinutes,
            mu: p?.expectedMinutes ?? null, sd: p?.minutesSd ?? null, capped: (p?.expectedMinutes ?? 0) >= 48,
            preCap: raw?.expectedMinutes != null ? r2(raw.expectedMinutes * (frozenMin.rescaleFactor ?? 1)) : null,
            rates: f?.rates ?? null, p50: f ? { pts: f.pts?.p50, reb: f.reb?.p50, ast: f.ast?.p50, pra: f.pra?.p50 } : null,
            v03: v03Frozen ? (v03Frozen.get(id)?.expectedMinutes ?? null) : null,
            v03P50: v03Frozen?.get(id) ? { pts: v03Frozen.get(id).pts?.p50, reb: v03Frozen.get(id).reb?.p50, ast: v03Frozen.get(id).ast?.p50 } : null, v03Replay: prepV03ById.get(id)?.expectedMinutes ?? null, v03PlayRate: prepV03ById.get(id)?.playRate ?? null, v04: prepV04ById.get(id)?.expectedMinutes ?? null, v05: prepV05ById.get(id)?.expectedMinutes ?? null,
            k3: k3.get(id) ?? null, k3q: k3q.get(id) ?? null, v05Q: qById.get(id)?.playRate ?? null, v05State: qById.get(id)?.eligibilityState ?? null,
            ladder: Object.fromEntries(Object.entries(ladderPred).map(([k, m]) => [k, m.get(id) ?? null])),
            played, inBox: !!a, actual: played ? a.minutes : 0, dnpReason: a?.dnpReason ?? null, actualStarter: a?.starter === true && played,
            pts: played ? a.pts : null, reb: played ? a.reb : null, ast: played ? a.ast : null,
            s1RegN: h?.reg?.[2026]?.length ?? 0, s1RegMean: r2(mean((h?.reg?.[2026] ?? []).map((x) => x.min))), s1PostN: h?.post?.[2026]?.length ?? 0, s1PostMean: r2(mean((h?.post?.[2026] ?? []).map((x) => x.min))), s2RegN: h?.reg?.[2025]?.length ?? 0, s3RegN: h?.reg?.[2024]?.length ?? 0, s1DnpN: h?.dnp?.[2026] ?? 0,
            curN: cur.length, curMean: r2(mean(cur.map((x) => x.min))), curStarts: cur.filter((x) => x.starter).length, curLast3: r2(mean(cur.slice(-3).map((x) => x.min))),
            everHist: !!h, frozenCurN: rec?.apps?.[seasons.currentSeason]?.length ?? 0, frozenCurMean: r2(mean((rec?.apps?.[seasons.currentSeason] ?? []).map((x) => x.minutes))), frozenCurStarts: (rec?.apps?.[seasons.currentSeason] ?? []).filter((x) => x.starter).length, rosterTeamOfId: rosterTeamById.get(id) ?? null, nameOnRosterDiffId: !inRoster && rosterNames.has(String(name ?? "").toLowerCase()),
            priorApps: rec?.apps?.[seasons.priorSeason]?.length ?? 0,
          };
          rows.push(row);
          return row;
        };
        const seenIds = new Set();
        for (const r of gated.rows) { const id = String(r.providerAthleteId); seenIds.add(id); addRow(id, r.name); }
        for (const a of boxPlayers) { const id = String(a.providerAthleteId); if (!seenIds.has(id) && a.providerAthleteId != null) addRow(id, a.name); }
      }
    }
  }
  console.error(`${date}: replayed; sides ${sides.length} rows ${rows.length}`);
}
if (fidelity.v01Mismatch.length) refuse(`v0.1 replay does not match the frozen receipts: ${fidelity.v01Mismatch.slice(0, 8).join(" ")}`);
if (fidelity.v03Mismatch.length) refuse(`v0.3 replay does not match the frozen receipts: ${fidelity.v03Mismatch.slice(0, 8).join(" ")}`);
if (fidelity.laneRows !== fidelity.laneRowsMatchFrozen) refuse("a lane row differs from its frozen receipt");
fs.mkdirSync(OUT, { recursive: true });

/* the injuries feed as it stood before each tip */
const INJ_REL = "data/internal/research/injuries/nba/latest.json";
const injHistory = [];
for (const c of git(["log", "--format=%H", "--since=2026-10-18", "--", INJ_REL], { encoding: "utf8" }).split("\n").filter(Boolean)) {
  let d; try { d = JSON.parse(git(["show", `${c}:${INJ_REL}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { continue; }
  const at = Date.parse(d.sourceAsOf ?? d.generatedAt ?? "");
  if (Number.isFinite(at)) injHistory.push({ at, by: new Map((d.entries ?? []).map((e) => [String(e.athleteId), e.status ?? null])) });
}
injHistory.sort((a, b) => a.at - b.at);
const injuryAtTip = (r) => { const t = Date.parse(r.tip); let best = null; for (const h of injHistory) { if (h.at <= t) best = h; else break; } return best?.by.get(r.id) ?? null; };

/* ========== analysis ========== */
const L = [];
const say = (s = "") => L.push(s);
const summary = { marker: "RESEARCH_ONLY", dataClass: "PRIVATE_RESEARCH", productEligible: false, fidelity: { ...fidelity, v01Mismatch: 0, v03Mismatch: 0 }, candidateFrozenAt };
const sideKeyOf = (x) => `${x.gameId}|${x.teamId}`;
const sideBy = new Map(sides.map((s) => [sideKeyOf(s), s]));
for (const s of sides) s.laneSum = 0;
for (const r of rows) { if (r.onLane) sideBy.get(sideKeyOf(r)).laneSum += r.mu ?? 0; r.tip = sideBy.get(sideKeyOf(r)).tipUtc; }
const G = rows.filter((r) => r.graded);
const P = G.filter((r) => r.played);
const M = P.filter((r) => r.mu != null);
const gradedGames = new Set(G.map((r) => r.gameId)).size;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : null; };

function bootStat(rs, fn, { seed = 7 } = {}) {
  const by = new Map(); for (const r of rs) { if (!by.has(r.gameId)) by.set(r.gameId, []); by.get(r.gameId).push(r); }
  const cl = [...by.values()];
  const est = fn(rs);
  if (cl.length === 0 || est == null) return { n: rs.length, clusters: cl.length, mean: null, lo: null, hi: null, label: "NO_DATA" };
  const rng = mulberry32(seed); const reps = [];
  for (let b = 0; b < B; b += 1) { const s = []; for (let i = 0; i < cl.length; i += 1) { const c = cl[Math.floor(rng() * cl.length)]; for (const x of c) s.push(x); } const v = fn(s); if (v != null && Number.isFinite(v)) reps.push(v); }
  reps.sort((a, b) => a - b);
  const lo = reps[Math.floor(0.025 * reps.length)], hi = reps[Math.min(reps.length - 1, Math.floor(0.975 * reps.length))];
  return { n: rs.length, clusters: cl.length, mean: r3(est), lo: r3(lo), hi: r3(hi), label: cl.length < MIN_CLUSTERS ? "FEW_CLUSTERS" : (lo > 0 || hi < 0) ? "EXCLUDES_0" : "INCLUDES_0" };
}
const ols = (rs, xf, yf) => { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (const r of rs) { const x = xf(r), y = yf(r); n += 1; sx += x; sy += y; sxx += x * x; sxy += x * y; } const d = n * sxx - sx * sx; return d > 0 ? (n * sxy - sx * sy) / d : null; };
const absErr = (r, k = "mu") => Math.abs(r[k] - r.actual);
const table = (head, lines) => { say(`| ${head.join(" | ")} |`); say(`|${head.map(() => "---").join("|")}|`); for (const l of lines) say(`| ${l.join(" | ")} |`); say(); };

say(`# NBA minutes audit output`);
say(`graded games ${gradedGames}, graded sides ${sides.filter((s) => s.graded).length}, played rows ${P.length}, matched rows ${M.length}`);
say(`fidelity: v0.1 sides ${fidelity.v01Match}/${fidelity.v01Sides}, v0.3 sides ${fidelity.v03Match}/${fidelity.v03Sides}, lane rows ${fidelity.laneRowsMatchFrozen}/${fidelity.laneRows}`);
say(`injury feed snapshots in git ${injHistory.length}`);
say(`candidate source frozen at: v0.4 ${candidateFrozenAt.v04}, v0.5 ${candidateFrozenAt.v05}`);
say();

/* --- 1. pools --- */
say(`## 1 pools by date`);
table(["date", "sides", "pool min–max", "raw sum min–max", "factor min–max", "factor>1.05", "factor<0.95", "capped players", "scaled sum min–max", "lane sum min–max", "out raw min per side", "departed raw min per side"],
  laneDates.map((d) => { const s = sides.filter((x) => x.date === d); return [d, s.length, `${Math.min(...s.map((x) => x.poolSize))}–${Math.max(...s.map((x) => x.poolSize))}`, `${Math.min(...s.map((x) => x.rawSum))}–${Math.max(...s.map((x) => x.rawSum))}`, `${Math.min(...s.map((x) => x.factor))}–${Math.max(...s.map((x) => x.factor))}`, s.filter((x) => x.factor > 1.05).length, s.filter((x) => x.factor < 0.95).length, s.reduce((t, x) => t + x.capped, 0), `${Math.min(...s.map((x) => x.scaledSum))}–${Math.max(...s.map((x) => x.scaledSum))}`, `${r1(Math.min(...s.map((x) => x.laneSum)))}–${r1(Math.max(...s.map((x) => x.laneSum)))}`, r1(mean(s.map((x) => x.omittedOutMinutes))), r1(mean(s.map((x) => x.omittedDepartedMinutes)))]; }));
say(`all sides: factor median ${med(sides.map((s) => s.factor))}, factor>1.05 ${sides.filter((s) => s.factor > 1.05).length}, factor<0.95 ${sides.filter((s) => s.factor < 0.95).length}, of ${sides.length}. Pool ≤10: ${sides.filter((s) => s.poolSize <= 10).length}.`);
const shortV = sides.filter((s) => s.poolSize <= 10);
say(`pool ≤10 sides: factor median ${med(shortV.map((s) => s.factor))}; pool ≥13 sides: factor median ${med(sides.filter((s) => s.poolSize >= 13).map((s) => s.factor))}`);
const pooledCorr = (() => { const xs = sides.map((s) => s.poolSize), ys = sides.map((s) => s.factor); const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; }); return sxy / Math.sqrt(sxx * syy); })();
say(`corr(pool size, factor) over sides ${r3(pooledCorr)}`);
const fromOut = sides.filter((s) => s.factor > 1.05);
say(`factor>1.05 sides: mean nOut ${r1(mean(fromOut.map((s) => s.nOut)))}, mean out raw min ${r1(mean(fromOut.map((s) => s.omittedOutMinutes)))}; factor<0.95 sides: mean nOut ${r1(mean(sides.filter((s) => s.factor < 0.95).map((s) => s.nOut)))}, mean out raw min ${r1(mean(sides.filter((s) => s.factor < 0.95).map((s) => s.omittedOutMinutes)))}`);
say();

say(`### 1a scaling test (matched rows; err = forecast − actual)`);
const fb = [["<0.80", 0, 0.8], ["0.80–0.95", 0.8, 0.95], ["0.95–1.05", 0.95, 1.05], ["1.05–1.20", 1.05, 1.2], ["≥1.20", 1.2, 9]];
table(["factor", "rows", "games", "bias scaled", "bias unscaled", "MAE scaled", "MAE unscaled", "MAE scaled−unscaled"],
  fb.map(([n, lo, hi]) => { const rs = M.filter((r) => r.raw != null && r.factor >= lo && r.factor < hi); const b1 = bootStat(rs, (s) => mean(s.map((r) => r.mu - r.actual))), b0 = bootStat(rs, (s) => mean(s.map((r) => r.raw - r.actual))), d = bootStat(rs, (s) => mean(s.map((r) => absErr(r) - absErr(r, "raw")))); return [n, rs.length, b1.clusters, `${b1.mean} (${b1.lo}, ${b1.hi})`, `${b0.mean} (${b0.lo}, ${b0.hi})`, r2(mean(rs.map((r) => absErr(r)))), r2(mean(rs.map((r) => absErr(r, "raw")))), `${d.mean} (${d.lo}, ${d.hi})`]; }));
const reg = M.filter((r) => r.raw != null && r.raw >= 20);
const implied = bootStat(reg, (s) => ols(s, (r) => (r.factor - 1) * r.raw, (r) => r.actual - r.raw));
say(`slope of (actual − raw) on the implied shift (factor−1)·raw, rows raw ≥ 20: ${fmt(implied)} (1 = the factor is right on average; 0 = it carries no information)`);
const implS1 = bootStat(reg, (s) => ols(s, (r) => (r.factor - 1) * r.raw, (r) => r.actual - (r.s1RegMean ?? r.raw)));
say(`same with whole-season regular mean as the base: ${fmt(implS1)}`);
const injRows = M.filter((r) => r.raw != null && r.raw >= 20 && r.s1RegMean != null);
for (const [n, f] of [["all raw≥20", () => true], ["actual starters", (r) => r.actualStarter], ["bench", (r) => !r.actualStarter]]) {
  const rs = injRows.filter(f);
  say(`minutes lift per 10 raw team minutes Out, ${n}: ${fmt(bootStat(rs, (s) => 10 * ols(s, (r) => sideBy.get(sideKeyOf(r)).omittedOutMinutes, (r) => r.actual - r.s1RegMean)))}`);
}
say();

say(`### 1b short pools (≤9 rows)`);
table(["date", "team", "pool", "raw", "factor", "scaled", "capped", "out raw min", "players (raw→mu, actual)"],
  sides.filter((s) => s.poolSize <= 9).map((s) => [s.date, s.team, s.poolSize, s.rawSum, s.factor, s.scaledSum, s.capped, s.omittedOutMinutes, rows.filter((r) => sideKeyOf(r) === sideKeyOf(s) && r.mu != null).sort((a, b) => b.mu - a.mu).slice(0, 4).map((r) => `${r.name?.split(" ").at(-1)} ${r1(r.raw)}→${r1(r.mu)}${s.graded ? ` (${r.actual})` : ""}`).join("; ")]));
const shortM = M.filter((r) => r.poolSize <= 9);
say(`pool ≤9 matched rows: bias ${fmt(bootStat(shortM, (s) => mean(s.map((r) => r.mu - r.actual))))}; rows with mu ≥ 40: ${shortM.filter((r) => r.mu >= 40).length}`);
say();

say(`### 1c named traces`);
const NAMED = ["Shai Gilgeous-Alexander", "Rui Hachimura", "Trae Young", "Donovan Mitchell", "Joel Embiid", "Moussa Cisse", "Nick Richards", "Zaccharie Risacher"];
for (const n of NAMED) {
  const rs = rows.filter((r) => r.name === n);
  const l = rs.at(-1);
  say(`**${n}** ${l.team}: basis ${l.basis}, gamesUsed ${l.gamesUsed}, history ${l.historyBasis}${l.historyBasis === "other-team" ? ` (team ${l.historyTeam})` : ""}, starterRate ${l.starterRate}; 2025-26 regular ${l.s1RegN} g @ ${l.s1RegMean}, postseason ${l.s1PostN} g @ ${l.s1PostMean}; 2026-27 to 11-02 ${l.curN} g @ ${l.curMean} (last 3 ${l.curLast3}, starts ${l.curStarts})`);
  { const a = rs.findLast((r) => r.mu != null); if (a?.curMean != null && a.s1RegMean != null) say(`gap to 2026-27 mean on ${a.date}: mu ${r1(a.mu)} − cur ${a.curMean} = ${r1(a.mu - a.curMean)} = stale role (S−1 regular − cur) ${r1(a.s1RegMean - a.curMean)} + window (raw − S−1 regular) ${r1(a.raw - a.s1RegMean)} + scale ${r1(a.preCap - a.raw)} + cap ${r1(a.mu - a.preCap)}`); }
  table(["date", "avail", "raw", "pool", "rawSum", "factor", "pre-cap", "mu", "actual", "v0.3", "v0.5"], rs.map((r) => [r.date, r.availability === "out" ? `OUT` : r.injuryStatus ?? "active", r1(r.raw), r.poolSize, r.rawSum, r.factor, r.preCap, r1(r.mu), r.graded ? (r.played ? r.actual : `DNP ${r.dnpReason ?? (r.inBox ? "" : "absent")}`) : "pending", r1(r.v03), r1(r.v05)]));
}

/* --- 2. coverage --- */
say(`## 2 coverage`);
const coverCause = (r) => {
  if (!r.inRoster) { if (r.nameOnRosterDiffId) return "ID_MAPPING"; if (r.rosterTeamOfId && r.rosterTeamOfId !== r.teamId) return "TRADED_AFTER_ROSTER_CAPTURE"; return "NOT_ON_ROSTER_CAPTURE"; }
  if (r.availability === "out") return "LISTED_OUT_THEN_PLAYED";
  const any = (r.s1RegN + r.s1PostN + r.s2RegN + r.s3RegN) > 0;
  if (!any) return (r.experienceYears ?? 0) === 0 ? "ROOKIE" : "VETERAN_NO_CORPUS_HISTORY";
  if (r.s1RegN + r.s1PostN === 0) return "ABSENTEE_2025_26";
  return "HAS_2025_26_HISTORY_BUT_NO_ROW";
};
const sixthSet = new Set();
for (const k of new Set(P.map(sideKeyOf))) { const b = P.filter((r) => sideKeyOf(r) === k && !r.actualStarter).sort((a, b2) => b2.actual - a.actual)[0]; if (b) sixthSet.add(`${k}|${b.id}`); }
const isSixth = (r) => sixthSet.has(`${sideKeyOf(r)}|${r.id}`);
const uncovered = P.filter((r) => r.mu == null);
for (const [lab, f] of [["all who played", () => true], ["starters", (r) => r.actualStarter], ["sixth men (top bench minutes)", isSixth]]) {
  const pop = P.filter(f), un = uncovered.filter(f);
  say(`${lab}: player-games ${pop.length}, no v0.1 projection ${un.length} (${r1(100 * un.length / pop.length)}%), unique players ${new Set(un.map((r) => r.id)).size}, minutes ${un.reduce((t, r) => t + r.actual, 0)} of ${pop.reduce((t, r) => t + r.actual, 0)}`);
  const c = new Map(); for (const r of un) { const k = coverCause(r); const v = c.get(k) ?? { n: 0, min: 0, ids: new Map() }; v.n += 1; v.min += r.actual; v.ids.set(r.id, r.name); c.set(k, v); }
  table(["cause", "player-games", "unique", "minutes", "avg min", "names"], [...c.entries()].sort((a, b) => b[1].min - a[1].min).map(([k, v]) => [k, v.n, v.ids.size, v.min, r1(v.min / v.n), [...v.ids.values()].slice(0, 10).join(", ")]));
}
const uncoveredFam = (k) => P.filter((r) => r[k] == null).length;
say(`rows that played with no projection, all graded: v0.1 ${uncoveredFam("mu")}`);
// the slate not yet played: starters of each team's last game
const lastDocOf = (teamId, t) => [...curGames].reverse().find((d) => Date.parse(d.dateUtc) < t && (d.teams ?? []).some((x) => String(x.providerTeamId) === teamId));
const latest = laneDates.at(-1);
const slateRes = { startersChecked: 0, covered: 0, outAtFreeze: 0, nocover: new Map(), sixthChecked: 0, sixthNoCover: new Map() };
for (const s of sides.filter((x) => x.date === latest)) {
  const d = lastDocOf(s.teamId, Date.parse(s.tipUtc));
  if (!d) continue;
  const lines = (d.players ?? []).filter((p) => String(p.providerTeamId) === s.teamId && Number.isInteger(p.minutes) && p.minutes > 0);
  const sixth = lines.filter((p) => !p.starter).sort((a, b) => b.minutes - a.minutes)[0];
  for (const p of [...lines.filter((x) => x.starter), ...(sixth ? [sixth] : [])]) {
    const isS = p.starter === true;
    const r = rows.find((x) => x.date === latest && x.gameId === s.gameId && x.id === String(p.providerAthleteId) && x.teamId === s.teamId);
    if (isS) slateRes.startersChecked += 1; else slateRes.sixthChecked += 1;
    let cause = null;
    if (!r) cause = "NOT_ON_ROSTER_CAPTURE";
    else if (r.availability === "out") { if (isS) slateRes.outAtFreeze += 1; continue; }
    else if (r.mu == null) cause = coverCause(r);
    if (cause) { const m = isS ? slateRes.nocover : slateRes.sixthNoCover; if (!m.has(cause)) m.set(cause, []); m.get(cause).push(`${p.name} ${s.team}`); } else if (isS) slateRes.covered += 1;
  }
}
say(`${latest} slate, proxy = starters and top bench of each team's last 2026-27 game: starters ${slateRes.startersChecked}, projected ${slateRes.covered}, Out at freeze ${slateRes.outAtFreeze}`);
for (const [k, v] of slateRes.nocover) say(`  starter no projection ${k}: ${v.length}: ${v.join(", ")}`);
for (const [k, v] of slateRes.sixthNoCover) say(`  sixth no projection ${k}: ${v.length}: ${v.join(", ")}`);
say(`all rostered, not Out, no projection on ${latest}: ${rows.filter((r) => r.date === latest && r.inRoster && r.availability !== "out" && r.mu == null).length}; cause: ${JSON.stringify(Object.entries(rows.filter((r) => r.date === latest && r.inRoster && r.availability !== "out" && r.mu == null).reduce((m, r) => { const k = coverCause(r); m[k] = (m[k] ?? 0) + 1; return m; }, {})))}`);
say();

/* --- 3. error --- */
say(`## 3 error (matched rows that played; ${M.length} rows, ${new Set(M.map((r) => r.gameId)).size} games)`);
const errBlock = (rs) => { const m = bootStat(rs, (s) => mean(s.map((r) => absErr(r)))), b = bootStat(rs, (s) => mean(s.map((r) => r.mu - r.actual))); return [rs.length, m.clusters, `${m.mean} (${m.lo}, ${m.hi})`, `${b.mean} (${b.lo}, ${b.hi})`]; };
say(`unscaled v0.1 window, same rows: MAE ${r2(mean(M.filter((r) => r.raw != null).map((r) => absErr(r, "raw"))))}, bias ${r2(mean(M.filter((r) => r.raw != null).map((r) => r.raw - r.actual)))}`);
say(`overall ${errBlock(M).join(" | ")}; on-lane rows ${errBlock(M.filter((r) => r.onLane)).join(" | ")}`);
const bands = [["<15", 0, 15], ["15–24.9", 15, 25], ["25–31.9", 25, 32], ["32–37.9", 32, 38], ["38–40.9", 38, 41], ["≥41", 41, 99]];
table(["expected band", "rows", "games", "MAE", "bias"], bands.map(([n, lo, hi]) => [n, ...errBlock(M.filter((r) => r.mu >= lo && r.mu < hi))]));
const pools = [["≤10", 0, 10], ["11", 11, 11], ["12", 12, 12], ["13", 13, 13], ["14", 14, 14], ["15+", 15, 99]];
table(["pool size", "rows", "games", "MAE", "bias"], pools.map(([n, lo, hi]) => [n, ...errBlock(M.filter((r) => r.poolSize >= lo && r.poolSize <= hi))]));
say(`### 3a stat error dependent on minutes`);
const STATS = ["pts", "reb", "ast"];
const statRows = M.filter((r) => r.rates && r.p50?.pts != null && r.pts != null);
table(["stat", "rows", "MAE frozen median", "MAE rate×actual min", "share removed by true minutes", "bias frozen", "bias rate×actual min"], STATS.map((k) => {
  const a = bootStat(statRows, (s) => mean(s.map((r) => Math.abs(r.p50[k] - r[k])))), o = bootStat(statRows, (s) => mean(s.map((r) => Math.abs(r.rates[k] * r.actual - r[k])))), sh = bootStat(statRows, (s) => 1 - mean(s.map((r) => Math.abs(r.rates[k] * r.actual - r[k]))) / mean(s.map((r) => Math.abs(r.p50[k] - r[k]))));
  const b = bootStat(statRows, (s) => mean(s.map((r) => r.p50[k] - r[k]))), bo = bootStat(statRows, (s) => mean(s.map((r) => r.rates[k] * r.actual - r[k])));
  return [k, statRows.length, `${a.mean} (${a.lo}, ${a.hi})`, `${o.mean} (${o.lo}, ${o.hi})`, `${sh.mean} (${sh.lo}, ${sh.hi})`, `${b.mean} (${b.lo}, ${b.hi})`, `${bo.mean} (${bo.lo}, ${bo.hi})`];
}));
const mb = [["<3", 0, 3], ["3–6", 3, 6], ["6–10", 6, 10], ["10–15", 10, 15], ["≥15", 15, 99]];
table(["|minutes err|", "rows", "games", "pts MAE", "reb MAE", "ast MAE"], mb.map(([n, lo, hi]) => { const rs = statRows.filter((r) => absErr(r) >= lo && absErr(r) < hi); const c = (k) => { const b = bootStat(rs, (s) => mean(s.map((r) => Math.abs(r.p50[k] - r[k])))); return `${b.mean} (${b.lo}, ${b.hi})`; }; return [n, rs.length, new Set(rs.map((r) => r.gameId)).size, c("pts"), c("reb"), c("ast")]; }));
for (const k of STATS) say(`${k}: signed minutes error → signed stat error slope ${fmt(bootStat(statRows, (s) => ols(s, (r) => r.mu - r.actual, (r) => r.p50[k] - r[k])))}`);
say();

/* --- budget + attribution --- */
say(`## 6 budget: L1 distance between projected and actual team minutes (graded sides ${new Set(G.map(sideKeyOf)).size})`);
const budget = (rs, k = "mu") => { let ph = 0, un = 0, ma = 0; for (const r of rs) { const p = r[k]; if (p != null && !r.played) ph += p; else if (p == null && r.played) un += r.actual; else if (p != null) ma += Math.abs(p - r.actual); } return { ph, un, ma, t: ph + un + ma }; };
const bud = budget(G);
const nS = new Set(G.map(sideKeyOf)).size;
say(`v0.1 per team-game: phantom ${r1(bud.ph / nS)}, uncovered ${r1(bud.un / nS)}, matched ${r1(bud.ma / nS)}, total ${r1(bud.t / nS)}`);
const phantom = G.filter((r) => r.mu != null && !r.played);
const phCause = (r) => (!r.inBox ? "NOT_IN_BOX" : /COACH/i.test(String(r.dnpReason ?? "")) ? "DNP_COACH" : "DNP_INJURY_OR_OTHER");
const pc = new Map(); for (const r of phantom) { const k = phCause(r); const v = pc.get(k) ?? { n: 0, m: 0 }; v.n += 1; v.m += r.mu; pc.set(k, v); }
table(["phantom cause", "rows", "projected minutes", "per team-game", "share of total L1"], [...pc.entries()].sort((a, b) => b[1].m - a[1].m).map(([k, v]) => [k, v.n, r1(v.m), r1(v.m / nS), `${r1(100 * v.m / bud.t)}%`]));
const ph2 = new Map();
const injAt = (r) => injuryAtTip(r);
for (const r of phantom) {
  const st = injAt(r);
  const k = /out/i.test(st ?? "") ? "OUT_IN_LAST_FEED_BEFORE_TIP (freeze too early)" : (r.injuryStatus || st) ? "LISTED_NOT_OUT (Day-To-Day etc)" : r.v05State === "LAST_PLAYED" ? "UNLISTED, PLAYED LAST GAME" : r.v05State === "NONE" ? "UNLISTED, NO CURRENT EVIDENCE" : "UNLISTED, ALREADY NOT PLAYING (state rule sees it)";
  const v = ph2.get(k) ?? { n: 0, m: 0 }; v.n += 1; v.m += r.mu; ph2.set(k, v);
}
table(["phantom by what was knowable", "rows", "projected minutes", "per team-game", "share of total L1"], [...ph2.entries()].sort((a, b) => b[1].m - a[1].m).map(([k, v]) => [k, v.n, r1(v.m), r1(v.m / nS), `${r1(100 * v.m / bud.t)}%`]));
const lateOut = P.filter((r) => r.availability === "out");
say(`listed Out at freeze but played: ${lateOut.length} rows; of those no longer Out in last feed before tip: ${lateOut.filter((r) => !/out/i.test(injAt(r) ?? "")).length}`);
const uc2 = new Map(); for (const r of uncovered) { const k = coverCause(r); uc2.set(k, (uc2.get(k) ?? 0) + r.actual); }
table(["uncovered cause", "minutes", "per team-game", "share of total L1"], [...uc2.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, r1(v / nS), `${r1(100 * v / bud.t)}%`]));
// the ladder
const ALL8 = ["W0C0S0", "W0C0S1", "W0C1S0", "W0C1S1", "W1C0S0", "W1C0S1", "W1C1S0", "W1C1S1"];
const LR = M.filter((r) => ALL8.every((k) => r.ladder[k] != null));
say(`ladder rows ${LR.length}; W0C0S0 equals frozen v0.1 on ${LR.filter((r) => Math.abs(r.ladder.W0C0S0 - r.mu) < 1e-3).length}; W1C1S1 equals v0.3 replay on ${LR.filter((r) => r.v03Replay != null && Math.abs(r.ladder.W1C1S1 - r.v03Replay) < 1e-2).length}`);
table(["combo", "window", "current", "norm", "MAE", "bias"], ALL8.map((k) => { const v = (r) => r.ladder[k]; return [k, k[1] === "0" ? "v0.1 last 10" : "whole S−1 reg", k[3] === "0" ? "no" : "yes", k[5] === "0" ? "uniform 240" : "water-fill", r2(mean(LR.map((r) => Math.abs(v(r) - r.actual)))), r2(mean(LR.map((r) => v(r) - r.actual)))]; }));
const vK = (r, W, C, S) => Math.abs(r.ladder[`W${W}C${C}S${S}`] - r.actual);
const shap = (r, i) => { // Shapley of moving factor i from 0 to 1, in absolute-error units (negative = reduces error)
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; let t = 0;
  for (const o of orders) { const b = [0, 0, 0]; for (const f of o) { if (f === i) { const x = vK(r, b[0], b[1], b[2]); b[f] = 1; t += vK(r, b[0], b[1], b[2]) - x; break; } b[f] = 1; } }
  return t / 6;
};
const shF = { W: 0, C: 1, S: 2 };
const shapRes = {};
for (const [n, i] of Object.entries(shF)) { shapRes[n] = bootStat(LR, (s) => mean(s.map((r) => shap(r, i)))); say(`Shapley ${n}: ${fmt(shapRes[n])}`); }
// floor: leave-one-out 2026-27 mean (hindsight)
const curAll = (id) => curByAthlete.get(id) ?? [];
const loo = (r) => { const xs = curAll(r.id).filter((x) => x.event !== r.gameId); return xs.length >= 3 ? mean(xs.map((x) => x.min)) : null; };
for (const r of M) r.loo = loo(r);
const FR = LR.filter((r) => r.loo != null);
say(`hindsight floor on ${FR.length} rows: MAE v0.1 ${r2(mean(FR.map((r) => absErr(r))))}, v0.3-ladder ${r2(mean(FR.map((r) => vK(r, 1, 1, 1))))}, leave-one-out season mean ${r2(mean(FR.map((r) => Math.abs(r.loo - r.actual))))}`);
{
  const rowsPerSide = LR.length / nS; const toTG = (x) => x * rowsPerSide;
  const w = -mean(LR.map((r) => shap(r, 0))), c = -mean(LR.map((r) => shap(r, 1))), sc = -mean(LR.map((r) => shap(r, 2)));
  const v03Mae = mean(LR.map((r) => vK(r, 1, 1, 1))), v01Mae = mean(LR.map((r) => vK(r, 0, 0, 0)));
  const floorRatio = mean(FR.map((r) => Math.abs(r.loo - r.actual))) / mean(FR.map((r) => absErr(r)));
  const floor = v01Mae * floorRatio;
  const lines = [
    ["phantom minutes (projected, did not play)", bud.ph / nS],
    ["uncovered minutes (played, no projection)", bud.un / nS],
    ["window: last 10 / thin sample / postseason vs whole prior regular season (Shapley)", toTG(w)],
    ["uniform 240 normalisation vs play-rate water-fill (Shapley)", toTG(sc)],
    ["no 2026-27 data (Shapley)", toTG(c)],
    ["left after v0.3 rules, above the hindsight role floor", toTG(v03Mae - floor)],
    ["hindsight floor: leave-one-out 2026-27 mean still misses this", toTG(floor)],
  ];
  say(`rows per team-game ${r2(rowsPerSide)}; v0.1 matched MAE ${r2(v01Mae)}, v0.3 rules ${r2(v03Mae)}, floor ${r2(floor)}`);
  table(["budget line", "min per team-game", "share of total L1"], lines.map(([n, v]) => [n, r1(v), `${r1(100 * v / (bud.t / nS))}%`]));
  say(`sum of lines ${r1(lines.reduce((t, [, v]) => t + v, 0))} vs total ${r1(bud.t / nS)}`);
}
const big = M.filter((r) => absErr(r) >= 8);
const classify = (r) => {
  const a = r.actual;
  if (r.raw != null && Math.abs(r.raw - a) < 8) return "SCALING";
  if (r.s1RegMean != null && Math.abs(r.s1RegMean - a) < 8) return "WINDOW";
  if (r.loo != null && Math.abs(r.loo - a) < 8) return "STALE_ROLE";
  if (r.loo == null) return "UNRESOLVED_TOO_FEW_GAMES";
  return "GAME_VARIANCE";
};
const cl = new Map(); for (const r of big) { const k = classify(r); const v = cl.get(k) ?? { n: 0, e: 0 }; v.n += 1; v.e += absErr(r); cl.set(k, v); }
const bigE = big.reduce((t, r) => t + absErr(r), 0), allE = M.reduce((t, r) => t + absErr(r), 0);
say(`rows with |err| ≥ 8: ${big.length} of ${M.length}; their |err| is ${r1(100 * bigE / allE)}% of matched L1`);
table(["first fix that gets within 8 (hindsight)", "rows", "share of big-row |err|"], [...cl.entries()].sort((a, b) => b[1].e - a[1].e).map(([k, v]) => [k, v.n, `${r1(100 * v.e / bigE)}%`]));
table(["last-season role vs this game", "rows", "bias", "MAE", "share matched L1"], [["starter then, starter now", (r) => (r.starterRate ?? 0) >= 0.5 && r.actualStarter], ["starter then, bench now", (r) => (r.starterRate ?? 0) >= 0.5 && !r.actualStarter], ["bench then, starter now", (r) => (r.starterRate ?? 0) < 0.5 && r.actualStarter], ["bench then, bench now", (r) => (r.starterRate ?? 0) < 0.5 && !r.actualStarter]].map(([n, f]) => { const rs = M.filter(f); return [n, rs.length, r2(mean(rs.map((r) => r.mu - r.actual))), r2(mean(rs.map((r) => absErr(r)))), `${r1(100 * rs.reduce((t, r) => t + absErr(r), 0) / allE)}%`]; }));
const b2bR = M.filter((r) => r.mu >= 15);
say(`back-to-back rows ${b2bR.filter((r) => r.b2b).length}, others ${b2bR.filter((r) => !r.b2b).length}. bias diff b2b−other: ${fmt(bootStat(b2bR, (s) => { const a = s.filter((r) => r.b2b), b = s.filter((r) => !r.b2b); return a.length && b.length ? mean(a.map((r) => r.mu - r.actual)) - mean(b.map((r) => r.mu - r.actual)) : null; }))}`);
const rot = G.filter((r) => r.mu != null && (r.raw ?? 0) >= 24);
say(`not playing, raw ≥ 24: b2b ${r3(mean(rot.filter((r) => r.b2b).map((r) => (r.played ? 0 : 1))))} (n ${rot.filter((r) => r.b2b).length}), other ${r3(mean(rot.filter((r) => !r.b2b).map((r) => (r.played ? 0 : 1))))} (n ${rot.filter((r) => !r.b2b).length})`);
say(`P(not play) difference b2b−other, raw ≥ 24: ${fmt(bootStat(rot, (s) => { const a = s.filter((r) => r.b2b), b = s.filter((r) => !r.b2b); return a.length && b.length ? mean(a.map((r) => (r.played ? 0 : 1))) - mean(b.map((r) => (r.played ? 0 : 1))) : null; }))}`);
say(`overtime sides ${sides.filter((s) => s.graded && s.inOT).length} of ${sides.filter((s) => s.graded).length}; matched bias in OT ${r2(mean(M.filter((r) => r.inOT).map((r) => r.mu - r.actual)))}, regulation ${r2(mean(M.filter((r) => !r.inOT).map((r) => r.mu - r.actual)))}`);
const oneBasis = (b) => M.filter((r) => r.basis === b);
table(["basis", "rows", "MAE", "bias"], ["trailing10", "season", "insufficient"].map((b) => [b, oneBasis(b).length, r2(mean(oneBasis(b).map((r) => absErr(r)))), r2(mean(oneBasis(b).map((r) => r.mu - r.actual)))]));
table(["history", "rows", "MAE", "bias"], ["same-team", "other-team"].map((b) => { const rs = M.filter((r) => r.historyBasis === b); return [b, rs.length, r2(mean(rs.map((r) => absErr(r)))), r2(mean(rs.map((r) => r.mu - r.actual)))]; }));
const postH = M.filter((r) => r.s1PostN >= 4 && r.basis === "trailing10");
say(`rows whose window is mostly postseason (≥4 postseason apps in 2025-26): ${postH.length}; bias raw ${r2(mean(postH.map((r) => r.raw - r.actual)))}, whole-reg-season bias ${r2(mean(postH.map((r) => r.s1RegMean - r.actual)))}`);
say();

/* --- 4. candidates --- */
say(`## 4 candidates on the same games`);
const windows = [
  ["W_v03: frozen v0.3 receipts, all graded forward games", (r) => r.v03Seen === true],
  ["W_v04: tip after PR 1180 head", (r) => r.v03Seen === true && Date.parse(r.tip) > Date.parse(candidateFrozenAt.v04)],
  ["W_v05: tip after PR 1281 head", (r) => r.v03Seen === true && Date.parse(r.tip) > Date.parse(candidateFrozenAt.v05)],
];
const v03Games = new Set(rows.filter((r) => r.v03 != null).map((r) => r.gameId));
for (const r of rows) r.v03Seen = v03Games.has(r.gameId) && r.graded;
summary.candidates = {};
const fams = [["v0.1", "mu"], ["v0.3", "v03"], ["v0.4", "v04"], ["v0.5", "v05"], ["k3 replay", "k3"], ["k3+gate replay", "k3q"]];
for (const [wn, wf] of windows) {
  const w = G.filter(wf), wp = w.filter((r) => r.played);
  const games = new Set(w.map((r) => r.gameId)).size;
  say(`### ${wn}: ${games} games, ${wp.length} played rows`);
  const common = wp.filter((r) => fams.every(([, k]) => r[k] != null));
  table(["family", "common rows MAE", "common bias", "|err|≥15 rows", "rows ≥41 (all rows)", "rows ≥41 per slate-game", "starters projected", "sixth projected", "played no projection (rows)", "phantom min per team-game (conditional)", "phantom, weighted by q"], fams.map(([n, k]) => {
    const st = wp.filter((r) => r.actualStarter), six = wp.filter(isSixth);
    const nSd = new Set(w.map(sideKeyOf)).size;
    const ph = w.filter((r) => r[k] != null && !r.played);
    const q = (r) => (k === "mu" ? 1 : k === "v05" || k === "k3q" ? (r.v05Q ?? 1) : (r.v03PlayRate ?? 1));
    return [n, r2(mean(common.map((r) => Math.abs(r[k] - r.actual)))), r2(mean(common.map((r) => r[k] - r.actual))), common.filter((r) => Math.abs(r[k] - r.actual) >= 15).length, w.filter((r) => (r[k] ?? 0) >= TRIGGER).length, r2(w.filter((r) => (r[k] ?? 0) >= TRIGGER).length / games), `${st.filter((r) => r[k] != null).length}/${st.length}`, `${six.filter((r) => r[k] != null).length}/${six.length}`, wp.filter((r) => r[k] == null).length, r1(ph.reduce((t, r) => t + r[k], 0) / nSd), r1(ph.reduce((t, r) => t + r[k] * q(r), 0) / nSd)];
  }));
  const pairs = [["v0.3", "v03", "v0.1", "mu"], ["v0.4", "v04", "v0.1", "mu"], ["v0.5", "v05", "v0.1", "mu"], ["v0.4", "v04", "v0.3", "v03"], ["v0.5", "v05", "v0.3", "v03"], ["k3", "k3", "v0.3", "v03"], ["k3+gate", "k3q", "v0.3", "v03"], ["k3+gate", "k3q", "v0.5", "v05"]];
  table(["pair", "ΔMAE (a−b), negative = a lower", "Δ|bias|", "rows ≥15 err diff per 100 rows", "Δ starter coverage"], pairs.map(([a, ka, b, kb]) => {
    const d = bootStat(common, (s) => mean(s.map((r) => Math.abs(r[ka] - r.actual) - Math.abs(r[kb] - r.actual))));
    const db = bootStat(common, (s) => Math.abs(mean(s.map((r) => r[ka] - r.actual))) - Math.abs(mean(s.map((r) => r[kb] - r.actual))));
    const de = bootStat(common, (s) => 100 * mean(s.map((r) => (Math.abs(r[ka] - r.actual) >= 15 ? 1 : 0) - (Math.abs(r[kb] - r.actual) >= 15 ? 1 : 0))));
    const st = wp.filter((r) => r.actualStarter);
    const dc = bootStat(st, (s) => mean(s.map((r) => (r[ka] != null ? 1 : 0) - (r[kb] != null ? 1 : 0))));
    summary.candidates[`${wn.slice(0, 6)}:${a}-${b}`] = { d, db, de, dc };
    return [`${a} − ${b}`, fmt(d), fmt(db), fmt(de), fmt(dc)];
  }));
  { // phantom per team-game, q-weighted, paired over games
    const q = (r, k) => (k === "mu" ? 1 : k === "v05" ? (r.v05Q ?? 1) : (r.v03PlayRate ?? 1));
    const perRow = (r, k) => (r[k] != null && !r.played ? r[k] * q(r, k) : 0);
    const rowsPerSide = w.length / new Set(w.map(sideKeyOf)).size;
    for (const [a, ka, b, kb] of [["v0.3", "v03", "v0.1", "mu"], ["v0.5", "v05", "v0.3", "v03"]]) say(`phantom q-weighted per team-game ${a} − ${b}: ${fmt(bootStat(w, (s) => rowsPerSide * mean(s.map((r) => perRow(r, ka) - perRow(r, kb)))))}`);
    const sr = common.filter((r) => r.v03P50?.pts != null && r.p50?.pts != null && r.pts != null);
    for (const k of STATS) say(`${k} MAE v0.3 − v0.1 frozen medians: ${fmt(bootStat(sr, (s) => mean(s.map((r) => Math.abs(r.v03P50[k] - r[k]) - Math.abs(r.p50[k] - r[k])))))}`);
  }
  const big2 = (k) => common.filter((r) => Math.abs(r[k] - r.actual) >= 8);
  say(`rows with |err|≥8: ${fams.map(([n, k]) => `${n} ${big2(k).length}`).join(", ")}`);
  say();
}
const v05q = G.filter((r) => r.v03Seen && r.mu != null && r.v05State);
table(["v0.5 state", "rows", "played share", "q mean", "v0.1 phantom minutes"], [...new Set(v05q.map((r) => r.v05State))].map((st) => { const rs = v05q.filter((r) => r.v05State === st); return [st, rs.length, r3(mean(rs.map((r) => (r.played ? 1 : 0)))), r3(mean(rs.map((r) => r.v05Q ?? 0))), r1(rs.filter((r) => !r.played).reduce((t, r) => t + r.mu, 0))]; }));

{
  const oos = v05q.filter((r) => Date.parse(r.tip) > Date.parse(candidateFrozenAt.v05));
  say(`v0.5 cells, games after the PR head only (${new Set(oos.map((r) => r.gameId)).size} games)`);
  table(["state", "rows", "played share", "mean q"], [...new Set(oos.map((r) => r.v05State))].map((st) => { const rs = oos.filter((r) => r.v05State === st); return [st, rs.length, r3(mean(rs.map((r) => (r.played ? 1 : 0)))), r3(mean(rs.map((r) => r.v05Q ?? 0)))]; }));
}

{ // participation as a probability: Brier (lower is better), paired over games
  const y = (r) => (r.played ? 1 : 0);
  for (const [lab, set] of [["all v0.3 games", v05q], ["games after the PR 1281 head", v05q.filter((r) => Date.parse(r.tip) > Date.parse(candidateFrozenAt.v05))]]) {
    const rs = set.filter((r) => r.v03PlayRate != null && r.v05Q != null);
    say(`participation Brier, ${lab}: v0.3 playRate ${r3(mean(rs.map((r) => (r.v03PlayRate - y(r)) ** 2)))}, v0.5 q ${r3(mean(rs.map((r) => (r.v05Q - y(r)) ** 2)))}, difference v0.5 − v0.3 ${fmt(bootStat(rs, (t) => mean(t.map((r) => (r.v05Q - y(r)) ** 2 - (r.v03PlayRate - y(r)) ** 2))))}`);
  }
}

/* --- prior-weight backtest: strictly before 2026-27 --- */
say(`## 4b prior strength backtest on completed seasons only (first 20 team games; no normalisation; S−1 whole regular season as prior)`);
for (const season of [2026, 2025]) {
  const teamN = new Map();
  const docs = corpusBox.filter((d) => d?.boxscoreAvailable && d.season === season && inPopulation(d.phase, "regular")).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));
  const seen = new Map(); const bt = [];
  for (const d of docs) {
    for (const t of d.teams ?? []) teamN.set(String(t.providerTeamId), (teamN.get(String(t.providerTeamId)) ?? 0) + 1);
    for (const p of d.players ?? []) {
      if (p?.providerAthleteId == null || p.didNotPlay || !Number.isInteger(p.minutes) || p.minutes <= 0) continue;
      const id = String(p.providerAthleteId);
      const sq = seen.get(id) ?? []; const pr = hist.get(id)?.reg?.[season - 1] ?? [];
      if (pr.length >= 3 && sq.length >= 1 && teamN.get(String(p.providerTeamId)) <= 20) bt.push({ gameId: String(d.providerEventId), a: p.minutes, pm: mean(pr.map((x) => x.min)), pn: pr.length, cs: sq.reduce((u, x) => u + x, 0), cn: sq.length });
      sq.push(p.minutes); seen.set(id, sq);
    }
  }
  const pred = (r, k) => { const w = Math.min(1, k / r.pn); return (w * r.pn * r.pm + r.cs) / (w * r.pn + r.cn); };
  table(["prior games k", `MAE ${season - 1}-${String(season).slice(2)} (n ${bt.length})`, "ΔMAE vs k=10"], [0.001, 2, 3, 5, 7, 10, 15, 20, 82].map((k) => [k < 1 ? "0 (current only)" : k, r3(mean(bt.map((r) => Math.abs(pred(r, k) - r.a)))), fmt(bootStat(bt, (s) => mean(s.map((r) => Math.abs(pred(r, k) - r.a) - Math.abs(pred(r, 10) - r.a)))))]));
}

/* --- 5. trigger --- */
say(`## 5 the ${TRIGGER}-minute trigger`);
const corpusLines = (season, f) => corpusBox.filter((d) => d?.boxscoreAvailable && d.season === season && f(d)).flatMap((d) => (d.players ?? []).filter((p) => !p.didNotPlay && Number.isInteger(p.minutes) && p.minutes > 0).map((p) => p.minutes));
const popT = [];
for (const [lab, season, f] of [["2025-26 regular (phase 2+cup)", 2026, (d) => inPopulation(d.phase, "regular")], ["2025-26 phase≠1", 2026, (d) => d.phase !== 1], ["2024-25 regular", 2025, (d) => inPopulation(d.phase, "regular")], ["2023-24 regular", 2024, (d) => inPopulation(d.phase, "regular")]]) {
  const m = corpusLines(season, f); popT.push([lab, m.length, pct(m, 0.5), pct(m, 0.9), pct(m, 0.95), pct(m, 0.99), m.filter((x) => x >= TRIGGER).length, r2(100 * m.filter((x) => x >= TRIGGER).length / m.length)]);
}
table(["population", "player-games played", "p50", "p90", "p95", "p99", `≥${TRIGGER}`, "share %"], popT);
const allPlayedThree = [...corpusLines(2024, (d) => d.phase !== 1), ...corpusLines(2025, (d) => d.phase !== 1), ...corpusLines(2026, (d) => d.phase !== 1)];
say(`all three seasons phase≠1: ${allPlayedThree.length}, p99 ${pct(allPlayedThree, 0.99)}`);
const trip = (k) => rows.filter((r) => (r[k] ?? 0) >= TRIGGER);
table(["date", "games", "v0.1 rows ≥41", "on lane", "v0.3 rows ≥41", "unique v0.1 names"], laneDates.map((d) => { const t = trip("mu").filter((r) => r.date === d); return [d, sides.filter((s) => s.date === d).length / 2, t.length, t.filter((r) => r.onLane).length, trip("v03").filter((r) => r.date === d).length, [...new Set(t.map((r) => `${r.name?.split(" ").at(-1)} ${r1(r.mu)}`))].join(", ")]; }));
const gt = G.filter((r) => (r.mu ?? 0) >= TRIGGER);
const realHigh = P.filter((r) => r.actual >= TRIGGER);
say(`v0.1 trips on graded games ${gt.length}: played ${gt.filter((r) => r.played).length}; actual ≥41 ${gt.filter((r) => r.actual >= TRIGGER).length}; actual ≥38 ${gt.filter((r) => r.actual >= 38).length}; mean actual if played ${r1(mean(gt.filter((r) => r.played).map((r) => r.actual)))}; mean mu ${r1(mean(gt.map((r) => r.mu)))}`);
say(`real rows actual ≥41 on graded games: ${realHigh.length} (in OT ${realHigh.filter((r) => r.inOT).length}); flagged by v0.1 trigger ${realHigh.filter((r) => (r.mu ?? 0) >= TRIGGER).length}; with no projection ${realHigh.filter((r) => r.mu == null).length}; mean mu of the rest ${r1(mean(realHigh.filter((r) => r.mu != null && r.mu < TRIGGER).map((r) => r.mu)))}`);
const gt3 = G.filter((r) => (r.v03 ?? 0) >= TRIGGER);
say(`v0.3 trips on graded games ${gt3.length}, actual ≥41 ${gt3.filter((r) => r.actual >= TRIGGER).length}; real rows flagged by v0.3 ${realHigh.filter((r) => (r.v03 ?? 0) >= TRIGGER).length}`);
table(["trip row", "date", "pool", "factor", "raw", "mu", "actual"], gt.sort((a, b) => b.mu - a.mu).slice(0, 30).map((r) => [`${r.name} ${r.team}`, r.date, r.poolSize, r.factor, r1(r.raw), r1(r.mu), r.played ? r.actual : "DNP"]));
const big10 = M.filter((r) => absErr(r) >= 10);
say(`|err|≥10 matched rows ${big10.length}: tripped by 41 ${big10.filter((r) => r.mu >= TRIGGER).length}; overprojection ${big10.filter((r) => r.mu > r.actual).length}, underprojection ${big10.filter((r) => r.mu < r.actual).length}`);
say();

/* --- contract evaluation --- */
say(`## 7 contract rules on pre-tip data`);
// constants from the 2025-26 regular season only: |game minutes − player's own prior mean this season|, ≥ 5 prior games
const devs = [];
{
  const seq = new Map();
  const docs = corpusBox.filter((d) => d?.boxscoreAvailable && d.season === 2026 && inPopulation(d.phase, "regular")).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));
  for (const d of docs) for (const p of d.players ?? []) {
    if (p?.providerAthleteId == null || p.didNotPlay || !Number.isInteger(p.minutes) || p.minutes <= 0) continue;
    const id = String(p.providerAthleteId); const s = seq.get(id) ?? { n: 0, sum: 0 };
    if (s.n >= 5) devs.push(Math.abs(p.minutes - s.sum / s.n));
    s.n += 1; s.sum += p.minutes; seq.set(id, s);
  }
}
const D_REVIEW = r1(pct(devs, 0.8)), D_BLOCK = r1(pct(devs, 0.95));
say(`2025-26 regular |minutes − own prior season mean|, n ${devs.length}: p50 ${r1(pct(devs, 0.5))}, p80 ${D_REVIEW}, p90 ${r1(pct(devs, 0.9))}, p95 ${D_BLOCK}, p99 ${r1(pct(devs, 0.99))}`);
// team-level uncovered share, pre-tip: last 3 team games captured before the freeze
for (const s of sides) {
  const docs = curGames.filter((d) => Date.parse(d.dateUtc) < Date.parse(s.now) && Date.parse(d.capturedAt ?? FAR) <= Date.parse(s.now) && (d.teams ?? []).some((x) => String(x.providerTeamId) === s.teamId)).slice(-3);
  const sideRows = new Map(rows.filter((r) => sideKeyOf(r) === sideKeyOf(s)).map((r) => [r.id, r]));
  let tot = 0, unc = 0;
  for (const d of docs) for (const p of d.players ?? []) {
    if (String(p.providerTeamId) !== s.teamId || !Number.isInteger(p.minutes) || p.minutes <= 0) continue;
    const r = sideRows.get(String(p.providerAthleteId));
    if (r?.availability === "out") continue;
    tot += p.minutes; if (!r || r.mu == null) unc += p.minutes;
  }
  s.uncoveredShare = tot ? unc / tot : null;
  s.teamCurGames = docs.length;
}
const tier = (r) => {
  const s = sideBy.get(sideKeyOf(r));
  const hasCur = r.frozenCurN >= 3;
  const gap = hasCur ? Math.abs(r.mu - r.frozenCurMean) : null;
  const reasons = [];
  if (r.mu >= 48) reasons.push("B_CAP");
  if (hasCur && gap >= D_BLOCK) reasons.push("B_GAP");
  if (r.v05State === "NO_APPEARANCE" || r.v05State === "MISSED_2PLUS_COACH" || r.v05State === "MISSED_2PLUS_OTHER") reasons.push("B_ELIG");
  if (r.mu >= TRIGGER) reasons.push("R_41");
  if (hasCur && gap >= D_REVIEW) reasons.push("R_GAP");
  if (!hasCur && (s.teamCurGames ?? 0) >= 3) reasons.push("R_THIN");
  if (r.v05State === "MISSED_1_COACH" || r.v05State === "MISSED_1_OTHER") reasons.push("R_MISSED_1");
  if (r.injuryStatus) reasons.push("R_INJ");
  if ((s.uncoveredShare ?? 0) >= 0.15) reasons.push("R_TEAM_COVERAGE");
  if (s.teamCurGames === 0 || !hasCur && (s.teamCurGames ?? 0) < 3) reasons.push("R_NO_CURRENT");
  return { t: reasons.some((x) => x.startsWith("B_")) ? "BLOCKED" : reasons.length ? "REVIEW" : "PASS", reasons };
};
for (const r of rows) if (r.mu != null) { const t = tier(r); r.tier = t.t; r.reasons = t.reasons; }
const evalRows = G.filter((r) => r.mu != null);
const late = evalRows.filter((r) => r.date >= "2026-10-24");
for (const [lab, set] of [["all graded", evalRows], ["from 10-24 (teams have ≥3 games)", late], ["lane rows from 10-24", late.filter((r) => r.onLane)]]) {
  say(`### ${lab}`);
  table(["tier", "rows", "share", "did not play", "minutes MAE", "bias", "pts MAE", "reb MAE", "ast MAE", "|err|≥10 captured"], ["PASS", "REVIEW", "BLOCKED"].map((t) => {
    const rs = set.filter((r) => r.tier === t), pl = rs.filter((r) => r.played);
    const m = bootStat(pl, (s) => mean(s.map((r) => absErr(r))));
    const sta = pl.filter((r) => r.p50?.pts != null && r.pts != null);
    const c = (k) => { const b = bootStat(sta, (s) => mean(s.map((r) => Math.abs(r.p50[k] - r[k])))); return `${b.mean} (${b.lo}, ${b.hi})`; };
    const b10 = set.filter((r) => r.played && absErr(r) >= 10);
    return [t, rs.length, `${r1(100 * rs.length / set.length)}%`, r3(mean(rs.map((r) => (r.played ? 0 : 1)))), `${m.mean} (${m.lo}, ${m.hi})`, r2(mean(pl.map((r) => r.mu - r.actual))), c("pts"), c("reb"), c("ast"), `${r1(100 * rs.filter((r) => r.played && absErr(r) >= 10).length / b10.length)}%`];
  }));
}
const reasonT = new Map(); for (const r of late) for (const x of r.reasons ?? []) { const v = reasonT.get(x) ?? { n: 0, pl: 0, ae: 0, np: 0 }; v.n += 1; if (r.played) { v.pl += 1; v.ae += absErr(r); } else v.np += 1; reasonT.set(x, v); }
table(["rule", "rows", "did not play", "MAE if played"], [...reasonT.entries()].map(([k, v]) => [k, v.n, r3(v.np / v.n), r2(v.ae / Math.max(1, v.pl))]));
const today = rows.filter((r) => r.date === latest && r.mu != null);
const todayLane = today.filter((r) => r.onLane);
say(`${latest}: all rows ${JSON.stringify(["PASS", "REVIEW", "BLOCKED"].map((t) => [t, today.filter((r) => r.tier === t).length]))}; lane rows ${JSON.stringify(["PASS", "REVIEW", "BLOCKED"].map((t) => [t, todayLane.filter((r) => r.tier === t).length]))}`);
for (const n of NAMED) { const r = today.find((x) => x.name === n); if (r) say(`  ${n}: ${r.tier} ${r.reasons.join(",")} mu ${r1(r.mu)} cur ${r.frozenCurMean} n ${r.frozenCurN} state ${r.v05State}`); }
say(`sides uncoveredShare ≥ 15% on ${latest}: ${sides.filter((s) => s.date === latest && (s.uncoveredShare ?? 0) >= 0.15).map((s) => `${s.team} ${r1(100 * s.uncoveredShare)}%`).join(", ")}`);
say();
say(`## appendix team-sides`);
table(["date", "team", "pool", "raw", "factor", "scaled", "lane", "capped", "out", "out raw", "no hist", "departed raw", "other-team"], sides.map((s) => [s.date.slice(5), s.team, s.poolSize, s.rawSum, s.factor, s.scaledSum, r1(s.laneSum), s.capped, s.nOut, s.omittedOutMinutes, s.nInsufficient, s.omittedDepartedMinutes, s.otherTeam]));

fs.writeFileSync(path.join(OUT, "report.md"), L.join("\n"));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(OUT, "sides.json"), JSON.stringify(sides));
fs.writeFileSync(path.join(OUT, "rows.json"), JSON.stringify(rows));
console.log(`wrote ${OUT}/report.md (${L.length} lines); graded games ${gradedGames}`);
