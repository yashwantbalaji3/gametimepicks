#!/usr/bin/env node
/**
 * NFL props-v1 RECEIVING YARDS — FORWARD RECEIPT, 2026 (ledger N8). PRIVATE_RESEARCH. Research only: writes nothing
 * public, changes no board label, no eligibility state, no model, no frozen file.
 *
 * WHY: the public player board shows player_reception_yds as PUBLISHED on the props-v1 RETROSPECTIVE evaluation
 * (held-out 2025, n=3575) — the board builder sets PUBLISHED whenever the event artifact's promotion block says
 * PUBLIC_ELIGIBLE (app/scripts/nfl/build-nfl-player-board.mjs), and the share-level model that would replace it
 * breached its own forward test. Nothing graded the props-v1 numbers the board actually carried in 2026.
 *
 * WHAT IS GRADED (AS SERVED, frozen pre-kickoff): for every regular-season 2026 event, the LAST revision of
 * app/public/data/nfl/player-board/<eventId>.json in this checkout's git history whose commit time AND own
 * generatedAt are both strictly before the event's kickoff — the share-level forward receipt's commit-time
 * convention. A git commit is not Vercel served-revision evidence (forecast-of-record Option B); the receipt says so.
 * Only rows of a revision whose receiving-yards family is the props-v1 engine (no share-level `model`) are graded.
 *
 * WHAT IS RECONSTRUCTED (labelled on the receipt, never presented as served):
 *   - the rolling-4 and share×volume BASELINES and the rolling-4 LINE PROXY: the props-v1 evaluator's walk-forward
 *     rule (evaluate-nfl-player-props.mjs foldGame/candidatesFor) over the committed ESPN corpus
 *     (player-events-v1 2023–2026), with the evaluator's committed fit (volume a0, league rates);
 *   - P(over line) for the calibration bar: the board never carried one for this family, so it is interpolated from
 *     the five served quantiles (pOverFromQuantiles), with step-bound sensitivity.
 *
 * SETTLEMENT (props-v1 population contract, participation-true): a player on the ESPN stat sheet settles his
 * receiving yards when he had a target or a carry, else VOID (zero-opportunity appearance); a player absent from the
 * stat sheet with offensive snaps settles 0; absent with no offensive snaps is VOID (the snap file carries offense
 * only, so special-teams-only appearances also void — declared difference); a team-game with no snap sheet is
 * EXCLUDED; a game not yet final is NOT_FINAL.
 *
 *   node scripts/research/nfl/forward-props-v1-reception-yds.mjs [--rev <commit>] [--out-dir <dir>]
 *
 * Deterministic: every input is read at --rev (default HEAD), which the receipt records as builtFromCommit; the same
 * --rev gives byte-identical output (props-v1-forward-receipt.test.mjs regenerates it). No wall clock.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { familyNumerator, teamGameTotals, decayedShare } from "../../../app/src/lib/sports/nfl/role-shares.mjs";
import { SHARE_LEVEL_MODEL_ID } from "../../../app/src/lib/sports/nfl/share-level-board.mjs";
import {
  MARKET, PROPS_V1_FORWARD_RECEIPT_VERSION, readPropsV1PromotionBars, readShareLevelForwardBars, pOverFromQuantiles,
  pointMetrics, judgePropsV1, judgeShareLevel, clusteredIntervals, stableJson,
} from "../../../app/src/lib/sports/nfl/props-v1-forward-receipt.mjs";
import { prefetchBlobs } from "./git-blob-prefetch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const OUT_DIR = path.resolve(argOf("--out-dir", rel("data/internal/research/nfl/replay/props-v1-reception-yds-forward")));
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const REV = git("rev-parse", "--verify", `${argOf("--rev", "HEAD")}^{commit}`).trim();
const SEASON = 2026;

const SRC = {
  evaluator: "app/scripts/nfl/evaluate-nfl-player-props.mjs",
  evaluation: "data/internal/research/nfl/reports/player-props-v1-evaluation.json",
  shareLevelPrereg: "data/internal/research/nfl/reports/player-props-share-level-preregistration.json",
  shareLevelProtocol: "data/internal/research/nfl/reports/player-props-share-level-forward-protocol.json",
  shareLevelForwardReceipt: "data/internal/research/nfl/replay/player-props-share-level-forward/receipt.json",
  scoringBridge: "data/internal/research/nfl/reports/scoring-bridge-v1.json",
  corpus2023: "data/internal/research/nfl/player-events-v1/2023.json",
  corpus2024: "data/internal/research/nfl/player-events-v1/2024.json",
  corpus2025: "data/internal/research/nfl/player-events-v1/2025.json",
  corpus2026: "data/internal/research/nfl/player-events-v1/2026.json",
  participation2026: "data/internal/research/nfl/nflverse/participation-2026.jsonl",
  season2026: "data/internal/research/nfl/replay/current-season.json",
};
const BOARD_DIR = "app/public/data/nfl/player-board";
/* Every input is read AT --rev, so a regeneration is a function of one commit. */
const atRev = (p) => git("show", `${REV}:${p}`);
const readJsonAtRev = (p) => JSON.parse(atRev(p));
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const inputs = {};
const load = (key) => { const text = atRev(SRC[key]); inputs[key] = { path: SRC[key], sha256: sha(text) }; return text; };
const BOARD_FILES_AT_REV = git("ls-tree", "--name-only", `${REV}:app/public/data/nfl/player-board`).split("\n").filter((f) => /^\d+\.json$/.test(f)).sort();
/* Partial clones (CI's blob:none): fetch every input blob at --rev in one round trip instead of one lazy fetch each. */
prefetchBlobs(ROOT, [...Object.values(SRC), ...BOARD_FILES_AT_REV.map((f) => `app/public/data/nfl/player-board/${f}`)].map((p) => `${REV}:${p}`));

