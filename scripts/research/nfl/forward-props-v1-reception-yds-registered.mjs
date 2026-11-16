#!/usr/bin/env node
/**
 * NFL props-v1 RECEIVING YARDS — REGISTERED FORWARD TEST, weekly enrollment (ledger N8). PRIVATE_RESEARCH.
 * Research only: writes nothing public, changes no board label, no eligibility state, no model, no frozen file.
 *
 * Protocol: data/internal/research/nfl/reports/player-props-v1-reception-yds-forward-protocol.json. Counting rules live
 * in app/src/lib/sports/nfl/props-v1-forward-registration.mjs; grading mechanics are the as-served retrospective's
 * (props-v1-forward-receipt.mjs, PR 1363) — one copy.
 *
 *   node scripts/research/nfl/forward-props-v1-reception-yds-registered.mjs [--rev <commit>] [--out-dir <dir>]
 *
 * Every input is read AT --rev (default HEAD). The "clock" is --rev's committer time, so the same --rev gives the
 * same bytes. Writes <out-dir>/<season>-wk<NN>.json once per completed counted week (append-only: an existing week
 * file is never rewritten) and rewrites <out-dir>/summary.json, which is derived from the week files alone.
 * Run by .github/workflows/nfl-props-forward-shadow.yml after the P300 share-level steps.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { familyNumerator, teamGameTotals, decayedShare } from "../../../app/src/lib/sports/nfl/role-shares.mjs";
import { SHARE_LEVEL_MODEL_ID } from "../../../app/src/lib/sports/nfl/share-level-board.mjs";
import {
  MARKET, readPropsV1PromotionBars, readShareLevelForwardBars, pOverFromQuantiles, stableJson,
  lastPreKickoffRevision, walkForwardBaselines, snapSheetsMissing, settleServedPlayer, servedModelOf,
} from "../../../app/src/lib/sports/nfl/props-v1-forward-receipt.mjs";
import {
  scheduleFromCaptures, regularSeasonWeeks, firstWeekAfter, classifyEvent, isPending, EVENT_CODE,
  buildWeekReceipt, appendWeekReceipt, summarize, weekFileName, pipelineVersionOf, registeredPipelineVersion,
} from "../../../app/src/lib/sports/nfl/props-v1-forward-registration.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const refuse = (why) => { console.error(`REFUSED: ${why}`); process.exit(1); };
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const REV = git("rev-parse", "--verify", `${argOf("--rev", "HEAD")}^{commit}`).trim();
const AS_OF = git("show", "-s", "--format=%cI", REV).trim();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const show = (commit, p) => git("show", `${commit}:${p}`);
const PROTOCOL_PATH = "data/internal/research/nfl/reports/player-props-v1-reception-yds-forward-protocol.json";
const RETRO_PATH = "data/internal/research/nfl/replay/props-v1-reception-yds-forward/receipt.json";
const BOARD_DIR = "app/public/data/nfl/player-board";
const SCHEDULE_DIR = "app/public/data/nfl/schedule";
const SRC = {
  corpus2023: "data/internal/research/nfl/player-events-v1/2023.json",
  corpus2024: "data/internal/research/nfl/player-events-v1/2024.json",
  corpus2025: "data/internal/research/nfl/player-events-v1/2025.json",
  corpus2026: "data/internal/research/nfl/player-events-v1/2026.json",
  participation2026: "data/internal/research/nfl/nflverse/participation-2026.jsonl",
  season2026: "data/internal/research/nfl/replay/current-season.json",
  scoringBridge: "data/internal/research/nfl/reports/scoring-bridge-v1.json",
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── registration: the commit that added the protocol, and the protocol unchanged since ───────────────────────
const added = git("log", "--diff-filter=A", "--format=%H %cI", REV, "--", PROTOCOL_PATH).split("\n").filter(Boolean);
if (!added.length) refuse(`${PROTOCOL_PATH} is not committed in ${REV}'s history — nothing is registered`);
const [regCommit, regAt] = added.at(-1).split(" ");
const protocolText = show(REV, PROTOCOL_PATH);
if (show(regCommit, PROTOCOL_PATH) !== protocolText) refuse(`${PROTOCOL_PATH} changed after its registration commit ${regCommit} — amendments need a new protocol`);
const protocol = JSON.parse(protocolText);
const protocolRef = { path: PROTOCOL_PATH, sha256: sha(protocolText) };
const registration = { commit: regCommit, committedAt: regAt };
const model = protocol.model;
if (model.shareLevelModelId !== SHARE_LEVEL_MODEL_ID) refuse(`protocol shareLevelModelId ${model.shareLevelModelId} ≠ ${SHARE_LEVEL_MODEL_ID}`);
const series = protocol.series;
if (registeredPipelineVersion(protocol) !== series?.pipelineVersion) refuse(`series.pipelineVersion ${series?.pipelineVersion} ≠ the version its frozen files define (${registeredPipelineVersion(protocol)})`);
/* One directory per series: a later pipeline version is a new protocol with its own directory, never pooled here. */
const OUT_DIR = path.resolve(argOf("--out-dir", path.join(ROOT, series.outputDir)));

