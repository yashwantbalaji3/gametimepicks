/**
 * Consistency audit × the NFL record of record (release owner 2026-10-26, after PIT @ NO 401873011). The producer side,
 * the eligibility predicate and the exclusions' append-only pins live with sports/nfl (record-eligibility.test.mjs);
 * this file holds the AUDIT side:
 *   · the official snapshot's record for an excluded event is the entry's `recordInstead` — the newest ELIGIBLE
 *     revision — and no snapshot source (official, board, supporting, shadow) rests on the excluded file;
 *   · the audit over the committed data raises no board/record mismatch for an excluded event, with no baseline change;
 *   · FOUNDER CONDITION: an exclusion may only skip a revision whose displayed and graded values equal the record's.
 *     One that would move a displayed or graded value fails here unless it is flagged `founderApproved`;
 *   · a receipt that records a post-kickoff input is never the snapshot's record (receipts written from 2026-10-26).
 * Run: npx tsx --test src/lib/consistency/nfl-record-exclusions-audit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { RECORD_EXCLUSIONS } from "../sports/nfl/record-exclusions.mjs";
import { isRecordEligible } from "../sports/nfl/record-eligibility.mjs";
import { nflOfficialSnapshot } from "./official-snapshot.mjs";
import { runConsistencyAudit } from "./audit.mjs";
import { KICKOFF, NFL_ID, nflBoard, nflReceipt, receiptsOf } from "./__fixtures__/synthetic.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../../..");
const RECEIPTS = "data/internal/nfl/forecast-receipts";
const readRel = (rel) => {
  const bytes = fs.readFileSync(path.join(REPO, rel));
  return { path: rel, doc: JSON.parse(bytes.toString("utf8")), sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
};
const receiptsFor = (id) => fs.readdirSync(path.join(REPO, RECEIPTS)).sort().flatMap((d) => {
  const dir = path.join(REPO, RECEIPTS, d);
  if (!fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir).sort().filter((f) => f === `${id}.json` || f.startsWith(`${id}-rev-`)).map((f) => {
    const a = readRel(`${RECEIPTS}/${d}/${f}`);
    return { file: a.path, receipt: a.doc, sha256: a.sha256 };
  });
});

/**
 * What a reader sees or is graded on from a receipt: the published forecast, the side, the market comparison and the
 * settlement key. Freeze stamps (sideDecision.frozenAt) are provenance, not values.
 */
export function recordValues(receipt) {
  const { frozenAt, ...side } = receipt?.sideDecision ?? {};
  return JSON.stringify({ forecastSummary: receipt?.forecastSummary ?? null, sideDecision: side, marketComparison: receipt?.marketComparison ?? null, settlementKey: receipt?.settlementKey ?? null });
}
/** The founder condition for one exclusion. Pure. */
export function exclusionProblems(entry, excluded, instead) {
  const out = [];
  const differs = recordValues(excluded) !== recordValues(instead);
  if (entry.displayedValueDiffers !== differs) out.push(`displayedValueDiffers says ${entry.displayedValueDiffers}, the receipts say ${differs}`);
  if (differs && entry.founderApproved !== true) out.push("skipping it moves a displayed or graded value: needs founderApproved");
  if (!(Date.parse(entry.evidence?.stamp) >= Date.parse(excluded?.kickoffUtc))) out.push(`evidence stamp ${entry.evidence?.stamp} is not at/after kickoff ${excluded?.kickoffUtc}`);
  return out;
}

test("every record exclusion: the official snapshot's record is its recordInstead — the newest ELIGIBLE revision — and no source rests on the excluded file", () => {
  assert.ok(RECORD_EXCLUSIONS.length >= 1);
  for (const x of RECORD_EXCLUSIONS) {
    const receipts = receiptsFor(x.providerEventId);
    assert.ok(receipts.some((r) => r.file === x.file), `${x.file}: append-only — the excluded receipt stays on disk`);
    const newestEligible = receipts.filter((r) => isRecordEligible(r.receipt)).sort((a, b) => a.receipt.generatedAt.localeCompare(b.receipt.generatedAt) || a.file.localeCompare(b.file)).at(-1);
    assert.equal(newestEligible.file, x.recordInstead, `${x.providerEventId}: recordInstead is the newest eligible revision`);
    const board = fs.existsSync(path.join(REPO, `app/public/data/nfl/player-board/${x.providerEventId}.json`)) ? readRel(`app/public/data/nfl/player-board/${x.providerEventId}.json`) : null;
    const s = nflOfficialSnapshot(x.providerEventId, { receipts, playerBoard: board });
    assert.equal(s.sources[0].path, x.recordInstead, `${x.providerEventId}: the snapshot's record`);
    for (const src of s.sources) {
      assert.notEqual(src.path, x.file, `${x.providerEventId}: no ${src.role} source is the excluded receipt`);
      assert.notEqual(src.expectedInputRef, x.file, `${x.providerEventId}: no ${src.role} source is checked against the excluded receipt`);
    }
  }
});