// ── bars from their sources of truth ──────────────────────────────────────────────────────────────
const evaluation = JSON.parse(load("evaluation"));
const V1 = readPropsV1PromotionBars({ evaluatorSource: load("evaluator"), evaluationReceipt: evaluation });
const SL = readShareLevelForwardBars(JSON.parse(load("shareLevelPrereg")));
const shareLevelForward = JSON.parse(load("shareLevelForwardReceipt"));
const FIT = {
  passA0: evaluation.fit?.volume?.pass?.a0,
  catchRate: evaluation.fit?.league?.catchRate,
  ypr: evaluation.fit?.league?.ypr,
  boundaryDecay: evaluation.fit?.rates?.boundaryDecay,
};
if (Object.values(FIT).some((v) => !Number.isFinite(v))) refuse("props-v1 evaluation receipt lacks fit.volume.pass.a0 / fit.league / fit.rates.boundaryDecay");
if (FIT.boundaryDecay !== V1.shareParams.boundaryDecay) refuse("evaluator BOUNDARY disagrees with the receipt's fit.rates.boundaryDecay");

// ── corpus (2023–25 hash-pinned by the scoring bridge, as the evaluator requires) ──────────────────
const pinned = new Map((JSON.parse(load("scoringBridge")).corpusAccounting ?? []).map((a) => [a.season, a.contentHash]));
const corpus = [2023, 2024, 2025, 2026].map((s) => {
  const doc = JSON.parse(load(`corpus${s}`));
  if (s < 2026 && doc.contentHash !== pinned.get(s)) refuse(`${s} corpus hash does not match the scoring bridge`);
  return doc;
});
const games = corpus.flatMap((d) => d.games).filter((g) => (g.seasonType ?? 0) !== 1)
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));
const espnGame = new Map(corpus[3].games.map((g) => [String(g.providerEventId), g]));

// ── participation (snap sheets) and ESPN→nflverse game ids ─────────────────────────────────────────
const seasonDoc = JSON.parse(load("season2026"));
const SC = Object.fromEntries(seasonDoc.columns.map((c, i) => [c, i]));
const nflverseGameOf = new Map(seasonDoc.games.map((g) => [String(g[SC.espnId]), g[SC.gameId]]));
const sheetTeams = new Set();
const offenseSnaps = new Set();
for (const line of load("participation2026").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  sheetTeams.add(`${r.gameId}|${r.team}`);
  if (r.espnId && (r.offenseSnaps ?? 0) > 0) offenseSnaps.add(`${r.gameId}|${r.espnId}`);
}
const ESPN_TO_NFLVERSE = { WSH: "WAS", LAR: "LA" };

