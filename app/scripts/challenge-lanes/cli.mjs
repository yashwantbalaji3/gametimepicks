/**
 * Shared CLI for the challenge lanes (src/lib/challenge-lanes/). NETWORK-FREE: no provider, no odds, no fetch.
 *
 *   node scripts/challenge-lanes/lanes-prepare.mjs   --root DIR --date D [--cards FILE] [--now ISO] [--approved-by REF] [--restart LANE] [--public-out DIR]
 *   node scripts/challenge-lanes/lanes-price.mjs     --root DIR --date D [--now ISO] [--public-out DIR]
 *   node scripts/challenge-lanes/lanes-reconcile.mjs --root DIR --date D [--finals FILE] [--public-out DIR]
 *
 * --root is required (production: ~/gtp-private/challenge-lanes). --public-out writes <laneId>.json projections
 * (production: app/public/data/challenge-lanes). Prints one JSON report; exit 1 when any lane was refused.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANE_IDS, LANES, laneState, selectLaneCards, runStarted, STATUS } from "../../src/lib/challenge-lanes/lanes.mjs";
import { prepareLane, unpricedLane, reconcileLane, ingestReceipts, FINALS_RECORD } from "../../src/lib/challenge-lanes/ops.mjs";
import { laneProjection, serializeProjection } from "../../src/lib/challenge-lanes/projection.mjs";
import { currentRun, appendEvents, readRuns, readInboxes, runFiles } from "../../src/lib/challenge-lanes/store.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");

export function main(command, argv = process.argv) {
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i > 0 && argv[i + 1] ? argv[i + 1] : d; };
  const fail = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };
  const ROOT = arg("--root"); const DATE = arg("--date");
  if (!ROOT) fail("--root DIR required (production: ~/gtp-private/challenge-lanes)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) fail("--date YYYY-MM-DD required");
  const root = path.resolve(ROOT);
  const report = { command, date: DATE, lanes: {} };
  const refusedAny = [];

  /* Receipts first, so a POSTED written since the last run is on the chain before anything else is appended. */
  const ingest = (laneId) => {
    const run = currentRun(root, laneId);
    if (!run) return;
    for (const { writer, receipts } of readInboxes(root, laneId)) {
      const r = ingestReceipts(run.events, receipts);
      appendEvents(root, laneId, run.file, run.events.length, r.events);
      run.events.push(...r.events);
      if (r.events.length || r.refused.length) (report.receipts ??= []).push({ laneId, writer, ingested: r.events.length, refused: r.refused });
    }
  };

  if (command === "prepare") {
    const cardsFile = arg("--cards", path.join(APP, "public", "data", "suggested-cards", `${DATE}.json`));
    const doc = fs.existsSync(cardsFile) ? JSON.parse(fs.readFileSync(cardsFile, "utf8")) : null;
    const at = doc?.evaluatedAt ?? arg("--now") ?? `${DATE}T11:00:00Z`;
    if (!Number.isFinite(Date.parse(at))) fail(`bad instant ${at}`);
    const rel = path.relative(REPO, path.resolve(cardsFile));
    const selections = doc ? { "bank-builder": selectLaneCards(doc, "bank-builder"), moonshot: selectLaneCards(doc, "moonshot") } : null;
    const approvedBy = arg("--approved-by"); const restart = arg("--restart");
    for (const laneId of LANE_IDS) {
      let run = currentRun(root, laneId);
      if (!run || restart === laneId) {
        if (run && laneState(run.events).status !== STATUS.AWAITING_RESTART_APPROVAL) { report.lanes[laneId] = { action: "REFUSED", reason: "RESTART_NOT_AWAITED" }; refusedAny.push(laneId); continue; }
        if (!approvedBy) { report.lanes[laneId] = { action: "REFUSED", reason: run ? "RESTART_NEEDS_APPROVAL: pass --approved-by <founder approval ref>" : "NO_RUN: pass --approved-by <founder approval ref> to start run-1" }; refusedAny.push(laneId); continue; }
        const runId = `run-${runFiles(root, laneId).length + 1}`;
        const head = runStarted({ laneId, runId, startedAt: at, approvedBy });
        appendEvents(root, laneId, `${runId}.jsonl`, 0, [head]);
        run = { file: `${runId}.jsonl`, events: [head] };
      }
      ingest(laneId);
      run = currentRun(root, laneId);
      const r = prepareLane(run.events, { date: DATE, at, selection: selections?.[LANES[laneId].product] ?? null, file: doc ? rel : null, docSha256: doc?.contentSha256 ?? null });
      appendEvents(root, laneId, run.file, run.events.length, r.events);
      report.lanes[laneId] = { runId: run.file.replace(".jsonl", ""), action: r.action, reason: r.reason, card: r.events.find((e) => e.type === "CARD_FROZEN")?.card ? summary(r.events.find((e) => e.type === "CARD_FROZEN").card) : null };
      if (r.action === "REFUSED") refusedAny.push(laneId);
    }
  } else if (command === "price") {
    const at = arg("--now") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    for (const laneId of LANE_IDS) {
      const run = currentRun(root, laneId);
      if (!run) { report.lanes[laneId] = { action: "SKIP", reason: "NO_RUN" }; continue; }
      const r = unpricedLane(run.events, { date: DATE, at });
      appendEvents(root, laneId, run.file, run.events.length, r.events);
      report.lanes[laneId] = { runId: run.file.replace(".jsonl", ""), action: r.action, reason: r.events[0]?.reason ?? null };
    }
  } else if (command === "reconcile") {
    const finalsFile = arg("--finals", path.join(REPO, FINALS_RECORD));
    const finalsRecord = JSON.parse(fs.readFileSync(finalsFile, "utf8"));
    for (const laneId of LANE_IDS) {
      if (!currentRun(root, laneId)) { report.lanes[laneId] = { action: "SKIP", reason: "NO_RUN" }; continue; }
      ingest(laneId);
      const run = currentRun(root, laneId);
      const r = reconcileLane(run.events, { finalsRecord, recordFile: path.relative(REPO, path.resolve(finalsFile)) });
      appendEvents(root, laneId, run.file, run.events.length, r.events);
      report.lanes[laneId] = { runId: run.file.replace(".jsonl", ""), settled: r.events.filter((e) => e.type === "LEG_SETTLED").map((e) => `${e.legId} ${e.outcome}`), steps: r.events.filter((e) => e.type === "STEP_SETTLED").map((e) => e.outcome), statuses: r.events.filter((e) => e.type === "STATUS").map((e) => e.status), held: r.held };
    }
  } else fail(`unknown command ${command}`);

  for (const laneId of LANE_IDS) {
    const runs = readRuns(root, laneId);
    if (!runs.length) continue;
    const s = laneState(runs.at(-1));
    Object.assign(report.lanes[laneId] ?? (report.lanes[laneId] = {}), { status: s.status, step: `${Math.min(s.step, s.steps)}/${s.steps}` });
    const out = arg("--public-out");
    if (out) {
      const doc = laneProjection(laneId, runs);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, `${laneId}.json`), serializeProjection(doc));
      report.lanes[laneId].projectionSha256 = doc.contentSha256;
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (refusedAny.length) process.exit(1);
}

const summary = (c) => ({ cardId: c.cardId, tier: c.tier, jointShown: c.jointShown, legs: c.legs.map((l) => `${l.selection.teamAbbr} ${l.probabilityShown}${l.guard.flags.length ? ` [${l.guard.flags.join(",")}]` : ""}`) });
