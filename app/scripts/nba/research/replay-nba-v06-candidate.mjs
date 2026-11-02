/**
 * REPLAY_NOT_PUBLISHED — the v0.6 candidate on the exact as-of inputs of frozen slates, against v0.1 and v0.3.
 * NBA REGULAR SEASON — CANDIDATE (NOT ARMED) · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * SEEN-DATA REPLAY. The audit read these games before v0.6 existed. Nothing printed here is forward evidence, a receipt,
 * a ledger row or a sample toward any preregistered count. Rules and bars:
 * docs/nba/NBA_V06_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md.
 *
 *   npx tsx scripts/nba/research/replay-nba-v06-candidate.mjs --out-dir <dir outside the repo> [--bootstrap 2000] [--simulations 10000] [--projections-only]
 *
 * --projections-only joins no outcome: it proves fidelity and prints what v0.6 projects. It is the only mode to use
 * before the preregistration commit exists.
 *
 * For each v0.1 freeze: roster and injury blobs located by the receipt's sha256; every v0.1 and v0.3 side re-derived and
 * compared with its frozen minutes (REFUSED on any mismatch); then v0.5 and v0.6 built on the same inputs. Reads committed
 * data and git history only. No network, no paid API, no build. Writes ONLY to --out-dir, which must be outside the repo.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { FAMILIES } from "../../../src/lib/sports/nba/experimental-forecast.mjs";
import { foldBoxscores } from "../../../src/lib/sports/nba/season-fold.mjs";
import { gatePool } from "../../../src/lib/sports/nba/roster-gated-pool.mjs";
import { prepareRoster, mulberry32 } from "../../../src/lib/sports/nba/game-sim.mjs";
import { prepareRosterV03 } from "../../../src/lib/sports/nba/game-sim-v03.mjs";
import { gatePoolV03, indexRoleHistory } from "../../../src/lib/sports/nba/minutes-model-v03.mjs";
import { applyEligibilityGate, indexCurrentSeasonStatus } from "../../../src/lib/sports/nba/eligibility-gate-v05.mjs";
import { buildV06Context, EXCLUDED_STATE, gatePoolV06, prepareRosterV06 } from "../../../src/lib/sports/nba/minutes-model-v06.mjs";
import { simulatePrepared } from "../../../src/lib/sports/nba/game-sim-v06.mjs";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src", "lib", "sports", "nba");
const APP = path.resolve(SRC_DIR, "..", "..", "..", "..");
const ROOT = path.resolve(APP, "..");
const NBA = path.join(ROOT, "data", "internal", "research", "nba");
const LANES = path.join(APP, "public", "data", "nba", "experimental-public");
const MIN_CLUSTERS = 10;
const SLATE = "2026-11-02"; // the slate not yet played: side by side only, never evaluated
const DTD_FIT_LAST_DATE = "2026-10-28";
const NAMED = ["Shai Gilgeous-Alexander", "Rui Hachimura", "Trae Young", "Donovan Mitchell", "Joel Embiid", "Moussa Cisse", "Nick Richards", "Zaccharie Risacher"];
const SENSITIVITIES = Object.freeze({
  noDayToDay: { DAY_TO_DAY_MULTIPLIER: 1 },
  noExclusion: { EXCLUDE_BELOW_PLAY_RATE: 0 },
  sameTransferPrior: { TRANSFER_PRIOR_GAMES: 3 },
});

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const OUT = arg("--out-dir") ? path.resolve(arg("--out-dir")) : null;
const B = Number(arg("--bootstrap") ?? 2000);
const SIMS = Number(arg("--simulations") ?? 10000);
const PROJECTIONS_ONLY = process.argv.includes("--projections-only");
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

const blobCache = new Map();
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

/* ---------- load ---------- */
const corpusBox = readBoxDir(path.join(NBA, "boxscores"));
const fetchedBox = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
const docById = PROJECTIONS_ONLY ? new Map() : new Map(foldBoxscores(corpusBox, fetchedBox, { now: "2099-01-01T00:00:00Z" }).docs.map((d) => [String(d.providerEventId), d]));
const lastGrade = new Map();
if (!PROJECTIONS_ONLY) for (const e of readJson(path.join(NBA, "experimental-v0.1", "ledger.json")).gradeEntries ?? []) lastGrade.set(String(e.providerEventId), e);