// ── the served boards: last revision committed (and generated) before kickoff ─────────────────────
const boardFiles = BOARD_FILES_AT_REV;
const events = [];
const exclusions = { noPreKickoffRevision: [], notRegularSeason2026: [], notFinal: [], noSnapSheet: [], shareLevelServed: [], familyAbsent: [] };
/* Pass 1 (history only, no blobs): each board's revision list; prefetch the newest pre-kickoff revision of each in
   one batch — it is the chosen one unless its own generatedAt is late, and git lazy-fetches anything older. */
const history = new Map();
for (const f of boardFiles) {
  const p = `${BOARD_DIR}/${f}`;
  history.set(f, git("log", "--format=%H %cI", REV, "--", p).split("\n").filter(Boolean));
}
prefetchBlobs(ROOT, boardFiles.flatMap((f) => {
  const current = readJsonAtRev(`${BOARD_DIR}/${f}`);
  const kickoff = Date.parse(current.kickoffUtc);
  const first = history.get(f).find((line) => Date.parse(line.split(" ")[1]) < kickoff);
  return first ? [`${first.split(" ")[0]}:${BOARD_DIR}/${f}`] : [];
}));
for (const f of boardFiles) {
  const p = `${BOARD_DIR}/${f}`;
  const current = readJsonAtRev(p);
  if (current.seasonType !== 2 || !String(current.kickoffUtc ?? "").startsWith(String(SEASON))) { exclusions.notRegularSeason2026.push(current.providerEventId ?? f); continue; }
  const kickoff = Date.parse(current.kickoffUtc);
  let chosen = null;
  for (const line of history.get(f)) {
    const [commit, committedAt] = line.split(" ");
    if (Date.parse(committedAt) >= kickoff) continue;
    const doc = JSON.parse(git("show", `${commit}:${p}`));
    if (!(Date.parse(doc.generatedAt) < kickoff)) continue;
    chosen = { commit, committedAt, doc };
    break; // git log is newest first: the first qualifying revision is the last one before kickoff
  }
  if (!chosen) { exclusions.noPreKickoffRevision.push(current.providerEventId); continue; }
  events.push({ eventId: String(current.providerEventId), ...chosen });
}

// ── walk-forward baselines (props-v1 evaluator rule) at each served event ─────────────────────────
const servedEvents = new Map(events.map((e) => [e.eventId, e]));
const state = new Map();
const baselineAt = new Map(); // eventId|playerId → {rolling4, line, shareVol, stateAtTeam}
for (const g of games) {
  const served = servedEvents.get(String(g.providerEventId));
  if (served) {
    for (const pl of served.doc.players ?? []) {
      if (!pl.markets?.[MARKET]) continue;
      const st = state.get(pl.playerId);
      const atTeam = Boolean(st && st.team === pl.team);
      const recent = atTeam ? st.recent : [];
      const r4 = recent.slice(-4);
      const rolling4 = r4.length ? r4.reduce((a, b) => a + b, 0) / r4.length : 0;
      const proxy = r4.length === V1.lineProxyGames ? r4.reduce((a, b) => a + b, 0) / V1.lineProxyGames : null;
      const obs = atTeam ? st.targets : [];
      const share = obs.length ? decayedShare({ observations: obs, predictSeason: SEASON, ...V1.shareParams }).share : 0;
      baselineAt.set(`${served.eventId}|${pl.playerId}`, { rolling4, line: proxy != null && proxy > 0 ? proxy : null, shareVol: share * FIT.passA0 * FIT.catchRate * FIT.ypr, stateAtTeam: atTeam });
    }
  }
  for (const abbr of new Set((g.players ?? []).map((p) => p.teamAbbr))) {
    const { totals, rows } = teamGameTotals(g, abbr);
    for (const r of rows) {
      let st = state.get(r.playerId);
      if (!st || st.team !== r.teamAbbr) { st = { team: r.teamAbbr, targets: [], recent: [] }; state.set(r.playerId, st); }
      if (totals.targets > 0) st.targets.push({ share: familyNumerator(r, "targets") / totals.targets, season: g.season });
      if (r.recYds != null) st.recent.push(r.recYds);
    }
  }
}

