/**
 * Append-only official-addition writer (Program 123-127 Phase 1B).
 *
 * Turns rows produced by the CANONICAL event-scoped generator into an official-addition patch,
 * validates it, materializes deterministically, and proves the existing official population is
 * untouched. It contains **no model math**: rows arrive from
 * `generate_mlb_board.py --event <id> --rows-out <file>`, which is the same production path used
 * for a full board (equivalence proven in `event_scope_equivalence_test.py`).
 *
 * SAFETY POSTURE (day one is supervised — §1.1):
 *   - `--apply` is required to write anything; the default is a rehearsal that touches nothing.
 *   - The base board is opened READ-ONLY. Its sha256 and row-identity digest are captured before
 *     and after every cycle; any change is a hard abort.
 *   - Every added row must be a NEW identity, belong to the target event, and carry
 *     `capturedAt < scheduledStart`. Anything else refuses the whole patch (never a partial write).
 *   - Movement snapshots can never enter here: this writer only ever emits `official_addition`.
 *
 * Usage:
 *   node app/scripts/mlb-append-official-coverage.mjs --date 2026-08-03 --event 824647 \
 *        --rows-in /tmp/scoped-rows.json [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  rowIdentity,
  validatePatch,
  materialize,
  PATCH_KINDS,
  PATCH_SCHEMA_VERSION,
} from "../src/lib/mlb/board-patches.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATCH_DIR = path.join(APP, "public/data/mlb/board-patches");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes("--apply");

const DATE = arg("date");
const EVENT = arg("event");
const ROWS_IN = arg("rows-in");
if (!DATE || !EVENT || !ROWS_IN) {
  console.error("usage: --date YYYY-MM-DD --event <gamePk> --rows-in <scoped-rows.json> [--apply]");
  process.exit(2);
}

const boardPath = path.join(APP, "public/data/mlb/boards", `${DATE}.json`);
const fingerprint = (p) => {
  const raw = fs.readFileSync(p);
  const board = JSON.parse(raw);
  const ids = (board.leans ?? []).map(rowIdentity).filter(Boolean).sort();
  return {
    sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    identityDigest: crypto.createHash("sha256").update(ids.join("\n")).digest("hex"),
    rows: board.leans?.length ?? 0,
    board,
  };
};

const before = fingerprint(boardPath);
const scoped = JSON.parse(fs.readFileSync(ROWS_IN, "utf8"));
const scopedRows = Array.isArray(scoped) ? scoped : scoped.rows ?? scoped.leans ?? [];

const game = (before.board.games ?? []).find((g) => String(g.gamePk) === String(EVENT));
if (!game) {
  console.error(`REFUSED: event ${EVENT} is not on the canonical ${DATE} schedule`);
  process.exit(1);
}

// Only genuinely NEW identities may be added; anything already published is refused outright.
const existing = new Set((before.board.leans ?? []).map(rowIdentity).filter(Boolean));
const additions = [];
for (const r of scopedRows) {
  const id = rowIdentity(r);
  if (!id) { console.error(`REFUSED: a scoped row has no canonical identity`); process.exit(1); }
  if (existing.has(id)) { console.error(`REFUSED: identity already published (${id}) — never last-write-wins`); process.exit(1); }
  if (String(r.gamePk ?? "") !== String(EVENT)) { console.error(`REFUSED: row ${id} does not belong to target event ${EVENT}`); process.exit(1); }
  additions.push(r);
}

if (additions.length === 0) {
  console.log(`NO_MARKET_DECISION ${DATE} event=${EVENT}: the scoped generator produced no eligible rows — honest partial coverage retained`);
  process.exit(0);
}

const nowIso = new Date().toISOString();
const patch = {
  schemaVersion: PATCH_SCHEMA_VERSION,
  patchId: `official-${DATE}-${EVENT}-${crypto.createHash("sha256").update(additions.map(rowIdentity).sort().join("\n")).digest("hex").slice(0, 12)}`,
  seq: Math.floor(Date.parse(nowIso) / 1000),
  kind: PATCH_KINDS.OFFICIAL_ADDITION,
  eventId: additions[0].gameId ?? additions[0].eventId ?? null,
  gamePk: Number(EVENT),
  scheduledStart: game.gameDate,
  capturedAt: additions[0].capturedAt,
  requestWindowStart: additions[0].capturedAt,
  // Provider fingerprint WITHOUT secrets: shape + count only.
  requestFingerprint: `oddsapi|mlb|${EVENT}|rows=${additions.length}|policy=${additions[0].capturePolicyVersion ?? 1}`,
  rows: additions,
};

const v = validatePatch(patch, before.board, [], nowIso);
if (!v.ok) { console.error(`REFUSED by validator: ${v.refusal}`); process.exit(1); }

const m = materialize(before.board, [patch], nowIso);
if (m.accepted.length !== 1) { console.error(`REFUSED: materializer rejected the patch: ${JSON.stringify(m.refused)}`); process.exit(1); }

// Gap-zero accounting must close before anything is written.
const expected = before.rows + additions.length;
if (m.accounting.publishedPopulation !== expected) {
  console.error(`REFUSED: accounting gap — expected ${expected}, materializer says ${m.accounting.publishedPopulation}`);
  process.exit(1);
}

console.log(`patch ${patch.patchId}`);
console.log(`  target        ${game.awayTeamName} @ ${game.homeTeamName} (gamePk ${EVENT}), first pitch ${game.gameDate}`);
console.log(`  additions     ${additions.length} new official identities`);
console.log(`  population    ${before.rows} base + ${additions.length} = ${m.accounting.publishedPopulation}`);
console.log(`  base sha256   ${before.sha256.slice(0, 16)} (identity digest ${before.identityDigest.slice(0, 16)})`);

if (!APPLY) {
  console.log("REHEARSAL — nothing written. Pass --apply to persist the patch.");
  process.exit(0);
}

fs.mkdirSync(PATCH_DIR, { recursive: true });
const out = path.join(PATCH_DIR, `${DATE}.json`);
const stream = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : { date: DATE, patches: [] };
if (stream.patches.some((p) => p.patchId === patch.patchId)) {
  console.log(`IDEMPOTENT: patch ${patch.patchId} already present — nothing to do`);
  process.exit(0);
}
stream.patches.push(patch);
fs.writeFileSync(out, JSON.stringify(stream, null, 2) + "\n");

// The base must be byte-identical after the write. This is the invariant the whole design exists
// to protect, so it is verified rather than assumed.
const after = fingerprint(boardPath);
if (after.sha256 !== before.sha256 || after.identityDigest !== before.identityDigest) {
  console.error("HARD ABORT: the base board changed during the patch cycle");
  process.exit(1);
}
console.log(`APPLIED — wrote ${path.relative(APP, out)}; base board byte-identical (${after.sha256.slice(0, 16)})`);