const laneDates = fs.readdirSync(LANES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d >= "2026-10-20").sort();
const v01Docs = new Map(), v03Docs = new Map();
const wantRoster = new Set(), wantInj = new Set();
for (const date of laneDates) {
  const f1 = path.join(NBA, "experimental-v0.1", "forecasts", `${date}.json`);
  const f3 = path.join(NBA, "experimental-v0.3", "forecasts", `${date}.json`);
  if (fs.existsSync(f1)) { const d = readJson(f1); v01Docs.set(date, d); for (const g of d.games) { wantRoster.add(g.receipt.inputs.rosters.sha256); wantInj.add(g.receipt.inputs.injuries.sha256); } }
  if (fs.existsSync(f3)) v03Docs.set(date, readJson(f3));
}
const rosterBlobs = blobIndex("data/internal/research/nba/rosters/latest.json", wantRoster);
const injBlobs = blobIndex("data/internal/research/injuries/nba/latest.json", wantInj);
const parsed = new Map();
const parse = (m, s) => { if (!m.has(s)) return null; if (!parsed.has(s)) parsed.set(s, JSON.parse(m.get(s))); return parsed.get(s); };

/* ---------- replay ---------- */
const rows = [], sides = [], feedSkews = [];
const fidelity = { v01Sides: 0, v01Match: 0, v03Sides: 0, v03Match: 0, v01Mismatch: [], v03Mismatch: [] };