// ── settle every served row ───────────────────────────────────────────────────────────────────────
const COLUMNS = ["week", "eventId", "gameId", "kickoffUtc", "playerId", "name", "team", "participation", "mean", "p10", "p25", "median", "p75", "p90", "state", "actual", "rolling4", "line", "shareVol", "pOver", "pOverLo", "pOverHi", "baselineStateAtTeam"];
const rows = [];
const points = [];
const tally = { SCORED: 0, VOID_ZERO_OPPORTUNITY: 0, VOID_NO_OFFENSE_SNAPS: 0, EXCLUDED_NO_SHEET: 0 };
const eventLedger = [];
for (const e of [...events].sort((a, b) => (a.doc.kickoffUtc < b.doc.kickoffUtc ? -1 : a.doc.kickoffUtc > b.doc.kickoffUtc ? 1 : a.eventId < b.eventId ? -1 : 1))) {
  const fam = e.doc.families?.[MARKET] ?? null;
  const ledger = { eventId: e.eventId, week: e.doc.week, matchup: e.doc.matchup, kickoffUtc: e.doc.kickoffUtc, revision: e.commit, committedAt: e.committedAt, boardGeneratedAt: e.doc.generatedAt, familyState: fam?.state ?? null, familyBasis: fam?.basis ?? fam?.reason ?? null, graded: false };
  eventLedger.push(ledger);
  if (!fam) { exclusions.familyAbsent.push(e.eventId); continue; }
  if (fam.model === SHARE_LEVEL_MODEL_ID) { exclusions.shareLevelServed.push(e.eventId); ledger.excluded = "share-level model served"; continue; }
  const g = espnGame.get(e.eventId);
  const gameId = nflverseGameOf.get(e.eventId) ?? null;
  if (!g || !gameId) { exclusions.notFinal.push(e.eventId); ledger.excluded = "not final in the committed corpus"; continue; }
  /* A whole game waits for both snap sheets (the share-level grader's rule): grading only the stat-sheet players
     would drop every dressed-no-catch zero and bias the sample. */
  const [awayAbbr, homeAbbr] = [g.away, g.home].map((t) => (t && t.length <= 3 ? t : null));
  const teamsServed = [...new Set((e.doc.players ?? []).map((pl) => pl.team))];
  const sheetMissing = [...new Set([...teamsServed, awayAbbr, homeAbbr].filter(Boolean))].filter((t) => !sheetTeams.has(`${gameId}|${ESPN_TO_NFLVERSE[t] ?? t}`));
  if (sheetMissing.length) { exclusions.noSnapSheet.push(e.eventId); ledger.excluded = `no snap sheet yet (${sheetMissing.join(", ")})`; continue; }
  ledger.graded = true;
  ledger.gameId = gameId;
  const statRow = new Map((g.players ?? []).map((p) => [`${p.playerId}|${p.teamAbbr}`, p]));
  for (const pl of [...(e.doc.players ?? [])].sort((a, b) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))) {
    const d = pl.markets?.[MARKET];
    if (!d) continue;
    const espn = String(pl.playerId).replace(/^nfl-athlete-/, "");
    const r = statRow.get(`${pl.playerId}|${pl.team}`);
    let st;
    let actual = null;
    if (r) {
      if ((r.targets ?? 0) > 0 || (r.rushAtt ?? 0) > 0) { st = "SCORED"; actual = r.recYds ?? 0; } else st = "VOID_ZERO_OPPORTUNITY";
    } else if (!sheetTeams.has(`${gameId}|${ESPN_TO_NFLVERSE[pl.team] ?? pl.team}`)) st = "EXCLUDED_NO_SHEET";
    else if (offenseSnaps.has(`${gameId}|${espn}`)) { st = "SCORED"; actual = 0; } else st = "VOID_NO_OFFENSE_SNAPS";
    tally[st] += 1;
    const b = baselineAt.get(`${e.eventId}|${pl.playerId}`) ?? { rolling4: 0, line: null, shareVol: 0, stateAtTeam: false };
    const po = b.line != null ? pOverFromQuantiles(d, b.line) : null;
    rows.push([e.doc.week, e.eventId, gameId, e.doc.kickoffUtc, pl.playerId, pl.name, pl.team, pl.participation ?? null, d.mean, d.p10, d.p25, d.median, d.p75, d.p90, st, actual, b.rolling4, b.line, b.shareVol, po?.p ?? null, po?.lo ?? null, po?.hi ?? null, b.stateAtTeam]);
    if (st === "SCORED") points.push({ gameId, week: e.doc.week, familyState: fam.state, actual, mean: d.mean, p10: d.p10, p25: d.p25, median: d.median, p75: d.p75, p90: d.p90, rolling4: b.rolling4, line: b.line, shareVol: b.shareVol, pOver: po, stateAtTeam: b.stateAtTeam });
  }
}

