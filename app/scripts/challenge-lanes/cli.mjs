/**
 * Shared CLI for the challenge lanes (src/lib/challenge-lanes/). NETWORK-FREE: no provider, no odds, no fetch.
 *
 *   node scripts/challenge-lanes/lanes-prepare.mjs   --root DIR --date D [--cards FILE] [--now ISO] [--approved-by REF] [--restart LANE] [--public-out DIR]
 *   node scripts/challenge-lanes/lanes-price.mjs     --root DIR --date D --post-at ISO --receipt docs/receipts/<file>.md [--apply] [--now ISO] [--public-out DIR]
 *                                                    --root DIR --date D --post-at ISO --snapshot FILE   (price from a private snapshot, no call)
 *                                                    --root DIR --date D --close-unpriced REASON         (close the day's unpriced cards)
 *   node scripts/challenge-lanes/lanes-display.mjs   --root DIR                                          (encrypted site prices; GTP_ODDS_DISPLAY_KEY)
 *   node scripts/challenge-lanes/lanes-reconcile.mjs --root DIR --date D [--finals FILE] [--public-out DIR]
 *
 * --root is required (production: ~/gtp-private/challenge-lanes). --public-out writes <laneId>.json projections
 * (production: app/public/data/challenge-lanes). Prints one JSON report; exit 1 when any lane was refused.
 *
 * PRICES (lanes-price). Without --apply it plans: the candidate games, the worst-case credits, the ceilings; nothing is
 * spent and no lane is touched. With --apply under a committed BBM receipt it makes the one capture (odds.mjs), books
 * credits in the committed ledger (credits and status only), writes the PRIVATE snapshot under GTP_PRIVATE_DATA_DIR
 * (or --out-dir), then prices each open card from that snapshot. The API key is read from ODDS_API_KEY only with
 * --apply and is never printed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANE_IDS, LANES, laneState, selectLaneCards, runStarted, STATUS } from "../../src/lib/challenge-lanes/lanes.mjs";
import { prepareLane, unpricedLane, reconcileLane, ingestReceipts, restartRun, FINALS_RECORD } from "../../src/lib/challenge-lanes/ops.mjs";
import { laneProjection, serializeProjection } from "../../src/lib/challenge-lanes/projection.mjs";
import { currentRun, appendEvents, readRuns, readInboxes, runFiles } from "../../src/lib/challenge-lanes/store.mjs";
import { captureBbmPrices, priceForCard, BBM_LEDGER_RELPATH } from "../../src/lib/challenge-lanes/odds.mjs";
import { encryptLanePriceDisplay, PRICE_DISPLAY_REPO_DIR } from "../../src/lib/challenge-lanes/price-display.mjs";
import { priceLane } from "../../src/lib/challenge-lanes/ops.mjs";
import { resolvePrivateDataDir } from "../../src/lib/ops/private-data-dir.mjs";
import { readDisplayKey } from "../../src/lib/odds/display-crypto.mjs";
import { displayAuthorization } from "../../src/lib/odds/display-authorization.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");

export async function main(command, argv = process.argv) {
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i > 0 && argv[i + 1] ? argv[i + 1] : d; };
  const fail = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };
  const ROOT = arg("--root"); const DATE = arg("--date");
  if (!ROOT) fail("--root DIR required (production: ~/gtp-private/challenge-lanes)");
  if (command !== "display" && !/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "")) fail("--date YYYY-MM-DD required");
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
      /* A founder restart recorded by the console (RESTART_APPROVED, ingested above) opens the next run at base. */
      const next = restartRun(run.events);
      if (next && !runFiles(root, laneId).includes(`${next.runId}.jsonl`)) {
        appendEvents(root, laneId, `${next.runId}.jsonl`, 0, [next]);
        (report.restarts ??= []).push({ laneId, runId: next.runId, approvedBy: next.approvedBy });
        run = { file: `${next.runId}.jsonl`, events: [next] };
      }
      const r = prepareLane(run.events, { date: DATE, at, selection: selections?.[LANES[laneId].product] ?? null, file: doc ? rel : null, docSha256: doc?.contentSha256 ?? null });
      appendEvents(root, laneId, run.file, run.events.length, r.events);
      report.lanes[laneId] = { runId: run.file.replace(".jsonl", ""), action: r.action, reason: r.reason, card: r.events.find((e) => e.type === "CARD_FROZEN")?.card ? summary(r.events.find((e) => e.type === "CARD_FROZEN").card) : null };
      if (r.action === "REFUSED") refusedAny.push(laneId);
    }
  } else if (command === "price") {
    const at = arg("--now") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const open = Object.fromEntries(LANE_IDS.map((laneId) => { const run = currentRun(root, laneId); const s = run && laneState(run.events); return [laneId, s?.open?.date === DATE && !s.open.payoutEvent ? { run, card: s.open.cardEvent.card } : null]; }));
    const closeReason = arg("--close-unpriced");
    if (closeReason) {
      for (const laneId of LANE_IDS) {
        const run = currentRun(root, laneId);
        if (!run) { report.lanes[laneId] = { action: "SKIP", reason: "NO_RUN" }; continue; }
        const r = unpricedLane(run.events, { date: DATE, at, reason: `UNPRICED: ${closeReason}` });
        appendEvents(root, laneId, run.file, run.events.length, r.events);
        report.lanes[laneId] = { runId: run.file.replace(".jsonl", ""), action: r.action, reason: r.events[0]?.reason ?? null };
      }
    } else {
      const postAt = arg("--post-at");
      if (!Number.isFinite(Date.parse(postAt ?? ""))) fail("--post-at <ISO> required: a price is used only if captured at most 90 minutes before the post");
      const legs = [...new Map(Object.values(open).filter(Boolean).flatMap((o) => o.card.legs).map((l) => { const [away, home] = String(l.eventLabel).split(" @ "); return [l.gameId, { gameId: l.gameId, home, away, startUtc: l.startUtc, market: l.market }]; })).values()];
      let snapshot = null;
      const snapFile = arg("--snapshot");
      if (snapFile) snapshot = JSON.parse(fs.readFileSync(snapFile, "utf8"));
      else {
        const rel = arg("--receipt");
        if (!rel) fail("--receipt docs/receipts/<file>.md required (a committed BBM odds receipt); without it nothing may be spent");
        const abs = path.resolve(REPO, rel);
        if (!abs.startsWith(path.join(REPO, "docs", "receipts") + path.sep) || !fs.existsSync(abs)) fail(`receipt ${rel} is not a committed file under docs/receipts/`);
        const apply = argv.includes("--apply");
        const priv = resolvePrivateDataDir({ cliDir: arg("--out-dir"), repoRoot: REPO });
        if (apply && !priv.ok) fail(`${priv.reason} — no paid call made`);
        const ledgerPath = path.join(REPO, BBM_LEDGER_RELPATH);
        const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : null;
        const cap = await captureBbmPrices({ now: at, receiptText: fs.readFileSync(abs, "utf8"), receiptRel: rel, ledger, legs, apply, apiKey: apply ? (process.env.ODDS_API_KEY ?? "").trim() : "", fetchImpl: globalThis.fetch });
        if (cap.calls?.length) { fs.mkdirSync(path.dirname(ledgerPath), { recursive: true }); fs.writeFileSync(ledgerPath, `${JSON.stringify(cap.ledger, null, 1)}\n`); }
        report.capture = { state: cap.state, reasons: cap.reasons ?? null, stoppedBecause: cap.stoppedBecause ?? null, plan: cap.plan ?? null, ceilings: cap.ceilings ?? null, spentToday: cap.spentToday ?? null, calls: cap.calls, creditsCharged: (cap.ledger?.cumulativeCredits ?? 0) - (ledger?.cumulativeCredits ?? 0), unjoined: cap.unjoined ?? null };
        if (cap.snapshot && priv.ok) {
          const out = path.join(priv.dir, "odds", "nba", "bbm", DATE, `${cap.snapshot.fetchedAt.replace(/[:.]/g, "")}.json`);
          fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
          fs.writeFileSync(out, `${JSON.stringify(cap.snapshot)}\n`, { mode: 0o600 });
          report.capture.snapshotFile = out; report.capture.snapshotSha256 = cap.snapshot.snapshotSha256;
        }
        snapshot = cap.snapshot ?? null;
      }
      for (const laneId of LANE_IDS) {
        const o = open[laneId];
        if (!o) { report.lanes[laneId] = { action: "SKIP", reason: "NO_OPEN_CARD" }; continue; }
        if (!snapshot) { report.lanes[laneId] = { action: "NOT_PRICED", reason: "no snapshot this run; the card stays open" }; continue; }
        const p = priceForCard(o.card, snapshot);
        if (!p.ok) { report.lanes[laneId] = { action: "NOT_PRICED", reason: p.refusals.join("; ") }; continue; }
        const docFile = path.join(APP, "public", "data", "suggested-cards", `${DATE}.json`);
        const cardsFile = arg("--cards", docFile);
        const doc = fs.existsSync(cardsFile) ? JSON.parse(fs.readFileSync(cardsFile, "utf8")) : null;
        const r = priceLane(o.run.events, { date: DATE, at: snapshot.fetchedAt, price: p.price, suggestedCards: doc, postScheduledAt: postAt });
        appendEvents(root, laneId, o.run.file, o.run.events.length, r.events);
        report.lanes[laneId] = { runId: o.run.file.replace(".jsonl", ""), action: r.action, refusals: r.payout?.refusals?.map((x) => x.code) ?? null, book: r.payout?.inputs?.book ?? null, belowPace: r.payout?.inputs?.belowPace ?? null };
        if (r.payout?.ok) report.privateTotals = { ...(report.privateTotals ?? {}), [laneId]: "see the private log (PAYOUT_COMPUTED); never printed" };
      }
    }
  } else if (command === "display") {
    const auth = displayAuthorization("nba", "site");
    if (!auth.ok) fail(`NBA site display is not authorized: ${auth.reasons.join("; ")}`);
    const k = readDisplayKey();
    if (!k.ok) fail(`${k.reason} — no encrypted display artifact written`);
    const dir = path.join(REPO, PRICE_DISPLAY_REPO_DIR);
    fs.mkdirSync(dir, { recursive: true });
    for (const laneId of LANE_IDS) {
      const runs = readRuns(root, laneId);
      if (!runs.length) continue;
      fs.writeFileSync(path.join(dir, `${laneId}.json.enc`), encryptLanePriceDisplay(laneId, runs, k.key));
      report.lanes[laneId] = { action: "ENCRYPTED", file: path.join(PRICE_DISPLAY_REPO_DIR, `${laneId}.json.enc`), kid: k.kid };
    }
    console.log(JSON.stringify(report, null, 2));
    return;
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