for (const date of laneDates) {
  const doc = v01Docs.get(date);
  if (!doc) continue;
  const v03ById = new Map((v03Docs.get(date)?.games ?? []).map((g) => [String(g.providerEventId), g]));
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
    const statusIdx = indexCurrentSeasonStatus(fold.docs, { asOfDateUtc: now });
    // The receipt hashed this feed, so it is the freeze's input even where its stamp ticks past the freeze. The skew is
    // counted, not hidden; gatePoolV06 refuses a later feed everywhere else. Entries stated after the instant still drop.
    const feedStamp = injDoc.sourceAsOf ?? injDoc.generatedAt ?? null;
    const skewSeconds = (Date.parse(feedStamp ?? now) - Date.parse(now)) / 1000;
    if (skewSeconds > 0) feedSkews.push({ date, now, feedStamp, skewSeconds });
    const contextArgs = { boxscores: fold.docs, injuries, injuriesAsOf: null, asOfDateUtc: now };
    const context = buildV06Context(contextArgs);
    const sensContexts = Object.fromEntries(Object.entries(SENSITIVITIES).map(([k, overrides]) => [k, buildV06Context({ ...contextArgs, overrides })]));
    const cache = new Map();
    for (const g of games) {
      const gameId = String(g.providerEventId);
      const box = docById.get(gameId) ?? null;
      const graded = !!(box?.boxscoreAvailable && lastGrade.get(gameId)?.status === "GRADED");
      const v03G = v03ById.get(gameId) ?? null;
      const prepared = {};
      const sideOut = [];
      for (const sideKey of ["home", "away"]) {
        const s = g[sideKey];
        const teamId = String(s.providerTeamId);
        const frozenPlayers = g.forecast.players[sideKey];
        const frozenMin = g.forecast.assumptions.minutes[sideKey];
        // v0.1, re-derived
        const gV01 = gatePool({ rosters, providerTeamId: teamId, boxscores: corpusBox, asOfDateUtc: now, injuries, population: "regular", teamMinutesCache: cache });
        if (gV01.state !== "GATED") refuse(`${date} ${gameId} ${sideKey}: v0.1 gate ${gV01.reason}`);
        const pV01 = prepareRoster(gV01);
        const f1 = new Map(frozenPlayers.map((p) => [String(p.providerAthleteId), p]));
        fidelity.v01Sides += 1;
        if (pV01.players.length === frozenPlayers.length && pV01.assumptions.minutes.rescaleFactor === frozenMin.rescaleFactor && pV01.players.every((p) => f1.get(String(p.providerAthleteId))?.expectedMinutes === p.expectedMinutes)) fidelity.v01Match += 1;
        else fidelity.v01Mismatch.push(`${date}:${gameId}:${sideKey}`);
        // v0.3, re-derived
        const gV03 = gatePoolV03({ rosters, providerTeamId: teamId, boxscores: fold.docs, asOfDateUtc: now, injuries, population: "regular", roleIndex: roleIdx });
        const pV03 = prepareRosterV03(gV03);
        const replay3 = new Map(pV03.players.map((p) => [String(p.providerAthleteId), p]));
        let f3 = null;
        if (v03G) {
          f3 = new Map(v03G.forecast.players[sideKey].map((p) => [String(p.providerAthleteId), p]));
          fidelity.v03Sides += 1;
          if (pV03.players.length === f3.size && pV03.players.every((p) => f3.get(String(p.providerAthleteId))?.expectedMinutes === p.expectedMinutes)) fidelity.v03Match += 1;
          else fidelity.v03Mismatch.push(`${date}:${gameId}:${sideKey}`);
        }
        // v0.5, replay
        const gV05 = applyEligibilityGate(gV03, { statusIndex: statusIdx });
        const pV05 = new Map(prepareRosterV03(gV05).players.map((p) => [String(p.providerAthleteId), p]));
        // v0.6
        const gV06 = gatePoolV06({ rosters, providerTeamId: teamId, context });
        if (gV06.state !== "GATED") refuse(`${date} ${gameId} ${sideKey}: v0.6 gate ${gV06.reason}`);
        const pV06 = prepareRosterV06(gV06);
        prepared[sideKey] = pV06;
        const v06Rows = new Map(gV06.rows.map((r) => [r.providerAthleteId, r]));
        const v06Live = new Map(pV06.players.map((p) => [p.providerAthleteId, p]));
        const sens = Object.fromEntries(Object.entries(sensContexts).map(([k, c]) => [k, new Map(prepareRosterV06(gatePoolV06({ rosters, providerTeamId: teamId, context: c })).players.map((p) => [p.providerAthleteId, p]))]));

        const boxPlayers = (box?.players ?? []).filter((p) => String(p.providerTeamId) === teamId);
        const ids = new Map();
        for (const r of gV01.rows) ids.set(String(r.providerAthleteId), r.name);
        for (const r of gV06.rows) ids.set(r.providerAthleteId, r.name);
        for (const a of boxPlayers) if (a.providerAthleteId != null && !ids.has(String(a.providerAthleteId))) ids.set(String(a.providerAthleteId), a.name);
        const prepV01 = new Map(pV01.players.map((p) => [String(p.providerAthleteId), p]));
        const row0 = [];
        for (const [id, name] of ids) {
          const a = boxPlayers.find((x) => String(x.providerAthleteId) === id) ?? null;
          const played = !!(a && !a.didNotPlay && Number.isInteger(a.minutes) && a.minutes > 0);
          const r6 = v06Rows.get(id) ?? null;
          const l6 = v06Live.get(id) ?? null;
          const rec = roleIdx.byAthlete.get(id);
          const cur = rec?.apps?.[roleIdx.currentSeason] ?? [];
          const row = {
            date, gameId, teamId, team: s.abbr, sideKey, id, name, graded, played, inBox: !!a, actual: played ? a.minutes : 0, starter: played && a.starter === true,
            pts: played ? a.pts : null, reb: played ? a.reb : null, ast: played ? a.ast : null,
            v01: prepV01.get(id)?.expectedMinutes ?? null, v01P50: f1.get(id) ? { pts: f1.get(id).pts?.p50, reb: f1.get(id).reb?.p50, ast: f1.get(id).ast?.p50 } : null,
            v03: f3 ? (f3.get(id)?.expectedMinutes ?? null) : null, v03Replay: replay3.get(id)?.expectedMinutes ?? null, v03Q: replay3.get(id)?.playRate ?? null,
            v03P50: f3?.get(id) ? { pts: f3.get(id).pts?.p50, reb: f3.get(id).reb?.p50, ast: f3.get(id).ast?.p50 } : null, hasV03Frozen: !!f3,
            v05: pV05.get(id)?.expectedMinutes ?? null, v05Q: pV05.get(id)?.playRate ?? null,
            v06: l6?.expectedMinutes ?? null, v06Q: r6?.projectedPlayProbability ?? null, v06Excluded: r6?.minutesState === EXCLUDED_STATE, v06Exclusion: r6?.exclusionReason ?? null, v06NoProjection: r6?.noProjectionReason ?? null, v06Availability: r6?.availability ?? null,
            v06State: r6?.eligibilityState ?? null, injuryStatus: r6?.injuryStatus ?? null, v06P50: null, onRoster: !!r6, roleMinutes: r6?.expectedMinutes ?? null, moved: r6?.movedTeam ?? false,
            curN: cur.length, curMean: r2(mean(cur.map((x) => x.minutes))),
            sens: Object.fromEntries(Object.entries(sens).map(([k, m]) => [k, m.get(id) ? { mu: m.get(id).expectedMinutes, q: m.get(id).playRate } : null])),
          };
          rows.push(row); row0.push(row);
        }
        const rc = pV06.reconciliation;
        const side = { date, gameId, team: s.abbr, teamId, sideKey, graded, now, hasV03Frozen: !!v03G, poolV06: pV06.players.length, unallocated: rc.unallocatedMinutes, expectedOnProjected: rc.expectedOnProjected, applied: rc.applied, atCeiling: rc.atCeiling, rawWeighted: rc.rawPlayRateWeighted, excluded: pV06.excluded.length, noProjection: pV06.noProjection.length, coverage: pV06.coverage, noProjectionList: pV06.noProjection };
        sides.push(side); sideOut.push(side);
      }
      const sim = simulatePrepared({ providerEventId: gameId, home: prepared.home, away: prepared.away, simulations: SIMS });
      const p50 = new Map();
      for (const k of ["home", "away"]) for (const p of sim.players[k]) p50.set(`${g[k].providerTeamId}|${p.providerAthleteId}`, { pts: p.pts.p50, reb: p.reb.p50, ast: p.ast.p50 });
      for (const r of rows) if (r.gameId === gameId) r.v06P50 = p50.get(`${r.teamId}|${r.id}`) ?? null;
    }
  }
  console.error(`${date}: rows ${rows.length}`);
}
if (fidelity.v01Mismatch.length) refuse(`v0.1 does not re-derive: ${fidelity.v01Mismatch.slice(0, 8).join(" ")}`);
if (fidelity.v03Mismatch.length) refuse(`v0.3 does not re-derive: ${fidelity.v03Mismatch.slice(0, 8).join(" ")}`);
fs.mkdirSync(OUT, { recursive: true });

