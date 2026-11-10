/**
 * NFL QB PROPS · GRADE-MODE INPUTS (pre-registration v1.1). Reads committed files only, and only AFTER the approval gate
 * has passed: scripts/nfl/grade-qb-props.mjs calls loadGradeInputs() only once gradingApproved() is true, so before
 * approval no final is ever read.
 *
 *   receipts  data/internal/research/nfl/sim-v2/shadow/<date>/*.json (the receipt of record is chosen by the grader)
 *   actuals   data/internal/research/nfl/player-events-v1/<season>.json, every season (the baselines walk back across seasons)
 *   verified  data/internal/nfl/official-stats/<eventId>.json with state FINAL; per team, the sum of passing yards (the
 *             grader drops a game whose box-score passing yards disagree with it)
 *   R5        data/internal/research/nfl/qb-props/r5-at-freeze.json — the per-slate job records, for every game with a
 *             receipt, the teamInputs.state of its official forecast (app/public/data/nfl/forecasts latest ∪
 *             frozen-latest) generated before kickoff, keeping the latest such forecast. The public files only carry the
 *             current week, so the state is captured while it is there; grade mode reads the log only. A game with no
 *             log entry is not allowed (unknown ≠ allowed). Interim until CANON-01's nflOfficialOfRecord is on main.
 *   eligibility@1 at freeze: not on this branch — `eligibilityAt` stays null (every row PENDING ⇒ none confirmatory)
 *             until the contract is on main and wired here.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readShadowReceipts } from "./sim-v2/public-receipt.mjs";
import { r5FromLog, readR5Log } from "./qb-props-r5-log.mjs";
import { APPROVED_PREREG_SHA256, PREREG_APPROVED_AT, buildLedger, gradeQbProps, gradingApproved } from "./qb-props-grade.mjs";

export const PLAYER_EVENTS_DIR = "data/internal/research/nfl/player-events-v1";
export const OFFICIAL_STATS_DIR = "data/internal/nfl/official-stats";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Every season's player-events games, oldest season first. */
export function readPlayerEventGames(root) {
  const dir = path.join(root, PLAYER_EVENTS_DIR);
  if (!fs.existsSync(dir)) return { games: [], files: [] };
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  const docs = files.map((f) => ({ f, d: readJson(path.join(dir, f)) }));
  return { games: docs.flatMap(({ d }) => d?.games ?? []), files: docs.map(({ f, d }) => ({ file: `${PLAYER_EVENTS_DIR}/${f}`, contentHash: d?.contentHash ?? null })) };
}

/** The settlement source's FINAL games: eventId → { teamPassYds }. */
export function readVerifiedFinals(root) {
  const dir = path.join(root, OFFICIAL_STATS_DIR);
  const verified = new Map();
  if (!fs.existsSync(dir)) return verified;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x)).sort()) {
    const d = readJson(path.join(dir, f));
    if (d?.state !== "FINAL") continue;
    const teamPassYds = {};
    for (const p of Object.values(d.players ?? {})) if (p?.passYds) teamPassYds[p.team] = (teamPassYds[p.team] ?? 0) + p.passYds;
    verified.set(f.replace(/\.json$/, ""), { teamPassYds });
  }
  return verified;
}



/** Everything grade mode needs, plus a digest of what was read (recorded in the ledger's `inputs`). */
export function loadGradeInputs(root) {
  const entries = readShadowReceipts(root);
  const { games, files } = readPlayerEventGames(root);
  const verified = readVerifiedFinals(root);
  const r5Log = readR5Log(root);
  const r5At = r5FromLog(r5Log);
  const inputs = {
    receiptsRead: entries.length,
    receiptsDigest: sha(entries.map((e) => `${e.file}:${e.receipt?.artifactHash ?? ""}`).join("\n")).slice(0, 16),
    actuals: files,
    verifiedFinals: verified.size,
    r5LogEvents: Object.keys(r5Log?.events ?? {}).length,
    eligibility: "PENDING_ELIGIBILITY_CONTRACT",
  };
  return { entries, games, verified, r5At, eligibilityAt: null, inputs };
}

export const LEDGER_REL = "data/internal/research/nfl/qb-props/ledger.json";

/**
 * Grade mode. Refuses — before reading any final — unless `preregSha256` is approved AND has an approval timestamp.
 * `approvals` / `approvedAt` default to the frozen code constants; tests pass synthetic ones on a synthetic root.
 */
export function runGrade({ root, preregSha256, approvals = APPROVED_PREREG_SHA256, approvedAt = PREREG_APPROVED_AT, write = false } = {}) {
  if (!gradingApproved(preregSha256, approvals)) return { refused: "no approved pre-registration" };
  const at = approvedAt[preregSha256];
  if (!at) return { refused: "the approved pre-registration has no approval timestamp" };
  const { entries, games, verified, r5At, eligibilityAt, inputs } = loadGradeInputs(root);
  const graded = gradeQbProps({ entries, games, verified, r5At, eligibilityAt, approvedAt: at, preregSha256, approvals });
  const ledger = buildLedger({ graded, inputs: { ...inputs, preregSha256, approvedAt: at } });
  let wrote = null;
  if (write) {
    const out = path.join(root, LEDGER_REL);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(ledger, null, 1)}\n`);
    wrote = LEDGER_REL;
  }
  return { ledger, wrote };
}