// ── bars: re-read from their cited sources at the registration commit; every value must match verbatim ──────
const B = protocol.bars;
for (const s of [...B.propsV1Promotion.source, B.shareLevelLevel.source]) {
  if (sha(show(regCommit, s.path)) !== s.sha256) refuse(`bar source ${s.path} at registration ${regCommit} does not hash to the cited ${s.sha256}`);
}
const evaluationAtReg = JSON.parse(show(regCommit, "data/internal/research/nfl/reports/player-props-v1-evaluation.json"));
const parsedV1 = readPropsV1PromotionBars({ evaluatorSource: show(regCommit, "app/scripts/nfl/evaluate-nfl-player-props.mjs"), evaluationReceipt: evaluationAtReg });
for (const k of Object.keys(parsedV1)) if (!sameJson(parsedV1[k], B.propsV1Promotion[k])) refuse(`protocol bar propsV1Promotion.${k} ${JSON.stringify(B.propsV1Promotion[k])} ≠ source ${JSON.stringify(parsedV1[k])}`);
const parsedSl = readShareLevelForwardBars(JSON.parse(show(regCommit, B.shareLevelLevel.source.path)));
if (!sameJson(parsedSl.levelBand, B.shareLevelLevel.levelBand)) refuse("protocol shareLevelLevel.levelBand ≠ preregistration frozen.bars.levelBand");
for (const f of model.frozenFiles) if (sha(show(regCommit, f.path)) !== f.sha256) refuse(`frozen file ${f.path} at registration does not hash to ${f.sha256}`);
const V1 = { ...B.propsV1Promotion };
const FIT = {
  passA0: evaluationAtReg.fit?.volume?.pass?.a0, catchRate: evaluationAtReg.fit?.league?.catchRate, ypr: evaluationAtReg.fit?.league?.ypr,
};
if (Object.values(FIT).some((v) => !Number.isFinite(v))) refuse("frozen fit lacks fit.volume.pass.a0 / fit.league");
const summaryProtocol = { ...protocol, bars: { propsV1Promotion: V1, shareLevelLevel: { levelBand: B.shareLevelLevel.levelBand, source: B.shareLevelLevel.source } } };

// ── schedule, first week ──────────────────────────────────────────────────────────────────────────────────
const captureFiles = git("ls-tree", "--name-only", `${REV}:${SCHEDULE_DIR}`).split("\n").filter((f) => /^(capture-.*|latest)\.json$/.test(f)).sort();
const captures = captureFiles.map((f) => { const d = JSON.parse(show(REV, `${SCHEDULE_DIR}/${f}`)); return { name: f, generatedAt: d.generatedAt, rows: d.rows }; });
const schedule = scheduleFromCaptures(captures);
const weeks = regularSeasonWeeks(schedule, regAt);
const firstWeek = firstWeekAfter(weeks, regAt);
const firstWeekFirstKickoffUtc = firstWeek != null ? weeks.get(firstWeek).firstKickoffUtc : null;

// ── settlement inputs at REV ──────────────────────────────────────────────────────────────────────────────
const inputs = {};
const load = (key) => { const text = show(REV, SRC[key]); inputs[key] = { path: SRC[key], sha256: sha(text) }; return text; };
const pinned = new Map((JSON.parse(load("scoringBridge")).corpusAccounting ?? []).map((a) => [a.season, a.contentHash]));
const corpus = [2023, 2024, 2025, 2026].map((s) => {
  const doc = JSON.parse(load(`corpus${s}`));
  if (s < 2026 && doc.contentHash !== pinned.get(s)) refuse(`${s} corpus hash does not match the scoring bridge`);
  return doc;
});
const games = corpus.flatMap((d) => d.games).filter((g) => (g.seasonType ?? 0) !== 1)
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));
const espnGame = new Map(corpus[3].games.map((g) => [String(g.providerEventId), g]));
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