/* ---------- output helpers ---------- */
const L = [];
const say = (s = "") => L.push(s);
const table = (head, lines) => { say(`| ${head.join(" | ")} |`); say(`|${head.map(() => "---").join("|")}|`); for (const l of lines) say(`| ${l.join(" | ")} |`); say(); };
const summary = { marker: "REPLAY_NOT_PUBLISHED", evidence: "SEEN_DATA_REPLAY — the audit read these games; never forward evidence", dataClass: "PRIVATE_RESEARCH", productEligible: false, fidelity: { v01: `${fidelity.v01Match}/${fidelity.v01Sides}`, v03: `${fidelity.v03Match}/${fidelity.v03Sides}` } };
say("# v0.6 seen-data replay output"); say("SEEN-DATA REPLAY. Not forward evidence."); say(`fidelity: v0.1 sides ${fidelity.v01Match}/${fidelity.v01Sides}, v0.3 sides ${fidelity.v03Match}/${fidelity.v03Sides}`);
say(`feeds stamped after their freeze: ${JSON.stringify(feedSkews)}`); say();

/* ---------- reconciliation and projections: no outcome involved ---------- */
const recon = sides.map((s) => s.expectedOnProjected + s.unallocated);
say("## reconciliation (all sides, no outcomes)");
say(`sides ${sides.length}; Σ q·minutes + unallocated: min ${Math.min(...recon)}, max ${Math.max(...recon)}; under-full sides ${sides.filter((s) => s.unallocated > 0).length}; mean unallocated when under-full ${r1(mean(sides.filter((s) => s.unallocated > 0).map((s) => s.unallocated)))}; max unallocated ${Math.max(...sides.map((s) => s.unallocated))}`);
const lanePool = rows.filter((r) => r.v06 != null);
say(`v0.6 rows ${lanePool.length}; max projected ${Math.max(...lanePool.map((r) => r.v06))}; rows ≥41: ${lanePool.filter((r) => r.v06 >= 41).length}; rows excluded ${rows.filter((r) => r.v06Excluded).length}; rows no projection ${rows.filter((r) => r.v06NoProjection).length}`);
say();