test("FOUNDER CONDITION: an exclusion only skips a revision whose displayed and graded values equal the record's, unless founderApproved", () => {
  for (const x of RECORD_EXCLUSIONS) {
    const excluded = readRel(x.file).doc, instead = readRel(x.recordInstead).doc;
    assert.deepEqual(exclusionProblems(x, excluded, instead), [], x.file);
  }
  // the rule itself, on synthetic receipts: a value-moving exclusion fails without the flag, passes with it
  const a = nflReceipt({ generatedAt: "2026-11-01T17:00:00Z", pHome: 0.62 }), b = nflReceipt({ generatedAt: "2026-11-01T17:30:00Z", pHome: 0.55, inputHash: "bbbbbbbbbbbbbbbb" });
  const entry = { displayedValueDiffers: true, evidence: { stamp: KICKOFF } };
  assert.deepEqual(exclusionProblems(entry, b, a), ["skipping it moves a displayed or graded value: needs founderApproved"]);
  assert.deepEqual(exclusionProblems({ ...entry, founderApproved: true }, b, a), []);
  assert.deepEqual(exclusionProblems({ ...entry, displayedValueDiffers: false }, b, a).length, 2, "a mislabelled entry fails too");
  const same = nflReceipt({ generatedAt: "2026-11-01T17:30:00Z", inputHash: "cccccccccccccccc" });
  assert.deepEqual(exclusionProblems({ displayedValueDiffers: false, evidence: { stamp: KICKOFF } }, same, a), [], "a stamp-only revision needs no founder decision");
  assert.deepEqual(exclusionProblems({ displayedValueDiffers: false, evidence: { stamp: "2026-11-01T17:59:00Z" } }, same, a).length, 1, "evidence before kickoff is no reason to exclude");
});

test("the audit over the committed data: no board/record mismatch for an excluded event, with the pinned baseline unchanged", () => {
  const audit = runConsistencyAudit({ repoRoot: REPO });
  for (const x of RECORD_EXCLUSIONS) {
    const hits = audit.discrepancies.filter((d) => d.eventId === x.providerEventId && d.identity?.field === "OFFICIAL:inputRef");
    assert.deepEqual(hits.map((d) => d.fingerprint), [], `${x.providerEventId}: the board agrees with the record of record`);
  }
});

test("a receipt that RECORDS a post-kickoff input is never the snapshot's record, even when it is labelled pre-kickoff", () => {
  const early = nflReceipt({ generatedAt: "2026-11-01T17:00:00Z" });
  const late = { ...nflReceipt({ generatedAt: "2026-11-01T17:59:54Z", inputHash: "dddddddddddddddd" }), inputs: { injuries: { sourceAsOf: "2026-11-01T18:00:12Z" }, rosters: { sourceAsOf: "2026-11-01T17:00:00Z" } } };
  assert.ok(Date.parse(late.generatedAt) < Date.parse(KICKOFF));
  const board = { path: `app/public/data/nfl/player-board/${NFL_ID}.json`, doc: nflBoard({ generatedAt: "2026-11-01T17:00:00Z" }), sha256: "x" };
  const s = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(early, late), playerBoard: board });
  assert.equal(s.sources[0].generatedAt, early.generatedAt, "the record is the last revision whose inputs all precede kickoff");
  const ok = { ...late, inputs: { injuries: { sourceAsOf: "2026-11-01T17:59:00Z" } } };
  assert.equal(nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(early, ok), playerBoard: board }).sources[0].generatedAt, ok.generatedAt, "control: pre-kickoff inputs → the newer revision is the record");
});