// ── metrics, verdicts, intervals ──────────────────────────────────────────────────────────────────
const v1 = judgePropsV1(pointMetrics(points, V1), V1);
const sl = judgeShareLevel(pointMetrics(points, SL), SL);
const sensitivity = {
  note: "ECE recomputed with P(over) at each end of its step bound — not intervals, just how far the interpolation choice can move the calibration number",
  propsV1EceAtLowerStep: pointMetrics(points, V1, "lo")?.ece ?? null,
  propsV1EceAtUpperStep: pointMetrics(points, V1, "hi")?.ece ?? null,
  shareLevelEceAtLowerStep: pointMetrics(points, SL, "lo")?.ece ?? null,
  shareLevelEceAtUpperStep: pointMetrics(points, SL, "hi")?.ece ?? null,
};
const weeks = [...new Set(points.map((p) => p.week))].sort((a, b) => a - b);
const perWeek = weeks.map((w) => {
  const ps = points.filter((p) => p.week === w);
  const m = pointMetrics(ps, V1);
  return { week: w, n: ps.length, games: new Set(ps.map((p) => p.gameId)).size, mae: m.mae, medianMae: pointMetrics(ps, SL).mae, rolling4Mae: m.rolling4Mae, shareVolMae: m.shareVolMae, coverage80: m.coverage80, level: m.level, servedStates: [...new Set(ps.map((p) => p.familyState))].sort() };
});
const servedStateCounts = {};
for (const p of points) servedStateCounts[p.familyState] = (servedStateCounts[p.familyState] ?? 0) + 1;
const publishedOnly = points.filter((p) => p.familyState === "PUBLISHED");
const publishedV1 = judgePropsV1(pointMetrics(publishedOnly, V1), V1);
const FIRST_WEEK = JSON.parse(load("shareLevelProtocol")).frozen?.firstWeek;
if (!Number.isInteger(FIRST_WEEK)) refuse("share-level forward protocol lacks frozen.firstWeek");
const fromFirstWeek = points.filter((p) => p.week >= FIRST_WEEK);
const fromFirstWeekV1 = judgePropsV1(pointMetrics(fromFirstWeek, V1), V1);
const fromFirstWeekSl = judgeShareLevel(pointMetrics(fromFirstWeek, SL), SL);