/* ---------- the unplayed slate ---------- */
say(`## slate ${SLATE} side by side (not played at this head)`);
const slate = rows.filter((r) => r.date === SLATE);
table(["Player", "Team", "v0.1", "v0.3", "v0.6 min", "v0.6 q", "State", "Injury", "2026-27 mean (n)", "v0.1 pts", "v0.3 pts", "v0.6 pts", "v0.6 reb", "v0.6 ast", "Note"],
  NAMED.map((n) => {
    const r = slate.find((x) => x.name === n);
    if (!r) return [n, "not on this slate", "", "", "", "", "", "", "", "", "", "", "", "", ""];
    return [n, r.team, r1(r.v01), r1(r.v03), r1(r.v06), r2(r.v06Q), r.v06State, r.injuryStatus ?? "", r.curMean == null ? "none" : `${r.curMean} (${r.curN})`, r.v01P50?.pts ?? "", r.v03P50?.pts ?? "", r.v06P50?.pts ?? "", r.v06P50?.reb ?? "", r.v06P50?.ast ?? "", r.v06Excluded ? `EXCLUDED ${r.v06Exclusion}` : r.v06NoProjection ?? (r.v06Availability === "out" ? "OUT" : "")];
  }));
{
  const ss = sides.filter((s) => s.date === SLATE);
  const roles = ss.flatMap((s) => s.coverage.roles.map((c) => ({ ...c, team: s.team })));
  const count = (role) => { const m = {}; for (const c of roles.filter((x) => x.role === role)) { const k = c.reason ? `${c.status}:${c.reason}` : c.status; m[k] = (m[k] ?? 0) + 1; } return m; };
  say(`slate rows ≥ 41: v0.1 ${slate.filter((r) => r.v01 >= 41).length}, v0.3 ${slate.filter((r) => r.v03 >= 41).length}, v0.6 ${slate.filter((r) => r.v06 >= 41).length}`);
  say(`slate last-game starters: ${JSON.stringify(count("STARTER"))}`);
  say(`slate last-game sixth men: ${JSON.stringify(count("SIXTH_MAN"))}`);
  say(`slate no-projection rows by reason: ${JSON.stringify(slate.filter((r) => r.v06NoProjection).reduce((m, r) => ((m[r.v06NoProjection] = (m[r.v06NoProjection] ?? 0) + 1), m), {}))}; excluded ${slate.filter((r) => r.v06Excluded).length}`);
  say(`slate unallocated by side over 5: ${ss.filter((s) => s.unallocated > 5).map((s) => `${s.team} ${s.unallocated}`).join(", ") || "none"}`);
  summary.slateNamed = NAMED.map((n) => slate.find((x) => x.name === n) ?? { name: n, absent: true });
  say();
}

if (PROJECTIONS_ONLY) {
  fs.writeFileSync(path.join(OUT, "projections-report.md"), L.join("\n"));
  console.log(L.join("\n"));
  process.exit(0);
}

/* ---------- evaluation ---------- */
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
const ci = (c) => (c.mean == null ? "n/a" : c.label === "FEW_CLUSTERS" ? `${c.mean} FEW_CLUSTERS` : `${c.mean} (${c.lo}, ${c.hi})`);
const err = (r, k) => Math.abs(r[k] - r.actual);
const pairDelta = (rs, a, b) => bootStat(rs, (s) => mean(s.map((r) => err(r, a) - err(r, b))));

const G = rows.filter((r) => r.graded && r.date !== SLATE);
const W74 = G.filter((r) => r.hasV03Frozen);
const games = (rs) => new Set(rs.map((r) => r.gameId)).size;
say(`## population\ngraded games ${games(G)}; with frozen v0.3 ${games(W74)}`); say();