// ── boards at REV ─────────────────────────────────────────────────────────────────────────────────────────
const boardIds = new Set(git("ls-tree", "--name-only", `${REV}:${BOARD_DIR}`).split("\n").filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")));
const currentBoard = new Map();
const boardAt = (id) => { if (!currentBoard.has(id)) currentBoard.set(id, boardIds.has(id) ? JSON.parse(show(REV, `${BOARD_DIR}/${id}.json`)) : null); return currentBoard.get(id); };
const kms = (iso) => Date.parse(String(iso ?? "").replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"));
const blobSha = new Map();
/** sha256 of a file at a commit ("MISSING" when absent), cached by blob id. */
const shaAt = (commit, p) => {
  let blob;
  try { blob = execFileSync("git", ["rev-parse", "--verify", "--quiet", `${commit}:${p}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "MISSING"; }
  if (!blobSha.has(blob)) blobSha.set(blob, sha(git("cat-file", "blob", blob)));
  return blobSha.get(blob);
};
/** The served pipeline at a board revision commit: its version, the frozen files that differ, and attribution shas. */
const pipelineAt = (commit) => {
  const shas = Object.fromEntries(model.frozenFiles.map((f) => [f.path, shaAt(commit, f.path)]));
  return {
    pipelineVersion: pipelineVersionOf(shas),
    identityMismatches: model.frozenFiles.filter((f) => shas[f.path] !== f.sha256).map((f) => f.path),
    roleSharesSha256: shaAt(commit, "data/internal/research/nfl/role-shares-v1/current.json"),
    boardBuilderSha256: shaAt(commit, "app/scripts/nfl/build-nfl-player-board.mjs"),
  };
};

/** Everything classifyEvent needs for one event; rows are attached later for GRADED events. */
function eventFacts(sched, boardOnly) {
  const board = boardAt(sched.eventId);
  const kickoffUtc = [sched.kickoffUtc, board?.kickoffUtc].filter((k) => Number.isFinite(kms(k))).sort((a, b) => kms(a) - kms(b))[0];
  const ev = { eventId: sched.eventId, matchup: board?.matchup ?? sched.matchup, kickoffUtc, inSchedule: !boardOnly, hasBoard: Boolean(board), revision: null, final: false, sheetMissing: [], servedRows: 0 };
  if (!(kms(kickoffUtc) < Date.parse(AS_OF)) || !board) return ev;
  const p = `${BOARD_DIR}/${sched.eventId}.json`;
  const revisions = git("log", "--format=%H %cI", REV, "--", p).split("\n").filter(Boolean).map((l) => { const [commit, committedAt] = l.split(" "); return { commit, committedAt }; });
  const chosen = lastPreKickoffRevision(revisions, kickoffUtc, (commit) => JSON.parse(show(commit, p)));
  if (!chosen) return ev;
  const family = chosen.doc.families?.[MARKET] ?? null;
  const servedModel = servedModelOf(family);
  ev.revision = {
    commit: chosen.commit, committedAt: chosen.committedAt, generatedAt: chosen.doc.generatedAt, family, servedModel,
    ...(servedModel === model.servedModelId ? pipelineAt(chosen.commit) : { pipelineVersion: null, identityMismatches: [] }),
  };
  ev.doc = chosen.doc;
  const g = espnGame.get(sched.eventId);
  ev.gameId = nflverseGameOf.get(sched.eventId) ?? null;
  ev.final = Boolean(g && ev.gameId);
  ev.game = g ?? null;
  if (ev.final) ev.sheetMissing = snapSheetsMissing({ doc: chosen.doc, game: g, gameId: ev.gameId, sheetTeams });
  ev.servedRows = (chosen.doc.players ?? []).filter((pl) => pl.markets?.[MARKET]).length;
  return ev;
}

// ── grade every counted week that is not yet written ───────────────────────────────────────────────────────
const SEASON = protocol.season;
const written = new Set(fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : []);
const pendingWeeks = [];
const log = [];
for (const w of weeks.values()) {
  if (firstWeek == null || w.week < firstWeek) continue; // pre-registration weeks never count
  if (written.has(weekFileName(SEASON, w.week))) { log.push(`wk${w.week} already written`); continue; }
  if (!(kms(w.firstKickoffUtc) < Date.parse(AS_OF))) continue; // not started: neither pending nor graded
  const scheduled = new Set(w.events.map((e) => e.eventId));
  const boardOnly = [...boardIds].filter((id) => !scheduled.has(id)).map(boardAt)
    .filter((b) => b?.seasonType === 2 && b.week === w.week && String(b.kickoffUtc ?? "").startsWith(String(SEASON)) && !schedule.has(String(b.providerEventId)))
    .map((b) => ({ eventId: String(b.providerEventId), kickoffUtc: b.kickoffUtc, matchup: b.matchup }));
  const events = [...w.events.map((e) => eventFacts(e, false)), ...boardOnly.map((e) => eventFacts(e, true))];
  const graded = events.filter((ev) => classifyEvent(ev, { asOf: AS_OF, model, series }) === EVENT_CODE.GRADED);
  const baselines = walkForwardBaselines({ games, served: new Map(graded.map((ev) => [ev.eventId, ev.doc])), bars: V1, fit: FIT, season: SEASON, shares: { familyNumerator, teamGameTotals, decayedShare } });
  for (const ev of graded) {
    const statRow = new Map((ev.game.players ?? []).map((p) => [`${p.playerId}|${p.teamAbbr}`, p]));
    ev.rows = (ev.doc.players ?? []).filter((pl) => pl.markets?.[MARKET]).map((pl) => {
      const d = pl.markets[MARKET];
      const { state, actual } = settleServedPlayer({ pl, gameId: ev.gameId, statRow, sheetTeams, offenseSnaps });
      const b = baselines.get(`${ev.eventId}|${pl.playerId}`) ?? { rolling4: 0, line: null, shareVol: 0, stateAtTeam: false };
      const po = b.line != null ? pOverFromQuantiles(d, b.line) : null;
      return [ev.eventId, ev.gameId, pl.playerId, pl.name, pl.team, pl.participation ?? null, d.mean, d.p10, d.p25, d.median, d.p75, d.p90, state, actual, b.rolling4, b.line, b.shareVol, po?.p ?? null, po?.lo ?? null, po?.hi ?? null, b.stateAtTeam, ev.revision.pipelineVersion];
    });
  }
  const out = buildWeekReceipt({ week: w.week, firstWeek, firstKickoffUtc: w.firstKickoffUtc, events, asOf: AS_OF, protocol: summaryProtocol, protocolRef, registration, builtFromCommit: REV, inputs: { ...inputs } });
  if (out.pending) { pendingWeeks.push({ week: w.week, pending: out.pending }); log.push(`wk${w.week} pending ${JSON.stringify(out.pending)}`); continue; }
  const result = appendWeekReceipt({ fs, path, dir: OUT_DIR, week: w.week, season: SEASON, receipt: out.receipt });
  log.push(`wk${w.week} ${result} (n ${out.receipt.rows.filter((r) => r[12] === "SCORED").length}, ${out.receipt.denominator.graded}/${out.receipt.denominator.events} events graded)`);
}

// ── summary, from the week files alone ─────────────────────────────────────────────────────────────────────
const weekReceipts = (fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : []).filter((f) => /^\d{4}-wk\d\d\.json$/.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")));
const retroText = (() => { try { return show(REV, RETRO_PATH); } catch { return null; } })();
const retro = retroText ? JSON.parse(retroText) : null;
const summary = summarize({
  protocol: summaryProtocol, protocolRef, registration, firstWeek, firstWeekFirstKickoffUtc, weekReceipts, pendingWeeks,
  retrospective: retro ? {
    label: "AS_SERVED_RETROSPECTIVE — pregame-frozen boards graded after the fact (PR 1363); pre-registration weeks; NEVER counted toward the forward n",
    path: RETRO_PATH, sha256: sha(retroText), n: retro.n, verdict: retro.verdict, weeks: (retro.perWeek ?? []).map((w) => w.week),
  } : null,
});
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "summary.json"), stableJson(summary));
const fam = summary.families[MARKET];
console.log(`props-v1 ${MARKET} registered forward · series ${series.id} ${series.pipelineVersion} · registered ${regAt} (${regCommit.slice(0, 10)}) · first week ${firstWeek} (first kickoff ${firstWeekFirstKickoffUtc}) · ${fam.state} n ${fam.n}/${fam.needed}`);
for (const l of log) console.log(`  ${l}`);