const receipt = {
  schemaVersion: PROPS_V1_FORWARD_RECEIPT_VERSION,
  artifact: "props-v1-reception-yds-forward-receipt",
  dataClass: "PRIVATE_RESEARCH",
  ledgerRow: "N8",
  market: MARKET,
  engine: "nfl-player-props-v1-opportunity-efficiency",
  season: SEASON,
  builtFromCommit: REV,
  evidenceTier: "AS_SERVED_COMMITTED_PRE_KICKOFF — forecast numbers are the last board revision committed (git committer time) and generated before each kickoff; a git commit is not Vercel served-revision evidence (forecast-of-record Option B)",
  provenance: {
    asServed: ["mean", "p10", "p25", "median", "p75", "p90", "board family state and basis per event"],
    reconstructed: [
      "rolling-4 baseline, rolling-4 line proxy and share×volume baseline: props-v1 evaluator walk-forward rule over the committed ESPN corpus 2023–2026, the evaluator's committed fit (volume.pass.a0, league.catchRate, league.ypr)",
      "P(over line) for the calibration bar: interpolated from the five served quantiles (the board never carried one for this family) — see sensitivity",
    ],
    settlement: "props-v1 participation-true contract on the committed ESPN stat sheets + nflverse offensive snap sheets; special-teams-only appearances void (offense-only snap file, declared difference)",
  },
  inputs,
  bars: {
    propsV1Promotion: { source: `${SRC.evaluator} (PROMOTION POLICY) cross-checked against ${SRC.evaluation} promotionPolicy[0]`, ...V1 },
    shareLevelForward: { source: `${SRC.shareLevelPrereg} frozen.bars (forward2026: no era clauses, no bootstrap)`, ...SL },
    differ: "props-v1 scores MAE on the distribution MEAN and ECE over bins holding ≥ eceMinBinN pairs; the share-level forward bars score MAE on the MEDIAN, ECE over every bin, and add a level band. Both are reported; neither is relaxed.",
  },
  verdictRule: "n below minimumN → ACCUMULATING (no verdict); every bar passes → FORWARD_HOLDING; otherwise FORWARD_BREACHED (forward-player-props-share-level.mjs rule)",
  verdict: v1.state,
  verdictBasis: "props-v1 promotion bars — the bars the board's PUBLISHED basis cites",
  barProvenance: {
    coverOk: "AS_SERVED — served p10/p90 against settled actuals",
    level: "AS_SERVED — served means against settled actuals (share-level bar set only)",
    beatsRolling: "served forecast vs RECONSTRUCTED rolling-4 baseline",
    beatsShareVol: "served forecast vs RECONSTRUCTED share×volume baseline",
    calOk: "RECONSTRUCTED — rolling-4 line proxy and quantile-interpolated P(over); see calibrationSensitivity",
  },
  failingBars: { propsV1: Object.entries(v1.bars ?? {}).filter(([, ok]) => !ok).map(([k]) => k), shareLevelForward: Object.entries(sl.bars ?? {}).filter(([, ok]) => !ok).map(([k]) => k) },
  propsV1Bars: v1,
  shareLevelForwardBars: sl,
  publishedRowsOnlyPropsV1Bars: publishedV1,
  fromShareLevelFirstWeek: { firstWeek: FIRST_WEEK, source: `${SRC.shareLevelProtocol} frozen.firstWeek`, propsV1Bars: fromFirstWeekV1, shareLevelForwardBars: fromFirstWeekSl },
  intervals: clusteredIntervals(points, V1),
  calibrationSensitivity: sensitivity,
  n: points.length,
  servedStateCounts,
  baselineCoverage: { pointsWithoutStateAtTeam: points.filter((p) => !p.stateAtTeam).length, note: "a served player with no prior game at his current team in the ESPN corpus gets rolling-4 0 and share 0, as in the evaluator" },
  perWeek,
  tally,
  events: { graded: eventLedger.filter((e) => e.graded).length, ledger: eventLedger },
  exclusions,
  comparison: { shareLevelForwardReceipt: SRC.shareLevelForwardReceipt, shareLevelState: shareLevelForward?.families?.[MARKET]?.state ?? null, shareLevelMetrics: shareLevelForward?.families?.[MARKET]?.metrics ?? null },
  consequence: "Research evidence only. The board label, family eligibility and every public output are unchanged — a label change is a founder decision.",
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "graded.json"), `${JSON.stringify({ schemaVersion: 1, artifact: "props-v1-reception-yds-forward-graded", dataClass: "PRIVATE_RESEARCH", builtFromCommit: REV, columns: COLUMNS, rows }, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(4)) : v))}\n`);
fs.writeFileSync(path.join(OUT_DIR, "receipt.json"), stableJson(receipt));
console.log(`props-v1 ${MARKET} forward: n ${points.length} over ${receipt.events.graded} graded events, weeks ${weeks.join(",")} · props-v1 bars ${v1.state} · share-level bars ${sl.state}`);