// A. minutes on common rows
const common74 = W74.filter((r) => r.played && r.v01 != null && r.v03 != null && r.v06 != null);
const common88 = G.filter((r) => r.played && r.v01 != null && r.v06 != null);
say(`## A minutes, played rows every family projects: ${common74.length} rows, ${games(common74)} games`);
const fam = [["v0.1 frozen", "v01"], ["v0.3 frozen", "v03"], ["v0.5 replay", "v05"], ["v0.6 replay", "v06"]];
const faRows = common74.filter((r) => r.v05 != null);
table(["Family", "Rows", "MAE", "Bias", "Err ≥ 15 per 100"], fam.map(([n, k]) => [n, faRows.length, ci(bootStat(faRows, (s) => mean(s.map((r) => err(r, k))))), ci(bootStat(faRows, (s) => mean(s.map((r) => r[k] - r.actual)))), ci(bootStat(faRows, (s) => 100 * mean(s.map((r) => (err(r, k) >= 15 ? 1 : 0)))))]));
const dA = { v06v03: pairDelta(faRows, "v06", "v03"), v06v01: pairDelta(faRows, "v06", "v01"), v06v05: pairDelta(faRows, "v06", "v05") };
const biasV06 = bootStat(faRows, (s) => mean(s.map((r) => r.v06 - r.actual)));
const ext = { v06v03: bootStat(faRows, (s) => 100 * mean(s.map((r) => (err(r, "v06") >= 15 ? 1 : 0) - (err(r, "v03") >= 15 ? 1 : 0)))) };
say(`ΔMAE v0.6 − v0.3 ${ci(dA.v06v03)}; v0.6 − v0.1 ${ci(dA.v06v01)}; v0.6 − v0.5 ${ci(dA.v06v05)}. Negative means v0.6 has the lower error on these rows.`);
say(`Δ err ≥ 15 per 100, v0.6 − v0.3 ${ci(ext.v06v03)}`);
say(`88-game set, v0.6 vs v0.1, ${common88.length} rows: ΔMAE ${ci(pairDelta(common88, "v06", "v01"))}`);
for (const [n, f] of [["actual starters", (r) => r.starter], ["bench", (r) => !r.starter], ["moved team", (r) => r.moved], ["same team", (r) => !r.moved]]) { const rs = faRows.filter(f); say(`${n}: rows ${rs.length}, bias v0.3 ${ci(bootStat(rs, (s) => mean(s.map((r) => r.v03 - r.actual))))}, bias v0.6 ${ci(bootStat(rs, (s) => mean(s.map((r) => r.v06 - r.actual))))}, ΔMAE ${ci(pairDelta(rs, "v06", "v03"))}`); }
say();

// B. coverage-fair: unconditional expected minutes per team-game
say("## B unconditional minutes error per team-game (Σ |q·mu − actual| over pool ∪ box; v0.1 q = 1; no projection counts 0)");
const uncond = (r, mu, q) => Math.abs((mu == null ? 0 : mu * (q ?? 1)) - r.actual);
const sideRows = [];
for (const [k, list] of Map.groupBy(W74.filter((r) => r.onRoster || r.played || r.v01 != null), (r) => `${r.gameId}|${r.teamId}`)) {
  const [gameId] = k.split("|");
  const o = { gameId, v01: 0, v03: 0, v05: 0, v06: 0, sens: Object.fromEntries(Object.keys(SENSITIVITIES).map((s) => [s, 0])) };
  for (const r of list) {
    o.v01 += uncond(r, r.v01, 1); o.v03 += uncond(r, r.v03, r.v03Q); o.v05 += uncond(r, r.v05, r.v05Q); o.v06 += uncond(r, r.v06, r.v06Q);
    for (const s of Object.keys(SENSITIVITIES)) o.sens[s] += uncond(r, r.sens[s]?.mu ?? null, r.sens[s]?.q ?? null);
  }
  sideRows.push(o);
}
const sideMean = (k) => bootStat(sideRows, (s) => mean(s.map((r) => r[k])));
table(["Family", "Per team-game"], [["v0.1", ci(sideMean("v01"))], ["v0.3", ci(sideMean("v03"))], ["v0.5", ci(sideMean("v05"))], ["v0.6", ci(sideMean("v06"))]]);
const dUm = bootStat(sideRows, (s) => mean(s.map((r) => r.v06 - r.v03)));
say(`Δ v0.6 − v0.3 ${ci(dUm)}; Δ v0.6 − v0.1 ${ci(bootStat(sideRows, (s) => mean(s.map((r) => r.v06 - r.v01))))}; Δ v0.6 − v0.5 ${ci(bootStat(sideRows, (s) => mean(s.map((r) => r.v06 - r.v05))))}`);
say();

// C. participation
const part = W74.filter((r) => r.v03 != null);
const y = (r) => (r.played ? 1 : 0);
const brier = (r, q) => (q - y(r)) ** 2;
say(`## C participation Brier, lower is better. Rows in the frozen v0.3 pool: ${part.length}`);
const qOf = { v01: (r) => (r.v01 != null ? 1 : 0), v03: (r) => r.v03Q, v05: (r) => r.v05Q, v06: (r) => r.v06Q ?? 0 };
table(["Family", "Brier"], Object.entries(qOf).map(([k, f]) => [k, ci(bootStat(part, (s) => mean(s.map((r) => brier(r, f(r))))))]));
const dB = bootStat(part, (s) => mean(s.map((r) => brier(r, qOf.v06(r)) - brier(r, qOf.v03(r)))));
say(`Δ v0.6 − v0.3 ${ci(dB)}; Δ v0.6 − v0.1 ${ci(bootStat(part, (s) => mean(s.map((r) => brier(r, qOf.v06(r)) - brier(r, qOf.v01(r))))))}; Δ v0.6 − v0.5 ${ci(bootStat(part, (s) => mean(s.map((r) => brier(r, qOf.v06(r)) - brier(r, qOf.v05(r))))))}`);
say();

// D. extreme rows
const allPool = (k) => W74.filter((r) => r[k] != null);
say("## D extreme rows (all projected rows on the 74 games)");
table(["Family", "Projected rows", "Rows ≥ 41", "Of those reached 41", "Missed ≥ 10 of those"], fam.map(([n, k]) => { const h = allPool(k).filter((r) => r[k] >= 41); return [n, allPool(k).length, h.length, h.filter((r) => r.actual >= 41).length, h.filter((r) => err(r, k) >= 10).length]; }));
say(`actual rows ≥ 41: ${W74.filter((r) => r.actual >= 41).length}`); say();
const high = { v03: allPool("v03").filter((r) => r.v03 >= 41).length, v06: allPool("v06").filter((r) => r.v06 >= 41).length };

// E. coverage
const sixth = new Set();
for (const [, list] of Map.groupBy(W74.filter((r) => r.played && !r.starter), (r) => `${r.gameId}|${r.teamId}`)) { const b = [...list].sort((a, c) => c.actual - a.actual)[0]; if (b) sixth.add(b); }
const covOf = (list, k) => list.filter((r) => r[k] != null).length;
const starters = W74.filter((r) => r.starter), sixthRows = [...sixth], allPlayed = W74.filter((r) => r.played);
say("## E coverage on the 74 games: played rows the family projected");
table(["Family", `Starters of ${starters.length}`, `Sixth men of ${sixthRows.length}`, `All who played of ${allPlayed.length}`], fam.map(([n, k]) => [n, covOf(starters, k), covOf(sixthRows, k), covOf(allPlayed, k)]));
const reasons = {}; for (const r of allPlayed.filter((x) => x.v06 == null)) { const c = r.v06Excluded ? `EXCLUDED:${r.v06Exclusion}` : r.v06NoProjection ?? (r.v06Availability === "out" ? "LISTED_OUT" : r.onRoster ? "OTHER" : "NOT_ON_ROSTER_CAPTURE"); reasons[c] = (reasons[c] ?? 0) + 1; }
say(`played with no v0.6 projection, by reason: ${JSON.stringify(reasons)}`);
{ const ex = G.filter((r) => r.v06Excluded); say(`exclusions on 88 games: ${ex.length} rows; played ${ex.filter((r) => r.played).length} (${r1(100 * ex.filter((r) => r.played).length / ex.length)}%); mean minutes when played ${r1(mean(ex.filter((r) => r.played).map((r) => r.actual)))}; by state ${JSON.stringify(ex.reduce((m, r) => { const k = r.v06Exclusion; m[k] ??= { n: 0, played: 0 }; m[k].n += 1; if (r.played) m[k].played += 1; return m; }, {}))}`); }
{ const d = G.filter((r) => r.v06 != null && r.injuryStatus && /day-to-day/i.test(r.injuryStatus) && r.date > DTD_FIT_LAST_DATE); say(`Day-To-Day rows after the fit window: ${d.length}, played ${d.filter((r) => r.played).length}, mean q ${r3(mean(d.map((r) => r.v06Q)))}`); }
say();

// F. dependent stats
const statRows = common74.filter((r) => r.v01P50?.pts != null && r.v03P50?.pts != null && r.v06P50?.pts != null);
say(`## F dependent stats, frozen v0.1 and v0.3 medians vs v0.6 sim medians. ${statRows.length} rows, ${games(statRows)} games`);
const dStat = {};
table(["Stat", "MAE v0.1", "MAE v0.3", "MAE v0.6", "Δ v0.6 − v0.3", "Δ v0.6 − v0.1", "Bias v0.3", "Bias v0.6"], ["pts", "reb", "ast"].map((k) => {
  const m = (f) => bootStat(statRows, (s) => mean(s.map((r) => Math.abs(r[f][k] - r[k]))));
  dStat[k] = bootStat(statRows, (s) => mean(s.map((r) => Math.abs(r.v06P50[k] - r[k]) - Math.abs(r.v03P50[k] - r[k]))));
  return [k, ci(m("v01P50")), ci(m("v03P50")), ci(m("v06P50")), ci(dStat[k]), ci(bootStat(statRows, (s) => mean(s.map((r) => Math.abs(r.v06P50[k] - r[k]) - Math.abs(r.v01P50[k] - r[k]))))), ci(bootStat(statRows, (s) => mean(s.map((r) => r.v03P50[k] - r[k])))), ci(bootStat(statRows, (s) => mean(s.map((r) => r.v06P50[k] - r[k]))))];
}));

// G. outside the Day-To-Day fit window
const late = faRows.filter((r) => r.date > DTD_FIT_LAST_DATE);
say(`## G games after the Day-To-Day fit window (still seen by the audit): ${late.length} rows, ${games(late)} games`);
say(`ΔMAE v0.6 − v0.3 ${ci(pairDelta(late, "v06", "v03"))}; Brier Δ v0.6 − v0.3 ${ci(bootStat(part.filter((r) => r.date > DTD_FIT_LAST_DATE), (s) => mean(s.map((r) => brier(r, qOf.v06(r)) - brier(r, qOf.v03(r))))))}`);
say();

// H. sensitivities
say("## H preregistered sensitivities, on the rows of section A");
table(["Variant", "ΔMAE vs v0.3 on rows it projects", "Rows", "Unconditional Δ vs v0.3 per team-game"], Object.keys(SENSITIVITIES).map((k) => {
  const rs = faRows.filter((r) => r.sens[k]?.mu != null).map((r) => ({ ...r, s: r.sens[k].mu }));
  return [k, ci(pairDelta(rs, "s", "v03")), rs.length, ci(bootStat(sideRows, (s) => mean(s.map((r) => r.sens[k] - r.v03))))];
}));

// I. bars
const barCoverage = covOf(starters, "v06") >= covOf(starters, "v03") && covOf(sixthRows, "v06") >= covOf(sixthRows, "v03");
const bars = [
  ["R1", "Minutes ΔMAE v0.6 − v0.3, interval below 0", ci(dA.v06v03), dA.v06v03.hi < 0],
  ["R2", "Unconditional minutes Δ v0.6 − v0.3, interval below 0", ci(dUm), dUm.hi < 0],
  ["R3", "|Minutes bias| ≤ 1.0 and its interval covers 0", ci(biasV06), Math.abs(biasV06.mean) <= 1 && biasV06.lo <= 0 && biasV06.hi >= 0],
  ["R4", "Participation Brier Δ v0.6 − v0.3, interval below 0", ci(dB), dB.hi < 0],
  ["R5", "Rows ≥ 41 no more than v0.3", `${high.v06} vs ${high.v03}`, high.v06 <= high.v03],
  ["R6", "Starters and sixth men projected no fewer than v0.3", `${covOf(starters, "v06")}/${covOf(starters, "v03")}, ${covOf(sixthRows, "v06")}/${covOf(sixthRows, "v03")}`, barCoverage],
  ["R7", "Pts, reb, ast not worse than v0.3: interval upper ≤ +0.05", `${ci(dStat.pts)}; ${ci(dStat.reb)}; ${ci(dStat.ast)}`, ["pts", "reb", "ast"].every((k) => dStat[k].hi <= 0.05)],
  ["R8", "Team minutes reconcile on every side, within 0.02", `${r2(Math.min(...recon))} to ${r2(Math.max(...recon))}`, recon.every((x) => Math.abs(x - 240) <= 0.02)],
];
say("## I replay bars (descriptive; meeting them is not forward evidence and arms nothing)");
table(["Bar", "Rule", "Result", "Met"], bars.map(([a, b, c, d]) => [a, b, c, d ? "yes" : "NO"]));
summary.bars = bars.map(([a, b, c, d]) => ({ bar: a, rule: b, result: c, met: d }));

fs.writeFileSync(path.join(OUT, "report.md"), L.join("\n"));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(OUT, "rows.json"), JSON.stringify(rows));
console.log(L.join("\n"));
